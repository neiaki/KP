import React from "react";
import { TradeInContent } from "./trade-in-content";
import { Locale } from "@/lib/translations";

export default async function TradeInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <TradeInContent locale={locale} />;
}
