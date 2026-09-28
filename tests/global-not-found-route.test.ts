import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nextConfig from "../next.config.ts";

/*
 * Penjaga route 404 global.
 *
 * Cacat yang dijaga di sini sudah terjadi di produksi. At Cell punya dua root
 * layout, src/app/(public)/[locale]/layout.tsx dan src/app/(portal)/layout.tsx,
 * dan tidak ada layout di src/app/. Route /_not-found karena itu tidak punya
 * layout mana pun untuk diwarisi, jadi Next.js merendernya memakai
 * next/dist/client/components/builtin/layout.js: HTML yang isinya tetap memakai
 * class Tailwind tapi tidak memuat satu pun stylesheet, tanpa navbar, tanpa
 * footer, dan tanpa font.
 *
 * Ini penjaga STATIS, bukan uji runtime, dan itu disengaja.
 *
 * Bukti terkuatnya adalah tabel route hasil `next build` (entri 404 memakai
 * global-not-found, bukan layout bawaan) atau permintaan sungguhan ke server
 * yang sudah dibuild, tapi keduanya butuh build penuh. Build di repo ini
 * tidak bisa dijadikan penjaga: ia hanya bisa dijalankan di environment yang
 * sama, tidak cocok untuk tiap `npm test`, dan tetap butuh env Supabase.
 * Yang dijaga di sini adalah prasyarat yang membuat route itu benar: flag
 * menyala, berkasnya ada, dan berkas itu sendiri yang membawa stylesheet,
 * font, dan chrome situs. Menghapus src/app/global-not-found.tsx atau
 * memutar balik flag di next.config.ts membuat test ini gagal, dan dua hal
 * itu satu-satunya cara route ini kembali memakai layout bawaan.
 *
 * Berkas .tsx tidak bisa diimpor runner test bawaan Node: ERR_UNKNOWN_FILE_
 * EXTENSION "Unknown file extension \".tsx\"", karena runner hanya mengurai
 * TypeScript tanpa JSX, dan isinya juga menarik komponen React plus alias @/
 * yang tidak bisa diurai runner. Karena itu isi .tsx dibaca sebagai teks,
 * sedangkan next.config.ts benar-benar diimpor supaya flag diuji secara
 * struktural, bukan lewat pola teks yang bisa lolos karena salah ketik.
 */

const GLOBAL_NOT_FOUND = new URL("../src/app/global-not-found.tsx", import.meta.url);
const NOT_FOUND = new URL("../src/app/not-found.tsx", import.meta.url);
const PORTAL_LAYOUT = new URL("../src/app/(portal)/layout.tsx", import.meta.url);

function modeRender(isi: string): string | null {
  return isi.match(/export const dynamic\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
}

test("flag globalNotFound menyala di dalam experimental", () => {
  // Dibaca lewat config yang benar-benar diimpor, bukan regex. Flag yang
  // tanpa sengaja duduk di luar blok experimental akan lolos pola teks tapi
  // Next.js mengabaikannya, dan route /_not-found balik ke layout telanjang.
  assert.equal(
    nextConfig.experimental?.globalNotFound,
    true,
    "tanpa experimental.globalNotFound, /_not-found dirender dengan layout bawaan Next.js yang tanpa CSS dan tanpa chrome"
  );
});

test("berkas global-not-found ada di root app dan memuat stylesheet global", async () => {
  const isi = await readFile(GLOBAL_NOT_FOUND, "utf8");
  assert.match(
    isi,
    /import\s+["']\.\/globals\.css["']/,
    "route /_not-found melewati semua root layout, jadi stylesheet global harus diimpor di berkas ini. Tanpa itu HTML 404 tetap tanpa satu pun <link rel=stylesheet>."
  );
});

test("halaman 404 global tetap server component supaya segment config dibaca", async () => {
  const isi = await readFile(GLOBAL_NOT_FOUND, "utf8");
  assert.ok(
    !/^\s*["']use client["']/m.test(isi),
    "segment config di berkas klien diabaikan tanpa pesan, dan <html>/<body> tidak boleh dibuat dari komponen klien"
  );
});

test("halaman 404 global dirender per permintaan seperti root layout portal", async () => {
  const [globalNotFound, notFound, portalLayout] = await Promise.all([
    readFile(GLOBAL_NOT_FOUND, "utf8"),
    readFile(NOT_FOUND, "utf8"),
    readFile(PORTAL_LAYOUT, "utf8"),
  ]);
  const mode = modeRender(globalNotFound);
  assert.equal(
    mode,
    "force-dynamic",
    "kalau hilang, /_not-found boleh diprerender dan nonce hasil build tidak akan cocok dengan CSP per permintaan"
  );
  assert.equal(
    mode,
    modeRender(portalLayout),
    "kalau mode render 404 global berbeda dari portal, nonce per permintaan tidak bisa dijamin untuk keduanya"
  );
  assert.equal(
    mode,
    modeRender(notFound),
    "kedua berkas 404 dilayani sebagai route /_not-found, jadi mode render mereka harus sama"
  );
});

test("halaman 404 global memakai chrome publik yang sama, bukan tampilan baru", async () => {
  const isi = await readFile(GLOBAL_NOT_FOUND, "utf8");
  for (const wajib of [
    // <html> dan <body> wajib karena berkas ini jadi layout route-nya sendiri.
    /<html\b/,
    /<body\b/,
    // Class font dan palet dari root-shell, tanpa itu halaman 404 jatuh ke
    // Times New Roman dan latar transparan seperti yang terjadi di produksi.
    /htmlClass/,
    /bodyClass/,
    // Navbar, footer, dan provider yang sama dengan halaman publik lain.
    /PublicNavbar/,
    /PublicFooter/,
    /RootProviders/,
  ]) {
    assert.match(isi, wajib, `halaman 404 global kehilangan ${wajib.source}`);
  }
});

test("NotFoundPage diekspor supaya 404 boundary dan 404 global berbagi satu isi", async () => {
  // src/app/not-found.tsx mengimpor NotFoundPage dari berkas ini. Kalau
  // ekspornya hilang atau diganti nama, kedua halaman 404 diam-diam jadi dua
  // salinan terpisah yang bisa melenceng.
  const isi = await readFile(GLOBAL_NOT_FOUND, "utf8");
  assert.match(
    isi,
    /export\s+async\s+function\s+NotFoundPage\b/,
    "NotFoundPage harus diekspor dari src/app/global-not-found.tsx"
  );
});
