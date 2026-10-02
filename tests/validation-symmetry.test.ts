import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterFotoMilikSendiri,
  hargaAcuanLayak,
  productSchema,
  productUpdateSchema,
  updateTicketSchema,
} from "../src/lib/validations.ts";

/*
 * Dua aturan validasi yang dulunya berbeda antara sisi tulis dan sisi baca.
 *
 * 1. filterFotoMilikSendiri hanya cocok-checking prefix folder dan tidak pernah
 *    menolak "..", jadi "<id-saya>/../<id-lain>/foto.jpg" lolos ke
 *    createSignedUrls, sementara photoRefSchema di sisi tulis menolaknya. Dua
 *    sisi dari aturan yang sama tidak boleh berbeda.
 *
 * 2. productImage adalah z.string().trim() polos, jadi "products/foo.jpg"
 *    tanpa garis miring diterima, sementara migrasi
 *    20260927201000_clear_unparseable_product_image_url.sql memblokirnya
 *    belakangan. Dan sisi baca, isUsablePhoto di src/lib/shop.ts, sudah
 *    memutuskan bentuk yang sah: path yang diawali satu garis miring, atau URL
 *    http/https absolut, dengan "//host/path" yang dilarang.
 *
 * Ketiga lapis sekarang memakai satu aturan yang sama, dan test ini menjaga
 * bahwa mereka tetap sama.
 */

const STAF_A = "8f14e45f-ceea-467a-9575-2b8a1a2f4c11";
const STAF_B = "3c59dc04-8e88-4a1c-9a1e-6f2b7c5d0e33";

/* ------------------------------------------------------------------ *
 * 1. Path foto: ".." ditolak di kedua sisi
 * ------------------------------------------------------------------ */

test("path yang memanjai prefix dengan .. tidak pernah ditandatangani", () => {
  // Dia diawali folder pemanggil, jadi cocok-checking prefix saja sudah
  // menjatuhkannya. Storage menafsirkan ".." sebagai naik satu level, jadi
  // path ini menunjuk folder staf lain.
  const curang = `${STAF_A}/../${STAF_B}/foto.jpg`;
  assert.deepEqual(
    filterFotoMilikSendiri(STAF_A, [curang]),
    [],
    "path yang memanjai prefix dengan .. harus dibuang"
  );
  // Varian yang lebih dalam, dan yang memakai ".." tersembunyi di tengah.
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [`${STAF_A}/a/../../${STAF_B}/x.jpg`]), []);
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [`${STAF_A}/..%2F..%2Fx.jpg`]), []);
});

test("sisi tulis dan sisi baca menolak path yang sama", () => {
  // photoRefsSchema adalah sisi tulis kolom photo_urls, filterFotoMilikSendiri
  // adalah sisi baca signed URL. Keduanya harus punya jawaban yang sama.
  const pathology = [
    `${STAF_A}/../${STAF_B}/foto.jpg`,
    `${STAF_A}/a/../../${STAF_B}/x.jpg`,
    `${STAF_A}/..%2F..%2Fx.jpg`,
    "products/foo.jpg",
    "a b.jpg",
  ];

  for (const path of pathology) {
    // Sisi tulis diuji lewat updateTicketSchema, bukan lewat photoRefsSchema
    // yang tidak diekspor: ini jalur Schema yang benar-benar dipakai Server
    // Action saat foto progres ditambahkan ke tiket.
    const tulis = updateTicketSchema.safeParse({ ticketId: 1, photo_urls: [path] }).success;
    const baca = filterFotoMilikSendiri(STAF_A, [path]).length > 0;
    assert.equal(
      baca,
      tulis,
      `sisi tulis (${tulis}) dan sisi baca (${baca}) tidak boleh berbeda untuk ${JSON.stringify(path)}`
    );
  }
});

