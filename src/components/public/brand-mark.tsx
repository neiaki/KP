import React from "react";
import Image from "next/image";

/*
 * Logo brand adalah berkas SVG lokal di public/brand/icons (diambil dari
 * Simple Icons, disalin sekali per merek per warna) dan selalu berukuran
 * 16px (h-4 w-4) atau kelipatan thereof. Alasan aset disimpan lokal, bukan
 * dimuat dari cdn.simpleicons.org saat halaman dibuka:
 *
 * 1. Marquee merek menggandakan logo 8x (4 set x 2 trek) supaya loop
 *    mulus. Dengan CDN itu berarti puluhan permintaan pihak ketiga per
 *    halaman; dengan berkas lokal semuanya same-origin, dicache sekali,
 *    dan bebas bergantung padaketersediaannya CDN.
 * 2. Layout stability tetap dijaga width/height eksplisit; ukuran nyata
 *    tetap dikendalikan className h-full w-full.
 *
 * unoptimized: SVG dikirim apa adanya tanpa melewati optimizer gambar,
 * karena merasterisasi ikon satu warna 1 KB hanya menambah round-trip.
 */
const SLUGS: Record<string, string> = {
  Apple: "apple",
  Samsung: "samsung",
  Xiaomi: "xiaomi",
  Oppo: "oppo",
  Vivo: "vivo",
};

/** Warna resmi logo brand saat aktif (nama berkas lokal, tanpa #). */
const BRAND_COLORS: Record<string, string> = {
  Apple: "000000",
  Samsung: "1428A0",
  Xiaomi: "FF6900",
  Oppo: "00755A",
  Vivo: "415FFF",
};

/** URL berkas ikon lokal: /brand/icons/<slug>-<hex>.svg */
function iconUrl(slug: string, hex: string): string {
  return `/brand/icons/${slug}-${hex}.svg`;
}

/** Merek yang punya logo di Simple Icons CDN; dipakai fallback foto kartu. */
export function isKnownBrand(brand: string): boolean {
  return Object.prototype.hasOwnProperty.call(SLUGS, brand);
}

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
        <Image
          src={`${iconUrl(slug, hex)}`}
          alt=""
          width={24}
          height={24}
          unoptimized
          className={img}
        />
      </span>
    );
  }

  if (active) {
    return (
      <span className={box} aria-hidden="true">
        <Image
          src={`${iconUrl(slug, "101828")}`}
          alt=""
          width={24}
          height={24}
          unoptimized
          className={`${img} dark:hidden`}
        />
        <Image
          src={`${iconUrl(slug, "ffffff")}`}
          alt=""
          width={24}
          height={24}
          unoptimized
          className={`hidden ${img} dark:block`}
        />
      </span>
    );
  }

  return (
    <span className={box} aria-hidden="true">
      <Image
        src={`${iconUrl(slug, "475467")}`}
        alt=""
        width={24}
        height={24}
        unoptimized
        className={`${img} dark:hidden`}
      />
      <Image
        src={`${iconUrl(slug, "A8B0C0")}`}
        alt=""
        width={24}
        height={24}
        unoptimized
        className={`hidden ${img} dark:block`}
      />
    </span>
  );
}
