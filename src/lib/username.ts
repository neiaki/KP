/**
 * Turunkan username dari email: bagian sebelum @, huruf kecil, hanya
 * [a-z0-9._-] yang bertahan, dipotong 32 karakter.
 *
 * Dipakai dua tempat: impor pelanggan di src/lib/actions/auth.ts dan
 * derivasi staf di src/lib/store.ts (form yang tidak mengirim username).
 * Sebelumnya rumusnya ditulis dua kali dan bisa berbeda diam-diam, padahal
 * profiles.username punya constraint format ^[a-z0-9._-]{3,32}$ (migrasi
 * 0005_username_login.sql), jadi selisih satu karakter saja membuat baris
 * ditolak database. Kolom itu juga unique, jadi hasil yang berbeda antar
 * tempat mudah berujung pada kegagalan simpan yang pesannya tidak menunjuk
 * ke sini.
 *
 * Harus sejalan dengan trigger handle_new_user() di migrasi 0005: kalau
 * server pernah mengisi username dari email, nilai yang dihitung di sini
 * tidak boleh berbeda dari yang sudah tersimpan. Karena itu tidak ada
 * pembersihan tambahan di luar yang tertulis di atas; titik atau garis di
 * ujung yang lolos dari bagian email dibiarkan, sama seperti versi SQL-nya.
 */
export function deriveUsernameFromEmail(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 32);
}
