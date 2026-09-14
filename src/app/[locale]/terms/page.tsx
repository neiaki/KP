import React from "react";
import { TermsContent } from "./terms-content";
import { Locale } from "@/lib/translations";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <TermsContent locale={locale} />;
}
