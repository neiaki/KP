import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { ShippingContent } from "./shipping-content";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("shipping", locale);
}

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <ShippingContent locale={locale} />;
}
