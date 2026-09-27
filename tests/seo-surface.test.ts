import test from "node:test";
import assert from "node:assert/strict";
import robots from "../src/app/robots.ts";
import sitemap, {
  DEFAULT_LOCALE,
  LOCALES,
  PUBLIC_ROUTES,
  SITE_ORIGIN,
  brandOfTitle,
  buildAggregateRating,
  buildLayoutMetadata,
  buildLocalBusinessJsonLd,
  buildOpeningHoursSpecification,
  buildRouteMetadata,
  isSupportedLocale,
  languageAlternates,
  buildLoginMetadata,
  normalizeSiteOrigin,
  parseTimeRange,
  routeUrl,
  sitemapUrl,
  toLocale,
} from "../src/app/sitemap.ts";
import type { PublicRoutePath } from "../src/app/sitemap.ts";
import type { GoogleReviewsData } from "../src/lib/reviews.ts";
import type { StoreSettings } from "../src/types/index.ts";

/*
 * Permukaan SEO At Cell.
 *
 * Yang diuji di sini adalah perilaku yang benar-benar diekspor: generator
 * sitemap dan robots, pembangun metadata, dan validasi locale. Bukan efek
 * string di file sumber. Semua import adalah modul .ts murni tanpa runtime
 * import "next", jadi bisa jalan di `node --experimental-strip-types`.
 */

const ROUTE_PATHS: PublicRoutePath[] = PUBLIC_ROUTES.map((route) => route.path);

/* Fixture store_settings, disalin dari seed 0001_atcell_schema.sql lalu
   disesuaikan dengan migrasi 20260927140000 yang mengisi nomor asli. */
const SETTINGS: StoreSettings = {
  id: 1,
  store_name: "At Cell - Gadget Store & Repair Center",
  description_id: "Pusat penjualan smartphone baru & seken berkualitas.",
  description_en: "Premium smartphone sales with store warranty.",
  address: "QM7H+8WG, Unnamed Road, Paku Jaya, Kec. Serpong Utara, Banten 15220",
  latitude: -6.2388951,
  longitude: 106.6710492,
  maps_url: "https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A",
  phone_number: "+62 857-7539-8389",
  whatsapp_number: "6285775398389",
  owner_name: "Steven Eka",
  social_facebook: "https://facebook.com/atcell",
  social_instagram: "",
  social_x: "",
  social_tiktok: "https://tiktok.com/@atcell",
  opening_hours: {
    monday_friday: "09:00 - 21:00 WIB",
    saturday_sunday: "10:00 - 22:00 WIB",
    holidays: "10:00 - 18:00 WIB",
  },
  updated_at: "2026-09-27T00:00:00.000Z",
};

const REVIEWS: GoogleReviewsData = {
  name: "at cell",
  rating: 4.4,
  count: 5,
  url: "https://www.google.com/maps/place/at+cell",
  reviews: [],
};

/* -------------------------------------------------------------------------- */
/* Origin                                                                      */
/* -------------------------------------------------------------------------- */

test("origin produksi selalu absolut dan tanpa trailing slash", () => {
  assert.match(SITE_ORIGIN, /^https?:\/\/[^/]+$/);
});

test("origin input bebas dinormalkan, nilai rusak jatuh ke default", () => {
  assert.equal(normalizeSiteOrigin("https://atcell.my.id"), "https://atcell.my.id");
  assert.equal(normalizeSiteOrigin("atcell.my.id"), "https://atcell.my.id");
  assert.equal(normalizeSiteOrigin("  https://www.atcell.my.id/  "), "https://www.atcell.my.id");
  assert.equal(normalizeSiteOrigin("https://atcell.my.id/some/path"), "https://atcell.my.id");
  // mailto:_origin "null" tidak bisa jadi base URL metadata.
  assert.equal(normalizeSiteOrigin("mailto:halo@atcell.my.id"), "https://atcell.my.id");
  assert.equal(normalizeSiteOrigin(""), "https://atcell.my.id");
  assert.equal(normalizeSiteOrigin(null), "https://atcell.my.id");
  assert.equal(normalizeSiteOrigin("http://localhost:3000"), "http://localhost:3000");
});

