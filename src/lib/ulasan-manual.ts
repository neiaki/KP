/* Ulasan Google yang disalin manual, untuk dipakai selagi Google Places API
 * belum dikonfigurasi.
 *
 * Kenapa file ini ada, dan kenapa tidak seperti blok data yang pernah ada
 * sebelumnya (yang dihapus di commit d685176): data lama itu berasal dari 2021,
 * 4 dari 5 kartunya tidak punya teks, dan angka 4,4-nya ikut dipancarkan
 * sebagai aggregateRating LocalBusiness ke Google. Ulasan basi yang tampil
 * seperti legitimasi lebih berbahaya daripada tidak ada ulasan sama sekali.
 *
 * Bedanya ada di sini: isinya ulasan asli yang disalin dari Google Maps, ada
 * tanggal penyalinannya, dan SNAPSHOT_MAKS_UMUR_HARI membatasi umurnya. Lewat
 * batas itu getGoogleReviews() mengembalikan null lagi: kartu "Tulis Review"
 * muncul kembali dan structured data berhenti memancarkan rating, supaya angka
 * yang tidak lagi mencerminkan toko tidak bertahan sebagai data resmi.
 *
 * Cara mengisi:
 * 1. Buka https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A di HP.
 * 2. Salin nama, jumlah bintang, dan waktu yang tampil di sana. Jangan
 *    meringkas atau memperbaiki ejaan, structured data harus bisa dibandingkan
 *    dengan aslinya.
 * 3. Isi DIAMBIL_PADA dengan tanggal hari ini (YYYY-MM-DD).
 * 4. Ulasan dengan teks kosong tidak boleh dimasukkan. ReviewsSection merender
 *    {r.text || " "}, jadi yang kosong akan jadi kartu hampa di layar.
 * 5. Begitu GOOGLE_PLACES_API_KEY terisi, API otomatis mengalahkan file ini,
 *    jadi tidak ada dua sumber data yang hidup bersamaan.
 */

import type { GoogleReviewsData } from "./reviews.ts";

export interface UlasanManual {
  author: string;
  rating: number;
  /** Waktu apa adanya yang tampil di Google Maps, misalnya "2 bulan lalu". */
  time: string;
  text: string;
}

/** Tanggal penyalinan ulasannya ke file ini, format YYYY-MM-DD. */
export const DIAMBIL_PADA = "2026-10-01";

export const SNAPSHOT: GoogleReviewsData = {
  name: "at cell",
  // Angka diambil dari header Google Maps saat disalin pada 1 Oktober 2026:
  // 4,4 dari 5 ulasan, dengan histogram empat bintang lima dan satu bintang
  // dua. Angka itu bukan hasil hitungan dua ulasan di bawah, jadi keduanya
  // sengaja tidak sama, dan itu bukan salah ketik.
  //
  // Angka yang sama juga yang dipancarkan sebagai aggregateRating ke Google.
  // Structured data ikut basi bersama snapshot ini, dan begitu lewat
  // SNAPSHOT_MAKS_UMUR_HARI aggregateRating ikut hilang, bukan ikut berubah
  // menjadi angka yang sudah tidak benar.
  rating: 4.4,
  count: 5,
  url: "",
  // Hanya ulasan yang punya teks. Tiga ulasan lain di Maps (BABY JOASH,
  // Victor Nicolas, Jasa tebang Pohon) tidak menulis apa pun, dan
  // ReviewsSection merender {r.text || " "}, jadi memuatnya hanya
  // menghasilkan kartu kosong di layar.
  //
  // "time" ditulis dalam bahasa Indonesia karena reviews.ts meminta
  // language=id ke Places API, jadi bentuknya sama dengan yang akan dikirim
  // API kalau nanti key-nya terisi.
  reviews: [
    { author: "St Puryanta", rating: 5, time: "5 tahun lalu", text: "Clean...good a feel" },
    { author: "fernando putra", rating: 5, time: "7 tahun lalu", text: "At cell Keren" },
  ],
};

