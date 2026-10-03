import test from "node:test";
import assert from "node:assert/strict";
import { dsnFromString, getEnvelopeEndpointWithUrlEncodedAuth } from "@sentry/core";
import { buildContentSecurityPolicy } from "../src/lib/csp.ts";

/*
 * Sentry butuh connect-src, tapi hanya untuk transport.
 *
 * Dua breakage yang berbeda bisa muncul di sini dan gejalanya sama-sama
 * "tidak ada data di dashboard", jadi keduanya dijaga terpisah:
 *
 * 1. connect-src menutup host ingest Sentry. SDK browser tetap berinialisasi,
 *    jadi tidak ada error di console yang menunjuk penyebabnya, tapi setiap
 *    envelope ditolak browser sebelum keluar. Pelaporan galat mati diam-diam.
 * 2. connect-src dibuka terlalu lebar untuk menutupi hal pertama. `*` atau
 *    `https://*` jelas salah karena kebijakan jadi tidak berguna, dan itu
 *    kesalahan yang tidak terlihat di diff yang sengaja dibaca cepat.
 *
 * Test di sini tidak membaca sumber csp.ts sebagai teks. Dia memanggil
 * buildContentSecurityPolicy sungguhan lalu, untuk kasus Sentry, menghitung
 * URL envelope dengan SDK yang sama yang dipakai aplikasi. Jadi kalau cara
 * SDK menghitung URL ingest berubah di versi berikutnya, test ini ikut
 * menangkapnya, bukan cuma memeriksa konstanta yang masih ada di header.
 *
 * Batas yang dijaga di sini sengaja hanya connect-src. Script-src punya
 * penjaganya sendiri di tests/csp.test.ts. Test ini tetap memeriksa
 * unsafe-inline dan unsafe-eval karena allowance transport adalah alasan
 * paling mungkin orang membuka script-src.
 */

const ASAL_SENDIRI = "https://atcell.my.id";

/*
 * DSN Representative Sentry SaaS. Angka organisasi sengaja dibuat berbeda
 * di dua test: kalau connect-src nanti ditulis daftar eksplisit per
 * organisasi, salah satu dari dua test ini harus gagal. Itu memang risikonya,
 * karena nomor organisasi datang dari env dan bisa diganti.
 *
 * Bentuk hostnya juga sengaja varied. Sentry punya dua topologi ingest:
 * `o<orgid>.ingest.sentry.io` dan `o<orgid>.ingest.<region>.sentry.io`.
 * Wildcard `*.` hanya menutup satu label di depan, jadi `*.ingest.sentry.io`
 * tidak menutup host yang punya label region di antaranya. DSN At Cell yang
 * dipakai produksi adalah bentuk regional dengan region `us`. Kalau test ini
 * hanya memakai bentuk lama, connect-src tetap hijau sementara browser tetap
 * membuang setiap envelope tanpa pesan. itu persis bug yang sudah pernah
 * terjadi, jadi kedua bentuk diuji.
 */
const DSN_ORG_A = "https://aaaa1111bbbb2222cccc3333dddd4444@o451234.ingest.sentry.io/451234";
const DSN_ORG_B = "https://eeee5555ffff6666aaaa7777bbbb8888@o987654.ingest.sentry.io/987654";
const DSN_ORG_C_REGION_US =
  "https://1111222233334444aaaa5555bbbb6666@o451234.ingest.us.sentry.io/451234";
const DSN_ORG_D_REGION_DE =
  "https://7777888899990000cccc1111dddd2222@o451234.ingest.de.sentry.io/451234";

/*
 * URL envelope yang benar-benar dikirim SDK: DSN dihitung jadi
 * <host DSN>/api/<projectId>/envelope/?... . Repo ini tidak menyetel tunnel,
 * jadi tanpa opsi tunnel itulah yang terjadi.
 */
function urlEnvelope(dsn: string): URL {
  const komponen = dsnFromString(dsn);
  assert.ok(komponen, `DSN test tidak bisa dibaca SDK: ${dsn}`);
  return new URL(getEnvelopeEndpointWithUrlEncodedAuth(komponen, undefined));
}

function directive(csp: string, nama: string): string[] {
  return (
    csp
      .split(";")
      .map((bagian) => bagian.trim())
      .find((bagian) => bagian.split(/\s+/)[0] === nama)
      ?.split(/\s+/)
      .slice(1) ?? []
  );
}

/*
 * Pencocokan host-source CSP yang disederhanakan, cukup untuk bentuk yang
 * benar-benar dipakai di At Cell: 'self', host utuh, dan satu label wildcard
 * depan. Aturan wildcard yang dipegang di sini adalah yang paling sering
 * disalahpahami: `https://*.ingest.sentry.io` menutup subdomain, bukan host
 * induknya, jadi `ingest.sentry.io` sendiri di luar jangkauan.
 */
function sumberMencocokkan(sumber: string, target: URL): boolean {
  if (sumber === "'self'") return target.origin === ASAL_SENDIRI;
  if (sumber === "*") return true;

  const pola = /^([a-z][a-z0-9+.-]*):\/\/(\*\.)?([^/:]+)(?::(\d+))?$/i.exec(sumber);
  if (!pola) return false;

  const [, skema, wildcard, host, port] = pola;
  if (target.protocol !== `${skema.toLowerCase()}:`) return false;
  if (port !== undefined && target.port !== port) return false;

  const hostTarget = target.hostname.toLowerCase();
  const hostSumber = host.toLowerCase();
  if (wildcard === undefined) return hostTarget === hostSumber;
  return hostTarget.endsWith(`.${hostSumber}`) && hostTarget.length > hostSumber.length;
}

