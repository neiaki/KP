"use client";

import React from "react";
import { Pause, Play } from "lucide-react";
import type { Locale } from "@/lib/translations";

/*
 * Kontrol jeda untuk marquee yang bergerak lebih dari 5 detik.
 *
 * Hover saja tidak cukup untuk WCAG 2.2.2: pengguna keyboard dan layar sentuh
 * tidak punya keadaan hover yang stabil. Tombol ini memberi kontrol eksplisit
 * yang bisa difokus dan ditekan, sementara prefers-reduced-motion tetap
 * mematikan animasinya lewat CSS.
 */
export function MarqueePauseButton({
  paused,
  onToggle,
  locale,
  controls,
}: {
  paused: boolean;
  onToggle: () => void;
  locale: Locale;
  controls: string;
}) {
  const label = paused
    ? locale === "en"
      ? "Resume"
      : "Lanjutkan"
    : locale === "en"
      ? "Pause"
      : "Jeda";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      aria-label={`${label} ${controls}`}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-ink shadow-sm transition-colors hover:border-accent hover:text-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {paused ? (
        <Play className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Pause className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
