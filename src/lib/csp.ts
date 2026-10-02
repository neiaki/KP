/*
 * Content-Security-Policy dalam satu tempat.
 *
 * Modul ini murni: tidak mengimpor next/server maupun next/headers, sehingga
 * bisa diuji langsung dengan runner test bawaan Node tanpa menjalankan dev
 * server. Proxy memanggilnya lalu memasang hasilnya sebagai header respons dan
 * juga sebagai header request, karena Next.js membaca nonce dari header
 * request ketika merender.
 */

/*
 * Host yang boleh dimuat oleh halaman. Semuanya ditulis utuh, bukan dari
 * pola, supaya mudah diaudit: satu kali baca cukup untuk melihat semua asal
 * daya yang diizinkan. Satu-satunya pengecualian ada di bawah, dan
 * alasannya dijelaskan di situ.
 */
const ASAL_GAMBAR_MEJA = "https://cdn.simpleicons.org";
const ASAL_GAMBAR_CONTOH = "https://images.unsplash.com";
const ASAL_PETA_EMBED = "https://www.google.com";

/*
 * Host ingest Sentry, satu-satunya alasan connect-src tidak cuma 'self'.
 *
 * Bentuknya wildcard, bukan daftar host, dan itu bukan sekadar malas menulis.
 * SDK browser menghitung URL envelope dari DSN: `getEnvelopeEndpointWithUrlEncodedAuth`
 * di @sentry/core mengembalikan `tunnel ? tunnel : <host DSN>/api/<projectId>/envelope/`.
 * Repo ini tidak pernah menyetel `tunnel`, jadi host yang dihubungi adalah
 * host yang tertulis di DSN. Angka `<orgid>` datang dari env
 * `NEXT_PUBLIC_SENTRY_DSN`, jadi daftar eksplisit akan mengunci kebijakan ke
 * satu organisasi dan diam-diam rusak begitu DSN dipindah. Wildcard-nya
 * dibatasi ke namespace ingest Sentry: host lain di bawah sentry.io tetap
 * tertutup, dan tidak ada asal lain yang ikut terbuka.
 *
 * Batasnya: ini hanya mengizinkan transport, tidak memuat skrip apa pun.
 * Sentry tetap di-load sebagai modul bundel biasa lewat modul Next, bukan
 * inline, jadi script-src tidak perlu dilonggarkan dan masih tetap
 * nonce + 'strict-dynamic'.
 *
 * Host ingest harus ditulis dalam dua bentuk, karena Sentry punya dua topologi
 * dan wildcard `*.` hanya menutup satu label di depan.
 *
 * Bentuk lama: `o<orgid>.ingest.sentry.io`, ditutup oleh `*.ingest.sentry.io`.
 * Bentuk regional: `o<orgid>.ingest.<region>.sentry.io`. Untuk yang ini
 * `*.ingest.sentry.io` justru tidak berlaku, karena label `<region>` ada di
 * antara `ingest` dan `sentry.io`. Kalau hanya bentuk lama yang ditulis,
 * connect-src tetap hijau dan browser tetap membuang setiap envelope tanpa
 * pesan, persis seperti tidak ada Sentry sama sekali.
 *
 * DSN At Cell sekarang memakai bentuk regional dengan region `us`, jadi
 * `*.ingest.us.sentry.io` yang benar-benar menutupnya. Region `de` ikut
 * ditulis supaya perpindahan region tidak menggagalkan pelaporan diam-diam,
 * dan karena keduanya tetap berada di bawah namespace ingest Sentry, bukan
 * membuka host lain.
 *
 * Kalau `NEXT_PUBLIC_SENTRY_DSN` kosong, `Sentry.init` dilewati seluruhnya
 * (lihat src/instrumentation-client.ts), tidak ada envelope yang dibuat, dan
 * allowance ini tidak punya efek di deployment yang tidak memakai Sentry.
 */
const ASAL_INGEST_SENTRY = [
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io",
  "https://*.ingest.de.sentry.io",
] as const;

export type CspOptions = {
  /*
   * Nonce per permintaan. Kalau kosong, kebijakan turun ke mode longgar
   * (lihat buildContentSecurityPolicy) supaya halaman yang tidak sempat
   * dirender dinamis tidak ikut mati. Halaman yang gagal tampil lebih buruk
   * daripada halaman yang tampil dengan perlindungan separuh.
   */
  nonce?: string | null;
  isDevelopment?: boolean;
  /* URL project Supabase, dipakai untuk host Storage. */
  supabaseUrl?: string | null;
};

/*
 * Host Storage diambil dari env, bukan ditulis mati, supaya kalau project
 * Supabase diganti tidak ada host lama yang tertinggal di dalam kebijakan.
 * Bucket foto produk dan foto tiket berada di host yang sama dengan project.
 */
function hostStorage(supabaseUrl?: string | null): string | null {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
}

/*
 * Nonce dibuat dari UUID lalu di-base64. btoa dipakai, bukan Buffer, supaya
 * baris ini tetap jalan kalau proxy nanti diganti runtime edge.
 */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment = false,
  supabaseUrl,
}: CspOptions = {}): string {
  const storage = hostStorage(supabaseUrl);

  /*
   * script-src punya dua mode. Kalau nonce tersedia, hanya skrip ber-nonce
   * yang boleh jalan, dan strict-dynamic membuat browser ikut mempercayai
   * skrip yang dimuat oleh skrip itu, sehingga daftar host tidak perlu
   * dipercaya dan tidak perlu menebak asal lain. Kalau nonce tidak ada,
   * halaman masih tampil memakai mode longgar, karena lebih baik tampil
   * dengan perlindungan separuh daripada tidak tampil sama sekali.
   */
  const scriptSrc = nonce
    ? [
        "'self'",
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        ...(isDevelopment ? ["'unsafe-eval'"] : []),
      ]
    : ["'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : [])];

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    ASAL_GAMBAR_MEJA,
    ASAL_GAMBAR_CONTOH,
    ...(storage ? [`https://${storage}`] : []),
  ];

  /*
   * upgrade-insecure-requests sengaja tidak dipakai. HSTS dengan preload di
   * next.config.ts sudah lebih kuat, sedangkan directive ini justru merusak
   * `next start` lokal yang berjalan di http, karena browser akan menaikkan
   * setiap alamat http menjadi https lalu gagal terhubung.
   */
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "script-src": scriptSrc,
    "script-src-attr": ["'none'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": imgSrc,
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...ASAL_INGEST_SENTRY],
    "frame-src": [ASAL_PETA_EMBED],
    "media-src": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };

  return Object.entries(directives)
    .map(([nama, nilai]) => `${nama} ${nilai.join(" ")}`)
    .join("; ");
}
