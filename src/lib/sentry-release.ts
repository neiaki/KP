/*
 * Satu sumber kebenaran untuk nomor versi aplikasi yang dilaporkan ke Sentry.
 *
 * Kenapa modul terpisah: Sentry meng-grup event berdasarkan release. Kalau
 * sisi server dan sisi browser melaporkan nomor versi yang berbeda untuk satu
 * deploy yang sama, galat dari satu commit akan terbagi menjadi dua grup di
 * dashboard, dan tidak ada yang bisa dilihat sebagai satu masalah. Repo ini
 * dulu punya dua bentuk: server memakai VERCEL_GIT_COMMIT_SHA (yang tidak
 * pernah terisi karena deployment lewat Coolify, bukan Vercel) dengan
 * prefiks atcell-web@, sementara browser memakai NEXT_PUBLIC_COMMIT_SHA apa
 * adanya. Satu baris env, satu format, satu fungsi.
 *
 * Env ini ada karena tag image Coolify adalah sha-<commit>, dan itu satu-satunya
 * tempat yang tahu commit mana yang benar-benar sedang jalan. Env diisi dari
 * tag itu saat deploy, lihat docs/DEPLOYMENT-REDUNDANCY.md.
 */

/** Prefix yang distinguishing agar tidak bentrok dengan project Sentry lain. */
const APP_NAME = "atcell-web";

/**
 * Nomor versi dalam bentuk Sentry: `atcell-web@<commit>`, atau null kalau
 * env tidak diisi.
 *
 * Nilai env diterima dalam dua bentuk supaya tidak mudah salah:
 *   - `519b5352...`        commit polos
 *   - `atcell-web@519b53`  sudah berformat
 *   - `sha-519b5352`       tag image Coolify apa adanya
 * Ketiganya jadi satu hasil. Kalau format tidak dikenali, nilainya tetap
 * dipakai apa adanya: lebih baik Sentry punya release yang aneh daripada
 * diam-diam kehilangan penanda versi dan mencampur beberapa deploy.
 */
export function sentryRelease(raw = process.env.NEXT_PUBLIC_COMMIT_SHA): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const commit = value
    .replace(/^atcell-web@/, "")
    .replace(/^sha-/, "")
    .trim();
  if (!commit) return null;
  return `${APP_NAME}@${commit}`;
}
