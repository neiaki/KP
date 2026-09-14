import React from "react";
import { ContactContent } from "./contact-content";
import { Locale } from "@/lib/translations";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <ContactContent locale={locale} />;
}
