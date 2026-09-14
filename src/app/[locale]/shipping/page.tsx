import React from "react";
import { ShippingContent } from "./shipping-content";
import { Locale } from "@/lib/translations";

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <ShippingContent locale={locale} />;
}
