/*
 * Konstanta bersama PWA.
 *
 * Semua angka yang muncul baik di manifest, di route icon, maupun di
 * registrar service worker dikumpulkan di sini supaya tidak bisa berbeda
 * antar berkas. Module ini murni tanpa import, jadi bisa dipakai langsung
 * oleh test dengan runner bawaan Node tanpa environment browser.
 */

/* Apple-touch-icon punya satu ukuran tetap, jadi tidak perlu route dinamis. */
export const APPLE_ICON_SIZE = 180;

/* Letak service worker. Harus sama dengan nama berkas di public/sw.js. */
export const SW_PATH = "/sw.js";

/**
 * Dukungan service worker di browser ini.
 *
 * Diperiksa, bukan diasumsikan. Safari iOS memang mendukung service worker
 * sejak 11.3, tapi hanya di origin yang served lewat HTTPS, dan mode private
 * ephemeral memblokir registrasi. Pemeriksaan ini hanya evita pemanggilan ke
 * API yang tidak ada; penolakan oleh browser tetap ditangkap .catch di
 * pemanggil.
 */
export function isServiceWorkerSupported(): boolean {
  return (
    typeof navigator !== "undefined" && "serviceWorker" in navigator
  );
}


/* Nama cache. Versinya harus naik setiap kali isi cache berubah. */
export const CACHE_NAME = "atcell-v1";

/*
 * Berkas yang boleh disimpan offline.
 *
 * Daftar ini sengaja hanya berisi barang yang tidak pernah berubah dan tidak
 * pernah berisi data pelanggan: icon, manifest, dan gambar produk. Halaman
 * HTML tidak ikut karena etalase menampilkan stok dan harga yang berubah
 * setiap menit; menyimpan salinan berjam-jam di layar pelanggan berarti
 * orang membeli unit yang sudah habis.
 */
export const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/payments/qris.svg",
] as const;

/* Pola yang boleh dilayani dari cache, hanya untuk aset statis. */
export const CACHEABLE_PATHS = [
  /^\/products\//,
  /^\/payments\//,
  /^\/_next\/static\//,
  /^\/icon\//,
  /^\/apple-icon/,
] as const;

/*
 * Prefix yang tidak boleh pernah disentuh service worker, apa pun yang
 * terjadi. Di portal ada cookie sesi, ID transaksi, dan data harga beli.
 * Satu salinan yang tertinggal di storage perangkat adalah kebocoran data
 * kasir ke HP yang dipinjam orang, jadi lebih baik halaman ini selalu
 * network dan gagal dengan jujur saat offline.
 */
export const NEVER_CACHE_PATHS = [
  /^\/portal(\/|$)/,
  /^\/api(\/|$)/,
  /^\/(id|en)\/login(\/|$)/,
] as const;

/**
 * Apakah request ini boleh dilayani dari cache aset statis.
 *
 * `origin` diberikan sebagai argumen dan bukan dibaca dari `self.location`,
 * supaya fungsi ini murni dan bisa diuji di runner Node yang tidak punya
 * ServiceWorkerGlobalScope. Salinan di public/sw.js memakai
 * self.location.origin karena di situ memang ada.
 *
 * Hanya GET, hanya same-origin, dan hanya pola yang ada di CACHEABLE_PATHS.
 * Vary pada Accept akibat negosiasi gambar Next.js juga ikut diperiksa:
 * satu URL bisa dilayani sebagai avif oleh browser modern dan sebagai jpeg
 * oleh yang lain, jadi menyimpan tanpa membedakan akan merusak gambar.
 */
export function isCacheableAsset(
  url: URL,
  request: { method: string; headers: Headers },
  origin: string
): boolean {
  if (request.method !== "GET") return false;
  if (url.origin !== origin) return false;
  if (request.headers.get("accept")?.includes("image/avif")) return false;
  if (NEVER_CACHE_PATHS.some((p) => p.test(url.pathname))) return false;
  return CACHEABLE_PATHS.some((p) => p.test(url.pathname));
}