test("path milik sendiri yang sah tetap ditandatangani", () => {
  const sah = `${STAF_A}/a1b2-foto-depan.jpg`;
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [sah]), [sah]);
  // Titik dan garis miring di dalam nama berkas tetap boleh.
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [`${STAF_A}/v1.2/foto_baru.jpg`]), [
    `${STAF_A}/v1.2/foto_baru.jpg`,
  ]);
});

/* ------------------------------------------------------------------ *
 * 2. image_url: satu aturan untuk schema dan migrasi
 * ------------------------------------------------------------------ */

const PRODUK = { brand: "Apple", model_name: "iPhone 13", default_price: 1_000_000 };

/**
 * Predikat yang sama persis dengan yang ditulis di migrasi
 * 20260927201000_clear_unparseable_product_image_url.sql, dihitung ulang di
 * sini supaya perbandingannya menguji isi migrasi itu dan bukan ingatan.
 * Bedanya satu: nilai kosong tidak dihitung "dibuang" karena itu keadaan
 * default kolomnya, dan migrasi melewatinya lewat klausa <> ''.
 */
function migrationMembuang(nilai: string): boolean {
  const t = nilai.trim();
  if (t === "") return false;
  if (t.startsWith("//")) return true;
  return !t.startsWith("/") && !t.startsWith("http://") && !t.startsWith("https://");
}

test("schema menolak tepat yang dibuang migrasi, tidak kurang tidak lebih", () => {
  const nilai = [
    "",
    "/products/placeholder.svg",
    "/products/iphone-13-1.jpg",
    "https://cdn.example.com/a.jpg",
    "http://cdn.example.com/a.jpg",
    "products/foo.jpg",
    "//cdn.example.com/a.jpg",
    "undefined/storage/v1/object/public/product-images/products/placeholder.svg",
    "notaurl",
    "ftp://example.com/a.jpg",
  ];

  for (const satu of nilai) {
    const schema = productSchema.safeParse({ ...PRODUK, image_url: satu }).success;
    const dibuang = migrationMembuang(satu);
    assert.equal(
      schema,
      !dibuang,
      `schema (${schema ? "terima" : "tolak"}) harus berlawanan dengan migrasi (${dibuang ? "buang" : "simpan"}) untuk ${JSON.stringify(satu)}`
    );
  }
});

test("path relatif tanpa garis miring ditolak di create dan update", () => {
  // Bentuk yang paling mungkin terjadi: admin menempel nama berkas dari
  // explorer atau dari folder lokal.
  for (const buruk of ["products/foo.jpg", "iphone-13.jpg", "images/a.jpg"]) {
    assert.equal(
      productSchema.safeParse({ ...PRODUK, image_url: buruk }).success,
      false,
      `create harus menolak ${JSON.stringify(buruk)}`
    );
    assert.equal(
      productUpdateSchema.safeParse({ image_url: buruk }).success,
      false,
      `update harus menolak ${JSON.stringify(buruk)}`
    );
  }
});

test("protocol-relative tetap ditolak karena isUsablePhoto juga menolaknya", () => {
  // src/lib/shop.ts isUsablePhoto menyatakan "//host/path" tidak boleh lolos,
  // jadi membukanya di schema akan membuat tiga lapis tidak sinkron lagi,
  // dan membuka kembali lubang yang sudah ditutup.
  assert.equal(
    productSchema.safeParse({ ...PRODUK, image_url: "//cdn.example.com/a.jpg" }).success,
    false
  );
});

test("bentuk yang sah tetap diterima, termasuk placeholder lokal", () => {
  // PLACEHOLDER_IMAGE di halaman produk adalah "/products/placeholder.svg",
  // jadi placeholder itu wajib lolos.
  for (const sah of ["", "/products/placeholder.svg", "https://cdn.example.com/a.jpg"]) {
    assert.equal(
      productSchema.safeParse({ ...PRODUK, image_url: sah }).success,
      true,
      `schema harus menerima ${JSON.stringify(sah)}`
    );
  }
});

