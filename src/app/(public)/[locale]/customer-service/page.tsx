import React from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { CustomerServiceContent } from "./customer-service-content";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("customer-service", locale);
}

export default async function CustomerServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <CustomerServiceContent locale={locale} />;
}
