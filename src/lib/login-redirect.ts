/*
 * Tujuan setelah login dari parameter ?next=.
 *
 * src/proxy.ts menempelkan ?next= ke URL login ketika pengunjung anonim
 * mencoba membuka halaman portal. Nilai itu masuk lewat address bar, jadi
 * siapa pun boleh mengubahnya dan tidak boleh dipercaya apa adanya. Modul ini
 * memutuskan boleh tidak nilai itu dipakai, dan kalau tidak boleh, halaman
 * tujuan resmi milik role yang dipakai.
 *
 * Modul ini murni dan tidak mengimpor next/server, sama seperti src/lib/access.ts
 * dan src/lib/csp.ts, supaya bisa diuji langsung dengan runner test bawaan Node
 * tanpa menjalankan dev server. Karena itu import di bawah memakai jalur relatif
 * dengan ekstensi .ts, bukan alias @/ yang tidak bisa diurai runner itu.
 */
import { canAccessPortalPath } from "./access.ts";
import type { UserRole } from "@/types";

/*
 * Asal di bawah ini hanya alat bantu mengurai nilai, tidak pernah dipakai
 * sebagai alamat tujuan. Kalau nilainya bukan path, new URL akan memakainya
 * sebagai origin, dan perbandingan origin di bawah akan menolaknya.
 */
const ASAL_PARSIR = "https://login.atcell.invalid";
const ORIGIN_PARSIR = new URL(ASAL_PARSIR).origin;

type PortalTarget = {
  pathname: string;
  search: string;
};

/*
 * Terjemahkan ?next= menjadi path portal di origin sendiri, atau null kalau
 * nilainya tidak aman atau bukan halaman portal.
 *
 * Nilainya harus diawali satu "/" supaya URL absolut dan "//host" langsung
 * gugur, dan tidak boleh memuat backslash karena browser menormalkan "\" jadi
 * "/" sehingga "/\evil.example" dibaca sebagai host lain. Setelah diurai,
 * origin-nya tetap harus milik sendiri, yang menutup "//evil.example" dan
 * "/\evil.example" walau lolos dua pemeriksaan sebelumnya. Terakhir, path-nya
 * harus di bawah /portal/, satu-satunya tempat yang boleh dituju setelah
 * proxy memantulkan pengunjung anonim.
 *
 * Query string ikut dipertahankan karena src/proxy.ts menempelkan query
 * halaman yang dituju, dan hasil parse URL sudah meng-encode ulang karakter
 * aneh sehingga string yang dikembalikan aman dipakai router.push.
 */
function parsePortalTarget(next: string | null | undefined): PortalTarget | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(next, ASAL_PARSIR);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN_PARSIR) return null;
  if (!url.pathname.startsWith("/portal/")) return null;

  return { pathname: url.pathname, search: url.search };
}

/**
 * Halaman tujuan setelah login untuk role tertentu.
 *
 * Memakai deep link hanya kalau nilainya path portal yang boleh dibuka role
 * itu. Selain itu memakai fallback, yaitu beranda role yang sudah diputuskan
 * server di signInWithUsername.
 */
export function resolveLoginDestination(
  next: string | null | undefined,
  role: UserRole,
  fallback: string
): string {
  const target = parsePortalTarget(next);
  if (!target) return fallback;
  if (!canAccessPortalPath(target.pathname, role)) return fallback;
  return `${target.pathname}${target.search}`;
}
