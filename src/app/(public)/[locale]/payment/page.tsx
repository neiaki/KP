import React from "react";
import { PaymentContent } from "./payment-content";
import { Locale } from "@/lib/translations";

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <PaymentContent locale={locale} />;
}
