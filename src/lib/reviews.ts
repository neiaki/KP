/* Ulasan Google At Cell, dikurasi manual dari halaman Google Maps
   https://www.google.com/maps/place/at+cell (rating 4.4 dari 5 ulasan).
   Manual karena API key belum tersedia; angka & isi diambil persis dari
   ulasan publik. Untuk auto-sync nanti, isi GOOGLE_PLACES_API_KEY dan
   hapus blok MANUAL di bawah. */

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

const MANUAL: GoogleReviewsData = {
  name: "at cell",
  rating: 4.4,
  count: 5,
  url: MAPS_URL,
  reviews: [
    { author: "St Puryanta", rating: 5, time: "5 tahun lalu", text: "Clean...good a feel" },
    { author: "fernando putra", rating: 5, time: "7 tahun lalu", text: "At cell Keren" },
    { author: "Jasa tebang Pohon", rating: 5, time: "5 tahun lalu", text: "" },
    { author: "BABY JOASH", rating: 5, time: "3 tahun lalu", text: "" },
    { author: "Victor Nicolas", rating: 2, time: "5 tahun lalu", text: "" },
  ],
};

const API = "https://maps.googleapis.com/maps/api/place";
const PLACE_ID = process.env.GOOGLE_PLACE_ID || "ChIJHhE1_jbpaS4RLjKeUKIicVw";

export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  if (key) {
    try {
      const detRes = await fetch(
        `${API}/details/json?place_id=${PLACE_ID}&fields=name,rating,user_ratings_total,reviews,url&language=id&key=${key}`,
        { next: { revalidate: 86400 } }
      );
      const detJson = await detRes.json();
      const det = detJson?.status === "OK" ? detJson.result : null;
      if (det && typeof det.rating === "number") {
        return {
          name: det.name || "at cell",
          rating: det.rating,
          count: det.user_ratings_total || 0,
          url: det.url || MAPS_URL,
          reviews: Array.isArray(det.reviews)
            ? det.reviews.slice(0, 5).map(
                (r: {
                  author_name?: string;
                  profile_photo_url?: string;
                  rating?: number;
                  relative_time_description?: string;
                  text?: string;
                }) => ({
                  author: r.author_name || "Pengunjung",
                  avatar: r.profile_photo_url,
                  rating: typeof r.rating === "number" ? r.rating : 5,
                  time: r.relative_time_description || "",
                  text: r.text || "",
                })
              )
            : [],
        };
      }
    } catch {
      /* jatuh ke manual */
    }
  }

  // Default: pakai data manual terkurasi (bukan fallback kosong)
  return MANUAL;
}


