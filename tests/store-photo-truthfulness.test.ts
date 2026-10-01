import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { STORE_IMAGE_PATH, buildLocalBusinessJsonLd } from "../src/app/sitemap.ts";
import type { StoreSettings } from "../src/types/index.ts";

/*
 * Foto yang dipakai sebagai identitas toko dan sebagai iklan tidak jujur.
 *
 * Dua tempat memakai satu aset, dan keduanya pernah salah.
 *
 * STORE_IMAGE_PATH di src/app/sitemap.ts adalah image pada LocalBusiness yang
 * dipancarkan di setiap halaman publik, jadi itu foto profil yang dibaca mesin
 * pencari. about-content.tsx memakai path yang sama untuk foto di halaman
 * tentang. Keduanya memakai iphone-15-pro-2.jpg, padahal isinya tangan
 * memegang Galaxy Note yang sedang menulis lingkaran dengan S Pen, di atas
 * layar bertuliskan Circle to Search. Nama file, alt teks, dan caption sama
 * sama menyebut iPhone 15 Pro, sementara yang terlihat Samsung.
 *
 * Slide hero punya kelas cacat yang sama dan lebih parah: foto
 * iphone-duo.jpg dengan caption "iPhone lipat pertama, layar dalam 7,6 inci".
 *
 * Yang bisa dijaga runner: aset yang dipilih benar-benar ada di disk, bukan
 * berkas yang audit tandai isinya tidak sesuai namanya, caption tidak
 * mengklaim hal yang tidak bisa dibuktikan, dan tidak ada slide yang
 * menjanjikan perangkat lipat dengan foto yang tidak menunjukkan engsel.
 * Pemeriksaan isi gambar tetap tugas manusia.
 *
 * Daftar banned hanya berisi aset yang benar-benar dipakai di permukaan yang
 * dimiliki test ini. Aset yang tidak dirujuk halaman mana pun sengaja tidak
 * masuk, supaya daftarnya tidak berubah jadi sekadar daftar nama file.
 */

const ASET_SALAH: Record<string, true> = {
  // Tangan memegang Galaxy Note dengan S Pen dan "Circle to Search".
  "products/iphone-15-pro-2.jpg": true,
  // Dua iPhone slab, tanpa engsel dan tanpa layar dalam.
  "products/iphone-duo.jpg": true,
  // Galaxy Note lifestyle shot, bukan Galaxy S24 Ultra.
  "products/s24-ultra-2.jpg": true,
  "products/s24-ultra-4.jpg": true,
  "products/s24-ultra-5.jpg": true,
};

const publicDir = new URL("../public/", import.meta.url);
const asetAda = (path: string) => existsSync(new URL(path, publicDir));

const aboutSource = readFileSync(
  new URL("../src/app/(public)/[locale]/about/about-content.tsx", import.meta.url),
  "utf8"
);
const landingSource = readFileSync(
  new URL("../src/app/(public)/[locale]/landing-content.tsx", import.meta.url),
  "utf8"
);
const jsonLdSource = readFileSync(
  new URL("../src/components/public/store-json-ld.tsx", import.meta.url),
  "utf8"
);

const SETTINGS = {
  id: 1,
  store_name: "At Cell",
  description_id: "Toko HP di Paku Jaya, Serpong Utara.",
  description_en: "Phone shop in Paku Jaya, Serpong Utara.",
  address: "Jl. Paku Jaya No. 1, Serpong Utara",
  phone_number: "081234567890",
  whatsapp_number: "6281234567890",
  latitude: -6.3123,
  longitude: 106.7211,
  opening_hours: "09:00-21:00",
  social_facebook: "https://facebook.com/atcell",
  social_instagram: "https://instagram.com/atcell",
  social_x: "",
  social_tiktok: "",
} as unknown as StoreSettings;

/* -------------------------------------------------------------------------- */
/* LocalBusiness                                                              */
/* -------------------------------------------------------------------------- */

const jsonLd = buildLocalBusinessJsonLd({
  origin: "https://atcell.my.id",
  settings: SETTINGS,
  reviews: null,
});

test("foto profil LocalBusiness bukan aset yang audit tandai salah", () => {
  const image = jsonLd.image;
  assert.equal(typeof image, "string", "LocalBusiness tidak punya properti image");
  const nama = String(image).split("/").pop() as string;
  assert.ok(
    !ASET_SALAH[`products/${nama}`],
    `foto profil toko menunjuk ${nama}, yang isinya tidak sesuai dengan peran dan namanya`
  );
});

test("foto profil LocalBusiness benar-benar ada di public/products", () => {
  const nama = String(jsonLd.image).split("/").pop() as string;
  assert.ok(nama, "image LocalBusiness tidak berakhir dengan nama berkas");
  assert.ok(
    asetAda(`products/${nama}`),
    `public/products/${nama} tidak ada, jadi image LocalBusiness menunjuk berkas hantu`
  );
});

test("image LocalBusiness memakai default STORE_IMAGE_PATH", () => {
  // store-json-ld.tsx relies on the default. Kalau default itu tidak terpakai,
  // image di structured data bisa diam-diam menunjuk aset lain.
  assert.match(jsonLdSource, /STORE_IMAGE_PATH/);
  assert.equal(
    String(jsonLd.image),
    `https://atcell.my.id/${STORE_IMAGE_PATH}`,
    "image LocalBusiness harus memakai default STORE_IMAGE_PATH"
  );
});

