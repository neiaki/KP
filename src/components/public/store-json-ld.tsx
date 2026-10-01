import React from "react";
import { getPublicImageUrls, getPublicStoreSettings } from "@/lib/actions/public";
import { getGoogleReviews } from "@/lib/reviews";
import { dbBatch } from "@/db/client";
import { SITE_ORIGIN, STORE_IMAGE_PATH, buildLocalBusinessJsonLd } from "@/app/sitemap";

/*
 * LocalBusiness untuk data kaya Google, disematkan di layout publik supaya
 * ada di setiap halaman yang bisa diindeks, bukan cuma di beranda.
 *
 * Tidak ada satu pun angka bisnis yang ditulis di sini: nama, alamat,
 * telepon, koordinat, peta, dan jam buka semuanya datang dari baris
 * store_settings yang dikelola Admin lewat portal/settings. Rating juga bukan
 * angka karangan, melainkan data yang sama persis dengan yang ditampilkan
 * ReviewsSection, jadi markup dan halaman tidak pernah berbeda.
 *
 * Kalau backend belum terkonfigurasi (mode demo lokal atau build tanpa
 * DATABASE_URL), komponen ini mengembalikan null dan tidak memancarkan
 * markup apa pun. LocalBusiness kosong lebih buruk daripada tidak ada,
 * karena Google bisa membaca alamat yang tidak ada sebagai toko yang salah
 * tempat.
 */

export async function StoreJsonLd() {
  // Ulasan diambil di luar batch dengan sengaja: getGoogleReviews() bicara
  // dengan Google lewat jaringan, bukan dengan database. Kalau ikut di dalam
  // batch, satu fetch yang lambat ke Google menahan antrean database instance
  // itu tanpa batas, dan tidak ada penjaga yang memotongnya.
  const reviewsP = getGoogleReviews().catch(() => null);

  // dbBatch, bukan Promise.all: komponen ini dirender bersamaan dengan page
  // dan layout, jadi dua dari dua panggilan di bawah bisa menyentuh database
  // pada waktu yang sama.
  //
  // try/catch di luar bukan hiasan. catch di dalam langkah hanya menutup galat
  // yang dilempar langkah itu sendiri; langkah yang ditolak karena batas waktu
  // dbBatch melempar dari luar langkah, jadi tanpa try di sini satu markup
  // JSON-LD yang bersifat tambahan bisa menjatuhkan seluruh halaman. Komponen
  // ini memang wajar mengembalikan null: tanpa structured data, halaman tetap
  // benar, hanya Google yang tidak membaca nomor tokomu.
  let settingsResult: Awaited<ReturnType<typeof getPublicStoreSettings>> | null = null;
  let imageUrls: Record<string, string> = {};
  try {
    [settingsResult, imageUrls] = await dbBatch([
      // getPublicStoreSettings() mengembalikan { ok: false } saat backend mati,
      // bukan melempar, tapi panggilan tetap dibungkus catch supaya satu
      // kegagalan jaringan tidak menjatuhkan seluruh render layout.
      () => getPublicStoreSettings().catch(() => null),
      () => getPublicImageUrls().catch((): Record<string, string> => ({})),
    ]);
  } catch {
    settingsResult = null;
    imageUrls = {};
  }
  const reviews = await reviewsP;

  const settings = settingsResult?.ok ? settingsResult.data : null;
  if (!settings) return null;

  // Foto resmi toko diambil dari registry, sama seperti foto yang tampil di
  // halaman. Kalau registry tidak punya path-nya, path lokal tetap dipakai
  // supaya structured data tidak kehilangan field image.
  const imagePath = imageUrls[STORE_IMAGE_PATH] ?? `/${STORE_IMAGE_PATH}`;
  const jsonLd = buildLocalBusinessJsonLd({
    origin: SITE_ORIGIN,
    settings,
    reviews,
    imagePath,
  });

  return (
    <script
      type="application/ld+json"
      // "&" di-escape supaya string yang memuat "</script>" tidak bisa
      // menutup tag lebih awal dan mengorbankan halaman.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}
