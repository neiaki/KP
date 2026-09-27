import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { AboutContent } from "./about-content";
import { Locale } from "@/lib/translations";
import { getPublicImageUrls } from "@/lib/actions/public";

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

  const imageUrls = await getPublicImageUrls();

  return <AboutContent locale={locale} imageUrls={imageUrls} />;
}
