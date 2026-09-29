import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildContentSecurityPolicy, createNonce } from "../src/lib/csp.ts";

/*
 * Content-Security-Policy dijaga karena kebijakan yang terlalu longgar yang
 * merusak, bukan yang terlalu ketat. Kebanyakan breakage baru ketahuan saat
 * staf menekan tombol di portal, yaitu saat halaman pos atau servis mengubah
 * data. Test di sini membuat policy itu gagal lebih dulu, sebelum sampai
 * ke tangan staf yang sedang pakai.
 *
 * Yang dijaga:
 *
 * 1. Mode nonce. Dengan nonce, script-src tidak boleh memuat unsafe-inline.
 *    Tanpa nonce, halaman harus tetap tampil, jadi script-src turun ke
 *    unsafe-inline. Tanpa penjaga ini, policy bisa jadi longgar dan ketat
 *    sekaligus tanpa error.
 *
 * 2. Daftar asal. Host Storage diambil dari env. Kalau project Supabase diganti
 *    dan env-nya masih host lama, semua foto produk rusak. Kalau host Storage
 *    lupa dipasang, gejalanya sama, jadi kedua arah diuji.
 *
 * 3. Bentuk header. Nilai header tidak boleh berisi baris baru atau spasi
 *    ganda, karena dua-duanya memutus parsing header HTTP dan membuat header
 *    lain ikut terbaca sebagai isi policy.
 */

const HOST = "https://abcdefghijklmnop.supabase.co";

function parse(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((bagian) => {
      const [nama, ...nilai] = bagian.trim().split(/\s+/);
      return [nama, nilai];
    })
  );
}

const ambil = (csp: string, nama: string) => parse(csp).get(nama) ?? [];

test("mode nonce menutup inline script dan memakai strict-dynamic", () => {
  const csp = buildContentSecurityPolicy({ nonce: "abc123" });
  const scriptSrc = ambil(csp, "script-src");
  assert.ok(
    scriptSrc.includes("'nonce-abc123'"),
    `nonce harus ikut, dapat: ${scriptSrc.join(" ")}`
  );
  assert.ok(scriptSrc.includes("'strict-dynamic'"), "strict-dynamic harus ikut");
  assert.ok(
    !scriptSrc.includes("'unsafe-inline'"),
    `inline script tidak boleh ikut ketika nonce ada, dapat: ${scriptSrc.join(" ")}`
  );
});

test("tanpa nonce halaman tetap tampil dan tidak memakai strict-dynamic", () => {
  const csp = buildContentSecurityPolicy({});
  const scriptSrc = ambil(csp, "script-src");
  assert.ok(scriptSrc.includes("'unsafe-inline'"), "mode longgar wajib ada");
  assert.ok(
    !scriptSrc.includes("'strict-dynamic'"),
    "strict-dynamic tanpa nonce tidak berguna"
  );
  assert.ok(
    !scriptSrc.some((n) => n.startsWith("'nonce-")),
    "nonce kosong tidak boleh ikut ditulis"
  );
});

test("mode pengembangan hanya menambah unsafe-eval", () => {
  const produksi = buildContentSecurityPolicy({ nonce: "n1" });
  const dev = buildContentSecurityPolicy({ nonce: "n1", isDevelopment: true });
  assert.ok(!ambil(produksi, "script-src").includes("'unsafe-eval'"));
  assert.ok(ambil(dev, "script-src").includes("'unsafe-eval'"));
  assert.equal(ambil(dev, "default-src").join(" "), "'self'");
});

test("host Storage masuk ke img-src hanya dari URL yang valid", () => {
  const denganHost = buildContentSecurityPolicy({ nonce: "n", supabaseUrl: HOST });
  assert.ok(
    ambil(denganHost, "img-src").some((h) => h.includes("abcdefghijklmnop.supabase.co")),
    "host Storage wajib diizinkan supaya foto produk tampil"
  );

  // Env kosong adalah kondisi nyata di mode mock lokal, bukan kondisi error.
  const tanpaEnv = buildContentSecurityPolicy({ nonce: "n", supabaseUrl: "" });
  assert.ok(
    !ambil(tanpaEnv, "img-src").some((h) => h.includes("supabase")),
    "host Storage tidak boleh dikarang saat env kosong"
  );

  // Env rusak tidak boleh membuat policy jadi tidak bisa dipakai.
  const rusak = buildContentSecurityPolicy({ nonce: "n", supabaseUrl: "bukan-url" });
  assert.ok(!ambil(rusak, "img-src").some((h) => h.includes("bukan-url")));
  assert.equal(ambil(rusak, "default-src").join(" "), "'self'");
});

