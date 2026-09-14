import React, { Suspense } from "react";
import { TrackingContent } from "./tracking-content";
import { Locale } from "@/lib/translations";

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-slate-500">
          Memuat data pelacakan servis...
        </div>
      }
    >
      <TrackingContent locale={locale} />
    </Suspense>
  );
}
