import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * PWA At Cell dijaga dengan test statis atas berkas, bukan uji browser.
 * node:test tidak punya ServiceWorkerGlobalScope, Cache Storage, maupun
 * Cache API, jadi perilaku cache tidak bisa diukur di sini. Yang bisa
 * dikunci adalah invarian yang membuat PWA ini aman:
 *
 *  1. Halaman tidak boleh di-cache sama sekali. Etalase menampilkan stok
 *     dan harga yang berubah tiap menit, jadi halaman berumur satu jam
 *     berarti pelanggan ditawari unit yang sudah habis.
 *  2. Portal, API, dan halaman login tidak boleh pernah menyentuh cache,
 *     karena di sana ada cookie sesi, ID transaksi, dan harga beli.
 *  3. Service worker hanya boleh menyimpan aset statis, hanya GET, hanya
 *     same-origin.
 *  4. src/lib/pwa.ts dan salinan di dalam public/sw.js harus identik.
 *     Service worker tidak bisa mengimpor modul TypeScript, jadi polanya
 *     harus disalin, dan salinan itulah yang paling rawan diam-diam
 *     menyimpang setelah registry berubah.
 */

import {
  CACHE_NAME,
  NEVER_CACHE_PATHS,
  CACHEABLE_PATHS,
  PRECACHE_URLS,
  SW_PATH,
  APPLE_ICON_SIZE,
  isCacheableAsset,
} from "../src/lib/pwa.ts";

const swSource = readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8"
);

const ORIGIN = "https://atcell.my.id";

function headers(map: Record<string, string>) {
  return new Headers(map);
}

test("SW_PATH menunjuk berkas yang benar-benar ada di public", () => {
  assert.equal(SW_PATH, "/sw.js");
  const url = new URL("../public" + SW_PATH, import.meta.url);
  assert.doesNotThrow(() => readFileSync(url, "utf8"));
});

test("halaman HTML tidak pernah di-cache", () => {
  for (const pathname of [
    "/id",
    "/id/catalog",
    "/en/tracking",
    "/id/payment",
    "/id/trade-in",
  ]) {
    assert.equal(
      isCacheableAsset(new URL(pathname, ORIGIN), {
        method: "GET",
        headers: headers({}),
      }, ORIGIN),
      false,
      pathname + " tidak boleh masuk cache: isinya stok dan harga yang berubah"
    );
  }
});

test("portal, API, dan login tidak pernah masuk cache", () => {
  for (const pathname of [
    "/portal",
    "/portal/pos",
    "/portal/inventory",
    "/portal/settings",
    "/api/health/ready",
    "/api/reviews",
    "/id/login",
    "/en/login",
  ]) {
    assert.equal(
      isCacheableAsset(new URL(pathname, ORIGIN), {
        method: "GET",
        headers: headers({}),
      }, ORIGIN),
      false,
      pathname + " memuat data internal dan tidak boleh tersimpan di perangkat"
    );
  }
});

test("aset statis boleh di-cache", () => {
  for (const pathname of [
    "/products/iphone-15-pro-1.jpg",
    "/payments/qris.svg",
    "/_next/static/chunks/main-app.js",
    "/icon/512",
    "/apple-icon",
  ]) {
    assert.equal(
      isCacheableAsset(new URL(pathname, ORIGIN), {
        method: "GET",
        headers: headers({}),
      }, ORIGIN),
      true,
      pathname + " adalah aset statis dan seharusnya bisa di-cache"
    );
  }
});

test("hanya GET same-origin yang boleh di-cache", () => {
  const url = new URL("/products/a.jpg", ORIGIN);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(
      isCacheableAsset(url, { method, headers: headers({}) }, ORIGIN),
      false,
      method + " tidak boleh masuk cache"
    );
  }
  assert.equal(
    isCacheableAsset(new URL("/products/a.jpg", "https://cdn.example.com"), {
      method: "GET",
      headers: headers({}),
    }, ORIGIN),
    false,
    "aset dari origin lain tidak boleh masuk cache lokal"
  );
});

test("negosiasi avif tidak di-cache supaya satu URL tidak melayani dua format", () => {
  assert.equal(
    isCacheableAsset(new URL("/products/a.jpg", ORIGIN), {
      method: "GET",
      headers: headers({ accept: "image/avif,image/webp,*/*" }),
    }, ORIGIN),
    false,
    "URL yang sama dilayani avif atau jpeg tergantung browser, jadi tidak boleh disimpan"
  );
});

test("cache addAll hanya berisi URL yang dijamin ada", () => {
  for (const url of PRECACHE_URLS) {
    // Manifest dibuat oleh route src/app/manifest.ts, bukan berkas statis.
    // Sisanya harus benar-benar ada di public/ karena addAll bersifat
    // atomik: satu saja hilang, seluruh instalasi gagal dan service worker
    // lama tetap berlaku.
    if (url === "/manifest.webmanifest") {
      assert.doesNotThrow(
        () =>
          readFileSync(
            new URL("../src/app/manifest.ts", import.meta.url),
            "utf8"
          ),
        "/manifest.webmanifest harus punya route di src/app/manifest.ts"
      );
      continue;
    }
    assert.doesNotThrow(
      () => readFileSync(new URL("../public" + url, import.meta.url), "utf8"),
      url + " ada di precache tapi tidak ada di public/"
    );
  }
});

