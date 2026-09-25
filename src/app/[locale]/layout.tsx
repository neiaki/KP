import React from "react";
import { PublicNavbar } from "@/components/public/navbar";
import { PublicFooter } from "@/components/public/footer";
import { LiveChatWidget } from "@/components/chat/live-chat-widget";
import { Locale } from "@/lib/translations";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "id";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PublicNavbar locale={locale} />
      <main className="flex-1">{children}</main>
      <PublicFooter locale={locale} />
      <LiveChatWidget />
    </div>
  );
}
