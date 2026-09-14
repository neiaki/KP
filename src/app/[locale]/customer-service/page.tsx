import React from "react";
import { CustomerServiceContent } from "./customer-service-content";
import { Locale } from "@/lib/translations";

export default async function CustomerServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <CustomerServiceContent locale={locale} />;
}
