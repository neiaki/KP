"use client";

import React, { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Smartphone } from "lucide-react";
import { Locale } from "@/lib/translations";

export interface HeroSlide {
  src: string;
  alt: string;
  model: string;
  fact: string;
  waMessage: string;
}

const AUTO_ADVANCE_MS = 5000;

/* Carousel hero: panah kiri kanan + dots + keyboard, meniru pola
   galeri ProductCard. Foto TIDAK ditimpa label apa pun, keterangan
   selalu di bawah foto. Bila file foto belum ada, tampil panel
   pengganti yang jujur, bukan gambar model lain.
   Selama kursor di dalam kotak gambar, slide bergeser sendiri
   tiap 5 detik, lalu berhenti begitu kursor pergi. */
export function HeroCarousel({
  slides,
  locale,
}: {
  slides: HeroSlide[];
  locale: Locale;
}) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [hovering, setHovering] = useState(false);
  // Dinaikkan setiap navigasi manual supaya hitung mundur 5 detik
  // selalu mulai ulang dari klik terakhir, bukan dari tengah jalan.
  const [manualTick, setManualTick] = useState(0);
  const total = slides.length;
  const current = total > 0 ? Math.min(active, total - 1) : 0;

  const go = useCallback(
    (dir: 1 | -1) => {
      setActive((a) => (a + dir + total) % total);
      setManualTick((t) => t + 1);
    },
    [total]
  );

  const jump = useCallback((index: number) => {
    setActive(index);
    setManualTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!hovering || total < 2) return;
    // Hormati prefers-reduced-motion: jangan geser sendiri.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % total);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [hovering, total, manualTick]);

  if (total === 0) return null;
  const slide = slides[current];

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={locale === "en" ? "Featured phones" : "HP sorotan toko"}
      tabIndex={0}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative overflow-hidden rounded-xl border border-line bg-card">
        {failed[current] ? (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-accent-soft px-6 text-center">
            <Smartphone className="h-10 w-10 text-accent-deep" strokeWidth={1.25} />
            <p className="text-lg font-extrabold text-ink">{slide.model}</p>
            <p className="max-w-sm text-[13px] text-muted">
              {locale === "en"
                ? "Official photo coming soon."
                : "Foto resmi menyusul."}
            </p>
          </div>
        ) : (
          <img
            key={slide.src}
            src={slide.src}
            alt={slide.alt}
            onError={() => setFailed((f) => ({ ...f, [current]: true }))}
            className="aspect-[4/3] w-full object-cover"
            loading="eager"
          />
        )}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={locale === "en" ? "Previous" : "Sebelumnya"}
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-ink shadow-md transition-all hover:bg-card active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={locale === "en" ? "Next" : "Berikutnya"}
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-ink shadow-md transition-all hover:bg-card active:scale-95"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        {total > 1 && (
          <div
            className="mt-3 flex items-center justify-center gap-0.5"
            role="group"
            aria-label={locale === "en" ? "Choose slide" : "Pilih slide"}
          >
            {slides.map((s, i) => (
              <button
                key={s.model}
                type="button"
                onClick={() => jump(i)}
                aria-label={`${locale === "en" ? "Show" : "Tampilkan"} ${s.model}`}
                aria-pressed={current === i}
                className="flex h-6 items-center px-1.5"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    current === i ? "w-5 bg-accent" : "w-1.5 bg-line hover:bg-muted"
                  }`}
                />
              </button>
            ))}
          </div>
        )}
        <span className="sr-only" aria-live="polite">
          {slide.model}
        </span>
      </div>
      <p className="mt-2 text-center text-sm font-extrabold text-ink" aria-hidden="true">
        {slide.model}
      </p>
      <span className="sr-only" aria-live="polite">
        {slide.model}. {slide.fact}
      </span>
    </div>
  );
}
