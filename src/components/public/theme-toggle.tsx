"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

/* Mode gelap hidup sebagai kelas .dark di <html>, yaitu state di luar React.
   useSyncExternalStore membacanya langsung, jadi tombol selalu tampil sejak
   render pertama tanpa menunggu frame berikutnya.

   Versi lama memakai state null lalu berubah di dalam requestAnimationFrame.
   rAF dijeda saat tab tidak terlihat dan bisa dibatalkan saat React
   memperbaiki error hydrasi, sehingga state tetap null dan yang tampil
   cuma placeholder kosong: tombol hilang tanpa jalan pulih. */
function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

// Server tidak punya DOM, selalu merender versi mode terang. Setelah
// hydration, useSyncExternalStore membandingkan snapshot client dan render
// ulang bila berbeda, tanpa memicu hydration mismatch.
function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("atcell-theme", next ? "dark" : "light");
    } catch {
      /* abaikan, tema tetap berubah untuk sesi ini */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={dark ? "Mode terang" : "Mode gelap"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-paper"
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
