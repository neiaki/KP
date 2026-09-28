import type { Metadata } from "next";
import React from "react";
import "./globals.css";
import { RootProviders, htmlClass, bodyClass } from "@/components/root-shell";
import { NotFoundPage } from "@/app/global-not-found";
import { DEFAULT_LOCALE } from "@/app/sitemap";

/*
 * 404 untuk URL yang COCOK dengan sebuah route tapi route itu memanggil
 * notFound(), yaitu locale yang tidak didukung: /tidak-ada, /foo, /admin,
 * /staff. Panggilannya cuma satu di seluruh src/, di
 * src/app/(public)/[locale]/layout.tsx L53-55.
 *
 * URL seperti /id/tidak-ada-xyz tidak sampai ke sini. Itu tidak cocok dengan
 * route mana pun, jadi dilayani route /_not-found lewat
 * src/app/global-not-found.tsx. Dua berkas itu sengaja memakai NotFoundPage
 * yang sama supaya isi, chrome, dan font-nya tidak bisa melenceng.
 */

export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
  description:
    "Alamat yang kamu buka tidak ketemu di At Cell. Kembali ke beranda, lihat stok HP, atau lacak servis kamu.",
};

/*
 * 404 ini sudah dirender per permintaan sampai sekarang, karena
 * getPublicImageUrls() membaca header permintaan lewat consumePublicQuota()
 * (src/lib/actions/public.ts). Mode render ditulis eksplisit di sini supaya
 * itu tetap begitu kalau suatu saat pembacaan header itu diganti sumber data
 * lain yang tidak menyentuh permintaan.
 *
 * Alasannya nonce. Content-Security-Policy membuat nonce baru satu kali per
 * permintaan di src/proxy.ts. Halaman yang diprerender sudah punya skripnya
 * jadi HTML jadi waktu build, sehingga nonce per permintaan tidak akan pernah
 * cocok dan seluruh skrip hydration ditolak browser.
 *
 * Halaman ini ada di luar route group (public) dan (portal), jadi tidak
 * mewarisi force-dynamic dari root layout portal, dan Next.js tetap menulis
 * /_not-found sebagai route sendiri. Jangan dihapus tanpa membaca
 * src/lib/csp.ts dulu.
 */
export const dynamic = "force-dynamic";

/*
 * Catatan tambahan untuk comment di atas, yang sekarang berlaku untuk
 * NotFoundPage di src/app/global-not-found.tsx: pembacaan header itu
 * sekarang terjadi di sana, dan berkas ini memanggilnya, jadi alasan
 * force-dynamic tetap sama. Berkas ini juga bukan lagi route /_not-found.
 * Dengan experimental.globalNotFound di next.config.ts, route /_not-found
 * memakai src/app/global-not-found.tsx. Yang dilayani berkas ini adalah
 * boundary not-found paling atas, untuk notFound() yang dilempar dari dalam
 * aplikasi, jadi render per permintaan tetap wajib.
 */

/*
 * KENAPA BERKAS INI MENGEMBALIKAN DOKUMEN UTUH
 *
 * Boundary not-found sebuah segmen tidak pernah membungkus layout-nya sendiri.
 * Di node_modules/next/dist/server/app-render/create-component-tree.js L332
 * dan L440, modul not-found milik segmen N diteruskan sebagai prop notFound ke
 * LayoutRouter milik N. Lalu di L665-680 LayoutRouter itu masuk ke
 * createElement(SegmentComponent, { ...parallelRouteProps }, parallelRouteProps.children),
 * artinya ia menjadi prop children milik layout N. Jadi boundary N duduk DI
 * DALAM hasil render layout N, membungkus children layout itu, bukan layoutnya.
 *
 * Karena yang melempar notFound() di sini adalah root layout [locale] itu
 * sendiri, boundary di level [locale] tidak pernah sempat terpasang. Galat naik
 * ke boundary paling atas, yaitu yang milik src/app/, dan karena aplikasi ini
 * tidak punya root layout, tidak ada satu pun <html> atau <body> yang sudah
 * dirender ketika boundary itu menyala.
 *
 * Efeknya, kalau berkas ini hanya mengembalikan fragmen, stream HTML berakhir
 * tanpa <html> dan <body>, lalu
 * node_modules/next/dist/server/app-render/stream-ops.node.js L451-466
 * menempelkan <html id="__next_error__"> dengan pesan "Missing <html> and
 * <body> tags in the root layout". Itulah persis HTML telanjang yang muncul di
 * produksi untuk /foo: tanpa stylesheet, tanpa navbar, tanpa font.
 *
 * Berkas ini karena itu mengembalikan dokumen utuh, dengan chrome, font, dan
 * token warna yang sama seperti halaman publik lain. Root layout portal juga
 * tidak pernah ikut di sini, karena boundary paling atas berada di atasnya.
 *
 * Konsekuensi yang harus dijaga: jangan memindahkan notFound() dari layout ke
 * halaman di bawahnya tanpa sekaligus menyiapkan boundary di level yang lebih
 * dalam. Kalau notFound() dilempar dari halaman, layout sudah merender <html>
 * dan <body>, lalu dokumen utuh di sini akan menjadi <html> di dalam <html>.
 */

/*
 * Bahasa: notFound() hanya dilempar kalau locale di URL tidak didukung, jadi
 * saat halaman ini muncul tidak ada locale valid yang bisa diikuti dari sana.
 * DEFAULT_LOCALE dipakai, sama seperti 404 global, dan catatan di NotFoundPage
 * memberi jalan ke beranda Inggris untuk pengunjung dari /en.
 */
export default function NotFound() {
  return (
    <html
      lang={DEFAULT_LOCALE}
      data-scroll-behavior="smooth"
      className={htmlClass}
      suppressHydrationWarning
    >
      <body className={bodyClass} suppressHydrationWarning>
        <RootProviders>
          <NotFoundPage locale={DEFAULT_LOCALE} />
        </RootProviders>
      </body>
    </html>
  );
}
