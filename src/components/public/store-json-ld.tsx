import React from "react";
import { getPublicImageUrls, getPublicStoreSettings } from "@/lib/actions/public";
import { getGoogleReviews } from "@/lib/reviews";
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
  const [settingsResult, reviews, imageUrls] = await Promise.all([
    // getPublicStoreSettings() mengembalikan { ok: false } saat backend mati,
    // bukan melempar, tapi panggilan tetap dibungkus catch supaya satu
    // kegagalan jaringan tidak menjatuhkan seluruh render layout.
    getPublicStoreSettings().catch(() => null),
    getGoogleReviews().catch(() => null),
    getPublicImageUrls().catch((): Record<string, string> => ({})),
  ]);

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
