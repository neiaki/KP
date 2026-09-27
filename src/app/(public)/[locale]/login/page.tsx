import type { Metadata } from "next";
import { buildLoginMetadata } from "@/app/sitemap";
import { LoginPanel } from "@/components/portal/login-panel";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLoginMetadata(locale);
}

export default async function LocaleLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return <LoginPanel locale={locale} />;
}
