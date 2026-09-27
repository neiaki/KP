import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { LandingContent } from "./landing-content";
import { Locale } from "@/lib/translations";
import { getPublicImageUrls } from "@/lib/actions/public";

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
  const imageUrls = await getPublicImageUrls();

  return <LandingContent locale={locale} imageUrls={imageUrls} />;
}
