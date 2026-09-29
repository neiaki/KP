import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import type { Sql } from "postgres";
import { sql } from "drizzle-orm";
import { getDb, invalidateDb, isConnectionFailure, type Db } from "../src/db/client.ts";

/*
 * INSIDEN 2026-09-27 dan satu bagian dari penjaganya yang belum tertutup:
 * proxy di src/db/client.ts semula hanya dipasang pada apply trap (tagged
 * template) dan pada properti .unsafe. db.transaction() tidak memakai
 * keduanya. Driver memanggil .begin, dan di dalam postgres 3.4.9
 * (cjs/src/index.js) begin membangun klien sendiri lewat Sql(handler) untuk
 * query di dalam callback transaksi. Klien kedua itu tidak pernah melewati
 * proxy, jadi satu-satunya yang masih terlihat dari sini adalah promise
 * balik dari .begin, dan itulah yang sekarang ikut diawasi.
 *
 * Test ini memakai klien postgres sungguhan dan dua bentuk server tiruan tanpa
 * Postgres sungguhan: port tertutup untuk kegagalan koneksi, dan server yang
 * berbicara protokol Postgres secukupnya untuk mengembalikan galat dengan
 * SQLSTATE asli. Tidak ada modul yang dimock dan tidak ada DATABASE_URL yang
 * dibutuhkan, jadi yang diuji adalah transisi state yang sebenarnya: klien
 * dicache, koneksi jadi tidak berguna, cache dibuang atau dipertahankan
 * sesuai jenis galatnya, lalu getDb() berikutnya membangun klien baru.
 */

type ServerTiruan = {
  port: number;
  close: () => Promise<void>;
};

