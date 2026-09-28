import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Penjaga 404 untuk locale yang tidak dikenal: /tidak-ada, /foo, /admin,
 * /staff. URL seperti itu COCOK dengan route /[locale], jadi tidak pernah
 * dilayani route /_not-found. Yang melayani adalah boundary not-found
 * paling atas di src/app/not-found.tsx, karena
 * src/app/(public)/[locale]/layout.tsx L53-55 memanggil notFound() untuk
 * locale yang tidak didukung.
 *
 * Cacat yang dijaga di sini sudah terjadi di produksi. Berkas not-found itu
 * hanya mengembalikan fragmen, padahal root layout yang melempar notFound()
 * ikut terbuang bersama seluruh <html> dan <body>-nya. Stream HTML berakhir
 * tanpa tag root, lalu Next.js menempelkan <html id="__next_error__"> dengan
 * pesan "Missing <html> and <body> tags in the root layout"
 * (node_modules/next/dist/server/app-render/stream-ops.node.js L451-466).
 * Hasilnya persis yang terlihat di produksi: nol stylesheet, tanpa navbar,
 * tanpa footer, Times New Roman.
 *
 * Ini penjaga STATIS, bukan uji runtime, dan itu disengaja.
 *
 * Yang terbukti benar di sini butuh `next build` penuh: membangun route
 * table, menjalankan server hasil build, lalu meminta /foo dan menghitung
 * <link rel="stylesheet"> di HTML balasannya. Build tidak bisa menjadi
 * penjaga secara rutin: ia hanya bisa jalan di environment yang sama, tidak
 * cocok untuk tiap `npm test`, dan ikut gagal kalau ada agent lain sedang
 * menyentuh berkas mana pun. Yang dijaga di sini adalah prasyarat yang
 * membuat hasil build itu benar: boundary-nya mengembalikan dokumen utuh,
 * ia memuat stylesheet global, dan ia memakai chrome bersama yang sama
 * dengan 404 global. Menghapus <html>/<body>, menghapus import globals.css,
 * atau memindahkan isinya ke komponen sendiri akan membuat test ini gagal.
 *
 * Test terakhir di berkas ini menjaga KEBALIKAN dari solusinya. Berkas
 * not-found.tsx di dalam segmen [locale] pernah dicoba sebagai perbaikan
 * dan terbukti tidak bekerja sama sekali, karena boundary sebuah segmen
 * duduk di dalam layout-nya dan tidak bisa menangkap notFound() yang
 * dilempar layout itu sendiri. Kalau boundary itu dibikin mengembalikan
 * dokumen utuh, dia justru jadi <html> di dalam <html> untuk pemanggilan
 * dari halaman. Test itu ada supaya kesalahan yang sama tidak diulang.
 *
 * Berkas .tsx tidak bisa diimpor runner test bawaan Node: ERR_UNKNOWN_FILE_
 * EXTENSION "Unknown file extension \".tsx\"", karena runner hanya mengurai
 * TypeScript tanpa JSX, dan isinya juga menarik komponen React plus alias @/
 * yang tidak bisa diurai runner. Karena itu isi .tsx dibaca sebagai teks.
 */

const NOT_FOUND = new URL("../src/app/not-found.tsx", import.meta.url);
const GLOBAL_NOT_FOUND = new URL("../src/app/global-not-found.tsx", import.meta.url);
const PUBLIC_LAYOUT = new URL("../src/app/(public)/[locale]/layout.tsx", import.meta.url);
const PORTAL_LAYOUT = new URL("../src/app/(portal)/layout.tsx", import.meta.url);
const PUBLIC_LOCALE_DIR = new URL("../src/app/(public)/[locale]/", import.meta.url);
const PORTAL_DIR = new URL("../src/app/(portal)/", import.meta.url);

