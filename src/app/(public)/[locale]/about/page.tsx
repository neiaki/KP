import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { AboutContent } from "./about-content";
import { Locale } from "@/lib/translations";
import { getPublicImageUrls } from "@/lib/actions/public";
import { dbBatch } from "@/db/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("about", locale);
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  // dbBatch satu elemen, sama seperti di page.tsx: about dirender bersamaan
  // dengan layout, dan dua query paralel di pool satu koneksi akan menggantung
  // tanpa galat (504 FUNCTION_INVOCATION_TIMEOUT di Vercel).
  const [imageUrls] = await dbBatch([
    () => getPublicImageUrls().catch((): Record<string, string> => ({})),
  ]);

  return <AboutContent locale={locale} imageUrls={imageUrls} />;
}
