import { ImageResponse } from "next/og";

/*
 * Icon app yang di-generate dari kode, bukan file PNG di repo.
 *
 * Alasannya: repository ini tidak punya satu pun berkas icon selain
 * favicon.ico, sedangkan PWA wajib punya beberapa ukuran yang harus sinkron.
 * Menyimpan semuanya sebagai binary berarti setiap perubahan warna brand
 * harus mengulang tiap berkas, dan tidak ada yang otomatis ikut berubah.
 * ImageResponse membuat semuanya dari satu komponen, jadi warna dan bentuk
 * hanya ada di satu tempat.
 *
 * Kenapa generateImageMetadata dan bukan satu route dengan query ?size=512:
 * route icon adalah route handler yang di-cache secara statis, dan saat build
 * Next.js memanggilnya tanpa searchParams sama sekali. Akibatnya semua varian
 * dengan query yang berbeda mengembalikan byte yang sama persis: icon maskable
 * diam-diam sama dengan icon biasa, dan Android memotong yang salah. Bentuk
 * di sini memakai daftar id, sehingga tiap varian punya route sendiri
 * (/icon/192, /icon/512, /icon/maskable-512) yang benar-benar ter-prerender
 * terpisah.
 */

/* Token brand yang sama dengan src/app/globals.css. */
const ACCENT = "#0b4ed8";
const PAPER = "#f4f5f7";

/**
 * Varian yang diproduksi. Id dipakai sebagai segment route, jadi isinya harus
 * aman dipakai di URL tanpa pengodean.
 *
 * 192 dan 512 adalah ukuran yang diminta Android dan Chrome untuk icon
 * install. Maskable 512 adalah yang dipakai Android untuk launcher yang
 * memotong ikon jadi lingkaran atau squircle.
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

/**
 * @param id Segment route yang berisi salah satu id di generateImageMetadata.
 */
export default async function Icon({ id }: { id: Promise<string | number> }) {
  const raw = String(await id);
  const varian = VARIAN[raw as VarianId] ?? VARIAN[VARIAN_FALLBACK];
  const { width, height, maskable } = varian;

  /*
   * Icon maskable dipakai Android untuk memotong ikon jadi lingkaran,
   * squircle, atau rounded square, dan Android memperbesar maskable sampai
   * sekitar 80% isi ke tengah. Karena itu isinya dijaga kecil dan di
   * tengah, supaya bagian apa pun yang dipotong tetap terbaca. Latarnya juga
   * memakai aksen, bukan paper: kalau paper, sudut yang dipotong akan terlihat
   * putih di atas wallpaper ponsel yang gelap.
   */
  const radius = maskable ? 0 : width * 0.22;
  const inner = maskable ? 0.56 : 0.7;

  /*
   * Kontras dibalik khusus untuk maskable. Latarnya sudah biru aksen, jadi
   * kotak di dalamnya harus putih dengan tulisan biru; kalau tetap biru di
   * atas biru, ikonnya jadi satu blok warna dan huruf "AT" nyaris tidak
   * terlihat di layar launcher.
   */
  const innerBg = maskable ? "#ffffff" : ACCENT;
  const innerFg = maskable ? ACCENT : "#ffffff";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: maskable ? ACCENT : PAPER,
          borderRadius: `${radius}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: `${inner * 100}%`,
            height: `${inner * 100}%`,
            borderRadius: maskable ? "24%" : "26%",
            backgroundColor: innerBg,
            color: innerFg,
            fontSize: maskable ? "46%" : "44%",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          AT
        </div>
      </div>
    ),
    { width, height }
  );
}
