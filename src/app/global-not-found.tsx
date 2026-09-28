import type { Metadata } from "next";
import React from "react";
import Link from "next/link";
import "./globals.css";
import { PublicNavbar } from "@/components/public/navbar";
import { PublicFooter } from "@/components/public/footer";
import { LiveChatWidget } from "@/components/chat/live-chat-widget";
import { ErrorState } from "@/components/error-state";
import { RootProviders, htmlClass, bodyClass } from "@/components/root-shell";
import { getPublicImageUrls } from "@/lib/actions/public";
import { DEFAULT_LOCALE } from "@/app/sitemap";
import type { Locale } from "@/lib/translations";

/*
 * 404 global.
 *
 * Aplikasi ini punya dua root layout, src/app/(public)/[locale]/layout.tsx
 * dan src/app/(portal)/layout.tsx, jadi tidak ada layout di src/app/ yang
 * bisa diwarisi route /_not-found. Tanpa experimental.globalNotFound di
 * next.config.ts, Next.js merender route itu memakai layout bawaannya yang
 * telanjang: HTML tanpa satu pun stylesheet, tanpa navbar, tanpa footer, dan
 * tanpa font, padahal markup-nya tetap memakai class Tailwind.
 *
 * Berkas ini adalah layout route tersebut, jadi Next.js mewajibkannya
 * mengembalikan dokumen utuh: <html> dan <body> di sini, bukan fragmen.
 * Semua yang biasanya datang dari root layout harus ikut diimpor ulang:
 * globals.css untuk token warna dan utilitas Tailwind, htmlClass dan
 * bodyClass untuk font Plus Jakarta Sans, JetBrains Mono, dan palet
 * terang/gelap, lalu RootProviders supaya ThemeInit dan StoreProvider
 * tetap jalan.
 *
 * Layout yang dipakai di dalam adalah komponen publik yang sama dengan
 * halaman lain, bukan tampilan baru: PublicNavbar, PublicFooter,
 * LiveChatWidget, dan hero ErrorState milik src/app/not-found.tsx.
 */

/*
 * Segment config harus berada di berkas server, dan route /_not-found tidak
 * mewarisi force-dynamic dari root layout portal karena file ini berada di
 * luar kedua route group.
 *
 * Alasannya nonce. Content-Security-Policy membuat nonce baru satu kali per
 * permintaan di src/proxy.ts. Halaman yang diprerender sudah punya skripnya
 * jadi HTML jadi waktu build, sehingga nonce per permintaan tidak akan pernah
 * cocok dan seluruh skrip hydration ditolak browser. Root layout portal punya
 * alasan yang sama, jadi keduanya harus memakai mode render yang sama.
 */
export const dynamic = "force-dynamic";

/*
 * Metadata diekspor di sini, bukan diwarisi dari layout mana pun. Next.js
 * otomatis menambah <meta name="robots" content="noindex" /> untuk status
 * 404, jadi halaman ini tidak akan masuk indeks.
 */
export const metadata: Metadata = {
  title: "Halaman tidak ditemukan",
  description:
    "Alamat yang kamu buka tidak ketemu di At Cell. Kembali ke beranda, lihat stok HP, atau lacak servis kamu.",
};

/*
 * Foto 404 diambil dari registry seperti foto halaman lain, jadi tidak ada
 * satu pun gambar situs yang masih terikat ke path lokal. getPublicImageUrls
 * mengembalikan peta kosong saat kuota habis atau Supabase tidak tersambung,
 * dan path lokal di bawah hanya dipakai sebagai cadangan supaya kartu tidak
 * pernah jadi kotak kosong.
 */
const NOT_FOUND_PHOTO = "products/iphone-duo.jpg";

export async function NotFoundPage({ locale }: { locale: Locale }) {
  const imageUrls = await getPublicImageUrls();
  const photo = imageUrls[NOT_FOUND_PHOTO] ?? `/${NOT_FOUND_PHOTO}`;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PublicNavbar locale={locale} />
      <main className="flex-1">
        <ErrorState
          code="404"
          title="Halaman ini tidak ketemu"
          description="Alamatnya mungkin salah ketik atau halamannya sudah dihapus. Stok dan data servis kamu tetap aman."
          image={photo}
          imageAlt="Dua unit iPhone di etalase At Cell"
          imageCaption="Yang nyasar cuma halaman ini. Stok di etalase tetap rapi."
          primary={{ href: `/${locale}`, label: "Kembali ke beranda" }}
          secondary={[
            { href: `/${locale}/catalog`, label: "Lihat stok" },
            { href: `/${locale}/tracking`, label: "Lacak servis" },
          ]}
          waText="Halo At Cell, saya nyasar ke halaman yang tidak ketemu. Minta info dong."
          helpText="Chat WA toko di jam buka 10.00 sampai 21.00, tim kami bantu arahkan."
          langNote={
            <>
              Looking for the English page? Start from the{" "}
              <Link
                href="/en"
                className="font-bold text-accent underline-offset-4 hover:underline"
              >
                homepage in English
              </Link>
              .
            </>
          }
        />
      </main>
      <PublicFooter locale={locale} />
      <LiveChatWidget />
    </div>
  );
}

/*
 * Bahasa.
 *
 * Route /_not-found tidak punya segmen dinamis apa pun dan Next.js tidak
 * mengirim props ke berkas ini, jadi pathname yang diketik pengunjung tidak
 * tersedia di sini. Halamannya karena itu selalu Bahasa Indonesia: id
 * adalah locale bawaan toko, src/proxy.ts mengarahkan / ke /id, dan copy
 * 404 yang sudah ada di src/app/not-found.tsx juga Bahasa Indonesia. Untuk
 * pengunjung yang datang dari /en, catatan di bawah memberi jalan
 * langsung ke beranda Inggris.
 */
export default async function GlobalNotFound() {
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