/* -------------------------------------------------------------------------- */
/* Locale                                                                      */
/* -------------------------------------------------------------------------- */

test("hanya id dan en yang dianggap locale sah", () => {
  for (const locale of LOCALES) assert.equal(isSupportedLocale(locale), true);

  // URL satu segmen yang dulu dilayani sebagai beranda dengan status 200.
  for (const bogus of ["admin", "staff", "portal", "ID", "EN", "idn", "en-US", "", " id"]) {
    assert.equal(isSupportedLocale(bogus), false, `harus menolak ${JSON.stringify(bogus)}`);
  }
  assert.equal(isSupportedLocale(undefined), false);
  assert.equal(isSupportedLocale(null), false);
  assert.equal(isSupportedLocale(1), false);
});

test("toLocale tidak melempar dan jatuh ke bahasa default", () => {
  assert.equal(toLocale("en"), "en");
  assert.equal(toLocale("id"), "id");
  assert.equal(toLocale("admin"), DEFAULT_LOCALE);
  assert.equal(toLocale(undefined), DEFAULT_LOCALE);
});

/* -------------------------------------------------------------------------- */
/* Sitemap                                                                     */
/* -------------------------------------------------------------------------- */

test("sitemap memuat setiap rute publik di kedua bahasa", () => {
  const entries = sitemap();
  const expected = ROUTE_PATHS.length * LOCALES.length;
  assert.equal(entries.length, expected, "jumlah entri harus rute x locale");

  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const url = routeUrl(path, locale);
      assert.ok(
        entries.some((entry) => entry.url === url),
        `sitemap harus memuat ${url}`
      );
    }
  }
});

test("sitemap tidak pernah memuat URL relatif atau duplikat", () => {
  const entries = sitemap();
  const seen = new Set<string>();
  for (const entry of entries) {
    assert.ok(entry.url.startsWith(`${SITE_ORIGIN}/`), `${entry.url} harus absolut`);
    assert.equal(seen.has(entry.url), false, `${entry.url} terduplikasi`);
    seen.add(entry.url);
  }
});

test("setiap entri sitemap menyilang referensi ke dua bahasa lewat xhtml", () => {
  for (const path of ROUTE_PATHS) {
    const entry = sitemap().find((item) => item.url === routeUrl(path, "id"));
    assert.ok(entry, `entri id untuk ${path || "beranda"} harus ada`);
    const languages = entry.alternates?.languages;
    assert.ok(languages, `${path || "beranda"} wajib punya alternates.languages`);
    assert.equal(languages.id, routeUrl(path, "id"));
    assert.equal(languages.en, routeUrl(path, "en"));
    assert.equal(languages["x-default"], routeUrl(path, DEFAULT_LOCALE));
  }
});

test("beranda tidak menghasilkan URL berganda seperti /id//", () => {
  const home = routeUrl("", "id");
  assert.equal(home, `${SITE_ORIGIN}/id`);
  assert.equal(home.includes("//", "https://".length), false);
});

/* -------------------------------------------------------------------------- */
/* Robots                                                                      */
/* -------------------------------------------------------------------------- */

test("robots menunjuk sitemap absolut di origin yang sama", () => {
  const result = robots();
  assert.equal(result.sitemap, `${SITE_ORIGIN}/sitemap.xml`);
  assert.equal(result.host, SITE_ORIGIN);
});

test("robots tidak menutup halaman publik", () => {
  const rules = robots().rules;
  assert.ok(!Array.isArray(rules), "aturan tunggal untuk User-Agent *");
  const single = rules as { allow?: string | string[]; disallow?: string | string[] };
  const allow = Array.isArray(single.allow) ? single.allow : [single.allow ?? "/"];
  assert.ok(allow.includes("/"), "halaman publik harus tetap diizinkan");

  const disallowed = (
    Array.isArray(single.disallow) ? single.disallow : [single.disallow ?? ""]
  ).filter(Boolean);
  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const url = routeUrl(path, locale);
      const blocked = disallowed.some((rule) => url.startsWith(SITE_ORIGIN + rule));
      assert.equal(blocked, false, `${url} adalah halaman publik dan tidak boleh disallow`);
    }
  }
});

