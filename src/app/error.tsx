"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { RotateCcw } from "lucide-react";
import { ErrorState } from "@/components/error-state";

type SegmentErrorProps = {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
};

export default function SegmentError({ error, retry, reset }: SegmentErrorProps) {
  const tryAgain = retry ?? reset;

  useEffect(() => {
    // Dilaporkan ke Sentry kalau DSN-nya terpasang, kalau tidak tetap ke
    // console supaya error terlihat di log browser saat development.
    // Sentry.init() tidak dijalankan sama sekali tanpa DSN, jadi pemanggilan
    // di sini aman di demo lokal.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error, { tags: { boundary: "segment" } });
    }
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      code="500"
      title="Sistem kami lagi gangguan"
      description="Coba muat ulang halaman ini. Kalau masih gagal, kirim kode di bawah lewat WA biar tim kami cepat cek."
      // Path lokal, satu-satunya di situs ini yang belum lewat product_images.
      // Alasannya bukan lupa: error boundary Next.js harus client component,
      // sedangkan product_images dibaca lewat database dari server. Halaman
      // 500 justru sering muncul saat database tidak bisa dijangkau, jadi
      // menanyakan lokasi file ke database di sini akan menggagalkan dua kali.
      // File-nya tetap ada di public/products, jadi fotonya tetap muncul.
      image="/products/iphone-15-pro-1.jpg"
      imageAlt="Unit iPhone di meja servis At Cell"
      imageCaption="Data transaksi dan antrean servis kamu tidak hilang."
      primary={{ href: "/id", label: "Kembali ke beranda" }}
      secondary={[{ href: "/id/catalog", label: "Lihat stok" }]}
      waText={`Halo At Cell, saya kena error di web.${error.digest ? ` Kode: ${error.digest}.` : ""} Minta bantuan.`}
      helpText="Chat WA toko di jam buka 10.00 sampai 21.00 dan sertakan kode error di bawah."
      actions={
        <span className="flex flex-wrap items-center gap-2">
          {tryAgain ? (
            <button
              type="button"
              onClick={tryAgain}
              className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-7 text-[15px] font-bold text-white shadow-sm transition-all duration-200 hover:bg-accent-deep active:scale-[0.98]"
            >
              <RotateCcw className="h-4 w-4" />
              Coba lagi
            </button>
          ) : (
            <Link
              href="/id"
              className="inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-7 text-[15px] font-bold text-white shadow-sm transition-all duration-200 hover:bg-accent-deep active:scale-[0.98]"
            >
              Kembali ke beranda
            </Link>
          )}
        </span>
      }
      meta={
        error.digest ? (
          <details className="rounded-lg border border-line bg-card px-4 py-3 text-sm">
            <summary className="cursor-pointer font-bold text-ink">
              Kode error untuk teknisi
            </summary>
            <p className="mt-2 font-mono text-xs break-all text-muted">
              {error.digest}
            </p>
          </details>
        ) : null
      }
    />
  );
}
