import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Dua setelan yang hanya berlaku di Vercel, dan keduanya hilang tanpa bukti apa
 * pun kalau sampai rusak: maxDuration dan daftar origin Server Actions.
 *
 * maxDuration. Semua halaman publik dirender per request dan membaca database
 * lewat dbBatch. Langkah di dalam dbBatch ditolak setelah DB_BATCH_STEP_TIMEOUT_MS
 * kalau tidak selesai, jadi satu request bisa saja spends selama itu sebelum
 * mengembalikan error. Batas durasi Vercel Hobby hanya 10 detik. Kalau
 * maxDuration tidak lebih besar dari batas internal itu, platform membunuh
 * request duluan dan kita kehilangan satu-satunya jejak kenapa halaman lambat:
 * tidak ada error yang sempat ditulis.
 *
 * Daftar origin. Server Actions memverifikasi Origin header dan menolak 403
 * kalau domainnya tidak terdaftar. Gejalanya mudah disalahartikan: form di
 * portal terlihat benar lalu diam-diam gagal saat dikirim. Produksi dan preview
 * Vercel keduanya harus ada.
 *
 * Tapi daftar ini juga tempat orang membuka akses tanpa sadar, jadi wildcard
 * bledak seperti "*" atau "*.vercel.app" ikut ditolak di sini. Yang diizinkan
 * hanya wildcard milik domain sendiri.
 */

const layoutSrc = readFileSync(
  new URL("../src/app/(public)/[locale]/layout.tsx", import.meta.url),
  "utf8"
);

const nextConfigSrc = readFileSync(
  new URL("../next.config.ts", import.meta.url),
  "utf8"
);

/** Angka maxDuration di layout publik, atau undefined kalau tidak ada. */
function maxDurationDetik(): number | undefined {
  const cocok = layoutSrc.match(/export const maxDuration = (\d+);/);
  return cocok ? Number(cocok[1]) : undefined;
}

test("halaman publik punya maxDuration di atas batas internal dbBatch", async () => {
  const { DB_BATCH_STEP_TIMEOUT_MS } = await import("../src/db/client.ts");

  const detik = maxDurationDetik();
  assert.ok(
    detik !== undefined,
    "src/app/(public)/[locale]/layout.tsx wajib export const maxDuration, kalau tidak " +
      "Vercel memakai default 10 detik dan request lambat dibunuh tanpa error"
  );

  const batasInternalDetik = DB_BATCH_STEP_TIMEOUT_MS / 1000;

  assert.ok(
    detik > batasInternalDetik,
    `maxDuration ${detik} detik harus lebih besar dari batas internal dbBatch ` +
      `${batasInternalDetik} detik. Kalau tidak, platform membatalkan request ` +
      "sebelum dbBatch sempat menulis sendiri alasannya."
  );
});

test("maxDuration tidak meminta kuota maksimum Hobby tanpa alasan", () => {
  const detik = maxDurationDetik();
  assert.ok(detik !== undefined, "maxDuration harus ada, test sebelumnya menyorotnya");

  // 60 detik adalah plafon duration fungsi pada paket Hobby. Meminta angka yang
  // lebih besar tidak menambah waktu nyata, hanya membuat plan yang lebih besar
  // dibutuhkan. Yang wajar berhenti di 30.
  assert.ok(
    detik <= 30,
    `maxDuration ${detik} detik melewati 30 detik. Kalau memang perlu lebih panjang, ` +
      "jelaskan dulu alasan teknisnya di komentar export-nya."
  );
});

test("origin Server Actions memuat produksi dan preview Vercel", () => {
  const wajib = ["atcell.my.id", "*.atcell.my.id", "kp-rust-five.vercel.app"];
  const hilang = wajib.filter((o) => !nextConfigSrc.includes(`"${o}"`));
  assert.deepEqual(
    hilang,
    [],
    "origin ini tidak ada di next.config.ts. Server Actions dari domain itu akan " +
      `ditolak 403: ${hilang.join(", ")}`
  );
});

test("daftar origin Server Actions tidak dibuka terlalu lebar", () => {
  const blok = nextConfigSrc.match(
    /const serverActionOrigins = Array\.from\(\s*new Set\(\[([\s\S]*?)\]\)\s*\);/
  );
  assert.ok(
    blok,
    "next.config.ts harus tetap membentuk serverActionOrigins dari new Set([...]), " +
      "supaya pola dan env bisa dibaca test ini"
  );

  // Hanya wildcard milik domain sendiri yang boleh ada. "*" membuka Server
  // Actions untuk seluruh internet, dan "*.vercel.app" membukanya untuk semua
  // preview orang lain.
  const wildcardAsing = [...blok[1].matchAll(/"([^"]*\*[^"]*)"/g)]
    .map((m) => m[1])
    .filter((o) => o !== "*.atcell.my.id");

  assert.deepEqual(
    wildcardAsing,
    [],
    `wildcard di luar domain sendiri: ${wildcardAsing.join(", ")}`
  );
});

test("maxDuration diletakkan di layout publik, bukan hanya satu halaman", () => {
  // Di layout, route segment config berlaku untuk semua segmen di bawahnya.
  // Kalau ditaruh di satu page saja, halaman lain yang nanti mulai membaca
  // database akan kembali ke default 10 detik tanpa ada yang menyadarinya.
  assert.ok(
    layoutSrc.includes("export const maxDuration"),
    "maxDuration harus ada di layout [locale] supaya semua halaman publik ikut"
  );

  const pageSrc = readFileSync(
    new URL("../src/app/(public)/[locale]/page.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(
    !/export const maxDuration\s*=\s*\d+/.test(pageSrc),
    "page.tsx tidak perlu maxDuration sendiri: layout sudah menurunkannya ke semua " +
      "halaman. Dua tempat berarti hanya satu yang bisa basi diam-diam."
  );
});