test("robots memblokir hanya portal, dan halaman login di-crawl agar noindex-nya terbaca", () => {
  const single = robots().rules as { disallow?: string | string[] };
  const disallowed = (
    Array.isArray(single.disallow) ? single.disallow : [single.disallow ?? ""]
  ).filter(Boolean);

  assert.ok(disallowed.includes("/portal/"));

  // Login tidak boleh masuk Disallow. Google berhenti di robots.txt dan tidak
  // pernah membaca tag noindex pada halaman yang tidak boleh di-crawl, jadi
  // memblokirnya membuat niat de-index tidak pernah tereksekusi.
  for (const locale of LOCALES) {
    assert.equal(
      disallowed.includes(`/${locale}/login`),
      false,
      `/${locale}/login harus boleh di-crawl supaya noindex-nya dibaca`
    );
  }

  // De-index ditegakkan lewat meta robots, bukan lewat Disallow.
  //
  // Bentuk objeknya ikut diuji, bukan hanya nilai index/follow. Kalau
  // buildLoginMetadata nanti diubah jadi robots: "noindex", perbandingan
  // terhadap { index, follow } ini langsung gagal, sementara membaca
  // propertinya langsung akan gagal compile karena tipe Metadata mengizinkan
  // string maupun objek.
  for (const locale of LOCALES) {
    assert.deepEqual(
      buildLoginMetadata(locale).robots,
      { index: false, follow: true },
      `/${locale}/login harus memakai objek robots: noindex, follow`
    );
  }

  const urls = sitemap().map((entry) => entry.url);
  for (const blocked of disallowed) {
    assert.equal(
      urls.some((url) => url.startsWith(SITE_ORIGIN + blocked)),
      false,
      `${blocked} tidak boleh masuk sitemap`
    );
  }
  for (const locale of LOCALES) {
    assert.equal(
      urls.some((url) => url === `${SITE_ORIGIN}/${locale}/login`),
      false,
      `/${locale}/login tetap harus di luar sitemap`
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Metadata per rute                                                           */
/* -------------------------------------------------------------------------- */

test("tiap rute punya title dan description sendiri di kedua bahasa", () => {
  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const meta = buildRouteMetadata(path, locale);
      const copy = PUBLIC_ROUTES.find((route) => route.path === path)![locale];
      assert.equal(meta.title, copy.title);
      assert.equal(meta.description, copy.description);
      assert.ok((meta.description as string).length >= 80, `${path}/${locale} deskripsi terlalu tipis`);
      assert.ok((meta.description as string).length <= 200, `${path}/${locale} deskripsi terlalu panjang`);
    }
  }
});

test("versi id dan en dari satu rute tidak pernah identik", () => {
  for (const path of ROUTE_PATHS) {
    const id = buildRouteMetadata(path, "id");
    const en = buildRouteMetadata(path, "en");
    assert.notEqual(id.title, en.title, `title ${path} id/en sama`);
    assert.notEqual(id.description, en.description, `description ${path} id/en sama`);
  }
});

test("title antar rute tidak bertabrakan dalam bahasa yang sama", () => {
  for (const locale of LOCALES) {
    const titles = ROUTE_PATHS.map((path) => buildRouteMetadata(path, locale).title);
    assert.equal(new Set(titles).size, titles.length, `title ${locale} ada yang duplikat`);

    const descriptions = ROUTE_PATHS.map(
      (path) => buildRouteMetadata(path, locale).description
    );
    assert.equal(
      new Set(descriptions).size,
      descriptions.length,
      `description ${locale} ada yang duplikat`
    );
  }
});

test("copy metadata bebas em-dash dan label bernomor gaya eyebrow", () => {
  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const copy = PUBLIC_ROUTES.find((route) => route.path === path)![locale];
      for (const [field, value] of Object.entries(copy)) {
        assert.equal(value.includes("\u2014"), false, `${path}/${locale}.${field} memuat em-dash`);
        assert.equal(value.includes("\u2013"), false, `${path}/${locale}.${field} memuat en-dash`);
        assert.equal(/^\s*\d{2}[\s.)-]/.test(value), false, `${path}/${locale}.${field} berlabel bernomor`);
      }
    }
  }
});

