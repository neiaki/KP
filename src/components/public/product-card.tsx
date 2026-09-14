"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { formatIDR } from "@/lib/utils";
import { MessageCircle, ArrowLeftRight, Check, BadgeCheck, CreditCard, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/public/brand-mark";
import { Locale } from "@/lib/translations";
import type { UnitTag } from "@/types";

export interface ProductCardItem {
  unitId: number;
  brand: string;
  modelName: string;
  specs: string;
  images: string[];
  condition: string;
  price: number;
  newPrice?: number;
  monthly: number;
  imeiTail: string;
  created_at: string;
  tag?: UnitTag;
}

export function ProductCard({
  item,
  locale,
  waNumber,
}: {
  item: ProductCardItem;
  locale: Locale;
  waNumber: string;
}) {
  const isNew = item.condition === "new";
  const gallery = item.images.length > 0 ? item.images : [];
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const current = gallery.length > 0 ? Math.min(active, gallery.length - 1) : 0;

  const go = (dir: 1 | -1) =>
    setActive((a) => (a + dir + gallery.length) % gallery.length);

  useEffect(() => {
    if (!hovering || gallery.length < 2) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % gallery.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [hovering, gallery.length, item.unitId]);

  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border border-line bg-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-paper">
        {gallery.length > 0 && (
          <img
            key={gallery[current]}
            src={gallery[current]}
            alt={`${item.brand} ${item.modelName} foto ${current + 1} dari ${gallery.length}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Foto sebelumnya"
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-ink shadow-md transition-all hover:bg-card active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Foto berikutnya"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-ink shadow-md transition-all hover:bg-card active:scale-95"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div
              className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/35 px-2 py-1.5 backdrop-blur-[2px]"
              role="group"
              aria-label="Pilih foto unit"
            >
              {gallery.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  type="button"
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  aria-label={`Lihat foto ${i + 1} dari ${gallery.length}`}
                  aria-pressed={current === i}
                  className="flex h-6 items-center px-1.5"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all ${
                      current === i ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white"
                    }`}
                  />
                </button>
              ))}
            </div>
          </>
        )}
        <span className="sr-only" aria-live="polite">
          {gallery.length > 1 ? `Foto ${current + 1} dari ${gallery.length}` : ""}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {item.tag && (
          <p
            className={`mb-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white ${
              item.tag === "bestseller" ? "bg-accent" : "bg-bad"
            }`}
          >
            {item.tag === "bestseller" && <Flame className="h-3 w-3" />}
            {item.tag === "bestseller"
              ? locale === "en"
                ? "Best seller"
                : "Terlaris"
              : locale === "en"
                ? "Last unit"
                : "Sisa 1"}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <BrandLogo brand={item.brand} active={false} />
          {item.brand}
        </p>
        <h3 className="mt-0.5 text-[15px] font-extrabold leading-snug text-ink">
          {item.brand} {item.modelName}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
          {item.specs}
        </p>
        <p className="mt-1.5 text-xs font-semibold text-muted">
          {isNew ? (locale === "en" ? "New, sealed" : "Baru, segel") : (locale === "en" ? "Second, checked at the counter" : "Second, sudah dicek di konter")}
        </p>

        <div className="mt-2.5">
          <span className="stamp-imei">
            <BadgeCheck className="h-3.5 w-3.5" />
            {locale === "en" ? "Official IMEI" : "IMEI resmi"}
          </span>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          {!isNew && item.newPrice ? (
            <p className="text-[11px] text-muted">
              {locale === "en" ? "New price" : "Barunya"}{" "}
              <span className="price-was font-semibold">{formatIDR(item.newPrice)}</span>
            </p>
          ) : null}
          <p className="text-[22px] font-extrabold tracking-tight text-ink">
            {formatIDR(item.price)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
            <CreditCard className="h-3 w-3" />
            {locale === "en" ? "Installment from" : "Cicilan dari"} {formatIDR(item.monthly)}/bln
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-good">
            <Check className="h-3.5 w-3.5" />
            {locale === "en" ? "In store now" : "Ada di toko"}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
              `Halo At Cell, saya mau tanya stok ${item.brand} ${item.modelName} (${item.condition}) seharga ${formatIDR(item.price)}. Masih ada?`
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" variant="wa" className="w-full">
              <MessageCircle className="h-3.5 w-3.5" />
              Tanya stok
            </Button>
          </a>
          <Link href={`/${locale}/trade-in`} className="w-full">
            <Button variant="outline" size="sm" className="w-full">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Tukar tambah
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}
