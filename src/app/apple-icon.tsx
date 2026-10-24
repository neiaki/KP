import { ImageResponse } from "next/og";
import { APPLE_ICON_SIZE } from "@/lib/pwa";
import { BRAND_ACCENT, BrandLogoGlyph } from "@/lib/brand-logo";

/*
 * apple-touch-icon untuk iOS.
 *
 * Safari di iOS membaca <link rel="apple-touch-icon"> untuk icon homescreen.
 * iOS selalu memotong ikon secara otomatis menjadi squircle (rounded rect),
 * jadi ikon ini sengaja dibuat aksen penuh tanpa ruang aman tepi: iOS yang
 * memotong. Glyph dikecilkan ke 84% supaya lengkungan sinyal tidak menabrak
 * sudut potongan. Geometri glyph bersumber dari src/lib/brand-logo.tsx,
 * sama dengan public/brand/logo-icon.svg.
 */

export const contentType = "image/png";
export const size = { width: APPLE_ICON_SIZE, height: APPLE_ICON_SIZE };

export default function AppleIcon() {
  const s = APPLE_ICON_SIZE;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BRAND_ACCENT,
        }}
      >
        <svg width={s} height={s} viewBox="0 0 512 512" fill="none">
          {/* Dipanggil sebagai fungsi: satori hanya menerima intrinsic
              elements di dalam <svg>. */}
          {BrandLogoGlyph({ stroke: "#ffffff", scale: 0.84 })}
        </svg>
      </div>
    ),
    { ...size }
  );
}
