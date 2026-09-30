/*
 * Digital Asset Links untuk aplikasi Android At Cell.
 *
 * Modul ini murni: tidak mengimpor next/server, sama seperti src/lib/csp.ts,
 * supaya bentuk sidik jari dan isi relation bisa diuji langsung dengan runner
 * Node tanpa menjalankan dev server. Route-nya ada di
 * src/app/.well-known/assetlinks.json/route.ts dan hanya membungkus fungsi di
 * sini jadi respons.
 *
 * Kenapa berkas ini penting. Android membandingkan sidik jari sertifikat di
 * sini dengan sertifikat yang benar-benar menandatangani my.id.atcell. Kalau
 * cocok, app dianggap pembungkus sah dari atcell.my.id, address bar tidak
 * muncul, dan Play Protect melihat app yang terikat ke domain nyata. Kalau
 * tidak cocok, Android tetap membuka app tetapi menandainya tidak terverifikasi,
 * dan itulah pemicu peringatan yang paling sering muncul.
 *
 * CARA MENGAMBIL SIDIK JARI:
 *   keytool -list -v -keystore atcell-release.jks -storepass <password>
 * lalu salin baris "SHA256:" dan buang tanda titik dua.
 *
 * Kalau nanti app masuk Play Store dengan Play App Signing, sidik jari yang
 * dipakai di sini harus milik app signing Google, bukan upload key. Play
 * Console menampilkannya di Setup > App integrity.
 */

export const ANDROID_PACKAGE_NAME = "my.id.atcell";
export const ANDROID_SITE = "https://atcell.my.id";

/** Sidik jari SHA-256 selalu 64 karakter heksadesimal tanpa titik dua. */
const POLA_SHA256 = /^[A-Fa-f0-9]{64}$/;

/**
 * Membersihkan daftar sidik jari dari nilai mentah env.
 *
 * Bentuk yang diterima sengaja longgar di awal dan ketat di akhir: string
 * dari env bisa berisi spasi, koma, atau sisa output keytool yang masih
 * bertanda titik dua. Semua itu dibersihkan, lalu hanya nilai yang benar-benar
 * berbentuk 64 hex yang diteruskan.
 *
 * Filter di akhir itu penting. Android menolak SELURUH berkas kalau satu
 * sidik jari di dalamnya tidak valid, jadi satu nilai rusak akan membuat
 * berkas yang tadinya benar ikut ditolak. Lebih baik menyajikan array yang
 * lebih sedikit daripada array yang pasti ditolak.
 */
export function parseCertFingerprints(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((bagian) => bagian.replace(/:/g, "").trim())
    .filter((bagian) => POLA_SHA256.test(bagian))
    .map((bagian) => bagian.toLowerCase());
}

type AssetLinkStatement = {
  relation: string[];
  target:
    | {
        namespace: "android_app";
        package_name: string;
        sha256_cert_fingerprints: string[];
      }
    | { namespace: "web"; site: string };
};

/**
 * Membangun isi assetlinks.json.
 *
 * Dua pernyataan, bukan satu. Pernyataan android_app memberi izin app
 * menangani semua URL di domain itu, dan pernyataan web mengklaim domainnya
 * sendiri. Android butuh keduanya: hanya salah satu tidak akan lolos
 * verifikasi.
 */
export function buildAssetLinks(fingerprints: string[]): AssetLinkStatement[] {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "web", site: ANDROID_SITE },
    },
  ];
}
