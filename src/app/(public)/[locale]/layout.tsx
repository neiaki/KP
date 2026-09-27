import type { Metadata } from "next";
import { notFound } from "next/navigation";
import React from "react";
import "../../globals.css";
import { PublicNavbar } from "@/components/public/navbar";
import { PublicFooter } from "@/components/public/footer";
import { LiveChatWidget } from "@/components/chat/live-chat-widget";
import { StoreJsonLd } from "@/components/public/store-json-ld";
import { RootProviders, htmlClass, bodyClass } from "@/components/root-shell";
import { buildLayoutMetadata, isSupportedLocale } from "@/app/sitemap";
import { Locale } from "@/lib/translations";

/*
 * Root layout area publik. Sengaja berada di dalam [locale] supaya atribut
 * lang pada <html> bisa mengikuti bahasa halaman. Kalau root layout diletakkan
 * di atas segmen locale, semua halaman /en tetap akan dianggap berbahasa id.
 *
 * Route group (public) tidak muncul di URL, jadi /id dan /en tetap address
 * yang sama seperti sebelumnya. src/app/page.tsx yang redirect ke /id tidak
 * lagi dipakai karena src/proxy.ts sudah menangani "/" lebih dulu.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLayoutMetadata(locale);
}

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  // Segmen [locale] tidak divalidasi Next.js. Tanpa cek di sini, /admin,
  // /staff, atau URL satu segmen apa pun yang tidak dikenal dilayani dengan
  // HTML beranda dan status 200, lalu ikut terindeks sebagai halaman nyata.
  // notFound() di root layout diproses sebelum response mengalir, jadi ini
  // status 404 sungguhan, bukan hanya tag noindex.
  //
  // Dua jalur yang tidak boleh ikut pecah:
  //   - "/" sudah di-redirect ke /id oleh src/proxy.ts sebelum routing.
  //   - subdomain login di-rewrite ke /id/login, yang tetap locale "id".
  // Semua <Link> di area publik memakai /${locale}/..., jadi tidak ada tautan
  // internal yang sekarang mendarat di 404.
  if (!isSupportedLocale(resolvedParams.locale)) {
    notFound();
  }
  const locale: Locale = resolvedParams.locale;

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={htmlClass}
      suppressHydrationWarning
    >
      <body className={bodyClass} suppressHydrationWarning>
        <RootProviders>
          <div className="flex min-h-[100dvh] flex-col">
            <PublicNavbar locale={locale} />
            <main className="flex-1">
              <StoreJsonLd />
              {children}
            </main>
            <PublicFooter locale={locale} />
            <LiveChatWidget />
          </div>
        </RootProviders>
      </body>
    </html>
  );
}
