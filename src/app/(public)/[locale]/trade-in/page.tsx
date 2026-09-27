import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { TradeInContent } from "./trade-in-content";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("trade-in", locale);
}

export default async function TradeInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <TradeInContent locale={locale} />;
}
