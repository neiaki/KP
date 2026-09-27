import type { Metadata } from "next";
import React from "react";
import "../../globals.css";
import { PublicNavbar } from "@/components/public/navbar";
import { PublicFooter } from "@/components/public/footer";
import { LiveChatWidget } from "@/components/chat/live-chat-widget";
import { RootProviders, htmlClass, bodyClass } from "@/components/root-shell";
import { Locale } from "@/lib/translations";

/*
 * Root layout area publik. Sengaja berada di dalam [locale] supaya atribut
 * lang pada <html> bisa mengikuti bahasa halaman. Kalau root layout diletakkan
 * di atas segmen locale, semua halaman /en tetap akan dianggap berBahasa id.
 *
 * Route group (public) tidak muncul di URL, jadi /id dan /en tetap address
 * yang sama seperti sebelumnya. src/app/page.tsx yang redirect ke /id tidak
 * lagi dipakai karena src/proxy.ts sudah menangani "/" lebih dulu.
 */

export const metadata: Metadata = {
  title: "At Cell: Toko HP Baru, Second dan Servis di Serpong Utara",
  description:
    "At Cell Serpong Utara: jual HP baru dan second bergaransi dengan IMEI terdaftar, terima tukar tambah, dan servis HP. Tanya stok lewat WhatsApp.",
};

export default async function PublicRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

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
            <main className="flex-1">{children}</main>
            <PublicFooter locale={locale} />
            <LiveChatWidget />
          </div>
        </RootProviders>
      </body>
    </html>
  );
}
