"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Menu, ExternalLink } from "lucide-react";
import { PortalSidebar } from "@/components/portal/portal-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";

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
        {/* Topbar HP: tinggi sentuh 44px (bukan 36px seperti p-2 default),
            plus ruang untuk notch/iStatus bar. Sticky karena halaman portal
            panjang (settings, reports) dan menu harus selalu terjangkau. */}
        <div className="sticky top-0 z-30 flex min-h-14 items-center gap-1 border-b border-line bg-card/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur sm:gap-2 sm:px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu navigasi"
            aria-expanded={mobileOpen}
            className="-ml-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-paper"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-extrabold text-white">
              AT
            </span>
            <span className="truncate text-sm font-extrabold tracking-tight text-ink">
              At Cell Portal
            </span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Link
              href="/id"
              aria-label="Lihat web publik"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink"
            >
              <ExternalLink className="h-5 w-5" />
            </Link>
          </div>
        </div>
        {/* pb-extra + safe-area: keypad HP dan garis gestur iOS bisa menutup
            baris terakhir / tombol submit kalau halaman tidak menyisakan
            ruang tambahan di bawah.

            <main> sengaja TIDAK diberi overflow-y-auto atau overscroll-
            contain. Kolomnya tinggi mengikuti isi (induknya flex-col tanpa
            tinggi pasti), jadi <main> tidak pernah bisa menggulir: ia cuma
            deklarasi dirinya kotak gulir. Akibatnya overscroll-contain
            memutus rantai gulir tepat di <main>, sehingga wheel dan gestur
            touchpad berhenti di sana dan tidak pernah sampai ke dokumen yang
            sebenarnya bisa digulir. Gejalanya: sidebar masih menggulir kalau
            menu panjang, scrollbar dokumen masih bisa ditarik, tapi gesture
            dua jari mati total. Area publik sudah benar begini juga
            (src/app/(public)/[locale]/layout.tsx, <main className="flex-1">)
            dan di situ trackpad normal. */}
        <main className="flex-1 p-3 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
