import React from "react";
import { WarrantyContent } from "./warranty-content";
import { Locale } from "@/lib/translations";

export default async function WarrantyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <WarrantyContent locale={locale} />;
}
