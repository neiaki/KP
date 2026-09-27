import type { Metadata, MetadataRoute } from "next";
import type { Locale } from "@/lib/translations";
import type { GoogleReviewsData } from "@/lib/reviews";
import type { StoreSettings } from "@/types";

/*
 * Permukaan SEO publik At Cell.
 *
 * File ini adalah satu-satunya sumber untuk:
 *   - origin produksi (robots.txt, sitemap.xml, canonical, og:url, JSON-LD)
 *   - daftar locale yang sah
 *   - copy title/description per rute per bahasa
 *   - pembangun metadata, opening hours, dan JSON-LD LocalBusiness
 *
 * Kenapa semuanya dikumpulkan di sini, bukan di src/lib/: aturan kepemilikan
 * file hanya mengizinkan modul baru di src/app/sitemap.ts, src/app/robots.ts,
 * dan satu komponen JSON-LD. Menyalin tabel rute ke beberapa modul membuat
 * sitemap, robots, dan <head> bisa diam-diam menghasilkan URL berbeda, dan
 * test tidak akan menangkapnya. Modul ini murni TypeScript tanpa runtime
 * import dari "next", jadi bisa diuji langsung oleh `node --test`.
 *
 * Data bisnis (nama, alamat, telepon, koordinat, jam buka) TIDAK pernah ditulis
 * di sini. Semuanya dibaca dari store_settings lewat getPublicStoreSettings(),
 * jadi admin yang mengubah data di portal langsung mengubah markup-nya juga.
 */

export type SupportedLocale = Locale;

/* -------------------------------------------------------------------------- */
/* Origin                                                                      */
/* -------------------------------------------------------------------------- */

/*
 * Host yang sama dengan subdomain login.* di src/proxy.ts dan dengan
 * SERVER_ACTIONS_ALLOWED_ORIGINS di next.config.ts. Env dipakai lebih dulu
 * supaya staging atau preview tidak pernah menyiarkan URL produksi.
 */