test("foto produk tidak masuk precache karena URL-nya berbeda per environment", () => {
  assert.equal(
    PRECACHE_URLS.some((u) => u.startsWith("/products/")),
    false,
    "foto produk pada mode live diambil dari Supabase Storage, jadi URL-nya " +
      "tidak bisa ditulis mati di sini"
  );
});

test("polanya yang dipakai service worker sama persis dengan src/lib/pwa.ts", () => {
  // Salinan wajib, karena service worker tidak bisa mengimpor modul.
  // Yang dikunci di sini adalah daftar polanya, bukan hanya nama cache.
  for (const pattern of [...CACHEABLE_PATHS, ...NEVER_CACHE_PATHS]) {
    const source = pattern.source;
    assert.ok(
      swSource.includes(source),
      "public/sw.js tidak punya pola yang sama dengan src/lib/pwa.ts: " + pattern
    );
  }
  assert.ok(
    swSource.includes(`"${CACHE_NAME}"`),
    "public/sw.js memakai nama cache yang berbeda dari src/lib/pwa.ts"
  );
});

test("service worker tidak pernah menyentuh respons non-2xx atau opaque", () => {
  // cache.put hanya menerima respons 2xx dan basic. Tanpa penjagaan, satu
  // respons 500 atau redirect opaque akan tersimpan dan disajikan offline
  // sebagai jawaban yang benar.
  assert.match(swSource, /response\.status === 200/);
  assert.match(swSource, /response\.type === "basic"/);
});

test("service worker memasang listener yang wajib ada", () => {
  for (const event of ["install", "activate", "fetch"]) {
    assert.ok(
      swSource.includes(`addEventListener("${event}"`),
      "tidak ada listener " + event
    );
  }
});

test("cache versi ikut dinaikkan supaya device lama tidak terkunci di cache lama", () => {
  assert.match(
    CACHE_NAME,
    /^atcell-v\d+$/,
    "nama cache harus punya nomor versi supaya activate bisa menghapus yang lama"
  );
  assert.ok(
    swSource.includes("key !== CACHE_NAME"),
    "activate harus menghapus cache versi lama"
  );
});

test("ukuran apple-icon tetap dan dipakai apple-icon.tsx", () => {
  assert.equal(APPLE_ICON_SIZE, 180);
  const appleIcon = readFileSync(
    new URL("../src/app/apple-icon.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(appleIcon.includes("APPLE_ICON_SIZE"));
  assert.ok(appleIcon.includes('contentType = "image/png"'));
});

test("sw.js dibebaskan dari proxy supaya tidak kena refresh sesi dan CSP", () => {
  const proxy = readFileSync(
    new URL("../src/proxy.ts", import.meta.url),
    "utf8"
  );
  const matcher = proxy.slice(proxy.indexOf("matcher:"));
  assert.ok(
    /sw\.js/.test(matcher),
    "sw.js harus ada di pengecualian matcher src/proxy.ts"
  );
});

test("CSP mengizinkan service worker dan manifest", () => {
  const csp = readFileSync(
    new URL("../src/lib/csp.ts", import.meta.url),
    "utf8"
  );
  assert.ok(
    /"worker-src": \["'self'", "blob:"\]/.test(csp),
    "worker-src harus mengizinkan 'self' supaya service worker tidak diblokir"
  );
  assert.ok(
    /"manifest-src": \["'self'"\]/.test(csp),
    "manifest-src harus mengizinkan 'self' supaya manifest.webmanifest termuat"
  );
});

test("kedua root layout memasang registrar service worker", () => {
  for (const rel of [
    "src/app/(public)/[locale]/layout.tsx",
    "src/app/(portal)/layout.tsx",
  ]) {
    const src = readFileSync(new URL("../" + rel, import.meta.url), "utf8");
    assert.ok(
      src.includes("<ServiceWorkerRegistrar />"),
      rel + " harus memasang ServiceWorkerRegistrar, kalau tidak app yang " +
        "ter-install tidak pernah memakai service worker"
    );
  }
});

test("sw.js dan service-worker-registrar harus sinkron", () => {
  const registrar = readFileSync(
    new URL("../src/components/pwa/service-worker-registrar.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(
    registrar.includes("SW_PATH"),
    "registrar harus memakai SW_PATH, bukan menulis /sw.js sendiri"
  );
  assert.ok(
    !/\/sw\.js/.test(registrar),
    "registrar jangan menulis /sw.js langsung, agar tetap sinkron dengan SW_PATH"
  );
  assert.ok(
    registrar.includes(".catch("),
    "pendaftaran yang gagal tidak boleh melempar error ke halaman"
  );
});
