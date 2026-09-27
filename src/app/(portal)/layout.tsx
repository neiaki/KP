import type { Metadata } from "next";
import React from "react";
import "../globals.css";
import { RootProviders, htmlClass, bodyClass } from "@/components/root-shell";

/*
 * Root layout area portal staf. Root layout kedua ini diperlukan oleh route
 * group: area publik butuh <html lang> yang dinamis, sedangkan portal selalu
 * Bahasa Indonesia. Next.js hanya mengizinkan satu root layout per route
 * group, jadi keduanya harus dipisah di sini.
 *
 * Layout portal (sidebar dan header) tetap di src/app/(portal)/portal/layout.tsx.
 * <main> juga disimpan di sana, supaya tidak ada dua landmark <main> bersarang
 * seperti sebelumnya.
 */

export const metadata: Metadata = {
  title: "At Cell: Toko HP Baru, Second dan Servis di Serpong Utara",
  description:
    "At Cell Serpong Utara: jual HP baru dan second bergaransi dengan IMEI terdaftar, terima tukar tambah, dan servis HP. Tanya stok lewat WhatsApp.",
};

export default function PortalRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      data-scroll-behavior="smooth"
      className={htmlClass}
      suppressHydrationWarning
    >
      <body className={bodyClass} suppressHydrationWarning>
        <RootProviders>{children}</RootProviders>
      </body>
    </html>
  );
}