const FALLBACK_SITE_ORIGIN = "https://atcell.my.id";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Terjemahkan input env bebas (https://host, host, atau host/path) menjadi
 * origin absolut tanpa trailing slash. Nilai rusak jatuh ke origin produksi
 * supaya sitemap dan robots tidak pernah jadi URL relatif.
 */
export function normalizeSiteOrigin(raw?: string | null): string {
  const value = (raw ?? "").trim();
  const candidate = value ? (HAS_SCHEME.test(value) ? value : `https://${value}`) : "";
  try {
    const { origin } = new URL(candidate);
    // Scheme non-http seperti mailto: menghasilkan origin "null", yang tidak
    // bisa dipakai sebagai base URL metadata.
    return origin && origin !== "null" ? origin : FALLBACK_SITE_ORIGIN;
  } catch {
    return FALLBACK_SITE_ORIGIN;
  }
}

/*
 * SITE_URL dibaca lebih dulu karena hanya itu yang dibaca runtime. Nilai
 * NEXT_PUBLIC_* di-inline saat build, jadi kalau satu-satunya yang diisi
 * adalah NEXT_PUBLIC_SITE_URL di env container, nilainya terkunci waktu build
 * (dan .env sengaja dikeluarkan dari image lewat .dockerignore), bukan
 * diambil saat request. Prefix itu tetap dibaca sebagai override waktu build
 * untuk preview yang origin-nya memang sudah diketahui sejak awal.
 */
export const SITE_ORIGIN = normalizeSiteOrigin(
  process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL
);

/** URL absolut sitemap.xml. Dipakai robots.ts dan tes. */
export function sitemapUrl(origin: string = SITE_ORIGIN): string {
  return `${normalizeSiteOrigin(origin)}/sitemap.xml`;
}

/* -------------------------------------------------------------------------- */
/* Locale                                                                      */
/* -------------------------------------------------------------------------- */

export const LOCALES = ["id", "en"] as const;
export const DEFAULT_LOCALE: SupportedLocale = "id";

/*
 * Segmen [locale] tidak divalidasi Next.js, jadi /admin, /staff, atau URL satu
 * segmen apa pun yang tidak dikenal ikut dilayani sebagai beranda. Fungsi ini
 * dipakai src/app/(public)/[locale]/layout.tsx untuk memanggil notFound(),
 * sehingga URL tersebut benar-benar 404 dan bukan soft 404.
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Versi yang tidak melempar, untuk jalur di luar render (mis. image route). */
export function toLocale(value: unknown): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

const OPEN_GRAPH_LOCALES: Record<SupportedLocale, string> = {
  id: "id_ID",
  en: "en_US",
};

/* -------------------------------------------------------------------------- */
/* Tabel rute                                                                 */
/* -------------------------------------------------------------------------- */

export type PublicRoutePath =
  | ""
  | "catalog"
  | "about"
  | "contact"
  | "customer-service"
  | "payment"
  | "shipping"
  | "terms"
  | "tracking"
  | "trade-in"
  | "warranty";

/*
 * Path yang boleh punya metadata. "login" ada di sini supaya halamannya bisa
 * punya canonical dan hreflang sendiri, tapi TIDAK ada di PUBLIC_ROUTES, jadi
 * sitemap() yang hanya mengiterasi PUBLIC_ROUTES tidak mungkin memancarkannya.
 * Robots.txt juga menutupnya sebagai penghematan crawl budget.
 */
export type MetadataPath = PublicRoutePath | "login";

type SitemapEntry = MetadataRoute.Sitemap[number];
type ChangeFrequency = NonNullable<SitemapEntry["changeFrequency"]>;

export type RouteCopy = { title: string; description: string };

export type PublicRoute = {
  path: PublicRoutePath;
  changeFrequency: ChangeFrequency;
  priority: number;
  id: RouteCopy;
  en: RouteCopy;
};

/*
 * Copy di bawah memakai kosakata yang sudah dipakai halaman terkait
 * (src/lib/translations.ts dan isi halaman publik) supaya hasil machine
 * tidak terasa seperti bahasa yang berbeda. Tidak ada em-dash, tidak ada
 * label bernomor, dan tidak ada eyebrow.
 *
 * convention: setiap title diakhiri "| At Cell". Bagian setelah "|" dipakai
 * ulang sebagai og:site_name supaya nama merek tidak ditulis dua kali.
 */
export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: "",
    changeFrequency: "weekly",
    priority: 1,
    id: {
      title: "Toko HP Serpong: HP Baru, Second, dan Servis | At Cell",
      description:
        "At Cell di Paku Jaya, Serpong Utara. Jual HP baru dan second bergaransi dengan IMEI resmi, terima tukar tambah, dan layani servis HP di konter. Tanya stok lewat WhatsApp.",
    },
    en: {
      title: "Phone Shop Serpong: New, Pre-Owned & Repair | At Cell",
      description:
        "At Cell in Paku Jaya, Serpong Utara sells new and pre-owned phones with store warranty and official IMEI, takes trade-ins, and repairs phones at one counter. Ask us on WhatsApp.",
    },
  },
  {
    path: "catalog",
    changeFrequency: "daily",
    priority: 0.9,
    id: {
      title: "Etalase Stok HP Serpong: Unit yang Benar-benar Ready | At Cell",
      description:
        "Lihat semua unit yang benar-benar ready di At Cell, Paku Jaya. Saring HP baru dan second per merek, lengkap dengan harga, kondisi, IMEI, dan garansi toko.",
    },
    en: {
      title: "Phone Stock Etalase Serpong: Units Actually Ready | At Cell",
      description:
        "Every unit actually available at At Cell, Paku Jaya. Filter new and pre-owned phones by brand, with price, condition, IMEI, and store warranty on each card.",
    },
  },
  {
    path: "about",
    changeFrequency: "monthly",
    priority: 0.6,
    id: {
      title: "Profil Toko HP Paku Jaya yang Bisa Didatangi | At Cell",
      description:
        "Kenalan dengan At Cell, toko handphone di Paku Jaya, Serpong Utara. Jual HP baru dan second berkualitas, sekaligus memperbaiki unit di konter yang sama.",
    },
    en: {
      title: "About The Phone Shop In Paku Jaya | At Cell",
      description:
        "Meet At Cell, the phone shop in Paku Jaya, Serpong Utara. We sell new and quality pre-owned phones and repair devices at the same physical counter.",
    },
  },
  {
    path: "contact",
    changeFrequency: "monthly",
    priority: 0.8,
    id: {
      title: "Kontak Resmi: WhatsApp, Telepon, dan Alamat Toko | At Cell",
      description:
        "Kontak resmi At Cell di Paku Jaya, Serpong Utara: nomor WhatsApp, telepon, alamat lengkap, jam buka toko, dan cara datang ke konter.",
    },
    en: {
      title: "Get In Touch: WhatsApp, Phone, And Store Address | At Cell",
      description:
        "The official At Cell contact for Paku Jaya, Serpong Utara: WhatsApp number, phone, full address, opening hours, and how to reach the counter.",
    },
  },
  {
    path: "customer-service",
    changeFrequency: "monthly",
    priority: 0.7,
    id: {
      title: "Layanan Pelanggan: Tanya Langsung ke Konter | At Cell",
      description:
        "Tanya soal stok, garansi, servis, atau tukar tambah langsung ke staf At Cell lewat WhatsApp dan telepon. Yang membalas orang toko, bukan bot.",
    },
    en: {
      title: "Customer Service: Talk To The Shop Counter | At Cell",
      description:
        "Ask about stock, warranty, repairs, or trade-in and reach At Cell staff on WhatsApp or by phone. Every reply comes from the shop, not from a bot.",
    },
  },
  {
    path: "payment",
    changeFrequency: "yearly",
    priority: 0.5,
    id: {
      title: "Cara Bayar di Toko: Tunai, QRIS, Transfer, Debit | At Cell",
      description:
        "At Cell menerima pembayaran tunai, QRIS, transfer bank, dan kartu debit di konter. Semua transaksi dapat nota cetak yang mencantumkan IMEI unit.",
    },
    en: {
      title: "Payment In Store: Cash, QRIS, Transfer, Debit | At Cell",
      description:
        "At Cell takes cash, QRIS, bank transfer, and debit cards at the counter. Every payment gets a printed receipt stating the unit IMEI.",
    },
  },
  {
    path: "shipping",
    changeFrequency: "yearly",
    priority: 0.5,
    id: {
      title: "Penyerahan Unit di Toko Setelah Dicek | At Cell",
      description:
        "At Cell adalah toko fisik di Paku Jaya. Unit diserahkan langsung di konter setelah dicek, tidak pernah dikirim jauh tanpa dilihat pembeli.",
    },
    en: {
      title: "Units Handed Over In Store, Checked First | At Cell",
      description:
        "At Cell is a physical shop in Paku Jaya. Units are handed over at the counter after a check, never shipped unseen across town to a buyer.",
    },
  },
  {
    path: "terms",
    changeFrequency: "yearly",
    priority: 0.4,
    id: {
      title: "Syarat dan Ketentuan Belanja di Toko | At Cell",
      description:
        "Aturan singkat untuk belanja, tukar tambah, dan servis di At Cell: harga etalase, booking unit 1x24 jam, garansi, dan pembatalan pesanan.",
    },
    en: {
      title: "Store Terms For Buying, Trading In, And Repairs | At Cell",
      description:
        "The short rules for buying, trading in, and repairing at At Cell: display pricing, 1x24 hour unit holds, warranty, and order cancellation.",
    },
  },
  {
    path: "tracking",
    changeFrequency: "weekly",
    priority: 0.6,
    id: {
      title: "Lacak Servis HP dari Kode Nota | At Cell",
      description:
        "Masukkan kode SRV dari nota terima untuk melihat tahap perbaikan HP kamu, dari diagnosa sampai selesai. Tidak perlu login dan tidak perlu antrean.",
    },
    en: {
      title: "Track Phone Repair Status From Your Receipt | At Cell",
      description:
        "Enter the SRV code from your receipt to see each repair stage for your phone, from diagnostics to finished. No login and no queue needed.",
    },
  },
  {
    path: "trade-in",
    changeFrequency: "monthly",
    priority: 0.7,
    id: {
      title: "Tukar Tambah HP Serpong: Taksir Harga Unit Lama | At Cell",
      description:
        "Isi kondisi HP lama kamu, dapat taksiran harga seketika, lalu bawa ke konter At Cell untuk cek fisik dan finalisasi harga tukar tambah.",
    },
    en: {
      title: "Phone Trade-In Serpong: Value Your Old Device | At Cell",
      description:
        "Fill in your old phone condition, get an instant estimate, then bring the device to the At Cell counter for a physical check and a final price.",
    },
  },
  {
    path: "warranty",
    changeFrequency: "yearly",
    priority: 0.6,
    id: {
      title: "Garansi Toko: 12 Bulan HP Baru, 30 Hari Second | At Cell",
      description:
        "Masa garansi At Cell per pembelian: 12 bulan untuk HP baru segel, 30 hari untuk HP second, 30 sampai 90 hari untuk hasil servis. Klaim lewat nota.",
    },
    en: {
      title: "Store Warranty: 12 Months New, 30 Days Used | At Cell",
      description:
        "At Cell warranty per purchase: 12 months on sealed new phones, 30 days on pre-owned units, 30 to 90 days on repairs. Claim with your receipt.",
    },
  },
];

