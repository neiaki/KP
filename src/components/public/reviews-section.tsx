"use client";

import React, { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Locale } from "@/lib/translations";
import type { GoogleReviewsData } from "@/lib/reviews";

function Stars({ value, className = "h-3.5 w-3.5" }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rating ${value} dari 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className={`${className} ${i < Math.round(value) ? "fill-amber-400 text-amber-400" : "text-line"}`}
        />
      ))}
    </span>
  );
}

function GoogleG({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.63h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.8z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.92l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.96H1.29v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.55.38-2.27v-3.1H1.3a12 12 0 0 0 0 10.74l4-3.1z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.43A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l4 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-line bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-4 w-24 rounded bg-paper" />
            <div className="ml-auto h-4 w-4 rounded-full bg-paper" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 rounded bg-paper" />
            <div className="h-3 w-5/6 rounded bg-paper" />
            <div className="h-3 w-2/3 rounded bg-paper" />
          </div>
          <div className="mt-4 h-3.5 w-1/3 rounded bg-paper" />
        </div>
      ))}
    </div>
  );
}

export function ReviewsSection({
  locale,
  mapsUrl,
}: {
  locale: Locale;
  mapsUrl: string;
}) {
  const [data, setData] = useState<GoogleReviewsData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/api/reviews")
      .then((r) => r.json())
      .then((j: { ok: boolean; data: GoogleReviewsData | null }) => {
        if (!alive) return;
        if (j.ok && j.data && j.data.reviews.length > 0) {
          setData(j.data);
          setState("ready");
        } else {
          setState("fallback");
        }
      })
      .catch(() => {
        if (alive) setState("fallback");
      });
    return () => {
      alive = false;
    };
  }, []);

  const list = data?.reviews ?? [];
  const countLabel = new Intl.NumberFormat("id-ID").format(data?.count ?? 0);

  return (
    <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
      {state === "loading" && <Skeleton />}

      {state === "ready" && data && (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Kartu ringkasan rating */}
          <div className="flex shrink-0 flex-col justify-between rounded-2xl border border-line bg-card p-6 lg:w-64">
            <div>
              <p className="text-3xl font-extrabold tracking-tight text-ink">
                {data.rating.toFixed(1)} <span className="text-2xl font-bold">Stars</span>
              </p>
              <div className="mt-2">
                <Stars value={data.rating} className="h-4 w-4" />
              </div>
              <p className="mt-2 text-[13px] text-muted">
                {locale === "en"
                  ? `Based on ${countLabel} Reviews`
                  : `Berdasarkan ${countLabel} Ulasan`}
              </p>
            </div>
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center gap-1.5 border-t border-line pt-4 text-sm font-semibold text-ink transition-colors hover:text-accent-deep"
            >
              <GoogleG className="h-5 w-5" />
              Google Reviews
            </a>
          </div>

          {/* Marquee endless, pause murni CSS saat hover */}
          <div
            className="group relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
            role="region"
            aria-label={locale === "en" ? "Customer reviews" : "Ulasan pelanggan"}
          >
            <div className="flex w-max gap-4 py-1 animate-[review-marquee_30s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
              {[...list, ...list].map((r, i) => (
                <figure
                  key={`${r.author}-${i}`}
                  className="relative flex w-72 shrink-0 flex-col rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md sm:w-80"
                >
                  <GoogleG className="absolute right-4 top-4 h-4 w-4" />
                  <div className="flex items-center gap-2 pr-6">
                    <Stars value={r.rating} />
                    {r.time ? <span className="text-[11px] text-muted">{r.time}</span> : null}
                  </div>
                  <blockquote className="mt-3 flex-1 text-[13px] leading-relaxed text-ink">
                    {r.text || " "}
                  </blockquote>
                  <figcaption className="mt-4 text-sm font-bold text-ink">{r.author}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      )}

      {state === "fallback" && (
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6 text-center">
          <div className="flex items-center justify-center">
            <Stars value={5} className="h-4 w-4" />
          </div>
          <p className="mt-2 text-sm font-bold text-ink">
            {locale === "en" ? "Shopped here? Tell others." : "Pernah belanja di sini? Ceritakan."}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
            {locale === "en"
              ? "Tap below to open our Google Maps page and leave a review."
              : "Ketuk tombol di bawah untuk membuka halaman Google Maps kami dan tulis ulasan."}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-xs font-bold text-white hover:bg-accent-deep"
            >
              {locale === "en" ? "Write a review" : "Tulis Review"}
            </a>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-line px-4 text-xs font-bold text-ink hover:border-accent hover:text-accent-deep"
            >
              <GoogleG className="h-3.5 w-3.5" />
              Google Maps
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
