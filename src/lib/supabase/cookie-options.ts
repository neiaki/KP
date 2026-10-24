/**
 * Flag keamanan untuk cookie sesi Supabase Auth.
 *
 * @supabase/ssr 0.12.7 memakai DEFAULT_COOKIE_OPTIONS berupa
 * `httpOnly: false` tanpa `secure` untuk SEMUA cookie yang ia kelola,
 * termasuk chunk `sb-<ref>-auth-token` yang memuat access token dan
 * refresh token. Tanpa override, cookie sesi portal bisa dibaca lewat
 * `document.cookie` oleh skrip mana pun yang lolos ke halaman, dan bisa
 * terkirim lewat koneksi HTTP biasa.
 *
 * Override ini aman untuk aplikasi ini karena TIDAK ADA pembaca client-side
 * terhadap cookie tersebut:
 * - `createBrowserClient` (src/lib/supabase/client.ts) tidak dipakai siapa pun.
 * - Tidak ada `document.cookie` di seluruh `src/`.
 * - Seluruh alur auth (login, refresh di proxy, signOut) berjalan di server,
 *   dan server membaca cookie lewat header permintaan yang tidak terpengaruh
 *   flag httpOnly.
 *
 * `secure` hanya dinyalakan di production supaya pengembangan lewat
 * `http://192.168.x.x` di jaringan lokal tetap bisa memasang sesi.
 * `sameSite: "lax"` dipertahankan dari bawaan library: cukup untuk CSRF
 * pada permintaan lintas situs, dan tidak memutus alur masuk dari tautan
 * biasa.
 */
export function authCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV
): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
} {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
  };
}
