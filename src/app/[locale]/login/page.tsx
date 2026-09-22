import type { Metadata } from "next";
import { LoginPanel } from "@/components/portal/login-panel";
import { Locale } from "@/lib/translations";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === "en";
  return {
    title: isEn ? "Staff Portal Login" : "Masuk Portal Staf",
    description: isEn
      ? "Single entry to the At Cell operational portal with role-based demo accounts."
      : "Pintu masuk tunggal portal operasional At Cell dengan akun demo berbasis peran.",
  };
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