test("path same-origin dengan .. ditolak walau migrasi menyimpannya", () => {
  // Ini satu-satunya tempat schema lebih ketat dari migrasi, dan itu arah yang
  // aman: migrasi tidak akan pernah perlu membuang nilai yang schema izinkan,
  // jadi tidak ada data yang hilang diam-diam.
  assert.equal(
    productSchema.safeParse({ ...PRODUK, image_url: "/a/../b.jpg" }).success,
    false,
    "path yang keluar dari direktori aset harus ditolak"
  );
});

/* -------------------------------------------------------------------------- */
/* Galeri foto produk                                                         */
/* -------------------------------------------------------------------------- */

/*
 * official_images dan second_images dulu z.array(z.string()) polos, jadi
 * menerima "javascript:alert(1)", "//evil.example/x.jpg", dan
 * "../../etc/passwd". Sisi baca menyaringnya sebelum menulis ke src, jadi
 * tidak ada yang bisa dirender dari nilai itu, tapi aturan yang berbeda
 * antara sisi tulis dan sisi baca adalah bug: begitu sisi baca berubah,
 * nilai yang dulu ditolak ikut lolos tanpa ada yang memberi tahu.
 *
 * Galeri dan image_url berakhir di atribut src yang sama, jadi keduanya harus
 * tunduk pada aturan yang sama. Test di bawah mengunci itu per field, bukan
 * cuma image_url, supaya penambahan field foto berikutnya tidak bisa membuka
 * jalan yang sama.
 */

/** Field galeri foto produk, yang keduanya harus tunduk pada aturan sama. */
const FIELD_GALERI = ["official_images", "second_images"] as const;

test("galeri foto menolak nilai yang tidak bisa dirender", () => {
  const nilaiJahat = [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "//evil.example/x.jpg",
    "../../etc/passwd",
    "/products/../etc/passwd",
    "products/foo.jpg",
    "undefined/storage/v1/object/public/product-images/products/placeholder.svg",
    "notaurl",
    "ftp://example.com/a.jpg",
  ];
  for (const field of FIELD_GALERI) {
    for (const nilai of nilaiJahat) {
      assert.equal(
        productSchema.safeParse({ ...PRODUK, [field]: [nilai] }).success,
        false,
        `${field} harus menolak ${JSON.stringify(nilai)}`
      );
      assert.equal(
        productUpdateSchema.safeParse({ [field]: [nilai] }).success,
        false,
        `update ${field} harus menolak ${JSON.stringify(nilai)}`
      );
    }
  }
});

test("galeri foto menolak entri kosong", () => {
  // Entri kosong di official_images menghasilkan <img src=""> yang rusak
  // tampil, dan galeri kosong sudah berarti "tidak ada foto" di kolom
  // image_url, jadi dua bentuk itu tidak perlu dibedakan.
  for (const field of FIELD_GALERI) {
    for (const kosong of ["", "   "]) {
      assert.equal(
        productSchema.safeParse({ ...PRODUK, [field]: [kosong] }).success,
        false,
        `${field} harus menolak entri kosong`
      );
    }
  }
});

test("galeri foto menerima bentuk yang sah dan daftar kosong", () => {
  // Bentuk yang ada di produksi harus tetap bisa ditulis, termasuk URL absolut
  // Supabase Storage dan path lokal. Daftar kosong juga sah: produk tanpa
  // foto resmi tetap boleh disimpan.
  for (const field of FIELD_GALERI) {
    for (const sah of [
      "/products/iphone-13-1.jpg",
      "/products/placeholder.svg",
      "https://contoh.supabase.co/storage/v1/object/public/product-images/products/a.jpg",
      "http://cdn.example.com/a.jpg",
    ]) {
      assert.equal(
        productSchema.safeParse({ ...PRODUK, [field]: [sah] }).success,
        true,
        `${field} harus menerima ${JSON.stringify(sah)}`
      );
    }
    assert.equal(
      productSchema.safeParse({ ...PRODUK, [field]: [] }).success,
      true,
      `${field} kosong harus diterima`
    );
  }
});

