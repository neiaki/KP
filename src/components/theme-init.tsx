"use client";

import { useEffect } from "react";

/**
 * Menerapkan kelas .dark di <html> dari localStorage atau preferensi OS.
 * Dijalankan sebagai effect (bukan <script> inline) agar React 19 tidak
 * melempar console error "script tag while rendering component".
 * <html> dan <body> memakai suppressHydrationWarning sehingga selisih
 * kelas awal tidak memicu hydration mismatch.
 */
export function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem("atcell-theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      document.documentElement.classList.toggle(
        "dark",
        stored === "dark" || (!stored && prefersDark)
      );
    } catch {
      /* abaikan, tetap mode terang */
    }
  }, []);

  return null;
}
