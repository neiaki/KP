import React, { Suspense } from "react";
import type { Metadata } from "next";
import { buildTrackingMetadata } from "@/app/sitemap";
import { TrackingContent } from "./tracking-content";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const ticket = Array.isArray(query.ticket) ? query.ticket[0] : query.ticket;
  return buildTrackingMetadata(locale, Boolean(ticket?.trim()));
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
