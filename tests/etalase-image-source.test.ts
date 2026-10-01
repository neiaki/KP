import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toCardItem, isRealPhoto } from "../src/lib/shop.ts";
import type { InventoryUnit, Product } from "../src/types/index.ts";

/*
 * Sumber foto etalase.
 *
 * Tiga hal diuji di sini, dan ketiganya pernah rusak di production.
 *
 * 1. Kartu unit baru harus memakai fallback yang sama dengan kartu unit
 *    second. toCardItem sudah menghitung officialOrFallback yang sudah
 *    menghitung image_url, tapi pernah memakai official yang tidak. Akibatnya
 *    produk dengan official_images kosong dan image_url yang sah menampilkan
 *    foto pada kartu second dan tidak menampilkan apa pun pada kartu baru.
 *
 * 2. isRealPhoto dulu hanya memblokir empat host placeholder dan tidak pernah
 *    memeriksa bentuk nilainya, jadi string
 *    "undefined/storage/v1/object/public/product-images/products/placeholder.svg"
 *    lolos ke etalase dan ikut terpaket ke browser di setiap halaman.
 *
 * 3. Galeri resmi Oppo Reno 11 pernah memuat oppo-reno11-2.jpg, yaitu foto
 *    laut tanpa perangkat di dalam frame.
 *
 * Catatan jujur soal titik 3: test ini tidak bisa melihat piksel gambar. Yang
 * bisa dikunci di sini ada dua, yaitu setiap entri galeri lolos isRealPhoto,
 * dan galerinya tidak lagi menunjuk berkas yang audit tandai salah. Foto
 * lautan yang isinya sama persis tapi diberi nama lain akan lolos test ini.
 * Pemeriksaan piksel tetap tugas manusia, dan langkahnya tertulis di
 * 20260927200000_remove_ocean_photo_from_reno11_gallery.sql.
 *
 * mock-data.ts diimpor lewat sumbernya, bukan lewat import: berkas itu
 * mengimpor @/types sebagai import nilai, jadi tidak bisa dievaluasi oleh
 * node --test. Pola yang sama dipakai tests/public-assets.test.ts.
 */

const mockData = readFileSync(
  new URL("../src/lib/mock-data.ts", import.meta.url),
  "utf8"
);

/** Nilai image_url yang benar-benar tersimpan di baris produk id 6 production. */
const IMAGE_URL_BROKEN =
  "undefined/storage/v1/object/public/product-images/products/placeholder.svg";

const product = (over: Partial<Omit<Product, "created_at">> = {}): Product => ({
  id: 1,
  brand: "Apple",
  model_name: "iPhone 13",
  specs: "Spesifikasi contoh",
  default_price: 1000000,
  image_url: "/products/contoh.jpg",
  created_at: "2026-03-15T10:00:00Z",
  ...over,
});

const unit = (condition: InventoryUnit["condition"]): InventoryUnit => ({
  id: 101,
  product_id: 1,
  imei: "352099001761481",
  condition,
  purchase_cost: 800000,
  selling_price: 1000000,
  status: "available",
  created_at: "2026-03-01T00:00:00Z",
});

/* -------------------------------------------------------------------------- */
/* toCardItem                                                                 */
/* -------------------------------------------------------------------------- */

test("unit baru dengan official_images kosong tetap dapat foto dari image_url", () => {
  const p = product({ official_images: [] });
  assert.deepEqual(
    toCardItem(unit("new"), [p]).images,
    ["/products/contoh.jpg"],
    "kartu unit baru harus jatuh ke image_url, sama seperti kartu unit second"
  );
});

test("kartu unit second dan kartu unit baru dapat foto yang sama saat galeri kosong", () => {
  const p = product({ official_images: [] });
  const baru = toCardItem(unit("new"), [p]).images;
  const second = toCardItem(unit("second"), [p]).images;
  assert.deepEqual(baru, second);
  assert.equal(baru.length, 1);
});

test("image_url yang tidak bisa dirender tidak dipakai sebagai fallback", () => {
  const p = product({ official_images: [], image_url: IMAGE_URL_BROKEN });
  assert.deepEqual(toCardItem(unit("new"), [p]).images, []);
  assert.deepEqual(toCardItem(unit("second"), [p]).images, []);
});