function modeRender(isi: string): string | null {
  return isi.match(/export const dynamic\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
}

test("boundary 404 paling atas mengembalikan dokumen utuh, bukan fragmen", async () => {
  const isi = await readFile(NOT_FOUND, "utf8");
  assert.match(isi, /<html\b/, "tanpa <html> di sini, stream berakhir tanpa tag root dan Next menempelkan shell __next_error__");
  assert.match(isi, /<body\b/, "tanpa <body> di sini, stream berakhir tanpa tag root dan Next menempelkan shell __next_error__");
});

test("boundary 404 paling atas memuat stylesheet global dan chrome bersama", async () => {
  const isi = await readFile(NOT_FOUND, "utf8");
  assert.match(
    isi,
    /import\s+["']\.\/globals\.css["']/,
    "root layout yang melempar notFound() ikut terbuang, jadi stylesheet global harus diimpor di berkas ini"
  );
  for (const wajib of [/htmlClass/, /bodyClass/, /RootProviders/, /NotFoundPage/]) {
    assert.match(isi, wajib, `boundary 404 kehilangan ${wajib.source}`);
  }
});

test("kedua halaman 404 memakai komponen chrome yang sama", async () => {
  const isi = await readFile(NOT_FOUND, "utf8");
  const global = await readFile(GLOBAL_NOT_FOUND, "utf8");
  assert.match(
    isi,
    /import\s*\{\s*NotFoundPage\s*\}\s*from\s*["']@\/app\/global-not-found["']/,
    "src/app/not-found.tsx harus memakai NotFoundPage, bukan menyalin ErrorState-nya sendiri"
  );
  assert.match(
    global,
    /export\s+async\s+function\s+NotFoundPage\b/,
    "NotFoundPage harus tetap diekspor dari src/app/global-not-found.tsx, dua 404 tidak boleh melenceng"
  );
});

test("boundary 404 tetap server component dan dirender per permintaan", async () => {
  const [notFound, portalLayout] = await Promise.all([
    readFile(NOT_FOUND, "utf8"),
    readFile(PORTAL_LAYOUT, "utf8"),
  ]);
  assert.ok(
    !/^\s*["']use client["']/m.test(notFound),
    "segment config di berkas klien diabaikan tanpa pesan, dan <html>/<body> tidak boleh dibuat dari komponen klien"
  );
  assert.equal(
    modeRender(notFound),
    "force-dynamic",
    "kalau hilang, halaman ini boleh diprerender dan nonce hasil build tidak akan cocok dengan CSP per permintaan"
  );
  assert.equal(
    modeRender(notFound),
    modeRender(portalLayout),
    "kalau mode render berbeda dari portal, nonce per permintaan tidak bisa dijamin untuk keduanya"
  );
});

test("hanya layout [locale] yang memanggil notFound, dan di dalam segmen itu", async () => {
  const isi = await readFile(PUBLIC_LAYOUT, "utf8");
  assert.match(
    isi,
    /if\s*\(\s*!isSupportedLocale\([^)]*\)\s*\)\s*\{\s*notFound\(\);/,
    "pemeriksaan locale harus tetap di layout [locale]: dialihkan ke halaman, notFound() tidak lagi tertangkap boundary mana pun dan status 404 berubah jadi 200"
  );
});

test("tidak ada not-found.tsx di dalam route group mana pun", async () => {
  // Lihat comment di atas: boundary di dalam segmen duduk DI DALAM layout-nya,
  // jadi tidak bisa menangkap notFound() yang dilempar layout itu sendiri, dan
  // kalau dipaksa mengembalikan dokumen utuh dia jadi <html> di dalam <html>.
  for (const [nama, dir] of [
    ["src/app/(public)/[locale]/", PUBLIC_LOCALE_DIR],
    ["src/app/(portal)/", PORTAL_DIR],
  ] as const) {
    let isi = "";
    try {
      isi = await readFile(new URL("not-found.tsx", dir), "utf8");
    } catch {
      continue; // memang tidak ada, ini yang diharapkan
    }
    assert.fail(
      `${nama}not-found.tsx tidak akan pernah dipakai untuk notFound() dari layout-nya sendiri, dan dokumen utuh di sana akan bersarang. Isi berkas:\n${isi.slice(0, 200)}`
    );
  }
});