test("connect-src mengizinkan diri sendiri dan transport Sentry, tapi tidak Supabase", () => {
  const csp = buildContentSecurityPolicy({ nonce: "n", supabaseUrl: HOST });
  const connectSrc = ambil(csp, "connect-src");
  // createBrowserClient tidak punya pemanggil, semua akses lewat server
  // action, jadi host Supabase tetap harus tertutup di connect-src.
  assert.ok(
    !connectSrc.some((h) => h.includes("supabase")),
    `connect-src tidak boleh dibuka ke host Storage: ${connectSrc.join(" ")}`
  );
  // Pengecualian Sentry hanya untuk transport ke host ingest, detail dan
  // alasannya dijaga di tests/csp-sentry-connect-src.test.ts.
  assert.equal(connectSrc[0], "'self'");
  assert.ok(
    connectSrc.includes("https://*.ingest.sentry.io"),
    `SDK Sentry harus bisa mengirim envelope: ${connectSrc.join(" ")}`
  );
});

test("asal wajib untuk gambar, peta, dan gaya tetap ada", () => {
  const csp = buildContentSecurityPolicy({ nonce: "n" });
  const imgSrc = ambil(csp, "img-src");
  assert.ok(imgSrc.includes("https://cdn.simpleicons.org"), "logo merek");
  assert.ok(imgSrc.includes("https://images.unsplash.com"), "foto mode mock");
  assert.ok(ambil(csp, "frame-src").includes("https://www.google.com"), "peta kontak");
  // Atribut style dipakai di tiga berkas, dan nonce tidak berlaku untuk itu.
  assert.ok(ambil(csp, "style-src").includes("'unsafe-inline'"));
  assert.deepEqual(ambil(csp, "font-src"), ["'self'"], "next/font self-host");
});

test("directive penguncian ikut terpasang", () => {
  const csp = buildContentSecurityPolicy({ nonce: "n" });
  assert.deepEqual(ambil(csp, "object-src"), ["'none'"]);
  assert.deepEqual(ambil(csp, "base-uri"), ["'self'"]);
  assert.deepEqual(ambil(csp, "frame-ancestors"), ["'none'"]);
  assert.deepEqual(ambil(csp, "form-action"), ["'self'"]);
  assert.deepEqual(ambil(csp, "script-src-attr"), ["'none'"]);
});

test("upgrade-insecure-requests tidak dipakai karena merusak localhost via http", () => {
  // HSTS dengan preload di next.config.ts sudah lebih kuat. Directive ini
  // menaikkan http jadi https juga di localhost, sehingga `next start` lokal
  // tidak bisa dibuka untuk pengujian.
  const csp = buildContentSecurityPolicy({ nonce: "n" });
  assert.ok(!csp.includes("upgrade-insecure-requests"));
});

test("nilai header aman untuk transport http", () => {
  for (const opsi of [
    { nonce: createNonce() },
    {},
    { nonce: createNonce(), supabaseUrl: HOST, isDevelopment: true },
  ]) {
    const csp = buildContentSecurityPolicy(opsi);
    assert.ok(!/[\r\n]/.test(csp), "baris baru memutus parsing header");
    assert.ok(!/\s{2,}/.test(csp), "spasi ganda memutus parsing header");
    assert.ok(!csp.includes("undefined"), "nilai tidak terisi ikut terpasang");
    assert.ok(!csp.includes("null"), "nilai kosong ikut terpasang");
  }
});

test("nonce berbeda tiap panggilan dan berbentuk base64", () => {
  const a = createNonce();
  const b = createNonce();
  assert.notEqual(a, b, "nonce berulang membuat policy bisa ditebak");
  assert.match(a, /^[A-Za-z0-9+/]+=*$/, "nonce harus cocok dengan grammar base64 CSP");
});

/*
 * Dua penguat di bawah membaca berkas. Keduanya bisa dihapus tanpa error tipe
 * dan tanpa test lain gagal, tapi efeknya membiarkan portal kosong di browser.
 */
test("root layout portal dipaksa dynamic supaya nonce bisa tertanam", async () => {
  const isi = await readFile(
    new URL("../src/app/(portal)/layout.tsx", import.meta.url),
    "utf8"
  );
  assert.match(
    isi,
    /export const dynamic = "force-dynamic"/,
    "kalau hilang, portal diprerender dan nonce tidak akan cocok"
  );
  // Root layout route group harus server. Segment config di berkas klien
  // diabaikan tanpa pesan.
  assert.ok(
    !/^\s*["']use client["']/m.test(isi),
    "layout ini tidak boleh jadi komponen klien"
  );
});

test("proxy meneruskan header request ke seluruh rantai", async () => {
  const isi = await readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");
  // Nonce yang hanya dipasang di respons membuat skrip hydration ditolak.
  assert.match(isi, /requestHeaders\.set\("x-nonce", nonce\)/);
  // Setiap NextResponse.next() dan rewrite() wajib membawa header request.
  const nextMentah = isi.match(/NextResponse\.next\(\)/g) ?? [];
  assert.deepEqual(nextMentah, [], "ada NextResponse.next() tanpa header request");
  const rewriteMentah = isi.match(/NextResponse\.rewrite\((?!target, \{)/g) ?? [];
  assert.deepEqual(rewriteMentah, [], "ada rewrite tanpa header request");
});
