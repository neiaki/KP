import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isConnectionFailure } from "../src/db/client.ts";

/*
 * Dua bagian penjaga koneksi yang paling gelap: isConnectionFailure, dan
 * callback .catch yang memanggilnya.
 *
 * Dua cacat yang keduanya berujung sama, yaitu proses Next.js produksi mati.
 *
 * Yang pertama: err.message.toLowerCase() tanpa pemeriksaan bentuk. Satu
 * rejection dengan message null sudah cukup untuk melempar TypeError dari
 * dalam callback penjaga. Dan karena `void thenable.catch(...)` membuang
 * promise yang dikembalikan .catch, TypeError itu tidak punya catcher apa
 * pun: Node melaporkannya sebagai unhandled rejection, dan sejak Node 15
 * bawaannya --unhandled-rejections=throw, jadi proses keluar.
 *
 * Yang kedua ada di call site dan bukan di isConnectionFailure: apa pun yang
 * dilemparkan callback itu berakhir sebagai penolakan tanpa catcher. Karena
 * itu test terakhir berkas ini menjalankan proses anak. Assertion di proses
 * Node yang sama tidak bisa membuktikan apa pun soal unhandled rejection,
 * karena AssertionError juga akan terlihat sebagai exit code bukan nol. Yang
 * dibuktikan di sana: proses benar-benar keluar dengan kode 0 setelah
 * menjalankan jalur yang dulu membunuhnya.
 *
 * Driver sungguhan dipakai di proses anak, tapi tidak ada database sama
 * sekali: port-nya ditutup sebelum connect, sehingga galatnya ECONNREFUSED.
 */

/* ------------------------------------------------------------------ *
 * Bentuk masukan. Fungsi klasifikasi tidak boleh melempar apa pun.
 * ------------------------------------------------------------------ */

test("isConnectionFailure tidak melempar untuk message dengan bentuk apa pun", () => {
  // Pesan yang dipakai daftar ini selalu string. Bentuk lain di bawah ini
  // semuanya pernah terjadi di dunia nyata: message null dari lapisan yang
  // membungkus galat, message angka dari driver lain, message objek dari
  // error mapper, dan Symbol dari kode yang menaruh token debug di sana.
  const pesanAneh: Array<{ label: string; nilai: unknown }> = [
    { label: "null", nilai: null },
    { label: "undefined", nilai: undefined },
    { label: "angka", nilai: 42 },
    { label: "objek", nilai: { toString: () => "not connected" } },
    { label: "symbol", nilai: Symbol("not connected") },
    { label: "string kosong", nilai: "" },
    { label: "string sangat panjang", nilai: "not connected".repeat(20_000) },
    { label: "array", nilai: ["not connected"] },
  ];

  for (const satu of pesanAneh) {
    // Bentuk Error asli. Propertinya di-assign karena Error.message writable,
    // jadi ini persis bentuk yang dulu meledak di baris toLowerCase.
    const err = new Error("asal");
    Object.assign(err, { message: satu.nilai });
    assert.doesNotThrow(
      () => isConnectionFailure(err),
      `message ${satu.label} tidak boleh membuat isConnectionFailure melempar`
    );
    assert.equal(
      typeof isConnectionFailure(err),
      "boolean",
      `message ${satu.label} harus tetap menghasilkan boolean`
    );

    // Objek biasa tanpa prototipe Error, supaya cabang yang sama ikut diuji.
    const polos = { message: satu.nilai };
    assert.doesNotThrow(
      () => isConnectionFailure(polos),
      `message ${satu.label} pada objek biasa tidak boleh melempar`
    );
  }
});

test("isConnectionFailure tidak melempar untuk accessor yang melempar", () => {
  // Bentuk terakhir yang masih bisa melempar setelah pengecekan bentuk: bukan
  // nilai yang salah, tapi getter-nya yang dipanggil. code dan message dua-duanya
  // diuji karena keduanya dibaca penjaga, dan sebuah Proxy bisa dibuat untuk
  // salah satunya saja.
  const getterMelempar = (nama: "code" | "message") =>
    new Proxy(
      {},
      {
        get(target, prop) {
          if (prop === nama) throw new Error(`getter ${nama} sengaja melempar`);
          return Reflect.get(target, prop);
        },
      }
    );

  for (const nama of ["code", "message"] as const) {
    const proxy = getterMelempar(nama);
    assert.doesNotThrow(
      () => isConnectionFailure(proxy),
      `getter ${nama} yang melempar tidak boleh menjatuhkan proses`
    );
    assert.equal(
      isConnectionFailure(proxy),
      false,
      `getter ${nama} yang melempar berarti kode tidak bisa dibaca, jadi bukan bukti koneksi rusak`
    );
  }

  // Bentuk yang lebih dekat ke kenyataan: objek biasa dengan property getter
  // yang melempar, bukan Proxy.
  const denganGetter = {
    get message(): string {
      throw new Error("message getter melempar");
    },
    code: "08006",
  };
  assert.doesNotThrow(() => isConnectionFailure(denganGetter));
  assert.equal(
    isConnectionFailure(denganGetter),
    true,
    "code yang terbaca tetap harus dipakai walau message getter-nya melempar"
  );
});