const ROUTE_BY_PATH = Object.fromEntries(
  PUBLIC_ROUTES.map((route) => [route.path, route])
) as Record<PublicRoutePath, PublicRoute>;

export function findRoute(path: PublicRoutePath): PublicRoute {
  const route = ROUTE_BY_PATH[path];
  if (!route) throw new Error(`Rute publik "${path}" tidak ada di PUBLIC_ROUTES.`);
  return route;
}

export function routeUrl(
  path: MetadataPath,
  locale: SupportedLocale,
  origin: string = SITE_ORIGIN
): string {
  return path ? `${origin}/${locale}/${path}` : `${origin}/${locale}`;
}

/**
 * Peta hreflang untuk satu rute. Dua bahasa saling menunjuk, dan x-default
 * mengarah ke versi Indonesia karena audiens utama toko ada di Indonesia.
 */
export function languageAlternates(
  path: MetadataPath,
  origin: string = SITE_ORIGIN
): Record<string, string> {
  return {
    id: routeUrl(path, "id", origin),
    en: routeUrl(path, "en", origin),
    "x-default": routeUrl(path, DEFAULT_LOCALE, origin),
  };
}

/** Nama merek diambil dari sufiks title, bukan ditulis ulang sebagai literal. */
export function brandOfTitle(title: string): string {
  return title.slice(title.lastIndexOf("|") + 1).trim();
}

