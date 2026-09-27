import React, { Suspense } from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { CatalogContent } from "./catalog-content";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("catalog", locale);
}

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return (
    <Suspense>
      <CatalogContent locale={locale} />
    </Suspense>
  );
}
