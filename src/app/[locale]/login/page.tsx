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
      ? "Secure staff portal access for the At Cell operations team."
      : "Akses portal operasional At Cell yang aman untuk tim toko.",
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