test("isConnectionFailure tidak melempar untuk err itu sendiri yang aneh", () => {
  // err bisa apa saja: .begin dan .unsafe boleh menolak dengan nilai yang
  // bukan Error, dan lapisan di atas driver bisa membungkusnya jadi apa saja.
  const errAneh: Array<{ label: string; nilai: unknown }> = [
    { label: "null", nilai: null },
    { label: "undefined", nilai: undefined },
    { label: "nol", nilai: 0 },
    { label: "string berisi kalimat", nilai: "socket hang up" },
    { label: "symbol", nilai: Symbol("socket hang up") },
    { label: "fungsi", nilai: () => "not connected" },
    { label: "array kosong", nilai: [] },
  ];

  for (const satu of errAneh) {
    assert.doesNotThrow(
      () => isConnectionFailure(satu.nilai),
      `err ${satu.label} tidak boleh membuat isConnectionFailure melempar`
    );
    assert.equal(
      typeof isConnectionFailure(satu.nilai),
      "boolean",
      `err ${satu.label} harus tetap menghasilkan boolean`
    );
  }

  // String dan Symbol primitif sengaja tidak diklasifikasi, meski isinya
  // persis kalimat yang ada daftarnya. Bentuk primitif tidak punya kode dan
  // tidak punya message, dan mengarang message dari isinya akan membuka jalan
  // baru untuk salah klasifikasi.
  assert.equal(isConnectionFailure("socket hang up"), false);
  assert.equal(isConnectionFailure(Symbol("socket hang up")), false);
});

/* ------------------------------------------------------------------ *
 * Klasifikasi SQLSTATE. Setiap kode dipin satu per satu.
 * ------------------------------------------------------------------ */

/** Bentuk PostgresError sungguhan: instance Error dengan properti code. */
function postgresError(kode: string, pesan: string): Error {
  return Object.assign(new Error(pesan), { code: kode });
}

test("kelas 08 dan kelas 57 yang server hilang ikut membangun ulang cache", () => {
  // Semua ini berarti jalur, bukan query: kelas 08 = Connection Exception,
  // dan 57P01/57P02/57P04 = server dimatikan, crash, atau di-drop. Semuanya
  // berakhir dengan socket yang tidak berguna, persis insiden 2026-09-27.
  const terklasifikasi: Array<readonly [string, string]> = [
    ["08000", "connection_exception"],
    ["08001", "sqlclient_unable_to_establish_sqlconnection"],
    ["08002", "sqlserver_rejected_establishment_of_connection"],
    ["08003", "connection_does_not_exist"],
    ["08004", "server_rejected_establishment_of_new_connection"],
    ["08006", "connection_failure"],
    ["08007", "transaction_resolution_unknown"],
    ["08P01", "protocol_violation"],
    ["57P01", "admin_shutdown"],
    ["57P02", "crash_shutdown"],
    ["57P04", "database_droped"],
  ];

  for (const [kode, arti] of terklasifikasi) {
    assert.equal(
      isConnectionFailure(postgresError(kode, arti)),
      true,
      `${kode} (${arti}) adalah kegagalan koneksi dan harus membangun ulang cache`
    );
  }
});

test("kode yang ditolak tetap ditolak, termasuk yang ditinjau tapi tidak jadi", () => {
  // 53300 too_many_connections ditolak dengan sadar: itu penolakan koneksi BARU
  // karena max_connections penuh, sedangkan koneksi yang sedang dipakai klien
  // utuh. Membuang cache di sini justru menambah beban ke server yang sedang
  // penuh, jadi over-invalidation di sini mahal, bukan murah.
  //
  // 57P03 cannot_connect_now juga ditolak: koneksi belum terjadi, jadi tidak
  // ada jalur yang rusak, dan retry driver yang menanganinya.
  //
  // Sisanya adalah galat query dan data yang harus tetap memakai cache lama,
  // termasuk 57014 yang paling sering muncul di produksi.
  const ditolak: Array<readonly [string, string]> = [
    ["53300", "too many connections"],
    ["57P03", "cannot connect now"],
    ["57014", "canceling statement due to statement timeout"],
    ["23505", 'duplicate key value violates unique constraint "x_pkey"'],
    ["23503", "foreign key violation"],
    ["23514", "check constraint violation"],
    ["22P02", "invalid text representation"],
    ["42P01", 'relation "x" does not exist'],
    ["42703", 'column "x" does not exist'],
    ["40001", "serialization failure"],
    ["40P01", "deadlock detected"],
    ["42601", 'syntax error at or near "seelect"'],
  ];

  for (const [kode, pesan] of ditolak) {
    assert.equal(
      isConnectionFailure(postgresError(kode, pesan)),
      false,
      `${kode} bukan kegagalan koneksi, jadi cache harus tetap dipakai`
    );
  }
});