test("canonical menunjuk diri sendiri dan hreflang menunjuk dua bahasa", () => {
  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const meta = buildRouteMetadata(path, locale);
      const url = routeUrl(path, locale);
      assert.equal(meta.alternates?.canonical, url, `canonical ${url}`);
      assert.deepEqual(meta.alternates?.languages, languageAlternates(path));
      assert.equal(meta.alternates?.languages?.id, routeUrl(path, "id"));
      assert.equal(meta.alternates?.languages?.en, routeUrl(path, "en"));
      assert.equal(meta.alternates?.languages?.["x-default"], routeUrl(path, DEFAULT_LOCALE));
    }
  }
});

test("kartu Open Graph dan Twitter lengkap dan menunjuk halaman yang sama", () => {
  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const meta = buildRouteMetadata(path, locale);
      const og = meta.openGraph;
      const twitter = meta.twitter;
      const url = routeUrl(path, locale);
      assert.ok(og && "type" in og, `${url} harus punya openGraph bertipe website`);
      assert.ok(twitter && "card" in twitter, `${url} harus punya kartu Twitter`);
      assert.equal(og.type, "website");
      assert.equal(og.url, url);
      assert.equal(og.title, meta.title);
      assert.equal(og.description, meta.description);
      assert.ok(og.locale, `og:locale wajib untuk ${url}`);
      assert.ok(og.siteName, `og:site_name wajib untuk ${url}`);
      assert.equal(twitter.card, "summary_large_image", `kartu Twitter untuk ${url}`);
      assert.equal(twitter.title, meta.title);
      assert.equal(twitter.description, meta.description);
    }
  }
});

test("og:site_name diambil dari sufiks title sehingga merek tidak ditulis dua kali", () => {
  for (const path of ROUTE_PATHS) {
    for (const locale of LOCALES) {
      const copy = PUBLIC_ROUTES.find((route) => route.path === path)![locale];
      assert.ok(
        copy.title.includes("|"),
        `title ${path}/${locale} harus memisahkan merek dengan "|"`
      );
      assert.equal(buildRouteMetadata(path, locale).openGraph?.siteName, brandOfTitle(copy.title));
    }
  }
});

test("locale tak dikenal pada builder metadata tidak melempar, tapi tetap menghasilkan URL", () => {
  const meta = buildRouteMetadata("catalog", "admin");
  assert.equal(meta.title, PUBLIC_ROUTES.find((r) => r.path === "catalog")!.id.title);
  assert.equal(meta.alternates?.canonical, routeUrl("catalog", DEFAULT_LOCALE));
});

/* -------------------------------------------------------------------------- */
/* Metadata layout                                                             */
/* -------------------------------------------------------------------------- */

test("layout memakai metadataBase origin produksi", () => {
  assert.equal(String(buildLayoutMetadata("id").metadataBase), `${SITE_ORIGIN}/`);
  assert.equal(String(buildLayoutMetadata("en").metadataBase), `${SITE_ORIGIN}/`);
});

test("layout tidak memancarkan canonical yang bisa menunjuk halaman lain", () => {
  // Layout tidak tahu pathname, jadi canonical di sini akan menandai setiap
  // halaman tanpa metadata sendiri sebagai duplikat beranda.
  for (const locale of LOCALES) {
    const meta = buildLayoutMetadata(locale);
    assert.equal(meta.alternates, undefined, `layout ${locale} tidak boleh punya alternates`);
    assert.equal(meta.openGraph?.url, undefined, `layout ${locale} tidak boleh punya og:url`);
  }
});

test("metadata layout berbeda antara bahasa", () => {
  assert.notEqual(buildLayoutMetadata("id").title, buildLayoutMetadata("en").title);
  assert.notEqual(
    buildLayoutMetadata("id").description,
    buildLayoutMetadata("en").description
  );
});

/* -------------------------------------------------------------------------- */
/* Structured data                                                             */
/* -------------------------------------------------------------------------- */

