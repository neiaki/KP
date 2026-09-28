/* Ulasan Google At Cell, diambil langsung dari Google Places API.
 *
 * Dulu berkas ini memuat satu blok data manual berisi 5 ulasan yang dikurasi
 * dari halaman Google Maps pada 2021: 4 dari 5 di antaranya tidak punya teks,
 * dan timestamps-nya "3 sampai 7 tahun lalu". Blok itu dilayani sebagai
 * kalau data asli, jadi etalase menampilkan rating dan ulasan yang sudah
 * tidak mencerminkan toko, plus kartu kosong yang terbaca seperti elemen
 * gagal render. Itu lebih buruk daripada tidak menampilkan apa pun: structured
 * data LocalBusiness ikut memancarkan aggregateRating dari angka yang sama,
 * jadi Google menerima angka lama itu sebagai data resmi toko.
 *
 * Sekarang tidak ada data manual. Tanpa GOOGLE_PLACES_API_KEY, fungsi ini
 * mengembalikan null, dan ReviewsSection memakai fallback yang jujur
 * ("Pernah belanja di sini? Ceritakan") plus tombol menuju Google Maps.
 * buildAggregateRating() di src/app/sitemap.ts sudah Discard nilai null
 * begitu juga, jadi tanpa key halaman tidak memancarkan rating apa pun.
 *
 * Konsekuensinya bagian ulasan di beranda menjadi lebih sedikit. Itu pilihan
 * yang benar: angka yang benar lebih berharga daripada angka yang bagus tapi
 * salah.
 */

export interface GoogleReview {
  author: string;
  avatar?: string;
  rating: number;
  time: string;
  text: string;
}

export interface GoogleReviewsData {
  name: string;
  rating: number;
  count: number;
  url: string;
  reviews: GoogleReview[];
}

const MAPS_URL =
  "https://www.google.com/maps/place/at+cell/@-6.2366815,106.6772451,17z/data=!4m8!3m7!1s0x2e69fa339a58131f:0xfc71c2a2509f322e";

const API = "https://maps.googleapis.com/maps/api/place";

/**
 * Place ID At Cell. Nilai ini bukan rahasia, cuma ID publik, tapi tetap
 * datang dari env supaya pindah project Google Places tidak perlu menyentuh
 * kode. Nilai bawaan tetap ditulis supaya demo lokal dan mode tanpa env
 * masih bisa mencoba fetch.
 */
const PLACE_ID = process.env.GOOGLE_PLACE_ID || "ChIJHhE1_jbpaS4RLjKeUKIicVw";

/** Batas aman untuk rating dari API: di luar ini jangan dipakai. */
function ratingValid(rating: unknown): rating is number {
  return typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 5;
}

export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `${API}/details/json?place_id=${encodeURIComponent(PLACE_ID)}` +
        `&fields=name,rating,user_ratings_total,reviews,url&language=id&key=${key}`,
      { next: { revalidate: 86400 } }
    );
    const json = (await res.json()) as {
      status?: string;
      result?: {
        name?: string;
        rating?: number;
        user_ratings_total?: number;
        url?: string;
        reviews?: {
          author_name?: string;
          profile_photo_url?: string;
          rating?: number;
          relative_time_description?: string;
          text?: string;
        }[];
      };
    };

    if (json?.status !== "OK" || !json.result) return null;
    const result = json.result;
    if (!ratingValid(result.rating)) return null;

    // Ulasan tanpa teks tidak pernah ditampilkan: ReviewsSection memakai
    // {r.text || " "} dan itu merender kartu kosong tanpa informasi apa pun.
    // Google hanya mengirim maksimal 5 ulasan lewat Places API, dan tidak
    // semuanya punya teks, jadi menyaring di sini lebih baik daripada
    // menampilkan kartu kosong yang muncul di layar.
    const reviews = (Array.isArray(result.reviews) ? result.reviews : [])
      .filter((r) => typeof r.text === "string" && r.text.trim().length > 0)
      .slice(0, 5)
      .map((r) => ({
        author: r.author_name || "Pengunjung",
        avatar: r.profile_photo_url,
        rating: ratingValid(r.rating) ? r.rating : 5,
        time: r.relative_time_description || "",
        text: (r.text || "").trim(),
      }));

    return {
      name: result.name || "at cell",
      rating: result.rating,
      count: result.user_ratings_total || 0,
      url: result.url || MAPS_URL,
      reviews,
    };
  } catch {
    // Jaringan atau parsing gagal. Null membuat halaman jatuh ke fallback
    // yang jujur, sama seperti saat API key belum diisi.
    return null;
  }
}