test("objek biasa yang membawa kode 08006 tetap dihitung kegagalan koneksi", () => {
  // Ini keputusan sadar, bukan kelalaian. Kode galat adalah sinyal terstruktur
  // dari driver, dan lapisan mana pun di antara socket dan kita bisa
  // membungkusnya jadi objek biasa tanpa kehilangan maknanya. Dulu pagar
  // instanceof Error menahan pengakuan seperti ini, jadi kasus 08006 yang
  // justru tercatat di kepala berkas sebagai commit yang putus lolos begitu
  // saja.
  assert.equal(
    isConnectionFailure({ code: "08006", message: "connection terminated unexpectedly" }),
    true,
    "kode 08006 harus tetap dihitung walau prototipe Error hilang"
  );
  assert.equal(
    isConnectionFailure({
      code: "57P01",
      message: "terminating connection due to administrator command",
    }),
    true,
    "kode 57P01 harus tetap dihitung walau prototipe Error hilang"
  );
  assert.equal(
    isConnectionFailure({
      code: "23505",
      message: 'duplicate key value violates unique constraint "x"',
    }),
    false,
    "kode di luar daftar tetap ditolak walau pesannya seperti kalimat koneksi"
  );
});

test("kode yang ada berkuasa, kalimat tidak dipakai untuk membangun ulang cache", () => {
  // Ketiganya kalimat yang benar-benar keluar dari driver, dan semuanya dulu
  // membakar cache pada galat query biasa. Setelah kode jadi berkuasa, yang
  // memutuskan adalah kode.
  assert.equal(
    isConnectionFailure(
      postgresError("23505", 'duplicate key value violates unique constraint "x", not connected')
    ),
    false,
    "23505 tidak boleh invalidate walau pesannya memuat kalimat koneksi"
  );
  assert.equal(
    isConnectionFailure(postgresError("42P01", 'relation "x" does not exist, socket hang up')),
    false,
    "42P01 tidak boleh invalidate walau pesannya memuat kalimat koneksi"
  );
  assert.equal(
    isConnectionFailure(
      postgresError("57014", "canceling statement due to statement timeout: write after end")
    ),
    false,
    "57014 tetap tidak invalidate walau pesannya memuat kalimat koneksi"
  );

  // Tanpa kode yang bisa dipercaya, kalimat tetap dipakai. Ini jalur driver pg
  // sekeluarga, yang berdiri di depan socket kita kalau deployment pernah
  // memakai PgBouncer alih-alih postgres.js.
  assert.equal(
    isConnectionFailure(new Error("Connection terminated unexpectedly")),
    true,
    "kalimat tanpa kode harus tetap dihitung"
  );
  assert.equal(
    isConnectionFailure({
      message: "Client has encountered a connection error and is not queryable",
    }),
    true,
    "kalimat tanpa kode pada objek biasa juga harus dihitung"
  );
});

test("code yang tidak bisa dipercaya tidak membatalkan jalur kalimat", () => {
  // code bukan string dan bukan angka finite berarti tidak ada kode, jadi
  // kalimat tetap jadi dasar klasifikasi. code null, code objek, dan code NaN
  // semuanya harus diperlakukan sama dengan tidak ada code sama sekali.
  const tidakDipercaya: unknown[] = [
    null,
    undefined,
    {},
    [],
    Number.NaN,
    Symbol("08006"),
    () => "08006",
  ];
  for (const code of tidakDipercaya) {
    assert.equal(
      isConnectionFailure({ code, message: "socket hang up" }),
      true,
      `code ${typeof code} bukan kode yang bisa dipercaya, kalimat harus jadi dasar`
    );
  }
});

/* ------------------------------------------------------------------ *
 * Jalur yang dulu membunuh proses, dijalankan di proses anak.
 * ------------------------------------------------------------------ */

test("callback penjaga yang melempar tidak menghasilkan unhandled rejection", () => {
  // Tidak ada database di sini: harness di tests/fixtures membuat port
  // tertutup sendiri lalu melakukan connect ke sana, sehingga galatnya
  // ECONNREFUSED dari Node dan tidak pernah menyentuh PostgreSQL mana pun.
  const hasil = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      new URL("./fixtures/db-guard-crash-child.ts", import.meta.url).pathname,
    ],
    { encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(
    hasil.status,
    0,
    "proses harus selamat dari jalur yang dulu menjadi unhandled rejection" +
      ` (status ${hasil.status}, stderr: ${hasil.stderr})`
  );
  assert.match(hasil.stdout, /PROSES_SELAMAT/, "harness harus sampai ke akhir");
});
