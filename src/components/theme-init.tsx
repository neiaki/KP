"use client";

import { useEffect } from "react";

/**
 * Menerapkan kelas .dark di <html> dari localStorage saja.
 *
 * Default selalu mode terang, bukan mengikuti preferensi OS. Aturan proyek
 * sudah menetapkan mode gelap sebagai pilihan eksplisit lewat kelas .dark di
 * <html>, jadi system dark mode tidak ikut menentukan tampilan awal.
 *
 * Dijalankan sebagai effect (bukan <script> inline) agar React 19 tidak
 * melempar console error "script tag while rendering component".
 * <html> dan <body> memakai suppressHydrationWarning sehingga selisih
 * kelas awal tidak memicu hydration mismatch.
 */
export function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem("atcell-theme");
      document.documentElement.classList.toggle("dark", stored === "dark");
    } catch {
      /* abaikan, tetap mode terang */
    }
  }, []);

  return null;
}