test("LocalBusiness memakai data store_settings, bukan literal di kode", () => {
  const node = buildLocalBusinessJsonLd({ origin: SITE_ORIGIN, settings: SETTINGS });

  assert.equal(node["@context"], "https://schema.org");
  assert.equal(node["@type"], "LocalBusiness");
  assert.equal(node.name, SETTINGS.store_name);
  assert.equal(node.description, SETTINGS.description_id);
  assert.equal(node.telephone, SETTINGS.phone_number);
  assert.equal(node.url, `${SITE_ORIGIN}/id`);
  assert.equal(node.hasMap, SETTINGS.maps_url);
  assert.equal(node.currenciesAccepted, "IDR");

  assert.deepEqual(node.address, {
    "@type": "PostalAddress",
    streetAddress: SETTINGS.address,
  });
  assert.deepEqual(node.geo, {
    "@type": "GeoCoordinates",
    latitude: SETTINGS.latitude,
    longitude: SETTINGS.longitude,
  });
  assert.deepEqual(node.sameAs, [
    "https://facebook.com/atcell",
    "https://tiktok.com/@atcell",
  ]);
});

test("koordinat 0,0 yang belum diisi portal tidak dipancarkan", () => {
  const node = buildLocalBusinessJsonLd({
    origin: SITE_ORIGIN,
    settings: { ...SETTINGS, latitude: 0, longitude: 0 },
  });
  assert.equal(node.geo, undefined, "koordinat nol akan menaruh toko di Samudra Atlantik");
});

test("hanya URL sosial yang valid yang masuk sameAs", () => {
  const node = buildLocalBusinessJsonLd({
    origin: SITE_ORIGIN,
    settings: { ...SETTINGS, social_facebook: "javascript:alert(1)", social_instagram: "  " },
  });
  assert.deepEqual(node.sameAs, ["https://tiktok.com/@atcell"]);
});

test("jam buka diturunkan dari kolom opening_hours, hari libur tanpa hari dilewati", () => {
  assert.deepEqual(buildOpeningHoursSpecification(SETTINGS.opening_hours), [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "21:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday", "Sunday"],
      opens: "10:00",
      closes: "22:00",
    },
  ]);

  const node = buildLocalBusinessJsonLd({ origin: SITE_ORIGIN, settings: SETTINGS });
  assert.deepEqual(node.openingHoursSpecification, buildOpeningHoursSpecification(SETTINGS.opening_hours));
});

test("rentang jam yang tidak bisa dibaca menghasilkan specification kosong", () => {
  assert.equal(parseTimeRange("buka kapan aja"), null);
  assert.equal(parseTimeRange("99:00 - 21:00"), null);
  assert.equal(parseTimeRange(""), null);
  assert.equal(parseTimeRange(null), null);
  assert.deepEqual(buildOpeningHoursSpecification({ monday_friday: "sepanjang hari" }), []);
  assert.deepEqual(buildOpeningHoursSpecification(null), []);
  assert.deepEqual(buildOpeningHoursSpecification({ monday_friday: "9:00 - 21:00 WIB" }), [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "21:00",
    },
  ]);
});

test("aggregateRating hanya ikut kalau data ulasan benar-benar bisa dipakai", () => {
  assert.deepEqual(buildAggregateRating(REVIEWS), {
    "@type": "AggregateRating",
    ratingValue: 4.4,
    reviewCount: 5,
    bestRating: 5,
    worstRating: 1,
  });
  assert.equal(buildAggregateRating(null), undefined);
  assert.equal(buildAggregateRating({ ...REVIEWS, count: 0 }), undefined);
  assert.equal(buildAggregateRating({ ...REVIEWS, rating: 9 }), undefined);

  const node = buildLocalBusinessJsonLd({
    origin: SITE_ORIGIN,
    settings: SETTINGS,
    reviews: null,
  });
  assert.equal(node.aggregateRating, undefined, "tanpa data ulasan, jangan pernah mengarang rating");
});

