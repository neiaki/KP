import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import type { Sql } from "postgres";
import { getDb, invalidateDb, isConnectionFailure, type Db } from "../src/db/client.ts";
import { probeSchema } from "../src/app/api/health/db-probe.ts";
import { isReady } from "../src/lib/health.ts";

/*
 * Insiden 2026-09-27: situs mati dua kali tanpa restart. Container tetap
 * running dan /api/health/live tetap 200, tapi /api/health/ready menjawab 503
 * dengan databaseReachable false sementara database-nya sehat. Penyebabnya
 * bukan memori dan bukan jaringan: singleton di src/db/client.ts tidak pernah
 * di-aged, jadi begitu pooler menutup socket dari sisi server, query berikutnya
 * menggantung atau melempar "The destination stream closed early" tanpa pernah
 * pulih, dan tidak ada apa pun yang membuang cache.
 *
 * Test ini memakai klien postgres sungguhan dan server TCP tiruan, tanpa
 * Postgres sungguhan dan tanpa memalsukan modul apa pun, jadi yang diuji adalah
 * transisi state yang sebenarnya: klien dicache, koneksi jadi tidak berguna,
 * cache dibuang, lalu getDb() berikutnya membangun klien baru.
 */

type ServerTiruan = {
  port: number;
  close: () => Promise<void>;
};

/**
 * Server TCP yang menerima lalu diam, tidak menjawab satu byte pun.
 *
 * Ini bentuk kegagalan yang paling berbahaya dan paling sulit: tidak ada galat
 * yang dilempar sama sekali, jadi satu-satunya bukti bahwa koneksi tidak berguna
 * adalah deadline probe. Tidak ada protokol Postgres yang dimock di sini, dan
 * memang tidak perlu, karena tidak boleh ada yang menjawab.
 */
async function startServerDiam(): Promise<ServerTiruan> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
  });

  // listen dan close hanya punya bentuk callback, jadi new Promise di sini
  // memang diminta oleh API-nya.
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

test("koneksi yang menggantung membuat cache klien dibangun ulang", async () => {
  const server = await startServerDiam();
  arahkanKe(server.port);
  try {
    const sebelum = getDb();
    assert.ok(sebelum, "getDb harus mengembalikan db saat DATABASE_URL diisi");

    // Menunggu deadline 3 detik milik probe itu disengaja: yang diuji memang
    // timeout platform itu, jadi tidak ada jam palsu yang bisa menggantikannya
    // dan tidak ada jeda tebakan di test ini.
    const macet = await probeSchema(sebelum);
    assert.equal(macet.reachable, false, "server yang diam tidak boleh dijawab terjangkau");
    assert.equal(macet.schemaReady, false);
    assert.equal(
      macet.timedOut,
      true,
      "koneksi yang diam harus dikenali sebagai lewat deadline, bukan galat biasa"
    );

    // Probe itu sendiri yang membuang klien yang lewat deadline, jadi route
    // tidak perlu mengingat apa pun dan tidak ada logika yang diduplikasi di
    // test. Inilah yang tidak terjadi sebelum insiden: cache yang sama dipakai
    // lagi selamanya dan 503 tidak pernah berubah.
    const sesudah = getDb();
    assert.ok(sesudah, "getDb harus membangun klien baru, bukan menolak");
    assert.notEqual(sesudah, sebelum, "db harus dibangun ulang setelah probe macet");
    assert.notEqual(
      klien(sesudah),
      klien(sebelum),
      "klien postgres di belakangnya juga harus baru, bukan objek basi yang sama"
    );
    // Batas umur dan idle timeout harus benar-benar ada di klien yang
    // dibangun, bukan hanya di komentar. Bawaan driver untuk keduanya
    // adalah max_lifetime acak 30 sampai 60 menit dan idle_timeout null.
    assert.equal(klien(sesudah).options.max_lifetime, 300);
    assert.equal(klien(sesudah).options.idle_timeout, 20);
  } finally {
    invalidateDb();
    await server.close();
  }
});

test("koneksi yang ditolak membuang cache dan tetap dijawab not ready", async () => {
  arahkanKe(await portTutup());
  try {
    const sebelum = getDb();
    assert.ok(sebelum);

    const probe = await probeSchema(sebelum);
    assert.equal(probe.reachable, false, "database mati harus dijawab tidak terjangkau");
    assert.equal(probe.schemaReady, false);

    // Galat koneksi nyata (connect ditolak) harus membuat cache dibuang, bukan
    // dipakai lagi selamanya seperti pada insiden 2026-09-27.
    const sesudah = getDb();
    assert.notEqual(
      sesudah,
      sebelum,
      "galat koneksi harus membangun klien baru pada pemanggilan berikutnya"
    );

    // Build ulang tidak boleh mengarang database hidup, jadi gerbang deploy dan
    // health check Coolify tetap melihat 503.
    assert.equal(
      isReady({
        supabaseConfigured: true,
        databaseConfigured: true,
        databaseReachable: probe.reachable,
        databaseSchemaReady: probe.schemaReady,
        serviceRoleConfigured: true,
      }),
      false
    );
  } finally {
    invalidateDb();
  }
});

test("probe dengan db null tidak pernah mengarang terjangkau", async () => {
  assert.deepEqual(await probeSchema(null), {
    reachable: false,
    schemaReady: false,
    timedOut: false,
  });
});

test("cache bertahan selama tidak ada koneksi yang gagal", async () => {
  // Idle timeout 20 detik dan max_lifetime 300 detik membuat driver menutup
  // socket secara terjadwal. Closure terjadwal itu BUKAN kegagalan, jadi tidak
  // boleh membuat cache di-aged setiap beberapa detik.
  const server = await startServerDiam();
  arahkanKe(server.port);
  try {
    assert.equal(getDb(), getDb(), "getDb harus memakai cache saat koneksi tidak gagal");
  } finally {
    invalidateDb();
    await server.close();
  }
});

test("klasifikasi galat hanya menandai yang benar-benar rusak", () => {
  // Yang harus membuang cache: jalurnya rusak.
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error("write CONNECTION_CLOSED 127.0.0.1:6543"), {
        code: "CONNECTION_CLOSED",
      })
    ),
    true
  );
  assert.equal(
    isConnectionFailure(new Error("The destination stream closed early")),
    true,
    "pesan persis dari insiden harus dikenali"
  );
  assert.equal(
    isConnectionFailure(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })),
    true
  );
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })
    ),
    true
  );

  // Yang TIDAK boleh membuang cache: galat query normal. Kalau ini ikut
  // dianggap gagal, setiap load spike akan membangun klien baru.
  assert.equal(
    isConnectionFailure(
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      })
    ),
    false,
    "statement timeout bukan kegagalan koneksi"
  );
  assert.equal(
    isConnectionFailure(Object.assign(new Error("duplicate key value"), { code: "23505" })),
    false
  );
  assert.equal(isConnectionFailure(new Error("kemarin informasinya berubah")), false);
  assert.equal(isConnectionFailure("bukan Error"), false);
  assert.equal(isConnectionFailure(null), false);
  assert.equal(isConnectionFailure(undefined), false);
});

test("invalidateDb aman dipanggil saat tidak ada klien", () => {
  invalidateDb();
  assert.doesNotThrow(() => invalidateDb());
});
