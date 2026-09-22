"use client";

import React from "react";
import { BRANDS, type BrandFilter } from "@/lib/shop";
import { BrandLogo, brandRingClass } from "@/components/public/brand-mark";
import { Locale } from "@/lib/translations";

/* Strip merek berjalan endless. Logo digandakan 4 set agar setengah trek
   selalu lebih lebar dari viewport, sehingga translateX(-50%) loop mulus. */
export function BrandMarquee({
  locale,
  selected,
  onSelect,
}: {
  locale: Locale;
  selected: string;
  onSelect: (b: string) => void;
}) {
  const logos = BRANDS.filter((b): b is Exclude<BrandFilter, "all"> => b !== "all");
  // Satu track lebih lebar dari viewport; track identik kedua membuat
  // translateX(-50%) kembali ke posisi visual yang sama tanpa blank spot.
  const track = Array.from({ length: 4 }, () => logos).flat();

  return (
    <section
      aria-label={locale === "en" ? "Brands available" : "Merek yang tersedia"}
      className="mt-10 overflow-hidden border-y border-line bg-card py-8 sm:mt-14 sm:py-10"
    >
      <div className="group [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex w-max animate-[brand-marquee_32s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
          {[0, 1].flatMap((copy) =>
            track.map((b, index) => {
              const active = selected === b;
              return (
                <button
                  key={`${b}-${copy}-${index}`}
                  type="button"
                  onClick={() => onSelect(active ? "all" : b)}
                  aria-label={copy === 0 ? (locale === "en" ? `Filter ${b}` : `Filter ${b}`) : undefined}
                  aria-hidden={copy > 0}
                  tabIndex={copy > 0 ? -1 : 0}
                  aria-pressed={copy === 0 ? active : undefined}
                  className={`mx-5 flex h-14 w-16 shrink-0 items-center justify-center rounded-full transition-all ${
                    active
                      ? `ring-2 ring-offset-2 ring-offset-card ${brandRingClass(b)}`
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <BrandLogo brand={b} active={active} colored={active} size="h-9 w-9" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