test("official_images yang terisi tetap menang atas image_url", () => {
  const p = product({
    official_images: ["/products/iphone-13-1.jpg", "/products/iphone-13-2.jpg"],
    image_url: "/products/lain.jpg",
  });
  assert.deepEqual(toCardItem(unit("new"), [p]).images, [
    "/products/iphone-13-1.jpg",
    "/products/iphone-13-2.jpg",
  ]);
});

test("second_images yang terisi tetap menang atas official_images", () => {
  const p = product({
    official_images: ["/products/iphone-13-1.jpg"],
    second_images: ["/products/iphone-13-2.jpg"],
  });
  assert.deepEqual(toCardItem(unit("second"), [p]).images, [
    "/products/iphone-13-2.jpg",
  ]);
});

/* -------------------------------------------------------------------------- */
/* isRealPhoto                                                                */
/* -------------------------------------------------------------------------- */

test("isRealPhoto menolak nilai yang bukan alamat foto", () => {
  const ditolak: Array<[string, string | undefined | null]> = [
    ["host Storage yang tidak terisi", IMAGE_URL_BROKEN],
    ["string kosong", ""],
    ["spasi saja", "   "],
    ["string acak", "foto iphone"],
    ["URL javascript", "javascript:alert(1)"],
    ["URL data", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["protocol-relative ke host lain", "//evil.example.com/x.jpg"],
    ["null", null],
    ["undefined", undefined],
  ];
  for (const [keterangan, nilai] of ditolak) {
    assert.equal(
      isRealPhoto(nilai),
      false,
      `isRealPhoto harusnya menolak ${keterangan}: ${JSON.stringify(nilai)}`
    );
  }
});

test("isRealPhoto tetap menerima URL Storage dan path lokal", () => {
  const diterima = [
    "https://abcdefgh.supabase.co/storage/v1/object/public/product-images/products/iphone-13-1.jpg",
    "http://localhost:3000/products/iphone-13-1.jpg",
    "/products/iphone-13-1.jpg",
    "/products/oppo-reno11-1.png",
  ];
  for (const nilai of diterima) {
    assert.equal(isRealPhoto(nilai), true, `isRealPhoto harusnya menerima ${nilai}`);
  }
});

/* -------------------------------------------------------------------------- */
/* Galeri produk                                                              */
/* -------------------------------------------------------------------------- */

/** Berkas yang audit tandai isinya tidak cocok dengan nama file. */
const FOTO_TERLALAH = ["products/oppo-reno11-2.jpg"];

/** official_images milik satu produk, dibaca dari mock-data.ts. */
function officialImages(mock: string, modelName: string): string[] {
  const produk = mock.indexOf(`model_name: "${modelName}`);
  assert.ok(produk !== -1, `produk ${modelName} tidak ada di mock-data.ts`);
  const mulai = mock.indexOf("official_images: [", produk);
  assert.ok(mulai !== -1, `produk ${modelName} tidak punya official_images`);
  const selesai = mock.indexOf("]", mulai);
  return [...mock.slice(mulai, selesai).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const galeriReno11 = officialImages(mockData, "Reno11 5G 8/256GB");

test("ekstrak galeri Reno 11 benar-benar dapat dibaca", () => {
  assert.ok(galeriReno11.length > 0, "test ini jadi tidak berarti");
});

test("galeri Oppo Reno 11 tidak menunjuk berkas yang audit tandai salah", () => {
  const salah = galeriReno11.filter((src) =>
    FOTO_TERLALAH.some((buruk) => src.endsWith(buruk))
  );
  assert.deepEqual(
    salah,
    [],
    `galeri resmi masih menunjuk ${salah.join(", ")}, yaitu foto tanpa perangkat di dalam frame`
  );
});

test("setiap entri galeri Oppo Reno 11 lolos isRealPhoto", () => {
  const buruk = galeriReno11.filter((src) => !isRealPhoto(src));
  assert.deepEqual(buruk, [], `entri galeri ini tidak bisa dirender: ${buruk.join(", ")}`);
});

test("galeri Oppo Reno 11 masih punya lebih dari satu foto setelah dipangkas", () => {
  // Menghapus satu entri tidak boleh membuat kartu produk kehilangan tombol
  // foto berikutnya sama sekali.
  assert.ok(
    galeriReno11.length >= 2,
    "galeri tinggal satu foto atau kosong, shopper tidak punya apa-apa untuk dilihat"
  );
});

test("galeri Galaxy A55 hanya memuat dua render yang berbeda", () => {
  // a55-3, a55-4, dan a55-5 terbukti potongan dari a55-1 dan a55-2, jadi
  // lima official photos itu sebenarnya dua gambar.
  const galeri = officialImages(mockData, "Galaxy A55 5G 8/256GB");
  assert.deepEqual(galeri, ["/products/a55-1.jpg", "/products/a55-2.jpg"]);
});

/* -------------------------------------------------------------------------- */
/* Migrasi pembersihan image_url                                              */
/* -------------------------------------------------------------------------- */

const migrasi = readFileSync(
  new URL(
    "../supabase/migrations/20260927201000_clear_unparseable_product_image_url.sql",
    import.meta.url
  ),
  "utf8"
);

// Komentar SQL dibuang lebih dulu. Tanpa itu, pernyataan yang sudah dinonaktifkan
// dengan memberi tanda -- di depan barisnya tetap cocok dengan pola di bawah,
// jadi testnya hijau padahal migrasi tidak lagi memperbaiki apa pun.
const sqlMigrasi = migrasi.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("migrasi image_url menjalankan update, bukan cuma catatan", () => {
  assert.match(sqlMigrasi, /update\s+public\.products/);
  assert.match(sqlMigrasi, /set\s+image_url\s*=\s*''/);
});

test("migrasi image_url tidak pernah mengisi kolom dengan nilai yang lolos filter", () => {
  const diisi = [...sqlMigrasi.matchAll(/set\s+image_url\s*=\s*([^;]+);/gi)].map((m) =>
    m[1].trim().replace(/^'|'$/g, "")
  );
  assert.ok(diisi.length > 0, "tidak ada set image_url di migrasi");
  for (const nilai of diisi) {
    assert.equal(
      isRealPhoto(nilai),
      false,
      `migrasi mengisi image_url dengan nilai yang bisa lolos filter: ${nilai}`
    );
  }
});

/** Nama setiap kolom yang ditulis di klausa SET sebuah pernyataan UPDATE. */
function kolomDiSet(sql: string): string[] {
  return [...sql.matchAll(/\bset\b([\s\S]*?)\bwhere\b/gi)].flatMap((m) =>
    [...(m[1] as string).matchAll(/(\w+)\s*=/g)].map((k) => (k[1] as string).toLowerCase())
  );
}

test("migrasi image_url tidak menyentuh merek, model, specs, atau harga", () => {
  // Baris produk id 6 punya brand 'Xiaomi' dengan model_name 'iphone 16'.
  // Itu pertanyaan merchandising, bukan konsekuensi gambar salah, jadi
  // migrasi tidak boleh menjawabnya dengan menebak. Klausa SET bisa menulis
  // beberapa kolom sekaligus, jadi seluruh klausanya dibaca, bukan hanya
  // kolom pertama.
  const kolom = kolomDiSet(sqlMigrasi);
  assert.ok(kolom.includes("image_url"), `kolom yang ditulis: ${kolom.join(", ")}`);
  for (const dilarang of ["brand", "model_name", "specs", "default_price"]) {
    assert.ok(
      !kolom.includes(dilarang),
      `migrasi mengubah kolom ${dilarang}; itu keputusan staf, bukan konsekuensi foto salah`
    );
  }
});

const oceanMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260927200000_remove_ocean_photo_from_reno11_gallery.sql",
    import.meta.url
  ),
  "utf8"
);
const sqlOcean = oceanMigration.replace(/--[^\n]*/g, "");

test("migrasi ocean photo meluruskan alt teks registry tanpa menyebut perangkat", () => {
  const literal = [...sqlOcean.matchAll(/set\s+alt_text\s*=\s*'([^']*)'/gi)].map(
    (m) => m[1] as string
  );
  assert.ok(literal.length > 0, "tidak ada set alt_text di migrasi ocean photo");
  for (const teks of literal) {
    assert.doesNotMatch(
      teks,
      /oppo\s*reno|reno\s*11/i,
      `alt_text masih mengklaim foto itu perangkat: ${teks}`
    );
  }
});

test("migrasi ocean photo tidak menghapus berkas apa pun", () => {
  assert.match(sqlOcean, /update\s+public\.product_images/);
  // Tidak boleh ada operation yang menghapus data, sama seperti yang dijaga
  // tests/run-all-pending.test.ts untuk file gabungan.
  assert.doesNotMatch(sqlOcean, /^\s*(drop\s+table|truncate|delete\s+from)/im);
});