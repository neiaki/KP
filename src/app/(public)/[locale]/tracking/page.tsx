import React, { Suspense } from "react";
import type { Metadata } from "next";
import { buildRouteMetadata } from "@/app/sitemap";
import { TrackingContent } from "./tracking-content";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildRouteMetadata("tracking", locale);
}

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
        <div className="py-20 text-center text-muted">
          {locale === "en"
            ? "Loading service tracking data..."
            : "Memuat data pelacakan servis..."}
        </div>
      }
    >
      <TrackingContent locale={locale} />
    </Suspense>
  );
}
