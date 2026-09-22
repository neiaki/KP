import React from "react";

const SLUGS: Record<string, string> = {
  Apple: "apple",
  Samsung: "samsung",
  Xiaomi: "xiaomi",
  Oppo: "oppo",
  Vivo: "vivo",
};

// Warna resmi logo brand saat aktif (hex tanpa # untuk Simple Icons CDN)
const BRAND_COLORS: Record<string, string> = {
  Apple: "000000",
  Samsung: "1428A0",
  Xiaomi: "FF6900",
  Oppo: "00755A",
  Vivo: "415FFF",
};

export function brandChipClass(brand: string, active: boolean) {
  if (active) {
    // "Semua" (default) tampil biru tebal agar status filter jelas.
    if (brand === "all") return "border-accent bg-accent text-white shadow-sm";
    switch (brand) {
      case "Apple":
        return "border-neutral-900 bg-neutral-900/10 text-neutral-900 dark:border-white dark:bg-white/10 dark:text-white";
      case "Samsung":
        return "border-[#1428A0] bg-[#1428A0]/10 text-[#1428A0] dark:border-[#5B8DEF] dark:bg-[#5B8DEF]/15 dark:text-[#9DB9F2]";
      case "Xiaomi":
        return "border-[#FF6900] bg-[#FF6900]/10 text-[#FF6900] dark:border-[#FF7A1A] dark:bg-[#FF7A1A]/15 dark:text-[#FFA666]";
      case "Oppo":
        return "border-[#00755A] bg-[#00755A]/10 text-[#00755A] dark:border-[#00A881] dark:bg-[#00A881]/15 dark:text-[#52D1B2]";
      case "Vivo":
        return "border-[#415FFF] bg-[#415FFF]/10 text-[#415FFF] dark:border-[#6B84FF] dark:bg-[#6B84FF]/15 dark:text-[#A3B3FF]";
      default:
        return "border-accent bg-accent-soft text-accent-deep";
    }
  }
  return "border-transparent bg-paper text-muted hover:text-ink";
}

// Warna ring seleksi mengikuti warna resmi tiap brand. Dipakai marquee
// agar lingkaran aktif terlihat disengaja, bukan artefak.
export function brandRingClass(brand: string) {
  switch (brand) {
    case "Apple":
      return "ring-neutral-900 dark:ring-white";
    case "Samsung":
      return "ring-[#1428A0] dark:ring-[#5B8DEF]";
    case "Xiaomi":
      return "ring-[#FF6900] dark:ring-[#FF7A1A]";
    case "Oppo":
      return "ring-[#00755A] dark:ring-[#00A881]";
    case "Vivo":
      return "ring-[#415FFF] dark:ring-[#6B84FF]";
    default:
      return "ring-accent";
  }
}

export function BrandLogo({
  brand,
  active,
  colored = false,
  size = "h-4 w-4",
}: {
  brand: string;
  active: boolean;
  colored?: boolean;
  // Kotak pembungkus berukuran tetap. Logo mengisi kotak via object-contain
  // sehingga tidak pernah melebar ke ukuran natural SVG (biang logo raksasa).
  size?: string;
}) {
  const slug = SLUGS[brand];
  if (!slug) return null;
  const box = `inline-flex ${size} shrink-0 items-center justify-center overflow-hidden`;
  const img = "h-full w-full object-contain";

  if (colored && BRAND_COLORS[brand]) {
    const hex = BRAND_COLORS[brand];
    return (
      <span className={box} aria-hidden="true">
        <img
          src={`https://cdn.simpleicons.org/${slug}/${hex}`}
          alt=""
          loading="lazy"
          className={img}
        />
      </span>
    );
  }

  if (active) {
    return (
      <span className={box} aria-hidden="true">
        <img
          src={`https://cdn.simpleicons.org/${slug}/101828`}
          alt=""
          loading="lazy"
          className={`${img} dark:hidden`}
        />
        <img
          src={`https://cdn.simpleicons.org/${slug}/ffffff`}
          alt=""
          loading="lazy"
          className={`hidden ${img} dark:block`}
        />
      </span>
    );
  }

  return (
    <span className={box} aria-hidden="true">
      <img
        src={`https://cdn.simpleicons.org/${slug}/475467`}
        alt=""
        loading="lazy"
        className={`${img} dark:hidden`}
      />
      <img
        src={`https://cdn.simpleicons.org/${slug}/A8B0C0`}
        alt=""
        loading="lazy"
        className={`hidden ${img} dark:block`}
      />
    </span>
  );
}
