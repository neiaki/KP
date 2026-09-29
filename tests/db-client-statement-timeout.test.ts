import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { sql as drizzleSql } from "drizzle-orm";
// Hanya untuk bentuk tipenya. Modul sungguhan diimpor ulang per kasus di
// bawah, dan impor bertipe tidak membangun apa pun.
import type * as ModulKlien from "../src/db/client.ts";

/*
 * STATEMENT_TIMEOUT_MS dibaca kode di src/db/client.ts lalu dikirim ke
 * PostgreSQL sebagai startup parameter, bukan sebagai SET. Yang diuji di sini
 * adalah nilai yang benar-benar keluar dari driver, karena tempat gagalnya ada
 * di lapisan itu dan bukan di pembacaan env: cjs/src/connection.js menyaring
 * opsi connection dengan filter `[, v]) => v` yang membuang nilai falsy.
 *
 * Akibatnya 0 dan NaN bukan "batas waktu nol", melainkan tidak adanya
 * statement_timeout sama sekali, tanpa satu galat pun yang bisa dilihat
 * operator. Nilai yang tidak bisa dipakai harus kembali ke bawaan, bukan
 * diteruskan dan bukan dihilangkan.
 *
 * Server TCP tiruan, tanpa PostgreSQL sungguhan, karena startup message adalah
 * tempat nilai itu benar-benar terlihat.
 */

type ServerTiruan = {
  port: number;
  /** Selesai begitu pesan startup pertama terbaca, dengan isinya apa adanya. */
  diterima: Promise<Record<string, string>>;
  close: () => Promise<void>;
};

/**
 * Server yang membaca pesan startup pertama lalu menutup socket.
 *
 * Panjang pesan ada di empat byte pertama, jadi pesan bisa dipotong tepat
 * pada batasnya. SSLRequest dan pesan lain yang menyusul di socket yang sama
 * tidak ikut terbaca, karena isinya bukan bagian dari startup message.
 *
 * Isi startup message bukan daftar "nama=-nilai" seperti connection string,
 * melainkan rangkaian teks yang diakhiri NUL, dibaca berpasangan: nama, nilai,
 * nama, nilai. Salah membacanya membuat setiap nama kehilangan huruf
 * terakhirnya, sehingga test hijau tanpa pernah melihat nilai aslinya.
 */
async function startServer(): Promise<ServerTiruan> {
  const { promise: diterima, resolve } = Promise.withResolvers<Record<string, string>>();
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let buf = Buffer.alloc(0);
    socket.on("data", (c) => {
      buf = Buffer.concat([buf, c]);
      if (buf.length < 4) return;
      const panjang = buf.readInt32BE(0);
      if (buf.length < panjang) return;
      const isi = buf.subarray(8, panjang - 1).toString("latin1").split("\0").filter(Boolean);
      const param: Record<string, string> = {};
      for (let i = 0; i + 1 < isi.length; i += 2) param[isi[i]] = isi[i + 1];
      resolve(param);
      socket.destroy();
    });
    socket.on("error", () => {});
  });

  await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    port,
    diterima,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}

/**
 * Tunggu sinyal yang benar-benar terjadi, dengan batas waktu hanya sebagai
 * jalan keluar kalau sinyalnya tidak pernah datang. Ini bukan jeda: test
 * selesai secepat sinyalnya tiba, dan tidak menebak-nebak lamanya.
 */
async function denganBatasWaktu<T>(sinyal: Promise<T>, milidetik: number): Promise<T> {
  const { promise, reject } = Promise.withResolvers<never>();
  const pengaman = setTimeout(
    () => reject(new Error("startup message tidak pernah sampai")),
    milidetik
  );
  pengaman.unref?.();
  try {
    return await Promise.race([sinyal, promise]);
  } finally {
    clearTimeout(pengaman);
  }
}

let nomor = 0;

