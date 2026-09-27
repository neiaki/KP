import React from "react";
import { LandingContent } from "./landing-content";
import { Locale } from "@/lib/translations";

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <LandingContent locale={locale} />;
}
