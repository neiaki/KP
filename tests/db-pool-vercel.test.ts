import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Penjaga untuk 504 FUNCTION_INVOCATION_TIMEOUT di deployment Vercel.
 *
 * Gejalanya: /id, /en, /id/catalog, /id/tracking, dan halaman lain di bawah
 * /[locale] timeout lebih dari 40 detik, sementara /api/health/ready membalas
 * 200 dalam 0,3 detik. Health check itu memakai satu koneksi, sedangkan setiap
 * halaman publik membaca snapshot etalase di layout.
 *
 * src/db/client.ts pernah mematok max: 1 di Vercel. Angka itu tidak bisa
 * bekerja, dan bukan karena kurangnya koneksi: di node_modules/postgres 3.4.9,
 * handler() di src/index.js:329-342 mencari koneksi di antrean open, closed,
 * lalu busy; kalau ketiganya kosong, query masuk antrean queries. go()
 * (src/index.js:344-348) memindahkan koneksi ke antrean full kalau
 * Connection.execute() mengembalikan false karena backpressure, dan antrean
 * full tidak pernah dikuras di mana pun di driver. Antrean queries hanya
 * dikuras saat socket connect atau ditutup (src/index.js:401-427). Dengan max 1
 * tidak ada socket kedua, jadi query yang mengantre menggantung tanpa galat,
 * tanpa statement_timeout, dan tanpa lock_timeout. Instance serverless tidak
 * pernah dimatikan, jadi satu request yang begitu menyeret semua request
 * berikutnya.
 *
 * Test di bawah menjaga dua hal: angka patok itu tidak boleh kembali, dan jalur
 * render publik tetap melepas query lewat dbBatch.
 */

// Dipasang sebelum impor: client.ts membaca process.env.VERCEL saat modul
// dimuat, jadi env harus sudah ada lebih dulu.
process.env.VERCEL = "1";

const clientUrl = new URL("../src/db/client.ts", import.meta.url);
const { POOL_EFEKTIF } = await import(clientUrl.href);

test("Vercel tidak boleh lagi dipatok satu koneksi", async () => {
  const sumber = await readFile(clientUrl, "utf8");

  assert.ok(
    POOL_EFEKTIF > 1,
    `POOL_EFEKTIF harus lebih dari satu koneksi bahkan dengan VERCEL=1, sekarang ${POOL_EFEKTIF}. `
      + "Satu koneksi membuat pool postgres.js menggantung permanen begitu ada "
      + "dua query bersamaan, dan itu 504 FUNCTION_INVOCATION_TIMEOUT di "
      + "kp-rust-five.vercel.app."
  );

  assert.equal(
    /process\.env\.VERCEL\s*\?\s*1\b/.test(sumber),
    false,
    "src/db/client.ts tidak boleh lagi mempatok pool lewat process.env.VERCEL. "
      + "Lihat catatan di atas test untuk bukti bagian driver yang jadi sebab."
  );

  assert.match(
    sumber,
    /export const POOL_EFEKTIF = POOL_MAX;/,
    "src/db/client.ts harus memakai POOL_MAX apa pun platformnya"
  );
  assert.match(sumber, /max: POOL_EFEKTIF,/, "option postgres() harus memakai max: POOL_EFEKTIF");
});

test("catatan penyebab di driver tidak boleh hilang tanpa pengganti", async () => {
  const sumber = await readFile(clientUrl, "utf8");

  // Angka 1 terlihat hemat dan sangat mudah dikembalikan lagi. Yang menahan
  // orang mengembalikannya bukan komentar, tapi bukti yang bisa diuji ulang
  // di driver: kalau(driver ini berubah, test ini ikut gagal dan akar
  // masalahnya harus dicari ulang.
  for (const jejak of [
    /src\/index\.js:329-342/,
    /src\/index\.js:344-348/,
    /antrean full tidak pernah dikuras/i,
    /onopen|onclose/,
  ]) {
    assert.match(
      sumber,
      jejak,
      "komentar penyebab di client.ts harus masih menyebut bagian driver yang jadi bukti"
    );
  }
});

test("jalur render publik melepas query lewat dbBatch", async () => {
  // Promise.all di jalur render berarti query paralel. Itu sendiri tidak salah
  // sekarang, tapi dbBatch adalah satu tempat yang menahan mutex dan memasang
  // batas waktu, jadi pemanggilnya tidak boleh manages sendiri.
  const berkas = [
    "src/lib/actions/public.ts",
    "src/components/public/store-json-ld.tsx",
    "src/app/(public)/[locale]/page.tsx",
    "src/app/(public)/[locale]/about/page.tsx",
    "src/lib/actions/auth.ts",
  ];

  for (const relatif of berkas) {
    const sumber = await readFile(new URL(`../${relatif}`, import.meta.url), "utf8");
    assert.match(
      sumber,
      /dbBatch\(\[/,
      `${relatif} harus melepas query lewat dbBatch supaya terlindungi batas waktu dan mutex`
    );
  }
});

test("fetch ke Google tidak boleh di dalam batch database", async () => {
  // getGoogleReviews() bicara dengan Google lewat jaringan. Kalau ia memegang
  // batch, satu fetch yang lambat menahan semua query database instance itu.
  const sumber = await readFile(
    new URL("../src/components/public/store-json-ld.tsx", import.meta.url),
    "utf8"
  );

  const blokBatch = sumber.slice(sumber.indexOf("await dbBatch(["));
  assert.equal(
    blokBatch.slice(0, blokBatch.indexOf("]);")).includes("getGoogleReviews("),
    false,
    "getGoogleReviews() tidak boleh berada di dalam dbBatch"
  );
  assert.match(
    sumber,
    /const reviewsP = getGoogleReviews\(\)/,
    "ulasan harus diambil terpisah, lalu ditunggu setelah batch selesai"
  );
});