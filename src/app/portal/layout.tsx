"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Menu, ExternalLink } from "lucide-react";
import { PortalSidebar } from "@/components/portal/portal-sidebar";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] bg-paper">
      <PortalSidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-card/95 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu navigasi"
            aria-expanded={mobileOpen}
            className="rounded-lg p-2 text-ink hover:bg-paper"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-extrabold text-white">
              AT
            </span>
            <span className="text-sm font-extrabold tracking-tight text-ink">
              At Cell Portal
            </span>
          </span>
          <Link
            href="/id"
            aria-label="Lihat web publik"
            className="ml-auto rounded-lg p-2 text-muted hover:bg-paper hover:text-ink"
          >
            <ExternalLink className="h-5 w-5" />
          </Link>
        </div>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