test("harga acuan nol tetap boleh disimpan, negatif tidak", () => {
  // default_price 0 berarti "belum ada harga acuan yang bisa
  // dipertanggungjawabkan", bukan harga Rp0. Menolaknya di sisi tulis membuat
  // produk yang sengaja dibiarkan tanpa harga mustahil diperbaiki dari portal,
  // dan satu-satunya jalan yang tersisa adalah SQL.
  assert.equal(
    productSchema.safeParse({ ...PRODUK, default_price: 0 }).success,
    true,
    "harga acuan 0 harus bisa disimpan"
  );
  assert.equal(
    productUpdateSchema.safeParse({ default_price: 0 }).success,
    true,
    "update dengan harga acuan 0 harus bisa disimpan"
  );
  // Batas bawahnya tetap di schema, jadi guard form dan schema tidak berbeda.
  assert.equal(productSchema.safeParse({ ...PRODUK, default_price: -1 }).success, false);
});

/*
 * Nilai yang ditolak guard harga acuan harus ditolak schema juga.
 *
 * Dulu keduanya berbeda. Schema memakai z.coerce.number(), jadi "", null, dan
 * [] ikut menjadi 0, sementara guard menolak ketiganya karena bukan number.
 * Form aman hanya karena memeriksa lebih dulu, jadi updateProduct yang
 * dipanggil langsung masih bisa menulis 0 hasil paksa. Dua penjaga yang
 * berbeda itu bug laten: keduanya sama-sama terlihat benar, dan hanya urutan
 * pemanggil yang menjaga agar tidak berbeda.
 *
 * Sekarang guard memanggil schema yang sama, jadi daftar di bawah bukan hanya
 * harus sama, tapi tidak mungkin berbeda. Test ini mengunci arah itu dari dua
 * sisi: nilai yang ditolak guard ditolak schema, dan nilai yang diterima guard
 * diterima schema.
 */
test("nilai yang ditolak guard harga acuan juga ditolak schema", () => {
  // Daftar ini persis yang dulu berbeda. "", null, dan [] adalah tiga di
  // antaranya yang diam-diam berubah jadi 0 oleh z.coerce.number().
  const ditolak: unknown[] = [
    "",
    "   ",
    null,
    [],
    {},
    "abc",
    "0",
    "8500000",
    "1e3",
    true,
    -1,
    -0.5,
    NaN,
    Infinity,
    1e13,
  ];
  for (const nilai of ditolak) {
    const teks = JSON.stringify(nilai) ?? String(nilai);
    assert.equal(hargaAcuanLayak(nilai), false, `guard harus menolak ${teks}`);
    assert.equal(
      productSchema.safeParse({ ...PRODUK, default_price: nilai }).success,
      false,
      `create harus menolak ${teks} yang ditolak guard`
    );
    assert.equal(
      productUpdateSchema.safeParse({ default_price: nilai }).success,
      false,
      `update harus menolak ${teks} yang ditolak guard`
    );
  }
});

test("harga acuan yang sah diterima guard dan schema", () => {
  // Arah sebaliknya, supaya test di atas tidak bisa lolos karena keduanya
  // sama-sama menolak semuanya termasuk nilai yang seharusnya sah.
  for (const sah of [0, 1, 8_500_000, 999_999_999_999]) {
    assert.equal(hargaAcuanLayak(sah), true, `guard harus menerima ${sah}`);
    assert.equal(
      productSchema.safeParse({ ...PRODUK, default_price: sah }).success,
      true,
      `create harus menerima ${sah}`
    );
    assert.equal(
      productUpdateSchema.safeParse({ default_price: sah }).success,
      true,
      `update harus menerima ${sah}`
    );
  }
});

