import React from "react";

/* Logo SVG resmi via Simple Icons CDN. Warna logo mengikuti
   state chip agar kontras di semua kombinasi. */
const SLUGS: Record<string, string> = {
  Apple: "apple",
  Samsung: "samsung",
  Xiaomi: "xiaomi",
  Oppo: "oppo",
  Vivo: "vivo",
};

/* Warna khas tiap brand, hanya dipakai saat chip aktif. */
const ACTIVE_BG: Record<string, string> = {
  Apple: "bg-[#515154] text-white",
  Samsung: "bg-[#1428A0] text-white",
  Xiaomi: "bg-[#FF6900] text-white",
  Oppo: "bg-[#00755A] text-white",
  Vivo: "bg-[#415FFF] text-white",
};

export function brandChipClass(brand: string, active: boolean) {
  if (active) return ACTIVE_BG[brand] ?? "bg-accent text-white";
  return "bg-paper text-muted hover:text-ink";
}

function logoFg(brand: string, active: boolean) {
  if (!active) return null;
  return "white";
}

export function BrandLogo({ brand, active }: { brand: string; active: boolean }) {
  const slug = SLUGS[brand];
  if (!slug) return null;
  const fg = logoFg(brand, active);
  if (fg) {
    return (
      <img
        src={`https://cdn.simpleicons.org/${slug}/${fg}`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="h-3.5 w-3.5 shrink-0"
      />
    );
  }
  return (
    <>
      <img
        src={`https://cdn.simpleicons.org/${slug}/475467`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="h-3.5 w-3.5 shrink-0 dark:hidden"
      />
      <img
        src={`https://cdn.simpleicons.org/${slug}/A8B0C0`}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="hidden h-3.5 w-3.5 shrink-0 dark:block"
      />
    </>
  );
}