/**
 * Bangun klien dengan STATEMENT_TIMEOUT_MS tertentu, lalu baca apa yang dikirim.
 *
 * Impor di-cache-busting supaya konstanta di src/db/client.ts dihitung ulang
 * dari env yang baru: ia dibaca saat modul dimuat, bukan saat koneksi
 * dibentuk, jadi hanya impor baru yang bisa mengujinya. Impor statis tidak
 * bisa dipakai di sini karena konstantanya sudah terkunci pada muat pertama,
 * dan impor bertanda kutip tidak bisa di-cache-bust. Setiap impor juga punya
 * singleton sendiri, jadi invalidateDb miliknya tidak menyentuh impor lain.
 */
async function paramYangTerkirim(nilaiEnv: string | undefined): Promise<Record<string, string>> {
  const server = await startServer();
  process.env.DATABASE_URL = `postgres://atcell:rahasia@127.0.0.1:${server.port}/postgres`;
  if (nilaiEnv === undefined) delete process.env.STATEMENT_TIMEOUT_MS;
  else process.env.STATEMENT_TIMEOUT_MS = nilaiEnv;
  nomor += 1;
  const modul = (await import(`../src/db/client.ts?kasus=${nomor}`)) as typeof ModulKlien;
  try {
    // Driver baru mencoba terhubung pada query pertama, jadi tanpa query
    // tidak ada satu byte pun yang keluar untuk diamati.
    modul.getDb()?.execute(drizzleSql`select 1`).catch(() => {});
    return await denganBatasWaktu(server.diterima, 5000);
  } finally {
    modul.invalidateDb();
    await server.close();
  }
}

test("bawaan dipakai kalau env tidak diisi, dan lock_timeout tidak ikut berubah", async () => {
  const param = await paramYangTerkirim(undefined);
  assert.equal(
    param.statement_timeout,
    "8000",
    `bawaan harus dikirim, bukan dilewati: ${JSON.stringify(param)}`
  );
  assert.equal(param.lock_timeout, "2000", "lock_timeout harus tetap 2000");
});

test("nilai yang dipakai operator diteruskan apa adanya", async () => {
  const param = await paramYangTerkirim("15000");
  assert.equal(param.statement_timeout, "15000");
});

test("nilai tidak bisa dipakai apa adanya jatuh ke bawaan, bukan ke tidak ada batas", async () => {
  // Semua nilai ini jadi 0 atau NaN di Number(), yang sama-sama falsy dan
  // sama-sama dibuang driver, jadi tanpa penjaga tidak ada statement_timeout
  // yang pernah dikirim. Kosong adalah yang paling mungkin terjadi, karena
  // operator mengosongkan fieldnya di dashboard Coolify.
  for (const buruk of ["", "   ", "abc", "0"]) {
    const param = await paramYangTerkirim(buruk);
    assert.equal(
      param.statement_timeout,
      "8000",
      `nilai ${JSON.stringify(buruk)} harus jatuh ke bawaan, dapat ${JSON.stringify(param)}`
    );
  }
});

test("nilai di luar rentang integer ditolak sebelum sampai ke PostgreSQL", async () => {
  // statement_timeout adalah parameter integer, jadi negatif dan pecahan
  // ditolak server saat koneksi dibentuk, yaitu seluruh aplikasi tidak bisa
  // terhubung karena satu salah ketik di dashboard.
  for (const buruk of ["-1", "2500.7"]) {
    const param = await paramYangTerkirim(buruk);
    assert.equal(
      param.statement_timeout,
      "8000",
      `nilai ${JSON.stringify(buruk)} harus jatuh ke bawaan, dapat ${JSON.stringify(param)}`
    );
  }
});

test("nilai terlalu besar dipangkas ke batas atas, bukan diteruskan utuh", async () => {
  // Di Vercel `max` hanya 1, jadi statement yang menahan sepuluh menit
  // menahan seluruh instance dan request berikutnya antre di belakang satu
  // socket yang sama.
  const param = await paramYangTerkirim("600000");
  assert.equal(param.statement_timeout, "30000");
});