test("hasil LocalBusiness bisa diserialisasi tanpa kunci kosong", () => {
  const node = buildLocalBusinessJsonLd({
    origin: SITE_ORIGIN,
    settings: {
      ...SETTINGS,
      address: "",
      phone_number: "",
      whatsapp_number: "",
      maps_url: "",
      store_name: "",
      description_id: "",
      description_en: "",
      social_facebook: "",
      social_instagram: "",
      social_x: "",
      social_tiktok: "",
      opening_hours: { monday_friday: "", saturday_sunday: "" },
    },
    reviews: null,
  });

  const parsed = JSON.parse(JSON.stringify(node));
  assert.equal(parsed.address, undefined);
  assert.equal(parsed.telephone, undefined);
  assert.equal(parsed.hasMap, undefined);
  assert.equal(parsed.openingHoursSpecification, undefined);
  assert.equal(parsed.aggregateRating, undefined);
  assert.equal(parsed.sameAs, undefined);
  // @context, @type, dan @id tetap harus ada supaya JSON-LD tidak rusak.
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@type"], "LocalBusiness");
  assert.ok(parsed["@id"]);
});

/* -------------------------------------------------------------------------- */
/* Cross-surface consistency                                                   */
/* -------------------------------------------------------------------------- */

test("origin yang sama dipakai sitemap, robots, canonical, dan JSON-LD", () => {
  const entry = sitemap().find((item) => item.url === routeUrl("catalog", "id"));
  assert.ok(entry);
  assert.equal(entry.alternates?.languages?.en, routeUrl("catalog", "en"));
  assert.equal(String(buildLayoutMetadata("id").metadataBase), `${SITE_ORIGIN}/`);
  assert.equal(robots().sitemap, sitemapUrl());
  assert.ok(String(robots().sitemap).startsWith(String(entry.url).split("/id")[0]));
});

/* -------------------------------------------------------------------------- */
/* Login staf                                                                 */
/* -------------------------------------------------------------------------- */

test("halaman login punya canonical dan hreflang seperti rute lain", () => {
  for (const locale of LOCALES) {
    const meta = buildLoginMetadata(locale);
    const url = `${SITE_ORIGIN}/${locale}/login`;
    assert.equal(meta.alternates?.canonical, url);
    assert.deepEqual(meta.alternates?.languages, {
      id: `${SITE_ORIGIN}/id/login`,
      en: `${SITE_ORIGIN}/en/login`,
      "x-default": `${SITE_ORIGIN}/id/login`,
    });
  }
});

test("halaman login menyatakan noindex lewat meta, bukan hanya robots.txt", () => {
  for (const locale of LOCALES) {
    assert.deepEqual(buildLoginMetadata(locale).robots, { index: false, follow: true });
  }
  // Halaman yang boleh diindeks tidak boleh ikut membawa meta robots.
  for (const path of ROUTE_PATHS) {
    assert.equal(buildRouteMetadata(path, "id").robots, undefined);
  }
});

test("copy login berbeda antar bahasa dan memakai sufiks merek yang sama", () => {
  const id = buildLoginMetadata("id");
  const en = buildLoginMetadata("en");
  assert.notEqual(id.title, en.title);
  assert.notEqual(id.description, en.description);
  for (const meta of [id, en]) {
    assert.ok((meta.title as string).includes("|"), "title login harus memisahkan merek");
    assert.equal(meta.openGraph?.siteName, brandOfTitle(meta.title as string));
  }
});

test("login tetap di luar sitemap meski punya metadata sendiri", () => {
  const urls = sitemap().map((entry) => entry.url);
  for (const locale of LOCALES) {
    assert.equal(
      urls.includes(`${SITE_ORIGIN}/${locale}/login`),
      false,
      "halaman staf tidak boleh ikut masuk sitemap.xml"
    );
  }
  // Panjang sitemap tetap hanya PUBLIC_ROUTES x locale, tidak ikut bertambah.
  assert.equal(urls.length, ROUTE_PATHS.length * LOCALES.length);
});

test("origin tetap ke produksi ketika SITE_URL tidak diisi sama sekali", () => {
  // .env.example belum punya SITE_URL, jadi jalur ini yang benar-benar
  // dipakai produksi sekarang. Nilainya harus persis host yang dipakai
  // subdomain login.* di src/proxy.ts dan next.config.ts.
  assert.equal(SITE_ORIGIN, "https://atcell.my.id");
  assert.equal(sitemapUrl(), "https://atcell.my.id/sitemap.xml");
});