/* -------------------------------------------------------------------------- */
/* Metadata                                                                    */
/* -------------------------------------------------------------------------- */

function resolveCopy(path: PublicRoutePath, locale: unknown) {
  const resolved = toLocale(locale);
  return { locale: resolved, copy: findRoute(path)[resolved] };
}

/*
 * Halaman login staf punya metadata sendiri, tapi sengaja TIDAK masuk
 * PUBLIC_ROUTES supaya tidak pernah bocor ke sitemap.xml. Yang boleh masuk
 * sitemap tetap hanya halaman yang benar-benar laminate untuk pembeli.
 */
const LOGIN_COPY: Record<SupportedLocale, RouteCopy> = {
  id: {
    title: "Masuk Portal Staf | At Cell",
    description:
      "Akses portal operasional At Cell untuk tim toko. Hanya staf terdaftar yang bisa masuk.",
  },
  en: {
    title: "Staff Portal Login | At Cell",
    description:
      "Secure access to the At Cell operations portal for shop staff. Registered staff only.",
  },
};

function buildPageMetadata(
  resolved: SupportedLocale,
  copy: RouteCopy,
  path: MetadataPath,
  robots?: Metadata["robots"]
): Metadata {
  const url = routeUrl(path, resolved);

  return {
    title: copy.title,
    description: copy.description,
    ...(robots ? { robots } : {}),
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    openGraph: {
      type: "website",
      siteName: brandOfTitle(copy.title),
      locale: OPEN_GRAPH_LOCALES[resolved],
      url,
      title: copy.title,
      description: copy.description,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
  };
}

/**
 * Metadata lengkap untuk satu rute publik: title dan description per locale,
 * canonical yang menunjuk diri sendiri, hreflang id/en/x-default, serta kartu
 * Open Graph dan Twitter.
 *
 * openGraph sengaja dibuat lengkap (type, siteName, locale, url, title,
 * description). Next.js mengganti objek openGraph anak secara utuh, bukan
 * menyatukannya dengan milik layout, jadi metadata yang tidak lengkap di sini
 * akan hilang begitu halaman ini dievaluasi.
 */
export function buildRouteMetadata(path: PublicRoutePath, locale: unknown): Metadata {
  const { locale: resolved, copy } = resolveCopy(path, locale);
  return buildPageMetadata(resolved, copy, path);
}

/**
 * Metadata halaman login staf.
 *
 * robots.index false adalah pernyataan eksplisit bahwa halaman ini tidak
 * boleh masuk indeks. robots.txt hanya mengatur apakah crawler boleh
 * mengambil halaman, bukan apakah halaman itu boleh tampil di hasil
 * pencarian, jadi keduanya memang harus ada terpisah.
 */
export function buildLoginMetadata(locale: unknown): Metadata {
  const resolved = toLocale(locale);
  return buildPageMetadata(resolved, LOGIN_COPY[resolved], "login", {
    index: false,
    follow: true,
  });
}

/**
 * Metadata bawaan untuk layout [locale].
 *
 * Layout tidak tahu pathname, jadi ia sengaja TIDAK mengisi
 * alternates.canonical maupun openGraph.url. Canonical yang menunjuk beranda
 * dari halaman lain akan membuat Google menganggap halaman itu duplikat dari
 * beranda, jauh lebih berbahaya daripada tidak ada canonical sama sekali.
 * Halaman yang punya metadata sendiri menimpanya dengan buildRouteMetadata().
 */
export function buildLayoutMetadata(locale: unknown): Metadata {
  const { locale: resolved, copy } = resolveCopy("", locale);

  return {
    metadataBase: new URL(SITE_ORIGIN),
    title: copy.title,
    description: copy.description,
    openGraph: {
      type: "website",
      siteName: brandOfTitle(copy.title),
      locale: OPEN_GRAPH_LOCALES[resolved],
      title: copy.title,
      description: copy.description,
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* sitemap.xml                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * lastModified sengaja tidak diisi. Tidak ada sumber tanggal yang bisa
 * dipercaya per rute, dan mengarang tanggal hanya menutupi ketiadaan data.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.flatMap((route) =>
    LOCALES.map((locale) => ({
      url: routeUrl(route.path, locale),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
      alternates: { languages: languageAlternates(route.path) },
    }))
  );
}

/* -------------------------------------------------------------------------- */
/* Structured data: LocalBusiness                                              */
/* -------------------------------------------------------------------------- */

type JsonNode = Record<string, unknown>;

/**
 * Buang kunci yang undefined, null, string kosong, atau array kosong sebelum
 * diserialisasi. String kosong ikut dibuang karena kolom store_settings yang
 * belum diisi menghasilkan "", dan `telephone: ""` dibaca mesin telusur
 * sebagai nomor telepon kosong, bukan sebagai "tidak ada".
 */
function withoutEmpty(node: JsonNode): JsonNode {
  const out: JsonNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

export type OpeningHoursInput = {
  monday_friday?: string | null;
  saturday_sunday?: string | null;
  holidays?: string | null;
};

/*
 * Format jam buka di store_settings bebas teks, misalnya "09:00 - 21:00 WIB".
 * Pola ini menerima tanda hubung ASCII maupun varian en-dash yang biasa
 * diketik orang. Em-dash sengaja ditulis sebagai escape unicode supaya file
 * ini tidak memuat karakter terlarang.
 */
const OPEN_CLOSE =
  /(\d{1,2}):(\d{2})\s*(?:-|\u2010|\u2011|\u2012|\u2013|\u2014|to)?\s*(\d{1,2}):(\d{2})/i;

const WEEKDAY_GROUPS: ReadonlyArray<{
  key: keyof OpeningHoursInput;
  dayOfWeek: string[];
}> = [
  {
    key: "monday_friday",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  },
  { key: "saturday_sunday", dayOfWeek: ["Saturday", "Sunday"] },
];

/** Ubah "09:00 - 21:00 WIB" jadi { opens, closes }, atau null kalau tak terbaca. */
export function parseTimeRange(
  range: string | null | undefined
): { opens: string; closes: string } | null {
  if (!range) return null;
  const match = OPEN_CLOSE.exec(range);
  if (!match) return null;

  const openHour = Number(match[1]);
  const openMinute = Number(match[2]);
  const closeHour = Number(match[3]);
  const closeMinute = Number(match[4]);
  if (openHour > 23 || closeHour > 23 || openMinute > 59 || closeMinute > 59) return null;

  return {
    opens: `${String(openHour).padStart(2, "0")}:${String(openMinute).padStart(2, "0")}`,
    closes: `${String(closeHour).padStart(2, "0")}:${String(closeMinute).padStart(2, "0")}`,
  };
}

/**
 * OpeningHoursSpecification untuk schema.org.
 *
 * Hanya monday_friday dan saturday_sunday yang dipetakan karena keduanya
 * punya hari yang pasti. Jam hari libur sengaja dilewati: kolomnya tidak
 * punya hari, dan menulis specification tanpa dayOfWeek membuat Google
 * menganggap toko buka jam itu setiap hari.
 */
export function buildOpeningHoursSpecification(
  hours: OpeningHoursInput | null | undefined
): JsonNode[] {
  if (!hours) return [];

  const specs: JsonNode[] = [];
  for (const group of WEEKDAY_GROUPS) {
    const range = parseTimeRange(hours[group.key]);
    if (!range) continue;
    specs.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: group.dayOfWeek,
      ...range,
    });
  }
  return specs;
}

/*
 * Foto resmi toko untuk structured data. Aset ini sudah dipakai di halaman
 * tentang sebagai foto konter, jadi tidak menambahkan path baru.
 */
export const STORE_IMAGE_PATH = "products/iphone-15-pro-2.jpg";

/**
 * Terjemahkan lokasi aset jadi URL absolut.
 *
 * Lokasi aset bisa berupa path di origin ini ("/products/...jpg") atau URL
 * absolut dari Supabase Storage ("https://xxx.supabase.co/..."). Keduanya tidak
 * boleh dirangkai dengan operator yang sama: menyatukan base dengan URL
 * absolut menghasilkan "https://atcell.my.idhttps://xxx.supabase.co/..." yang
 * tidak bisa dibuka, dan Google akan membuang structured data-nya.
 */
export function toAbsoluteAssetUrl(location: string, origin: string = SITE_ORIGIN): string {
  const value = location.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${normalizeSiteOrigin(origin)}${value.startsWith("/") ? value : `/${value}`}`;
}

/**
 * aggregateRating hanya dibuat dari data yang memang ditampilkan halaman
 * (getGoogleReviews(), sumbernya Google Maps). Angka yang di luar rentang atau
 * jumlah ulasan nol membuat properti ini dihilangkan, bukan dibuat nol,
 * karena structured data yang salah lebih berbahaya daripada tidak ada.
 */
export function buildAggregateRating(
  reviews: GoogleReviewsData | null | undefined
): JsonNode | undefined {
  if (!reviews) return undefined;
  const { rating, count } = reviews;
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return undefined;
  if (!Number.isInteger(count) || count < 1) return undefined;

  return {
    "@type": "AggregateRating",
    ratingValue: rating,
    reviewCount: count,
    bestRating: 5,
    worstRating: 1,
  };
}

export type LocalBusinessInput = {
  origin: string;
  settings: StoreSettings;
  reviews?: GoogleReviewsData | null;
  imagePath?: string;
};

/**
 * LocalBusiness untuk ritel, mengikuti pedoman Google: nama, deskripsi, url,
 * telepon, koordinat geo, peta, jam buka, dan rating yang benar-benar tampil
 * di halaman.
 *
 * addressCountry sengaja tidak diisi. store_settings hanya punya satu kolom
 * alamat bebas, tanpa negara dan tanpa kota terpisah, jadi mengarang "ID" di
 * sini berarti menuliskan fakta bisnis sebagai literal, sesuatu yang harus
 * datang dari portal settings.
 */
export function buildLocalBusinessJsonLd({
  origin,
  settings,
  reviews,
  imagePath = STORE_IMAGE_PATH,
}: LocalBusinessInput): JsonNode {
  const base = normalizeSiteOrigin(origin);
  const storeName = settings.store_name.trim();
  const description = (settings.description_id || settings.description_en || "").trim();
  const address = (settings.address || "").trim();
  const telephone = (settings.phone_number || settings.whatsapp_number || "").trim();
  const openingHours = buildOpeningHoursSpecification(settings.opening_hours);

  // 0,0 berarti koordinat belum diisi di portal settings. Memancarkannya
  // akan menaruh toko di Samudra Atlantik di peta Google.
  const hasGeo =
    Number.isFinite(settings.latitude) &&
    Number.isFinite(settings.longitude) &&
    (settings.latitude !== 0 || settings.longitude !== 0);

  const socialLinks = [
    settings.social_facebook,
    settings.social_instagram,
    settings.social_x,
    settings.social_tiktok,
  ].filter((link): link is string => Boolean(link && /^https?:\/\//i.test(link.trim())));

  return withoutEmpty({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${base}/#store`,
    name: storeName,
    description,
    url: routeUrl("", DEFAULT_LOCALE, base),
    image: toAbsoluteAssetUrl(imagePath, base),
    telephone,
    currenciesAccepted: "IDR",
    address: address
      ? { "@type": "PostalAddress", streetAddress: address }
      : undefined,
    geo: hasGeo
      ? {
          "@type": "GeoCoordinates",
          latitude: settings.latitude,
          longitude: settings.longitude,
        }
      : undefined,
    hasMap: (settings.maps_url || "").trim() || undefined,
    openingHoursSpecification: openingHours,
    aggregateRating: buildAggregateRating(reviews),
    sameAs: socialLinks,
  });
}
