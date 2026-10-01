/*
 * Service worker At Cell.
 *
 * Prinsip utama: service worker ini TIDAK Hooper meng-cache halaman. Etalase
 * menampilkan stok dan harga yang berubah tiap menit, jadi halaman berumur
 * satu jam yang masih tersimpan di layar pelanggan berarti orang ditawari
 * unit yang sudah habis. Halaman selalu network, dan kalau offline gagal
 * dengan jujur.
 *
 * Yang di-cache hanya aset statis: gambar produk, QRIS, bundel Next.js, dan
 * icon. Aset ini immutable atau berganti nama, jadi aman, dan efeknya nyata:
 * gambar produk yang sudah pernah dilihat tidak perlu diunduh ulang setiap
 * kunjungan.
 *
 * Seluruh keputusan tentang mana yang boleh di-cache ada di src/lib/pwa.ts
 * dan dikunci test. Jangan menambah daftar baru tanpa mengubah test itu.
 */

const CACHE_NAME = "atcell-v2";
const PRECACHE_URLS = ["/manifest.webmanifest", "/payments/qris.svg"];

/* Pola yang boleh dilayani dari cache, hanya aset statis. */
const CACHEABLE_PATHS = [
  /^\/products\//,
  /^\/payments\//,
  /^\/_next\/static\//,
  /^\/_next\/image$/,
  /^\/icon\//,
  /^\/apple-icon/,
];

/*
 * Prefix yang tidak boleh pernah disentuh. Di portal ada cookie sesi, ID
 * transaksi, dan harga beli. Satu salinan yang tertinggal di storage
 * perangkat adalah kebocoran data kasir ke HP yang dipinjam orang.
 */
const NEVER_CACHE_PATHS = [/^\/portal(\/|$)/, /^\/api(\/|$)/, /^\/(id|en)\/login(\/|$)/];

/**
 * Sama persis dengan isCacheableAsset di src/lib/pwa.ts, disalin apa adanya
 * karena service worker tidak bisa mengimpor modul TypeScript. Test
 * pwa-service-worker.test.ts membandingkan keduanya supaya salinan ini tidak
 * bisa diam-diam menyimpang.
 */
function isCacheableAsset(url, request) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  for (const pattern of NEVER_CACHE_PATHS) {
    if (pattern.test(url.pathname)) return false;
  }
  for (const pattern of CACHEABLE_PATHS) {
    if (pattern.test(url.pathname)) return true;
  }
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      /*
       * addAll bersifat atomik: satu saja gagal, seluruh instalasi gagal dan
       * service worker lama tetap berlaku. Karena itu daftar ini hanya boleh
       * berisi berkas yang dijamin ada. Foto produk tidak ikut karena berada
       * di Supabase Storage pada mode live, dan URL-nya berbeda antara
       * environment.
       */
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (!isCacheableAsset(url, request)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        if (cached) {
          /*
           * Cache-first untuk aset statis, tapi tetap perbarui di latar
           * belakang supaya fname berikutnya cepat. Escrita diam-diam supaya
           * tidak menambah satu siklus jaringan di depan pengguna.
           */
          event.waitUntil(
            fetch(request)
              .then((response) => {
                if (response && response.status === 200 && response.type === "basic") {
                  return cache.put(request, response.clone());
                }
                return undefined;
              })
              .catch(() => undefined)
          );
          return cached;
        }
        return fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              const copy = response.clone();
              event.waitUntil(cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cache.match(request).then((fallback) => fallback || Response.error()));
      })
    )
  );
});