/** Port yang tidak ada yang listen, jadi connect-nya ditolak seketika. */
async function portTutup(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/**
 * Klien postgres di balik db. Nilai $client hanya ada di nilai balik
 * drizzle(), bukan di tipe Db, jadi diambil lewat cast yang jujur di sini.
 */
function klien(d: Db): Sql {
  return (d as unknown as { $client: Sql }).$client;
}

function arahkanKe(port: number): void {
  process.env.DATABASE_URL = `postgres://atcell:rahasia@127.0.0.1:${port}/postgres`;
}

/**
 * Kode galat dari driver, apa pun asalnya: SQLSTATE untuk galat Postgres,
 * kode milik driver postgres (CONNECTION_CLOSED dan sejenisnya), atau kode
 * socket Node (ECONNREFUSED). Semua test membandingkan kode yang sama, jadi
 * membacanya lewat satu tempat saja, tanpa cast di tiap baris.
 */
function kodeGalat(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  return typeof err.code === "string" ? err.code : "";
}

/* ------------------------------------------------------------------ *
 * Server tiruan yang berbicara protokol Postgres secukupnya.
 *
 * Driver melakukan handshake (AuthenticationOk, ParameterStatus,
 * BackendKeyData, ReadyForQuery), lalu karena fetch_types bawaan menyala ia
 * mengirim satu query bootstrap untuk pg_catalog.pg_type. Query itu
 * dijawab dengan hasil kosong supaya handshake selesai seperti di server
 * sungguhan. Query sesudahnya, baik lewat simple protocol (tanpa argumen)
 * maupun extended protocol, dijawab dari skrip yang diberikan test.
 * ------------------------------------------------------------------ */

type Balasan =
  | { jenis: "selesai" }
  | { jenis: "galat"; kode: string; pesan: string }
  | { jenis: "putus" };

/** Bentuk pesan Postgres: satu byte tipe, int32 panjang, lalu isi. */
function pesan(tipe: string, isi: Buffer): Buffer {
  const kepala = Buffer.alloc(5);
  kepala.write(tipe, 0, "latin1");
  kepala.writeUInt32BE(isi.length + 4, 1);
  return Buffer.concat([kepala, isi]);
}

/** String berterminator nol, seperti yang dipakai protokol Postgres. */
function z(teks: string): Buffer {
  return Buffer.concat([Buffer.from(teks, "utf8"), Buffer.from([0])]);
}

function uint32(nilai: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(nilai, 0);
  return buf;
}

/** ErrorResponse: pasangan byte medan dan nilai, ditutup satu byte nol. */
function errorResponse(kode: string, teks: string): Buffer {
  return pesan(
    "E",
    Buffer.concat([
      Buffer.from("S", "latin1"),
      z("ERROR"),
      Buffer.from("V", "latin1"),
      z("ERROR"),
      Buffer.from("C", "latin1"),
      z(kode),
      Buffer.from("M", "latin1"),
      z(teks),
      Buffer.from("n", "latin1"),
      z("batasan_kunci"),
      Buffer.from([0]),
    ])
  );
}

/** Jawaban sukses untuk satu query: tanpa kolom dan tanpa baris. */
function jawabanSelesai(): Buffer {
  return Buffer.concat([
    pesan("1", Buffer.alloc(0)),
    pesan("2", Buffer.alloc(0)),
    pesan("C", z("SELECT 0")),
    pesan("Z", Buffer.from("I", "latin1")),
  ]);
}

function sapaan(): Buffer {
  return Buffer.concat([
    pesan("R", uint32(0)),
    pesan("S", Buffer.concat([z("client_encoding"), z("UTF8")])),
    pesan("S", Buffer.concat([z("server_version"), z("15.0")])),
    pesan("K", Buffer.concat([uint32(4242), uint32(2424)])),
    pesan("Z", Buffer.from("I", "latin1")),
  ]);
}

function balasanUntuk(
  jawab: (sql: string, socket: net.Socket) => Balasan,
  socket: net.Socket,
  sql: string
): Buffer {
  // Query bootstrap pg_catalog.pg_type harus berhasil supaya handshake selesai.
  if (sql.includes("pg_catalog.pg_type")) return jawabanSelesai();
  const hasil = jawab(sql, socket);
  if (hasil.jenis === "putus") {
    // Persis yang dilakukan pooler dan proxy: socket ditutup di tengah
    // query tanpa jawaban apa pun.
    socket.destroy();
    return Buffer.alloc(0);
  }
  if (hasil.jenis !== "galat") return jawabanSelesai();
  return Buffer.concat([
    errorResponse(hasil.kode, hasil.pesan),
    pesan("Z", Buffer.from("I", "latin1")),
  ]);
}

function onePengguna(socket: net.Socket, jawab: (sql: string, socket: net.Socket) => Balasan): void {
  let buf = Buffer.alloc(0);
  let masihSapaan = true;
  let statement = "";

  socket.on("data", (data) => {
    buf = Buffer.concat([buf, Buffer.from(data as Uint8Array)]);
    for (;;) {
      if (masihSapaan) {
        // StartupMessage: int32 panjang, lalu isi tanpa byte tipe.
        if (buf.length < 4) return;
        const panjang = buf.readUInt32BE(0);
        if (buf.length < panjang) return;
        buf = buf.subarray(panjang);
        masihSapaan = false;
        socket.write(sapaan());
        continue;
      }
      if (buf.length < 5) return;
      const tipe = String.fromCharCode(buf[0]);
      const panjang = buf.readUInt32BE(1);
      if (buf.length < panjang + 1) return;
      const isi = buf.subarray(5, panjang + 1);
      buf = buf.subarray(panjang + 1);

      if (tipe === "X") {
        socket.end();
        return;
      }
      if (tipe === "Q") {
        // SimpleQuery: SQL-nya null terminated, tanpa byte panjang.
        const akhir = isi.indexOf(0);
        socket.write(balasanUntuk(jawab, socket, isi.toString("utf8", 0, akhir === -1 ? isi.length : akhir)));
        continue;
      }
      if (tipe === "P") {
        // Parse: nama statement null terminated, lalu SQL-nya. Driver memakai
        // statement tanpa nama, jadi byte pertama memang byte nol.
        const akhirNama = isi.indexOf(0);
        statement = isi.toString("utf8", akhirNama + 1).split("\0")[0];
        continue;
      }
      if (tipe === "S") {
        socket.write(balasanUntuk(jawab, socket, statement));
        statement = "";
        continue;
      }
      // Describe, Bind, Execute, dan Flush tidak perlu dijawab satu per satu:
      // jawabannya mengikuti Sync.
    }
  });
}

async function startServerPgl(
  jawab: (sql: string, socket: net.Socket) => Balasan
): Promise<ServerTiruan> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    onePengguna(socket, jawab);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/**
 * Tanya klien apakah dia sudah ditutup, lalu kembalikan kode penolakan yang
 * dilihat.
 *
 * end() milik driver baru menandai dirinya selesai setelah satu tick (await 1
 * di dalam cjs/src/index.js) dan invalidateDb memang tidak menunggunya,
 * supaya pemanggil yang gagal tidak ikut menunggu. Jadi yang ditunggu di sini
 * adalah kondisinya, bukan durasi tebakan.
 *
 * Probe ini tidak mungkin jadi badai koneksi: pada klien yang sudah di-end(),
 * handler menolak lebih dulu di antrean ended (cjs/src/index.js baris 331)
 * tanpa pernah menyentuh socket, jadi tidak ada connect ke port mati sama
 * sekali. Batasnya di sini hanya supaya test gagal dengan pesan yang jelas,
 * bukan menggantung.
 */
async function sampaiDitutup(k: Sql): Promise<string> {
  const dilihat: string[] = [];
  for (let i = 0; i < 20; i++) {
    const galat = await k
      .unsafe("select 1")
      .then(
        () => null,
        (err: unknown) => err
      );
    const kode = kodeGalat(galat);
    dilihat.push(kode || "(tanpa kode)");
    if (kode === "CONNECTION_ENDED") return kode;
    // Satu putaran event loop, bukan jeda berbasis waktu: yang ditunggu
    // adalah kondisi driver sudah menandai dirinya selesai, bukan lamanya.
    // setImmediate memberi putaran itu tanpa mengikat durasi ke jam dinding.
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(`klien belum tertutup setelah 20 probe; kode yang dilihat: ${dilihat.join(", ")}`);
}

/* ------------------------------------------------------------------ */

test("kegagalan koneksi lewat db.transaction() membuang cache klien", async () => {
  arahkanKe(await portTutup());
  try {
    const sebelum = getDb();
    assert.ok(sebelum, "getDb harus mengembalikan db saat DATABASE_URL diisi");

    // Bentuk yang dipakai executeSale, updateUnitStatus, dan updateTicket.
    // Callback-nya tidak pernah jalan karena "begin" sendiri yang ditolak,
    // dan itulah yang terjadi di produksi ketika pooler sudah tidak ada.
    await assert.rejects(
      sebelum.transaction(async () => {
        throw new Error("callback transaksi tidak boleh dijalankan");
      }),
      (err: unknown) => {
        assert.equal(
          kodeGalat(err),
          "ECONNREFUSED",
          "test ini harus gagal karena connect ditolak, bukan karena alur lain"
        );
        return true;
      }
    );

    // Inilah yang hilang sebelum perbaikan. .begin mengembalikan promise yang
    // ditolak, tetapi promise itu tidak pernah melewati proxy, jadi tidak ada
    // penjaga yang membacanya dan cache tetap dipakai lagi oleh request
    // berikutnya sampai query biasa berikutnya tanpa sengaja menyadarinya.
    const sesudah = getDb();
    assert.ok(sesudah, "getDb harus membangun klien baru, bukan menolak");
    assert.notEqual(
      sesudah,
      sebelum,
      "galat koneksi di dalam transaksi harus membuang cache, bukan menunggu query biasa berikutnya"
    );
    assert.notEqual(klien(sesudah), klien(sebelum));
  } finally {
    invalidateDb();
  }
});

test("socket yang diputus di tengah transaksi lewat db.transaction() membuang cache", async () => {
  // Bentuk paling dekat dengan insiden: pooler menutup socket dari sisi
  // server saat query di dalam transaksi sedang jalan. Driver menjawabnya
  // dengan CONNECTION_CLOSED, dan karena query transaksi berjalan di klien
  // kedua milik driver, satu-satunya jalan yang terlihat dari lapisan kita
  // adalah promise balik dari .begin.
  const server = await startServerPgl((sql) =>
    sql.includes("begin") ? { jenis: "putus" } : { jenis: "selesai" }
  );
  arahkanKe(server.port);
  try {
    const sebelum = getDb();
    assert.ok(sebelum, "getDb harus mengembalikan db saat DATABASE_URL diisi");

    await assert.rejects(
      sebelum.transaction(async () => {
        throw new Error("callback transaksi tidak boleh dijalankan");
      }),
      (err: unknown) => {
        assert.equal(
          kodeGalat(err),
          "CONNECTION_CLOSED",
          "socket yang diputus harus muncul sebagai CONNECTION_CLOSED dari driver"
        );
        return true;
      }
    );

    const sesudah = getDb();
    assert.ok(sesudah, "getDb harus membangun klien baru, bukan menolak");
    assert.notEqual(
      sesudah,
      sebelum,
      "socket yang putus di tengah transaksi harus langsung membuang cache"
    );
  } finally {
    invalidateDb();
    await server.close();
  }
});

test("koneksi yang putus saat commit membuang cache", async () => {
  // Bentuk paling dekat dengan executeSale, dan yang paling diam-diam: seluruh
  // badan transaksi berhasil, tidak ada satu pun query di dalam callback yang
  // gagal, dan yang putus adalah statement "commit". Driver sudah sempat
  // membangun klien kedua di dalam scope (cjs/src/index.js baris 252) dan
  // callback-nya benar-benar menulis. Karena semua query itu berjalan di klien
  // milik driver, satu-satunya yang terlihat dari lapisan kita adalah promise
  // balik dari .begin, jadi itulah yang harus membangun ulang cache.
  //
  // Galat commit dibuat di sisi server, bukan dengan memutus socket, karena
  // driver saling mencoba lima kali dengan jeda saat socket hilang dan test
  // ini akan menjadi lima puluh detik. Bentuk 08006 dengan kalimat itu juga
  // yang lebih mirip kenyataan: yang berdiri di depan socket kita adalah
  // pooler, bukan Postgres, dan poolerfamili pg yang menutup koneksi di tengah
  // transaksi mengirim persis kalimat itu. Bentuk socket yang hilang sudah
  // dipakai dua test di atas.
  const server = await startServerPgl((teks) => {
    if (/^\s*begin\b/i.test(teks) || teks.includes("products")) return { jenis: "selesai" };
    return {
      jenis: "galat",
      kode: "08006",
      pesan: "connection terminated unexpectedly",
    };
  });
  arahkanKe(server.port);
  try {
    const sebelum = getDb();
    assert.ok(sebelum, "getDb harus mengembalikan db saat DATABASE_URL diisi");

    let masukCallback = false;
    await assert.rejects(
      sebelum.transaction(async (tx) => {
        masukCallback = true;
        // Bentuk nyata: aksi di repo ini menulis lewat drizzle, dan driver
        // miliknya sendiri yang menjalankan query ini lewat client kedua
        // milik scope. Objek itu bukan milik kita, jadi satu-satunya yang
        // bisa kita andalkan di sini murni penolakan yang keluar dari .begin.
        await tx.execute(sql`update products set qty = qty - 1 where id = 1`);
      }),
      (err: unknown) => {
        assert.equal(
          kodeGalat(err),
          "08006",
          "galat commit harus diteruskan apa adanya oleh driver"
        );
        return true;
      }
    );
    assert.equal(masukCallback, true, "test ini harus benar-benar masuk ke callback transaksi");

    const sesudah = getDb();
    assert.ok(sesudah, "getDb harus membangun klien baru, bukan menolak");
    assert.notEqual(
      sesudah,
      sebelum,
      "koneksi yang putus di dalam transaksi harus membuang cache, bukan menunggu query biasa"
    );
    assert.notEqual(klien(sesudah), klien(sebelum));
  } finally {
    invalidateDb();
    await server.close();
  }
});

test("galat query dari server tidak membuang cache", async () => {
  // Kelima ini adalah galat yang sering muncul di produksi dan sama sekali
  // tidak tentang koneksi: statement timeout saat load spike, SKU dobel,
  // kolom yang salah ketik, tabel yang salah ketik, dan salah ketik pada
  // query itu sendiri. Kalau salah satu ikut membangun klien baru, setiap
  // salah ketik akan membuat satu koneksi baru dan satu soket baru.
  //
  // Galatnya dibuat server tiruan dan dilalui driver sungguhan lewat socket
  // sungguhan, jadi yang sampai ke penjaga adalah PostgresError dengan
  // SQLSTATE asli, bukan objek yang dibuat test.
  const skenario: Array<{ sql: string; kode: string; pesan: string }> = [
    {
      sql: "select pg_sleep(30)",
      kode: "57014",
      pesan: "canceling statement due to statement timeout",
    },
    {
      sql: "insert into products (sku) values ('AT-001')",
      kode: "23505",
      pesan: 'duplicate key value violates unique constraint "products_sku_key"',
    },
    {
      sql: "select * from tabel_yang_tidak_ada",
      kode: "42P01",
      pesan: 'relation "tabel_yang_tidak_ada" does not exist',
    },
    {
      sql: "select kolom_yang_tidak_ada from products",
      kode: "42703",
      pesan: 'column "kolom_yang_tidak_ada" does not exist',
    },
    {
      sql: "seelect 1",
      kode: "42601",
      pesan: 'syntax error at or near "seelect"',
    },
  ];

  for (const satu of skenario) {
    const server = await startServerPgl(() => ({ jenis: "galat", ...satu }));
    arahkanKe(server.port);
    try {
      const db = getDb();
      assert.ok(db, "getDb harus mengembalikan db saat DATABASE_URL diisi");

      const galat = await klien(db)
        .unsafe(satu.sql)
        .then(
          () => null,
          (err: unknown) => err
        );
      assert.ok(galat instanceof Error, "server tiruan harus benar-benar menjawab galat");
      assert.equal(
        kodeGalat(galat),
        satu.kode,
        "SQLSTATE harus diteruskan apa adanya oleh driver"
      );

      assert.equal(
        getDb(),
        db,
        `galat query ${satu.kode} bukan kegagalan koneksi, jadi cache harus tetap dipakai`
      );
    } finally {
      invalidateDb();
      await server.close();
    }
  }
});

test("dua kegagalan bersamaan tidak meninggalkan dua klien hidup", async () => {
  arahkanKe(await portTutup());
  try {
    const pertama = getDb();
    assert.ok(pertama);
    // Dua kegagalan yang benar-benar bersamaan, dan keduanya sengaja lewat
    // .begin, bukan lewat query biasa. Alasannya dua. Pertama, jalur .begin
    // adalah yang diawasi dan yang harus tetap berlaku saat beberapa kegagalan
    // datang bersamaan, bukan hanya saat satu. Kedua, kalau salah satunya
    // lewat query biasa, guard lama yang hanya menutup apply dan .unsafe
    // akan ikut membakar cache dan test ini lolos di kode yang belum
    // diperbaiki, jadi test ini jadi tidak membuktikan apa pun.
    // Karena keduanya memakai cache yang sama, invalidateDb tidak boleh ikut
    // membangun pengganti: kalau iya, salah satu bisa membangun klien sendiri
    // dan klien lama akan tetap hidup tanpa terlihat.
    const hasil = await Promise.allSettled([
      pertama.transaction(async () => {
        throw new Error("callback transaksi tidak boleh dijalankan");
      }),
      pertama.transaction(async () => {
        throw new Error("callback transaksi tidak boleh dijalankan");
      }),
    ]);
    assert.deepEqual(
      hasil.map((satu) => satu.status),
      ["rejected", "rejected"],
      "kedua panggilan harus gagal"
    );
    for (const satu of hasil) {
      if (satu.status !== "rejected") continue;
      assert.equal(
        kodeGalat(satu.reason),
        "ECONNREFUSED",
        "keduanya harus gagal karena koneksi, bukan karena isi callback"
      );
    }

    // Setelah keduanya selesai, cache harus menetap pada tepat satu klien.
    const sesudah = getDb();
    assert.ok(sesudah, "getDb harus membangun klien baru, bukan menolak");
    assert.notEqual(sesudah, pertama, "cache lama harus dibuang");
    assert.equal(
      getDb(),
      sesudah,
      "hanya boleh ada satu klien baru yang di-cache, bukan satu per kegagalan"
    );
    assert.notEqual(
      klien(sesudah),
      klien(pertama),
      "klien yang gagal tidak boleh masih dipegang sebagai klien hidup"
    );
    // Klien yang gagal harus benar-benar ditutup. Kalau invalidateDb pernah
    // ikut membangun pengganti tanpa menutup yang lama, klien di tangan
    // pemanggil yang gagal akan tetap hidup dan bocor.
    const ditolak = await sampaiDitutup(klien(pertama));
    assert.equal(
      ditolak,
      "CONNECTION_ENDED",
      "klien yang gagal harus ditutup end() supaya tidak ada dua klien hidup"
    );
  } finally {
    invalidateDb();
  }
});

test("proxy tidak mengubah bentuk klien yang dilihat drizzle", async () => {
  // Menjaga galat koneksi tidak boleh mengubah bentuk objek. drizzle
  // memanggil client.unsafe(...).values() di session.ts, jadi hasil .unsafe
  // harus tetap berupa Query dari driver, bukan promise pembungkus. Proxy juga
  // harus tetap callable karena sql dipakai sebagai tagged template, dan
  // properti yang bukan fungsi harus lewat apa adanya sebagai objek yang
  // sama, bukan salinan.
  const server = await startServerPgl(() => ({ jenis: "selesai" }));
  arahkanKe(server.port);
  try {
    const db = getDb();
    assert.ok(db, "getDb harus mengembalikan db saat DATABASE_URL diisi");
    const sql = klien(db);

    assert.equal(typeof sql, "function", "proxy harus tetap callable sebagai tagged template");
    const baris = await sql`select 1`;
    assert.equal(
      Array.isArray(baris) && baris.length,
      0,
      "tagged template harus tetap dieksekusi driver dan mengembalikan baris"
    );

    const query = sql.unsafe("select 1");
    assert.equal(
      typeof query.values,
      "function",
      "hasil .unsafe harus tetap Query yang punya .values, bukan promise pembungkus"
    );
    const barisUnsafe = await query.values();
    assert.equal(
      Array.isArray(barisUnsafe) && barisUnsafe.length,
      0,
      "hasil .unsafe harus tetap bisa dieksekusi dan mengembalikan array"
    );

    // Properti bukan fungsi: keluar sebagai objek yang sama pada setiap akses,
    // jadi tidak ada yang membungkusnya jadi closure baru.
    const opsi = sql.options;
    assert.equal(typeof opsi, "object");
    assert.equal(sql.options, opsi, ".options harus diteruskan apa adanya, bukan disalin");
    assert.equal(opsi.prepare, false, "opsi yang benar-benar dipakai driver harus terlihat");
    assert.equal(opsi.max_lifetime, 300);
    assert.equal(opsi.idle_timeout, 20);

    // Properti yang berupa fungsi harus tetap punya bentuknya sendiri.
    // .types adalah fungsi typed milik driver (yang hanya memuat serializer
    // yang didaftarkan pengguna, jadi tidak ada isi tetap untuk diperiksa),
    // sedangkan .PostgresError adalah kelas: kalau dibungkus jadi closure,
    // new dan instanceof keduanya diam-diam rusak.
    assert.equal(typeof sql.types, "function", ".types harus tetap berupa fungsi driver");
    const galat = new sql.PostgresError("uji");
    assert.ok(galat instanceof Error, ".PostgresError harus tetap bisa dipakai dengan new");
    assert.equal(
      typeof sql.PostgresError.prototype,
      "object",
      "properti kelas harus diteruskan, bukan hilang di balik closure"
    );
  } finally {
    invalidateDb();
    await server.close();
  }
});

test("kalimat koneksi dari driver lain ikut dihitung koneksi", () => {
  // Dua kalimat ini bukan berasal dari postgres 3.4.9 yang terpasang di sini.
  // Driver pg sekeluarga memakainya persis seperti ini, dan socket di depan
  // aplikasi ini milik pooler, bukan milik driver, jadi klasifikasi tidak
  // boleh bergantung pada versi paket yang kebetulan terpasang.
  assert.equal(
    isConnectionFailure(new Error("Connection terminated unexpectedly")),
    true,
    "socket yang ditutup di tengah query harus ikut dibangun ulang"
  );
  assert.equal(
    isConnectionFailure(
      new Error("Client has encountered a connection error and is not queryable")
    ),
    true,
    "klien yang sudah tidak bisa dipakai harus ikut dibangun ulang"
  );

  // Bentuk asli ECONNREFUSED dari driver: message memuat kode, dan properti
  // code memuat kode yang sama. Klasifikasi harus benar dari keduanya.
  const asli = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6543"), {
    code: "ECONNREFUSED",
    errno: "ECONNREFUSED",
    syscall: "connect",
  });
  assert.equal(isConnectionFailure(asli), true);
  assert.equal(
    isConnectionFailure({ code: "ECONNREFUSED", message: "connect ECONNREFUSED" }),
    false,
    "bukan Error berarti bukan bukti koneksi rusak"
  );

  // Memperlebar daftar kalimat tidak boleh menelan galat query. Semua pesan
  // di bawah ini kalimat yang benar-benar keluar dari server sungguhan.
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error('duplicate key value violates unique constraint "x_pkey"'), {
        code: "23505",
      })
    ),
    false,
    "pelanggaran batasan unik bukan kegagalan koneksi"
  );
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error('column "x" does not exist'), { code: "42703" })
    ),
    false,
    "kolom tidak ada bukan kegagalan koneksi"
  );
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error('syntax error at or near "seelect"'), { code: "42601" })
    ),
    false,
    "galat sintaks bukan kegagalan koneksi"
  );
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error('relation "x" does not exist'), { code: "42P01" })
    ),
    false,
    "tabel tidak ada bukan kegagalan koneksi"
  );
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      })
    ),
    false,
    "57014 tetap bukan kegagalan koneksi"
  );
});
