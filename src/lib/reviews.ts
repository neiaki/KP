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
 * Sekarang tidak ada data manual di berkas ini. Tanpa GOOGLE_PLACES_API_KEY,
 * fungsi ini memakai snapshot di src/lib/ulasan-manual.ts; kalau snapshotnya
 * kosong atau sudah basi, hasilnya null dan ReviewsSection memakai fallback
 * yang jujur ("Pernah belanja di sini? Ceritakan") plus tombol menuju Google
 * Maps. buildAggregateRating() di src/app/sitemap.ts membuang nilai null begitu
 * juga, jadi tanpa sumber yang bisa dipercaya halaman tidak memancarkan
 * rating apa pun.
 *
 * Konsekuensinya bagian ulasan di beranda menjadi lebih sedikit. Itu pilihan
 * yang benar: angka yang benar lebih berharga daripada angka yang bagus tapi
 * salah.
 *
 * Yang berubah lagi: semua jalur yang mengembalikan null sekarang menulis
 * alasannya ke log server. Tanpa itu, "ulasan hilang" terlihat persis seperti
 * "belum ada ulasan", dan tidak ada yang tahu env var-nya salah. Satu kali per
 * proses, bukan satu kali per request, supaya log tidak dibanjiri: setiap
 * halaman publik dan sitemap memanggil fungsi ini.
 *
 * Fallback tanpa API key bukan blok data yang ditulis mati di berkas ini,
 * tapi snapshot di src/lib/ulasan-manual.ts: ulasannya asli, ada tanggal
 * penyalinannya, dan ada batas umur. API key yang aktif selalu menang, jadi
 * begitu Places API siap, file snapshot tinggal ditinggalkan.
 */

import { getSnapshotUlasan } from "./ulasan-manual.ts";

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

/*
 * Alasan kegagalan dilaporkan sekali per proses. Env container dibaca sekali
 * juga, jadi kalau GOOGLE_PLACES_API_KEY kosong, setiap render beranda akan
 * mengambil jalur yang sama dan log akan penuh dengan baris yang sama tanpa
 * menambah informasi apa pun. Di Vercel satu proses hanya melayani satu
 * request, jadi satu baris per request justru yang diinginkan: log tidak
 * hilang bersama instance.
 */
const sudahDilaporkan = new Set<string>();

function laporkan(alasan: string, detail?: string): null {
  if (sudahDilaporkan.has(alasan)) return null;
  sudahDilaporkan.add(alasan);
  console.warn(`[reviews] ${alasan}${detail ? `: ${detail}` : ""}`);
  return null;
}

/**
 * Snapshot manual dipakai baik saat key tidak ada maupun saat key ada tapi
 * Places API sedang bermasalah. Alasan keduanya sama saja: yang penting angka
 * di halaman tetap berasal dari salinan Google Maps, bukan dari karangan, dan
 * snapshot itu sendiri sudah dating serta ada batas umurnya.
 *
 * Bentuk balikannya discriminated supaya pemanggil bisa menulis alasan
 * kegagalan ke log tanpa memanggil getSnapshotUlasan() dua kali.
 */
function snapshotJikaSiap(): { data: GoogleReviewsData } | { alasan: string } {
  const snapshot = getSnapshotUlasan();
  if (snapshot.status !== "siap") return { alasan: snapshot.alasan };
  // url dari Google hanya ada kalau snapshot mengisinya. Kalau kosong,
  // ReviewsSection memakai tautan "Google Reviews" sebagai href, dan href
  // kosong membuat tombolnya tidak mengarah ke mana pun.
  return { data: { ...snapshot.data, url: snapshot.data.url || MAPS_URL } };
}

/** Fallback diam-diam untuk jalur API yang gagal: null kalau tidak ada snapshot. */
function denganSnapshot(): GoogleReviewsData | null {
  const hasil = snapshotJikaSiap();
  return "data" in hasil ? hasil.data : null;
}

export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    // Tanpa API key, snapshot manual yang dipakai. Kalau snapshotnya kosong
    // atau sudah lewat batas umur, hasilnya tetap null supaya ReviewsSection
    // menampilkan fallback yang jujur, bukan angka yang sudah tidak benar.
    const snapshot = snapshotJikaSiap();
    if ("data" in snapshot) return snapshot.data;
    return laporkan(
      `GOOGLE_PLACES_API_KEY kosong, jadi memakai ulasan manual. ${snapshot.alasan}`,
      `PLACE_ID=${PLACE_ID}`
    );
  }

  try {
    const res = await fetch(
      `${API}/details/json?place_id=${encodeURIComponent(PLACE_ID)}` +
        `&fields=name,rating,user_ratings_total,reviews,url&language=id&key=${key}`,
      {
        next: { revalidate: 86400 },
        // Tanpa batas waktu, satu koneksi ke Google yang lambat menahan
        // render halaman ini sampai Vercel memutuskan function-nya terlalu
        // lama. statement_timeout tidak menutup ini karena tidak ada statement
        // yang sedang berjalan.
        signal: AbortSignal.timeout(8000),
      }
    );
    const json = (await res.json()) as {
      status?: string;
      error_message?: string;
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

    if (json?.status !== "OK" || !json.result) {
      // Status Places API yang sering muncul: REQUEST_DENIED (API belum
      // diaktifkan, billing mati, atau kunci dibatasi), NOT_FOUND (Place ID
      // salah), ZERO_RESULTS, OVER_QUERY_LIMIT.
      laporkan(
        `Google Places API tidak mengembalikan OK (status=${json?.status ?? "tidak ada"})`,
        json?.error_message
      );
      return denganSnapshot();
    }
    const result = json.result;
    if (!ratingValid(result.rating)) {
      laporkan(
        "Rating dari Places API di luar rentang 1..5, jadi dibuang",
        String(result.rating)
      );
      return denganSnapshot();
    }

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
  } catch (error) {
    // Jaringan atau parsing gagal.
    laporkan(
      "Gagal menghubungi Google Places API",
      error instanceof Error ? error.message : String(error)
    );
    return denganSnapshot();
  }
}