/* -------------------------------------------------------------------------- */
/* Halaman tentang                                                            */
/* -------------------------------------------------------------------------- */

/** Path aset yang dikunci halaman tentang. */
function asetTentang(): string {
  const m = aboutSource.match(/const\s+STORE_PHOTO\s*=\s*"([^"]+)"/);
  assert.ok(m, "halaman tentang tidak punya konstanta STORE_PHOTO");
  return m[1] as string;
}

test("halaman tentang memakai aset yang sama dengan foto profil LocalBusiness", () => {
  // Dua permukaan ini menunjuk aset yang sama. Kalau satu berganti dan yang
  // tidak, toko punya dua identitas foto yang berbeda tanpa disadari.
  assert.equal(asetTentang(), STORE_IMAGE_PATH);
});

test("halaman tentang tidak memakai aset yang audit tandai salah", () => {
  assert.ok(
    !ASET_SALAH[asetTentang()],
    `halaman tentang memakai ${asetTentang()}, yang isinya tidak sesuai dengan caption dan namanya`
  );
});

test("foto halaman tentang benar-benar ada di public/products", () => {
  assert.ok(asetAda(asetTentang()), `public/${asetTentang()} tidak ada`);
});

test("caption halaman tentang tidak mengklaim foto itu diambil di konter", () => {
  // Foto di public/products bukan foto interiors. Mem|caption-nya sebagai
  // unit display di konter adalah klaim yang tidak bisa dibuktikan, jadi
  // caption hanya boleh menyebut produk yang memang dijual toko.
  const caption = aboutSource.match(/<figcaption[\s\S]*?<\/figcaption>/)?.[0] ?? "";
  assert.ok(caption.length > 0, "figcaption halaman tentang tidak ditemukan");
  assert.doesNotMatch(
    caption,
    /display/i,
    "caption masih mengklaim foto itu unit display di konter"
  );
  // Caption harus menyebut model yang sama dengan nama berkas fotonya, di
  // KEDUA cabang bahasa. Kalau hanya satu cabang dicek, mengganti teks di
  // cabang yang lain lolos tanpa terdeteksi.
  const model = asetTentang().match(/iphone-(\d+)/i)?.[1];
  assert.ok(model, `nama aset ${asetTentang()} tidak menyebut model yang bisa dicocokkan`);
  const cabang = [
    ...caption.matchAll(/locale === "en"\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/g),
  ].flatMap((m) => [m[1] as string, m[2] as string]);
  assert.equal(cabang.length, 2, `harus ada dua caption (id dan en), ketemu ${cabang.length}`);
  for (const teks of cabang) {
    assert.match(
      teks,
      new RegExp(`iphone ?${model}\\b`, "i"),
      `caption tidak menyebut ${model} sesuai berkas ${asetTentang()}: ${teks}`
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Slide hero                                                                 */
/* -------------------------------------------------------------------------- */

const curatedRaw =
  landingSource.match(/const curatedSlides[\s\S]*?\n {2}\];/)?.[0] ?? "";
// Komentar di dalam daftar slide menjelaskan slide yang sengaja dihapus dan
// boleh menyebut "iPhone lipat pertama" sebagai kutipan. Pemindaian di bawah
// harus melihat isi slide saja, bukan penjelasannya.
const curated = curatedRaw
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

test("daftar slide hero terbaca", () => {
  assert.ok(curated.length > 0, "curatedSlides tidak ditemukan di landing-content.tsx");
});

test("tidak ada slide hero yang memakai aset yang audit tandai salah", () => {
  const salah = [...curated.matchAll(/photo:\s*"([^"]+)"/g)]
    .map((m) => m[1] as string)
    .filter((path) => ASET_SALAH[path]);
  assert.deepEqual(salah, [], `slide hero masih memakai ${salah.join(", ")}`);
});

test("tidak ada slide hero yang menjanjikan iPhone lipat", () => {
  // Galaxy Z Fold 8 dan Galaxy Z Flip 8 memang perangkat lipat dan foto
  // mereka memang perangkat lipat. Yang dilarang adalah janji lipat untuk
  // foto yang tidak menunjukkan engsel, dan repo tidak punya satu pun gambar
  // perangkat lipat Apple.
  const menjanjikanLipat = /lipat pertama|first foldable/i.test(curated);
  const iphoneLipat = /iphone[^"']*lipat|lipat[^"']*iphone/i.test(curated);
  assert.equal(
    menjanjikanLipat && iphoneLipat,
    false,
    "masih ada slide yang menjanjikan iPhone lipat tanpa foto perangkat lipat"
  );
});

test("slide perangkat lipat yang ada memang Samsung, dan fotonya ada", () => {
  const lipatan = [...curated.matchAll(/photo:\s*"([^"]+)"/g)]
    .map((m) => m[1] as string)
    .filter((path) => /fold|flip/i.test(path));
  assert.ok(lipatan.length > 0, "tidak ada slide perangkat lipat sama sekali");
  for (const path of lipatan) {
    assert.ok(
      /galaxy-z/i.test(path),
      `slide perangkat lipat memakai ${path}, yang bukan Samsung`
    );
    assert.ok(asetAda(path), `public/${path} tidak ada`);
  }
});