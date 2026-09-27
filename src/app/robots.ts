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
      // /portal/ di domain utama dan halaman login staf sudah dijaga proxy
      // dan guard 307, tapi tetap tidak ada nilainya bagi siapa pun yang
      // mencari, dan membiarkannya terindeks hanya menambah halaman tipis.
      disallow: ["/portal/", "/id/login", "/en/login"],
    },
    host: SITE_ORIGIN,
    sitemap: sitemapUrl(),
  };
}
