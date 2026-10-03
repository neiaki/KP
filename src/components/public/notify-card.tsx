"use client";

import Image from "next/image";
import { MessageCircle, Smartphone } from "lucide-react";
import {
  buildNotifyMeHref,
  notifyMeTargetFrom,
  referencePriceNote,
  type NoUnitSectionCopy,
  type SoldOutSectionCopy,
} from "@/lib/catalogue-notify";
import { isRealPhoto } from "@/lib/shop";
import type { Product } from "@/types";
import type { Locale } from "@/lib/translations";

/*
 * Kartu produk yang tidak bisa dibeli hari ini, dipakai di beranda dan katalog
 * untuk dua kelompok yang berbeda: model yang belum pernah punya unit, dan
 * model yang unitnya habis.
 *
 * Komponen ini ada supaya kedua kelompok itu tidak bisa berbeda tampilan dan
 * tidak bisa salah label. Dulu keduanya ditulis terpisah di tiap halaman, dan
 * label "belum ada unit" ikut dipakai untuk model yang sudah pernah terjual,
 * karena halaman publik tidak pernah menerima unit sold.
 *
 * Satu perbedaan yang disengaja: `alasan` menentukan kalimat pembuka pesan
 * WhatsApp, bukan tampilan kartu. Pelanggan yang menekan tombolnya harus
 * membaca alasan yang benar, dan "unitnya belum ada di toko" versus
 * "sekarang tidak ada di rak" itu pernyataan yang berbeda.
 */

/** Copy yang dipakai kartu, dari noUnitSectionCopy atau soldOutSectionCopy. */
export type NotifyCardCopy = NoUnitSectionCopy | SoldOutSectionCopy;

export function NotifyCard({
  product,
  locale,
  waNumber,
  copy,
  alasan,
  headingLevel = "h3",
}: {
  product: Product;
  locale: Locale;
  waNumber: string;
  copy: NotifyCardCopy;
  alasan: "never_had_unit" | "sold_out";
  /** Tag heading, supaya hierarki dokumen tetap benar di tiap halaman. */
  headingLevel?: "h3" | "h4";
}) {
  // Aturan foto disalin dari isRealPhoto, bukan ditulis ulang di sini, supaya
  // kartu ini dan kartu unit yang bisa beli tidak bisa berbeda pendapat soal
  // nilai apa yang boleh masuk ke atribut src.
  // filter(isRealPhoto) mengembalikan elemen aslinya, bukan salinan yang sudah
  // dipangkas. Jadi nilai yang dikelilingi spasi lolos validasi lalu tetap
  // ber-spasi sampai atribut src, dan next/image menolaknya. Yang diteruskan
  // harus nilai yang sama persis dengan yang divalidasi, sama seperti yang
  // sudah dilakukan di grid produk portal.
  const official = (product.official_images ?? [])
    .filter(isRealPhoto)
    .map((v) => v.trim());
  const img =
    official.length > 0
      ? official[0]
      : isRealPhoto(product.image_url)
        ? product.image_url.trim()
        : undefined;
  const target = notifyMeTargetFrom(product);
  const harga = referencePriceNote(product.default_price, locale);
  const Heading = headingLevel;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-card opacity-80 grayscale-[35%]">
      <div className="relative aspect-[4/3] overflow-hidden bg-paper">
        {!img && <PhotoFallback locale={locale} />}
        {img && (
          <Image
            fill
            sizes={"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            src={img}
            alt={`${product.brand} ${product.model_name}`}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-2 inline-flex w-fit items-center rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-paper">
          {copy.badge}
        </p>
        <Heading className="text-[15px] font-extrabold leading-snug text-ink">
          {product.brand} {product.model_name}
        </Heading>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
          {product.specs}
        </p>
        {harga && (
          <>
            <p className="mt-1 text-[13px] font-bold text-muted">{harga}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              {copy.priceCaveat}
            </p>
          </>
        )}
        {target && (
          <a
            href={buildNotifyMeHref({ locale, waNumber, target, alasan })}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-wa px-4 text-[13px] font-bold text-white hover:bg-wa-deep"
          >
            <MessageCircle className="h-4 w-4" />
            {copy.notifyLabel}
          </a>
        )}
      </div>
    </article>
  );
}

/**
 * Placeholder untuk produk tanpa foto yang bisa dirender.
 *
 * Text-nya jujur soal apa yang terjadi: fotonya menyusul, bukan rusak.
 */
function PhotoFallback({ locale }: { locale: Locale }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted">
      <Smartphone className="h-10 w-10" strokeWidth={1.25} />
      <p className="text-[11px] font-bold">
        {locale === "en" ? "Photo coming soon" : "Foto menyusul"}
      </p>
    </div>
  );
}
