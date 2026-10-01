import type { NextConfig } from "next";

const configuredOrigins = (process.env.SERVER_ACTIONS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/*
 * Origin yang boleh memanggil Server Actions.
 *
 * Server Actions memverifikasi Origin header, jadi domain yang tidak ada di
 * daftar ini akan ditolak dengan 403 walaupun halamannya sendiri terbuka.
 * Produksi memakai atcell.my.id dan subdomainnya, jadi keduanya ditulis mati
 * di sini.
 *
 * kp-rust-five.vercel.app ikut ditulis karena deployment Vercel dipakai sebagai
 * preview yang kerap dibuka, dan tanpa itu semua Server Actions dari sana
 * gagal. Env SERVER_ACTIONS_ALLOWED_ORIGINS tetap tersedia untuk menambah
 * domain lain tanpa mengubah kode.
 */
const serverActionOrigins = Array.from(
  new Set([
    "atcell.my.id",
    "*.atcell.my.id",
    "kp-rust-five.vercel.app",
    ...configuredOrigins,
  ])
);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // HSTS hanya bermakna di produksi. Tanpa precondition, cookie sesi bisa
  // terkirim lewat HTTP saat isomorphic dan memancing browser menyimpan header ini.
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

// Foto produk diambil dari Supabase Storage (bucket product-images), bukan
// file lokal di public/. Host Storage dihitung dari env, bukan ditulis mati,
// supaya tidak ikut bocor ke repo kalau project Supabase diganti.
const supabaseStorageHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

/*
 * Host lain yang boleh dilayani optimizer.
 *
 * images.unsplash.com muncul di photo_urls tiket servis pada data demo
 * (src/lib/mock-data.ts). Foto produk punya filter sendiri di
 * src/lib/shop.ts yang membuang URL placeholder, tapi photo_urls tiket tidak
 * lewat filter itu, jadi tanpa daftar di sini optimizer menjawab 400 dan
 * foto rusak tepat di mode demo lokal, yaitu mode default saat env Supabase
 * kosong.
 *
 * Daftar ditulis utuh supaya satu kali baca cukup untuk melihat semua asal
 * daya yang diizinkan, sama seperti src/lib/csp.ts.
 */
const remotePatterns = [
  ...(supabaseStorageHost
    ? [
        {
          protocol: "https" as const,
          hostname: supabaseStorageHost,
          pathname: "/storage/v1/object/public/product-images/**",
        },
      ]
    : []),
  {
    protocol: "https" as const,
    hostname: "images.unsplash.com",
    pathname: "/**",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Key images selalu ditulis, walau daemonnya kosong. Kalau bloknya
  // dikondisikan seperti sebelumnya, environment tanpa NEXT_PUBLIC_SUPABASE_URL
  // kehilangan seluruh konfigurasi optimizer dan setiap URL absolut ditolak
  // tanpa sebab yang jelas.
  images: { remotePatterns },
  experimental: {
    // 404 global. Aplikasi ini punya dua root layout, satu di route group
    // (public) dan satu lagi di (portal), jadi tidak ada layout di src/app/
    // yang bisa diwarisi route /_not-found. Tanpa flag ini Next.js merender
    // 404 memakai layout bawaannya yang telanjang: HTML tanpa satu pun
    // stylesheet, tanpa navbar, tanpa footer, dan tanpa font. Flag ini
    // memindahkan route tersebut ke src/app/global-not-found.tsx, yang
    // membawa chrome, font, dan token warnanya sendiri.
    globalNotFound: true,
    // Prarender dibatasi ke dua halaman sekaligus. Default Next memakai jumlah
    // worker sesuai jumlah CPU, dan tiap worker adalah proses Node terpisah
    // yang memuat seluruh graf modul. Di mesin 23 GB yang sudah memakai
    // 7,8 GB swap, tujuh worker sekaligus membuat sistem masuk kondisi swap
    // berat: worker dapat SIGKILL dan halaman lewat ambang 60 detik sehingga
    // build gagal. Dengan dua worker, 17 halaman selesai dalam 1,9 detik dan
    // total build tetap sekitar satu menit. Tidak ada dampak ke runtime produksi.
    staticGenerationMaxConcurrency: 2,
    serverActions: {
      // Upload validasi menerima 5 MB; sisakan ruang untuk multipart overhead.
      bodySizeLimit: "6mb",
      allowedOrigins: serverActionOrigins,
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        /*
         * Service worker tidak boleh disimpan HTTP cache.
         *
         * Browser mengevaluasi service worker dari salinan yang tersimpan,
         * jadi sw.js yang di-cache membuat perubahan yang baru deploy tidak
         * pernah sampai ke perangkat yang sudah memasang app. no-store
         * membuat browser selalu meminta ulang, dan max-age=0 menutup jalur
         * cache intermediary yang biasanya lebih longgar. Service-Worker-
         * Allowed mengizinkan service worker mengklaim seluruh origin dari
         * root, yang memang scope yang dipakai manifest.
         */
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Foto produk dan logo QRIS adalah berkas statis di public/ yang
        // namanya tidak pernah diubah place-nya: mengganti foto memakai nama
        // baru, bukan menimpa berkas lama. Tanpa header di bawah, Next
        // mengirim max-age=0 sehingga tiap kunjungan halaman memaksa browser
        // conditional GET untuk tiap foto sebelum menampilkannya.
        // TTL-nya satu hari, bukan immutable, supaya penggantian nama berkas
        // yang tidak disengaja tidak membuat foto lama bertahan terlalu lama.
        source: "/:dir(products|payments)/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
