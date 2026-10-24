import test from "node:test";
import assert from "node:assert/strict";
import { brandFromUrl } from "../src/lib/shop.ts";

/*
 * Tautan katalog yang dibagikan sering menulis `?brand=apple` dengan huruf
 * kecil, sementara chip filter dan data memakai kapital ("Apple"). Dulu nilai
 * URL dibandingkan langsung, jadi pencocokan gagal dan filter diam-diam jatuh
 * ke "all": grid tetap menampilkan semua merek padahal alamat menulis filter
 * Apple. Kasus nyata di production 24 Oktober 2026.
 */

const produk = [
  { brand: "Apple" },
  { brand: "Samsung" },
  { brand: "Xiaomi" },
  { brand: "Oppo" },
  { brand: "Vivo" },
];

test("nilai URL kecil cocok dengan merek berkapital", () => {
  assert.equal(brandFromUrl("apple", produk), "Apple");
  assert.equal(brandFromUrl("SAMSUNG", produk), "Samsung");
  assert.equal(brandFromUrl(" Xiaomi ", produk), "Xiaomi");
});

test("kapital persis, kosong, all, dan tak dikenal jatuh ke all", () => {
  assert.equal(brandFromUrl("Apple", produk), "Apple");
  assert.equal(brandFromUrl("", produk), "all");
  assert.equal(brandFromUrl("all", produk), "all");
  assert.equal(brandFromUrl("Nokia", produk), "all");
  assert.equal(brandFromUrl("   ", produk), "all");
});

test("daftar produk kosong tidak melempar dan tetap all", () => {
  assert.equal(brandFromUrl("apple", []), "all");
});
