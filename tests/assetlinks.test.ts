import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANDROID_PACKAGE_NAME,
  ANDROID_SITE,
  parseCertFingerprints,
  buildAssetLinks,
} from "../src/lib/assetlinks.ts";

/*
 * /.well-known/assetlinks.json menentukan apakah Android menganggap
 * my.id.atcell sebagai pembungkus sah dari atcell.my.id.
 *
 * Yang dikunci di sini adalah yang paling mudah rusak dan paling sulit
 * terlihat dari HP: bentuk sidik jari dan isi relation. Android menolak
 * SELURUH berkas kalau satu sidik jari di dalamnya tidak berbentuk 64 hex,
 * jadi satu nilai rusak membuat berkas yang tadinya benar ikut ditolak, dan
 * gejalanya di HP hanya "app tidak terverifikasi" tanpa penjelasan.
 *
 * Logikanya sengaja tidak ada di route.ts supaya bisa diuji di runner Node
 * tanpa server. Route-nya diuji secara statis di bagian bawah.
 */

test("sidik jari kosong ketika env kosong, bukan hasil tebakan", () => {
  assert.deepEqual(parseCertFingerprints(undefined), []);
  assert.deepEqual(parseCertFingerprints(null), []);
  assert.deepEqual(parseCertFingerprints(""), []);
  // Spasi dan koma saja tidak boleh berubah jadi array berisi satu nilai.
  assert.deepEqual(parseCertFingerprints(" , "), []);
});

test("sidik jari dari env dipakai apa adanya", () => {
  const fp = "5a62b44ad0408aedd1df23174f219cfe25cbcac6d8e28ed3e5023fe5c659a9e3";
  assert.deepEqual(parseCertFingerprints(fp), [fp]);
});

test("huruf besar dari keytool diturunkan supaya konsisten", () => {
  const upper = "5A62B44AD0408AEDD1DF23174F219CFE25CBCAC6D8E28ED3E5023FE5C659A9E3";
  const lower = upper.toLowerCase();
  assert.deepEqual(parseCertFingerprints(upper), [lower]);
});

test("sidik jari bertanda titik dua dari keytool dibersihkan", () => {
  // keytool mencetak "5A:62:B4:...". Nilai itu wajib diterjemahkan, kalau
  // tidak semua sidik jari hasil keytool akan ditolak Android.
  const withColon = "5A:62:B4:4A:D0:40:8A:ED:D1:DF:23:17:4F:21:9C:FE:25:CB:CA:C6:D8:E2:8E:D3:E5:02:3F:E5:C6:59:A9:E3";
  const hasil = parseCertFingerprints(withColon);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0], withColon.replace(/:/g, "").toLowerCase());
  assert.match(hasil[0], /^[0-9a-f]{64}$/);
});

test("beberapa sidik jari dipisah spasi, koma, atau baris baru", () => {
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  const c = "c".repeat(64);
  assert.deepEqual(parseCertFingerprints(`${a}, ${b}`), [a, b]);
  assert.deepEqual(parseCertFingerprints(`${a}\n${b}\n${c}`), [a, b, c]);
  assert.deepEqual(parseCertFingerprints(`${a}  ${b}`), [a, b]);
});

test("nilai rusak dibuang sendiri supaya tidak menggagalkan seluruh berkas", () => {
  const valid = "c".repeat(64);
  const hasil = parseCertFingerprints(
    `pendek, ${valid}, ../../etc/passwd, ${"z".repeat(63)}, ${"y".repeat(65)}`
  );
  assert.deepEqual(
    hasil,
    [valid],
    "Android menolak seluruh berkas kalau ada satu sidik jari tidak valid"
  );
});

test("nilai yang bukan heksadesimal ditolak", () => {
  // 64 karakter tapi huruf g dan z bukan hex. Kalau lolos, Android akan
  // menolak berkasnya tanpa menunjuk mana yang salah.
  const bukanHex = "g".repeat(64);
  assert.deepEqual(parseCertFingerprints(bukanHex), []);
  const campur = `${"a".repeat(63)}z`;
  assert.deepEqual(parseCertFingerprints(campur), []);
});

test("dua pernyataan: android_app dan web", () => {
  const fp = "d".repeat(64);
  const statements = buildAssetLinks([fp]);
  assert.equal(statements.length, 2);

  const app = statements.find((s) => s.target.namespace === "android_app");
  assert.ok(app, "pernyataan android_app wajib ada");
  assert.equal(
    app.target.namespace === "android_app" ? app.target.package_name : "",
    ANDROID_PACKAGE_NAME
  );
  assert.deepEqual(
    app.target.namespace === "android_app"
      ? app.target.sha256_cert_fingerprints
      : [],
    [fp]
  );

  const web = statements.find((s) => s.target.namespace === "web");
  assert.ok(web, "pernyataan web wajib ada, tanpa itu domain tidak diklaim");
  assert.equal(web.target.namespace === "web" ? web.target.site : "", ANDROID_SITE);
});

test("relation yang diminta adalah delegate_permission handle_all_urls", () => {
  // Relation inilah yang di-<intent-filter autoVerify> di AndroidManifest.xml
  // APK._relation yang berbeda berarti verifikasi ditolak.
  for (const statement of buildAssetLinks([])) {
    assert.deepEqual(statement.relation, [
      "delegate_permission/common.handle_all_urls",
    ]);
  }
});

test("package name dan site sama dengan yang diklaim APK", () => {
  // Nilai ini harus sama persis dengan applicationId di app/build.gradle dan
  // hostName di AndroidManifest.xml APK. Kalau berbeda, autoVerify gagal
  // tanpa pesan yang berguna.
  assert.equal(ANDROID_PACKAGE_NAME, "my.id.atcell");
  assert.equal(ANDROID_SITE, "https://atcell.my.id");
  assert.equal(new URL(ANDROID_SITE).host, "atcell.my.id");
});

test("route memakai helper murni dan tidak hoard logika sendiri", () => {
  const route = readFileSync(
    new URL("../src/app/.well-known/assetlinks.json/route.ts", import.meta.url),
    "utf8"
  );
  assert.ok(
    route.includes("parseCertFingerprints") &&
      route.includes("buildAssetLinks"),
    "route harus memakai helper dari src/lib/assetlinks.ts"
  );
  assert.ok(
    !route.includes("64"),
    "route tidak boleh punya regex sendiri, supaya hanya ada satu tempat " +
      "yangervised bentuk sidik jari"
  );
  assert.ok(
    route.includes("force-dynamic"),
    "route wajib force-dynamic supaya sidik jari baru tidak ikut di-cache"
  );
  assert.ok(
    route.includes("no-store"),
    "Android men-cache hasil verifikasi Digital Asset Links, jadi no-store wajib"
  );
});

test("env contoh menyebut variabel dan file yang benar", () => {
  const env = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.ok(
    env.includes("NEXT_PUBLIC_ANDROID_APP_SHA256="),
    ".env.example wajib menyebut NEXT_PUBLIC_ANDROID_APP_SHA256, kalau tidak " +
      "tidak ada yang tahu variabel ini harus diisi"
  );
  assert.ok(
    env.includes("assetlinks.json"),
    ".env.example harus menyebut file yang dibaca dari variabel ini"
  );
  assert.ok(
    env.includes("keytool"),
    ".env.example harus memberi cara mengambil sidik jarinya"
  );
});
