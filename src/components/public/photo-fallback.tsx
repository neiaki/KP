import React from "react";
import { Smartphone } from "lucide-react";
import { BrandLogo, isKnownBrand } from "@/components/public/brand-mark";
import { Locale } from "@/lib/translations";

/*
 * Placeholder kartu untuk produk yang belum punya foto resmi.
 *
 * Yang tampil adalah logo merek dari Simple Icons CDN, bukan foto ponsel.
 * Itu disengaja: memasang foto ponsel yang diambil dari mana pun akan
 * menyamarkan unit yang dijual, padahal foto unit asli hanya bisa diberikan
 * pemilik toko. Logo merek bersifat informatif (pembeli langsung tahu
 * mereknya) tanpa mengaku sebagai foto barang, dan teks "Foto menyusul"
 * tetap menyertai supaya statusnya jujur. Label tetap ada di bawah, bukan
 * menimpa, sesuai aturan foto di AGENTS.md.
 */
export function BrandPhotoFallback({
  brand,
  locale,
}: {
  brand?: string;
  locale: Locale;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 text-muted">
      {brand && isKnownBrand(brand) ? (
        <BrandLogo brand={brand} active={false} colored size="h-14 w-14" />
      ) : (
        <Smartphone className="h-10 w-10" strokeWidth={1.25} />
      )}
      <p className="text-[11px] font-bold">
        {locale === "en" ? "Photo coming soon" : "Foto menyusul"}
      </p>
    </div>
  );
}