const connectSrc = (): string[] =>
  directive(buildContentSecurityPolicy({ nonce: "NONCE" }), "connect-src");

test("connect-src mengizinkan URL envelope Sentry yang dihitung SDK", () => {
  // Tanpa test ini, connect-src hanya 'self' tetap hijau dan browser tetap
  // membuang setiap envelope tanpa pesan.
  for (const dsn of [DSN_ORG_A, DSN_ORG_B, DSN_ORG_C_REGION_US, DSN_ORG_D_REGION_DE]) {
    const tujuan = urlEnvelope(dsn);
    const sumber = connectSrc();
    const boleh = sumber.some((s) => sumberMencocokkan(s, tujuan));
    assert.ok(
      boleh,
      `connect-src ${sumber.join(" ")} menolak envelope Sentry ke ${tujuan.origin}`
    );
  }
});

test("connect-src tidak memakai host Supabase dan tidak pernah pakai wildcard telanjang", () => {
  const sumber = connectSrc();
  assert.ok(!sumber.some((s) => s === "*"), `wildcard telanjang masuk: ${sumber.join(" ")}`);
  assert.ok(
    !sumber.some((s) => s.endsWith("://*")),
    `wildcard semua host masuk: ${sumber.join(" ")}`
  );
  // createBrowserClient tidak punya pemanggil, semua akses lewat server action.
  assert.ok(
    !sumber.some((s) => s.includes("supabase")),
    `connect-src tidak boleh dibuka ke Supabase: ${sumber.join(" ")}`
  );
});

test("allowance Sentry sesempit mungkin dan self tetap yang pertama", () => {
  const sumber = connectSrc();
  assert.equal(
    sumber[0],
    "'self'",
    "request ke server sendiri harus selalu diizinkan lebih dulu"
  );
  // Dikenai yang boleh: server sendiri dan namespace ingest Sentry saja.
  // Dua bentuk ingest wajib ikut tertulis, bukan hanya bentuk non-regional.
  assert.deepEqual(sumber, [
    "'self'",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
  ]);
});

test("host ingest regional tertutup oleh connect-src", () => {
  // Test ini menjaga bug yang sudah terjadi. DSN produksi punya label region
  // (`o<orgid>.ingest.us.sentry.io`), dan `*.ingest.sentry.io` tidak menutup
  // host itu karena ada label tambahan di tengah. connect-src tetap hijau,
  // browser tetap membuang envelope, tidak ada yang gagal keras.
  const tujuan = new URL(urlEnvelope(DSN_ORG_C_REGION_US).origin);
  const sumber = connectSrc();
  assert.ok(
    sumber.some((s) => sumberMencocokkan(s, tujuan)),
    `connect-src ${sumber.join(" ")} menolak envelope regional ke ${tujuan.origin}. ` +
      "Perhatikan hanya bentuk non-regional yang tertulis."
  );

  // Region yang tidak terdaftar harus tetap tertutup, jadi daftar ini bukan
  // jalan pintas ke seluruh sentry.io.
  const regionAwal = new URL("https://o451234.ingest.ap.sentry.io/");
  assert.ok(
    !sumber.some((s) => sumberMencocokkan(s, regionAwal)),
    `connect-src ${sumber.join(" ")} seharusnya menolak region yang tidak terdaftar`
  );
});

test("wildcard ingest tidak membuka host Sentry lain", () => {
  // Host UI/API Sentry, host apex, dan domain lain semuanya harus tetap
  // tertutup. Kalau salah satu lolos, wildcard-nya bukan lagi bounded.
  const tertutup = [
    "https://o451234.sentry.io/",
    "https://sentry.io/",
    "https://ingest.sentry.io/",
    "https://451234.ingest.sentry.io.evil.example/",
    "https://o451234.ingest.us.sentry.io.evil.example/",
    "https://evil.example/",
  ];
  for (const alamat of tertutup) {
    const sumber = connectSrc();
    assert.ok(
      !sumber.some((s) => sumberMencocokkan(s, new URL(alamat))),
      `connect-src ${sumber.join(" ")} seharusnya menolak ${alamat}`
    );
  }
});

test("script-src versi produksi tidak pernah unsafe-inline atau unsafe-eval", () => {
  const produksi = directive(buildContentSecurityPolicy({ nonce: "NONCE" }), "script-src");
  assert.ok(
    !produksi.includes("'unsafe-inline'"),
    `script-src produksi tidak boleh longgar: ${produksi.join(" ")}`
  );
  assert.ok(
    !produksi.includes("'unsafe-eval'"),
    `script-src produksi tidak boleh longgar: ${produksi.join(" ")}`
  );
  // Yang tetap utuh: mode nonce dan strict-dynamic.
  assert.ok(produksi.includes("'nonce-NONCE'"));
  assert.ok(produksi.includes("'strict-dynamic'"));
});

test("mode pengembangan menambah unsafe-eval tanpa pernah menambah unsafe-inline", () => {
  const dev = directive(
    buildContentSecurityPolicy({ nonce: "NONCE", isDevelopment: true }),
    "script-src"
  );
  assert.ok(dev.includes("'unsafe-eval'"), "webpack dev memang butuh unsafe-eval");
  assert.ok(
    !dev.includes("'unsafe-inline'"),
    `unsafe-inline tidak boleh masuk lewat mode pengembangan: ${dev.join(" ")}`
  );
});
