import test from "node:test";
import assert from "node:assert/strict";
import {
  filterFotoMilikSendiri,
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
  // jadioke membukanya di schema akan membuat tiga lapis tidak sinkron lagi,
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
