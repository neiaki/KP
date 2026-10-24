import { ImageResponse } from "next/og";
import { BRAND_ACCENT, BRAND_PAPER, BrandLogoGlyph, BrandSquircle } from "@/lib/brand-logo";

/*
 * Icon app yang di-generate dari kode, bukan file PNG di repo.
 *
 * Sesuai panduan Next.js & PWA: 192 dan 512 adalah ukuran standar
 * Android/Chrome untuk instalasi PWA; maskable 512 dipakai Android untuk
 * launcher adaptif (lingkaran/squircle).
 *
 * Bentuknya persis public/brand/logo-icon.svg (sumber geometrinya satu di
 * src/lib/brand-logo.tsx): squircle aksen dengan margin, glyph sinyal putih.
 * Varian non-maskable punya latar paper di luar squircle, seperti asset.
 * Maskable memakai aksen penuh dan glyph yang dikecilkan ke safe zone
 * tengah, karena Android memperbesar maskable sampai sekitar 80% isinya.
 */

const VARIAN = {
  "192": { width: 192, height: 192, maskable: false },
  "512": { width: 512, height: 512, maskable: false },
  "maskable-512": { width: 512, height: 512, maskable: true },
} as const;

type VarianId = keyof typeof VARIAN;
const VARIAN_FALLBACK: VarianId = "512";

export function generateImageMetadata() {
  return (Object.keys(VARIAN) as VarianId[]).map((id) => ({
    id,
    contentType: "image/png",
    size: { width: VARIAN[id].width, height: VARIAN[id].height },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const raw = String(await id);
  const varian = VARIAN[raw as VarianId] ?? VARIAN[VARIAN_FALLBACK];
  const { width, height, maskable } = varian;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: maskable ? BRAND_ACCENT : BRAND_PAPER,
          borderRadius: maskable ? 0 : `${width * 0.22}px`,
        }}
      >
        <svg width={width} height={height} viewBox="0 0 512 512" fill="none">
          {/*
            Dipanggil sebagai fungsi, bukan JSX component: renderer next/og
            (satori) hanya menerima intrinsic elements di dalam <svg> dan
            tidak meng-expand komponen React kustom.
          */}
          {maskable
            ? BrandLogoGlyph({ stroke: "#ffffff", scale: 0.68 })
            : [BrandSquircle({ fill: BRAND_ACCENT }), BrandLogoGlyph({ stroke: "#ffffff" })]}
        </svg>
      </div>
    ),
    { width, height }
  );
}
