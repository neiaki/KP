import React, { Suspense } from "react";
import { CatalogContent } from "./catalog-content";
import { Locale } from "@/lib/translations";

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