/**
 * Batas umur snapshot. Setelah ini ReviewsSection kembali menampilkan ajakan
 * menulis ulasan dan aggregateRating hilang dari structured data. Enam bulan
 * dipilih supaya satu ulasan nyata harus disalin ulang paling sering setiap
 * setengah tahun, bukan tiap hari ditimpa jadi tidak ada.
 */
export const SNAPSHOT_MAKS_UMUR_HARI = 180;

export type SnapshotStatus =
  | { status: "siap"; data: GoogleReviewsData }
  | { status: "gagal"; alasan: string };

/**
 * Mengembalikan snapshot kalau isinya masih layak ditampilkan, atau alasan
 * kenapa tidak. Tidak pernah melempar galat: file ini dibaca setiap render
 * beranda dan sitemap, jadi satu baris yang salah edit tidak boleh menjatuhkan
 * seluruh halaman.
 */
export function getSnapshotUlasan(sekarang: Date = new Date()): SnapshotStatus {
  if (SNAPSHOT.reviews.length === 0) {
    return {
      status: "gagal",
      alasan:
        "src/lib/ulasan-manual.ts masih kosong. Isi dengan ulasan asli dari "
        + "Google Maps, atau isi GOOGLE_PLACES_API_KEY.",
    };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(DIAMBIL_PADA)) {
    return {
      status: "gagal",
      alasan:
        "DIAMBIL_PADA di src/lib/ulasan-manual.ts harus tanggal YYYY-MM-DD. "
        + "Tanpa tanggal, umur snapshot tidak bisa dinilai dan ulasannya dibuang.",
    };
  }

  const diambil = new Date(`${DIAMBIL_PADA}T00:00:00Z`);
  if (Number.isNaN(diambil.getTime())) {
    return {
      status: "gagal",
      alasan: `DIAMBIL_PADA "${DIAMBIL_PADA}" bukan tanggal yang bisa dibaca.`,
    };
  }

  const umurHari = Math.floor((sekarang.getTime() - diambil.getTime()) / 86_400_000);
  // Tanggal di masa depan berarti salah ketik, bukan snapshot yang sangat baru.
  // Tanpa cek ini umurHari negatif dan lolos ke seluruh pemeriksaan di bawah.
  if (umurHari < 0) {
    return {
      status: "gagal",
      alasan: `DIAMBIL_PADA "${DIAMBIL_PADA}" ada di masa depan.`,
    };
  }
  if (umurHari > SNAPSHOT_MAKS_UMUR_HARI) {
    return {
      status: "gagal",
      alasan:
        `Ulasan manual terakhir disalin ${DIAMBIL_PADA} (${umurHari} hari lalu), `
        + `melebihi batas ${SNAPSHOT_MAKS_UMUR_HARI} hari. Perbarui salinan dari `
        + "Google Maps supaya angka di halaman tetap sama dengan yang dilihat "
        + "pelanggan.",
    };
  }

  // Rating dan jumlah dari header Maps divalidasi dengan aturan yang sama dengan
  // jalur API. ReviewsSection merender rating itu untuk kartu bintang, jadi satu
  // ketik nol atau angka di luar 1..5 akan tampil ke semua pengunjung tanpa
  // galat, dan structured data ikut memancarkan angka yang salah.
  if (!Number.isFinite(SNAPSHOT.rating) || SNAPSHOT.rating < 1 || SNAPSHOT.rating > 5) {
    return {
      status: "gagal",
      alasan: `SNAPSHOT.rating harus di antara 1 dan 5, sekarang ${SNAPSHOT.rating}.`,
    };
  }
  if (!Number.isInteger(SNAPSHOT.count) || SNAPSHOT.count < 1) {
    return {
      status: "gagal",
      alasan: `SNAPSHOT.count harus bilangan bulat positif, sekarang ${SNAPSHOT.count}.`,
    };
  }

  return { status: "siap", data: SNAPSHOT };
}