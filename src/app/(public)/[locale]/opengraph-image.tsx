import { ImageResponse } from "next/og";
import { toLocale } from "@/app/sitemap";
import { translations } from "@/lib/translations";

/*
 * Kartu Open Graph untuk seluruh halaman publik.
 *
 * Letaknya di [locale]/ supaya satu berkas menutup semua rute di bawahnya
 * sekaligus, dan og:image ikut berubah bahasa mengikuti segmen locale.
 *
 * Teksnya diambil dari kamus yang sudah dipakai halaman (nav.brand dan
 * hero.tag), jadi tidak ada slogan atau nama merek baru yang ditulis ulang
 * di sini. Warnanya disalin dari token globals.css mode terang: satu aksen
 * biru At Cell di atas paper dengan teks ink, jadi ditulis ulang secara
 * literal. Lihat catatan di dekat konstantannya.
 *
 * Font: TIDAK ada font kustom. next/og memuat Geist-Regular.ttf dari paket
 *nya sendiri saat modul ini di-import (node_modules/next/dist/compiled/
 * @vercel/og/Geist-Regular.ttf, dibaca lewat readFileSync di src/index.node.ts),
 * jadi tidak ada fetch jaringan dan tidak ada file yang harus ikut ter-deploy.
 * Karena font bawaan hanya punya weight 400, hierarki memakai ukuran dan warna,
 * bukan bold. Plus Jakarta Sans sendiri tidak dipakai di sini karena aset
 * built-in next/font tidak tersedia untuk ImageResponse tanpa jaringan.
 */

export const alt = "At Cell, toko handphone dan pusat servis di Serpong Utara";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Warna ini disalin literal dari token mode terang di src/app/globals.css,
 * bukan dibaca darinya. next/og menggambar ke PNG di luar browser, jadi
 * tidak ada cascade CSS yang bisa diikuti dan nilai token tidak bisa dibaca
 * dari berkas CSS.
 *
 * Konsekuensinya, kalau nilai token berubah di globals.css, keempat
 * konstanta di bawah harus diubah juga. Warna mode gelap tidak dipakai di
 * sini karena gambar OG selalu dikirim ke situs pihak ketiga yang
 * menampilkannya di latar terang.
 */
const ACCENT = "#0b4ed8"; // globals.css: --color-accent
const PAPER = "#f4f5f7"; // globals.css: --color-paper
const INK = "#101828"; // globals.css: --color-ink
const MUTED = "#475467"; // globals.css: --color-muted

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = translations[locale];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
        }}
      >
        <div
          style={{
            width: 24,
            height: "100%",
            display: "flex",
            background: ACCENT,
          }}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 88px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 116,
              lineHeight: 1.05,
              letterSpacing: -4,
              color: INK,
            }}
          >
            {t.nav.brand}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 32,
              width: 200,
              height: 12,
              borderRadius: 6,
              background: ACCENT,
            }}
          />
          <div
            style={{
              display: "flex",
              marginTop: 40,
              fontSize: 44,
              lineHeight: 1.3,
              color: MUTED,
            }}
          >
            {t.hero.tag}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
