import type { MetadataRoute } from "next";
import { DEFAULT_LOCALE } from "@/app/sitemap";

/*
 * Manifest PWA. Tanpa berkas ini, At Cell hanya bisa dibuka lewat browser:
 * tidak ada icon di layar utama, tidak ada mode standalone, dan address bar
 * tetap menempel di atas. Chrome dan Android memakai manifest ini sebagai
 * syarat pertama "Tambahkan ke layar utama".
 *
 * start_url sengaja /id, bukan "/". src/proxy.ts mengarahkan "/" ke /id
 * dengan redirect, jadi app yang dibuka dari layar utama akan melewati satu
 * lompatan ekstra sebelum sampai ke isi. Memakai /id sebagai start_url
 * menghilangkan lompatan itu dan langsung memparah locale, sehingga cache
 * dan shortcut di bawah tidak pernah tercampur dua bahasa.
 *
 * scope "/" karena portal (/portal) dan seluruh halaman publik harus ikut
 * ter-install, bukan hanya beranda. Sesi portal memakai cookie origin yang
 * sama, jadi sudah masuk di browser berarti sudah masuk juga di app.
 *
 * display "standalone" tanpa "minimal-ui" supaya app benar-benar terlihat
 * seperti app: tanpa address bar, tanpa tombol refresh.
 */

const ICON_192 = "/icon/192";
const ICON_512 = "/icon/512";
const ICON_MASKABLE = "/icon/maskable-512";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "At Cell: Toko HP Baru, Second dan Servis di Serpong Utara",
    short_name: "At Cell",
    description:
      "Etalase HP baru dan second bergaransi, lacak servis, dan tukar tambah di At Cell Paku Jaya, Serpong Utara.",
    lang: DEFAULT_LOCALE,
    dir: "ltr",
    start_url: `/${DEFAULT_LOCALE}`,
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait",
    /*
     * Warna disalin dari token globals.css: --paper terang dan --accent biru
     * At Cell. Android memakai background_color untuk layar splash, jadi
     * warna kartu putih tidak terlihat seperti halaman yang belum termuat.
     */
    background_color: "#f4f5f7",
    theme_color: "#0b4ed8",
    categories: ["shopping", "business", "productivity"],
    icons: [
      { src: ICON_192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICON_512, sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: ICON_MASKABLE,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    /*
     * Shortcut adalah tombol tekan lama pada icon di layar utama. Yang di sini
     * sengaja hanya aksi yang berguna dan tidak perlu login: lihat stok, lacak
     * servis, dan tukar tambah. Portal tetap ikut, karena begitu masuk di
     * browser, sesi yang sama berlaku di app.
     */
    shortcuts: [
      {
        name: "Lihat stok",
        short_name: "Stok",
        description: "Buka etalase HP yang siap dibawa pulang hari ini.",
        url: `/${DEFAULT_LOCALE}/catalog`,
      },
      {
        name: "Lacak servis",
        short_name: "Servis",
        description: "Lacak progres perbaikan HP dengan kode nota.",
        url: `/${DEFAULT_LOCALE}/tracking`,
      },
      {
        name: "Tukar tambah",
        short_name: "Tukar",
        description: "Hitung taksiran tukar tambah HP lama.",
        url: `/${DEFAULT_LOCALE}/trade-in`,
      },
      {
        name: "Portal staf",
        short_name: "Portal",
        description: "Masuk ke portal operasional At Cell.",
        url: "/portal",
      },
    ],
  };
}
