"use client";

import { useEffect } from "react";

/**
 * Fallback terakhir saat root layout sendiri crash. File ini menggantikan
 * <html> dan <body>, jadi tidak boleh memakai komponen layout, context,
 * atau class Tailwind. Semua gaya ditulis inline agar tetap tampil rapi.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const tryAgain = retry ?? reset;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f4f5f7",
          color: "#101828",
          fontFamily:
            "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "24px",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "560px",
            backgroundColor: "#ffffff",
            border: "1px solid #e4e7ec",
            borderRadius: "12px",
            padding: "32px",
            textAlign: "left",
          }}
        >
          <p
            style={{
              display: "inline-block",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              fontSize: "12px",
              fontWeight: 700,
              border: "1.5px dashed #1d55c9",
              color: "#1848ac",
              borderRadius: "6px",
              padding: "4px 10px",
              margin: 0,
            }}
          >
            ERR 500
          </p>
          <h1
            style={{
              fontSize: "28px",
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              margin: "16px 0 0",
            }}
          >
            Sistem kami lagi gangguan
          </h1>
          <p style={{ color: "#475467", lineHeight: 1.7, margin: "12px 0 0" }}>
            Coba muat ulang halaman ini. Kalau masih gagal, buka web At Cell
            dari awal atau hubungi toko lewat WhatsApp di jam buka 10.00
            sampai 21.00.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: "12px",
                color: "#475467",
                wordBreak: "break-all",
                margin: "16px 0 0",
              }}
            >
              Kode: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "24px" }}>
            {tryAgain ? (
              <button
                type="button"
                onClick={tryAgain}
                style={{
                  height: "48px",
                  padding: "0 28px",
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: "#0b4ed8",
                  color: "#fff",
                  fontSize: "15px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Coba lagi
              </button>
            ) : null}
            {/* next/link tidak bisa dipakai di sini: global-error menggantikan root layout sehingga tidak ada router context. Navigasi full-reload via <a> justru yang paling aman untuk fallback terakhir. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/id"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "48px",
                padding: "0 20px",
                border: "1px solid #e4e7ec",
                borderRadius: "8px",
                color: "#101828",
                fontSize: "15px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Kembali ke beranda
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
