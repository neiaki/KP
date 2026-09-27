import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { ContactContent } from "./contact-content";
import { Locale } from "@/lib/translations";

/* Halaman ini sebelumnya tidak punya metadata sendiri, jadi ia hanya mewarisi
   title dan description dari layout. Akibatnya tidak ada canonical maupun
   hreflang, dan Google tidak tahu bahwa /id/contact dan /en/contact adalah
   pasangan bahasa dari halaman yang sama. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("contact", locale);
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <ContactContent locale={locale} />;
}
