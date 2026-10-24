import React from "react";

/*
 * Sumber tunggal geometri logo "Cellular Signal Tower & Apex".
 *
 * Markup logo dipakai tiga route gambar yang berdiri sendiri (icon, apple-icon,
 * opengraph-image). Tanpa modul ini, perubahan bentuk logo berarti menyunting
 * path yang sama di tiga tempat dan satu tempat pasti tertinggal. Warna hanya
 * ada di sini juga, supaya token aksen tidak digandakan.
 */

/** Token aksen AtCell; sama dengan --color-accent mode light di globals.css. */
export const BRAND_ACCENT = "#0b4ed8";

/** Latar paper; dipakai sebagai margin luar ikon PWA non-maskable. */
export const BRAND_PAPER = "#f4f5f7";

/** Squircle dasar dalam kanvas 512; margin 32px tiap sisi, radius 112. */
export function BrandSquircle({
  fill = BRAND_ACCENT,
}: {
  fill?: string;
}) {
  return (
    <rect x={32} y={32} width={448} height={448} rx={112} fill={fill} />
  );
}

/**
 * Lima bentuk glyph sinyal: dua gelombang, rangka menara A, palang, dan titik
 * puncak. Scale opsional untuk konteks safe zone (ikon maskable Android dan
 * apple-touch-icon) yang isinya harus menjauh dari tepi.
 */
export function BrandLogoGlyph({
  stroke = "#ffffff",
  scale,
}: {
  stroke?: string;
  scale?: number;
}) {
  const transform =
    scale === undefined
      ? undefined
      : `translate(${(512 * (1 - scale)) / 2}, ${(512 * (1 - scale)) / 2}) scale(${scale})`;
  return (
    <g transform={transform}>
      <path
        d="M 172 108 A 116 116 0 0 1 340 108"
        stroke={stroke}
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M 204 140 A 72 72 0 0 1 308 140"
        stroke={stroke}
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      <path
        d="M 148 392 L 256 182 L 364 392"
        stroke={stroke}
        strokeWidth="42"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 194 304 L 318 304"
        stroke={stroke}
        strokeWidth="36"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="256" cy="182" r="16" fill={stroke} />
    </g>
  );
}
