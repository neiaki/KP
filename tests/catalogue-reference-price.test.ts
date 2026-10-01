import test from "node:test";
import assert from "node:assert/strict";
import {
  referencePriceNote,
  referencePriceOf,
} from "../src/lib/catalogue-notify.ts";
import { toCardItem } from "../src/lib/shop.ts";
import type { InventoryUnit, Product } from "../src/types/index.ts";

/*
 * `default_price` boleh bernilai nol, dan tidak boleh berarti apa pun selain
 * "harga acuan belum diisi".
 *
 * Dua jalur etalase membacanya. Kartu model tanpa unit lewat
 * `referencePriceNote`, dan kartu unit second lewat `newPrice` yang
 * dirender sebagai label "Barunya" yang dicoret. Jalur pertama sudah
 * menyembunyikan angka yang tidak layak sejak awal. Jalur kedua tidak:
 * `toCardItem` meneruskan `default_price` apa adanya, jadi unit trade-in yang
 * produknya belum punya harga unit baru menghasilkan `newPrice: 0`.
 *
 * Bahaya `0` di sini bukan karena ia langsung tampil. `ProductCard` kebetulan
 * memakai penjaga kebenaran, jadi `0` ikut tersingkir. Yang berbahaya adalah
 * arti nilainya: `newPrice: 0` berarti "ada harga baru, yaitu nol", jadi
 * konsumen mana pun yang memeriksa `newPrice !== undefined` akan menulis
 * "Barunya Rp0" di samping harga jual yang sebenarnya, dan pembeli
 * membacanya sebagai diskon yang rusak.
 *
 * Jadi yang dikunci di sini adalah sifat datanya, bukan teks yang tampil:
 * `newPrice` untuk unit second hanya boleh berisi angka finite yang positif,
 * dan `undefined` kalau tidak ada. Aturan yang sama dipakai kedua jalur lewat
 * `referencePriceOf`, jadi tidak ada lagi dua salinan aturan yang bisa berbeda.
 */

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1,
    brand: "Apple",
    model_name: "iPhone 14 Plus",
    specs: "Unit second dari tukar tambah",
    default_price: 0,
    image_url: "/products/placeholder.svg",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function unit(over: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: 9,
    product_id: 1,
    imei: "000000000003203",
    condition: "second",
    purchase_cost: 4_000_000,
    selling_price: 5_000_000,
    status: "available",
    created_at: "2026-03-01T00:00:00Z",
    ...over,
  };
}

/* -------------------------------------------------------------------------- */
/* Aturally                                                                    */
/* -------------------------------------------------------------------------- */

test("harga acuan yang tidak layak ditulis jadi undefined, bukan nol", () => {
  assert.equal(referencePriceOf(0), undefined);
  assert.equal(referencePriceOf(-1), undefined);
  assert.equal(referencePriceOf(Number.NaN), undefined);
  assert.equal(referencePriceOf(Number.POSITIVE_INFINITY), undefined);
  assert.equal(referencePriceOf(Number.NEGATIVE_INFINITY), undefined);
});

test("harga acuan di luar tipe number tidak pernah diteruskan", () => {
  // Nilai datang dari database lewat toNumber, jadi bentuknya tidak dijamin
  // number meski tipenya sudah number. "0" dan null harus hilang, bukan
  // diteruskan dan nanti terbaca formatIDR sebagai angka nol.
  assert.equal(referencePriceOf("0"), undefined);
  assert.equal(referencePriceOf("18000000"), undefined);
  assert.equal(referencePriceOf(null), undefined);
  assert.equal(referencePriceOf(undefined), undefined);
  assert.equal(referencePriceOf({}), undefined);
});

test("harga acuan yang layak dikembalikan apa adanya", () => {
  assert.equal(referencePriceOf(18_499_000), 18_499_000);
  assert.equal(referencePriceOf(1), 1);
});

/* -------------------------------------------------------------------------- */
/* Kartu unit second                                                          */
/* -------------------------------------------------------------------------- */

test("unit second tanpa harga acuan tidak pernah mengirim newPrice", () => {
  // Kasus nyata unit trade-in id 9: produknya default_price 0 karena toko
  // belum menetapkan harga iPhone 14 Plus baru.
  const p = product({ default_price: 0 });
  const card = toCardItem(unit({ condition: "second" }), [p]);
  assert.equal(card.newPrice, undefined);
});

test("harga acuan negatif, NaN, dan tak hingga juga tidak jadi newPrice", () => {
  for (const bad of [-1, -18_499_000, Number.NaN, Number.POSITIVE_INFINITY]) {
    const card = toCardItem(unit({ condition: "second" }), [
      product({ default_price: bad }),
    ]);
    assert.equal(
      card.newPrice,
      undefined,
      `default_price ${bad} tidak boleh jadi newPrice: ${String(card.newPrice)}`
    );
  }
});

test("unit second tanpa katalog tidak mengirim newPrice sama sekali", () => {
  const card = toCardItem(unit({ condition: "second", product_id: null }), []);
  assert.equal(card.newPrice, undefined);
});

test("harga acuan positif tetap jadi newPrice untuk unit second", () => {
  // Penjaga yang terlalu longgar akan menghapus label "Barunya" dari setiap
  // kartu second yang selama ini bekerja, jadi kasus positif ikut dikunci.
  const card = toCardItem(unit({ condition: "second" }), [
    product({ default_price: 18_499_000 }),
  ]);
  assert.equal(card.newPrice, 18_499_000);
});

test("unit baru tidak punya newPrice walau harga acuannya positif", () => {
  // Kartu unit baru sudah menulis "Baru, segel", jadi harga "Barunya" tidak
  // boleh muncul. Ini perilaku lama dan harus tetap begitu.
  const card = toCardItem(unit({ condition: "new" }), [
    product({ default_price: 18_499_000 }),
  ]);
  assert.equal(card.newPrice, undefined);
});

/* -------------------------------------------------------------------------- */
/* Dua jalur satu aturan                                                       */
/* -------------------------------------------------------------------------- */

test("kedua jalur etalase menolak harga acuan yang sama", () => {
  // Kalau referencePriceNote dijaga tapi newPrice tidak, atau sebaliknya,
  // pelanggan melihat dua treatment berbeda untuk angka nol yang sama.
  for (const bad of [0, -1, Number.NaN]) {
    const note = referencePriceNote(bad, "id");
    const card = toCardItem(unit({ condition: "second" }), [
      product({ default_price: bad }),
    ]);
    assert.equal(note, null, `referencePriceNote(${bad}) harus null`);
    assert.equal(card.newPrice, undefined, `newPrice untuk ${bad} harus undefined`);
  }
});

test("newPrice tidak pernah bernilai falsy selain undefined", () => {
  // Yang memeriksa newPrice sebagai "ada atau tidak" harus melihat
  // hanya dua kemungkinan: angka positif, atau tidak ada sama sekali.
  for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1]) {
    const card = toCardItem(unit({ condition: "second" }), [
      product({ default_price: price }),
    ]);
    if (card.newPrice === undefined) continue;
    assert.ok(
      Number.isFinite(card.newPrice) && card.newPrice > 0,
      `newPrice harus angka finite positif, bukan ${String(card.newPrice)}`
    );
  }
});