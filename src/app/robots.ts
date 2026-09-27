import type { MetadataRoute } from "next";
import { SITE_ORIGIN, sitemapUrl } from "./sitemap.ts";

/*
 * Import di atas memakai ekstensi .ts supaya modul ini bisa diuji langsung
 * oleh `node --experimental-strip-types`, yang tidak menebak ekstensi pada
 * import relatif. Di dalam aplikasi, alias @/ tetap dipakai seperti biasa.
 *
 * Tidak ada aturan Allow/Disallow untuk halaman publik. Halaman-halaman itu
 * justru targetnya: etalase, Lacak Servis, dan kebijakan toko adalah jalan
 * masuk dari pencarian "toko HP Serpong".
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Disallow di sini murni penghematan crawl budget, bukan keamanan.
      //
      // /portal/ tetap diblokir: halaman-halaman itu sudah dijaga guard 307
      // dan tidak punya konten yang layak diindeks, jadi memblokirnya murni
      // menghemat kuota crawl tanpa risiko apa pun.
      //
      // Halaman login (/id/login, /en/login) sengaja TIDAK diblokir di sini.
      // Keduanya sudah mengirim meta robots "noindex, follow" lewat
      // buildLoginMetadata(), dan Google tidak bisa membaca tag noindex pada
      // halaman yang crawler sendiri tidak boleh di-crawl. Kalau dua mekanisme
      // ini dipakai bersamaan, yang menang adalah Disallow: crawler berhenti
      // di robots.txt, tidak pernah sampai ke tag, dan niat untuk dikeluarkan
      // dari indeks tidak pernah tereksekusi. Membiarkan halaman di-crawl
      // justru satu-satunya cara agar noindex-nya terbaca.
      disallow: ["/portal/"],
    },
    host: SITE_ORIGIN,
    sitemap: sitemapUrl(),
  };
}