test("undefined berarti kolom tidak diisi, bukan nilai yang lolos", () => {
  // Satu-satunya tempat guard dan schema tidak menjawab sama, dan itu
  // disengaja. undefined di zod berarti "kolom tidak ada", bukan "kolom diisi
  // dengan undefined": create memakai default 0, dan update berarti jangan
  // sentuh. Itu kontrak .default() dan .optional(), bukan celah yang membuka
  // kembali nilai paksa. Guard tetap menolaknya karena form tidak boleh
  // mengirimnya.
  assert.equal(hargaAcuanLayak(undefined), false, "guard menolak undefined");
  assert.equal(
    productSchema.safeParse({ ...PRODUK, default_price: undefined }).success,
    true,
    "create tanpa default_price memakai default 0"
  );
  assert.equal(
    productUpdateSchema.safeParse({ default_price: undefined }).success,
    true,
    "update tanpa default_price berarti kolom tidak disentuh"
  );
});

test("form portal menolak harga acuan negatif dan bukan nol", () => {
  // Guard di halaman harus setuju dengan schema. Kalau halaman masih menolak
  // 0, produk yang tidak bisa disimpan dari portal tetap tidak bisa.
  //
  // Pola yang dikunci di sini berubah bentuk. Guard pertamanya inline
  // (`Number.isFinite(defaultPrice) || defaultPrice < 0`) dan tidak ada satu pun
  // test yang memanggil aturannya, jadi bentuk itu tidak bisa dibuktikan benar
  // atau salah, hanya bisa dicocokkan. Sekarang form memanggil
  // hargaAcuanLayak dari lib/validations, dan tests/harga-acuan.test.ts
  // menguji fungsi itu sungguhan: 0 lolos, negatif dan non-number ditolak,
  // dan penjagaan inline tidak boleh muncul lagi di halaman.
  //
  // Test ini sengaja hanya memeriksa pemanggilannya. Aturannya sendiri diuji di
  // berkas lain supaya tidak ada dua test yang mengklaim hal sama dengan cara
  // berbeda.
  const productsPage = readFileSync(
    new URL("../src/app/(portal)/portal/products/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(
    productsPage,
    /if \(!hargaAcuanLayak\(defaultPrice\)\)/,
    "form harus menolak lewat hargaAcuanLayak, sumber aturan yang sama dengan schema"
  );
  assert.doesNotMatch(
    productsPage,
    /defaultPrice <= 0/,
    "form tidak boleh menolak harga acuan 0"
  );
  // Petunjuk di bawah field supaya 0 terbaca sebagai pilihan yang disengaja.
  assert.match(productsPage, /Isi 0 kalau harga acuannya belum tahu/);
});

test("galeri foto dan image_url memakai aturan yang sama", () => {
  // Kalau ketiganya menangkap fungsi yang sama, daftar ini tidak mungkin
  // berbeda. Test ini sengaja membandingkan hasilnya per nilai, bukan hanya
  // menguji image_url seperti test lain di berkas ini.
  const nilai = [
    "/products/a.jpg",
    "https://cdn.example.com/a.jpg",
    "javascript:alert(1)",
    "//evil.example/a.jpg",
    "../../etc/passwd",
    "products/a.jpg",
    "notaurl",
  ];
  for (const satu of nilai) {
    // image_url boleh kosong, jadi hanya yang tidak kosong yang dibandingkan.
    const imageUrl = productSchema.safeParse({ ...PRODUK, image_url: satu }).success;
    for (const field of FIELD_GALERI) {
      assert.equal(
        productSchema.safeParse({ ...PRODUK, [field]: [satu] }).success,
        imageUrl,
        `${field} dan image_url harus sepakat soal ${JSON.stringify(satu)}`
      );
    }
  }
});

test("batas jumlah entri galeri tetap dijaga", () => {
  for (const field of FIELD_GALERI) {
    assert.equal(
      productSchema.safeParse({ ...PRODUK, [field]: Array(10).fill("/products/a.jpg") }).success,
      true,
      `${field} harus menerima 10 entri`
    );
    assert.equal(
      productSchema.safeParse({ ...PRODUK, [field]: Array(11).fill("/products/a.jpg") }).success,
      false,
      `${field} harus menolak 11 entri`
    );
  }
});
