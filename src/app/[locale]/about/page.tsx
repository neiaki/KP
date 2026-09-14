import React from "react";
import { AboutContent } from "./about-content";
import { Locale } from "@/lib/translations";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <AboutContent locale={locale} />;
}
