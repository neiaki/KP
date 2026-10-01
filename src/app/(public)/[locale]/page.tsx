import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { LandingContent } from "./landing-content";
import { Locale } from "@/lib/translations";
import { getPublicImageUrls } from "@/lib/actions/public";
import { dbBatch } from "@/db/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("", locale);
}

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  // Foto carousel diambil di sini, di server, lalu dikirim sebagai prop.
  // Komponen klien tidak boleh bicara langsung ke database, dan simpan peta
  // ini di store justru membuat salinan kedua yang bisa basi.
  //
  // dbBatch satu elemen, bukan panggilan langsung: page dirender bersamaan
  // dengan layout, dan di Vercel pool database cuma satu koneksi. Dua query
  // paralel di pool itu menggantung tanpa galat sampai Vercel memutuskan
  // function-nya terlalu lama (504 FUNCTION_INVOCATION_TIMEOUT).
  // catch-nya bukan hiasan: database yang sedang sibuk membuat langkah ini
  // ditolak oleh batas waktu dbBatch, dan halaman publik tidak boleh ikut 500
  // karena peta gambar gagal. Tanpa seed, komponen klien tetap mencoba
  // mengambilnya sendiri di browser.
  const [imageUrls] = await dbBatch([
    () => getPublicImageUrls().catch((): Record<string, string> => ({})),
  ]);

  return <LandingContent locale={locale} imageUrls={imageUrls} />;
}
