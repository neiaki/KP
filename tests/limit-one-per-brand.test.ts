import test from "node:test";
import assert from "node:assert/strict";
import { limitOnePerBrand } from "../src/lib/shop.ts";
import type { Product } from "../src/types/index.ts";

/*
 * Halaman utama membatasi kartu "Belum ada unit" jadi satu per merek supaya
 * tidak menumpuk: lima merek, lima kartu, sisanya hanya di halaman katalog.
 * Permintaan pemilik 24 Oktober 2026.
 */

function produk(id: number, brand: string, model: string): Product {
  return {
    id,
    brand,
    model_name: model,
    specs: "",
    default_price: 0,
    image_url: "",
    official_images: [],
    second_images: [],
    created_at: `2026-10-${String(10 + (id % 10)).padStart(2, "0")}T00:00:00Z`,
  } as Product;
}

test("satu kartu per merek, urut sesuai BRANDS, total maksimal lima", () => {
  // Urutan input terbaru-dulu: id besar = lebih baru.
  const masukan = [
    produk(9, "Vivo", "Y28 8/128GB"),
    produk(8, "Oppo", "Find X8 12/256GB"),
    produk(7, "Xiaomi", "14T 12/256GB"),
    produk(6, "Samsung", "S24 Ultra 256GB"),
    produk(5, "Apple", "iPhone 15 Pro 128GB"),
    produk(4, "Vivo", "V30 5G 8/256GB"),
    produk(3, "Oppo", "Reno 12 5G 12/256GB"),
    produk(2, "Samsung", "S24 8/256GB"),
    produk(1, "Apple", "iPhone 15 128GB"),
  ];
  const hasil = limitOnePerBrand(masukan);
  assert.equal(hasil.length, 5, "harus tepat lima kartu");
  assert.deepEqual(
    hasil.map((p) => p.brand),
    ["Apple", "Samsung", "Xiaomi", "Oppo", "Vivo"],
    "urutan mengikuti BRANDS"
  );
  // Yang terpilih per merek adalah yang terbaru (id terbesar, karena input
  // terurut terbaru-dulu).
  assert.deepEqual(
    hasil.map((p) => p.model_name),
    [
      "iPhone 15 Pro 128GB",
      "S24 Ultra 256GB",
      "14T 12/256GB",
      "Find X8 12/256GB",
      "Y28 8/128GB",
    ]
  );
});

test("merek tanpa model dilewati tanpa menggeser merek lain", () => {
  const masukan = [
    produk(3, "Xiaomi", "14T 12/256GB"),
    produk(1, "Apple", "iPhone 15 128GB"),
  ];
  const hasil = limitOnePerBrand(masukan);
  assert.deepEqual(
    hasil.map((p) => p.brand),
    ["Apple", "Xiaomi"]
  );
});

test("daftar kosong menghasilkan kosong", () => {
  assert.deepEqual(limitOnePerBrand([]), []);
});

test("merek di luar daftar BRANDS tidak ditampilkan di halaman utama", () => {
  // Katalog lima merek: merek lain tidak ada di BRANDS dan tidak boleh
  // lolos dari saringan ini.
  const masukan = [produk(1, "Google", "Pixel 9 128GB")];
  assert.deepEqual(limitOnePerBrand(masukan), []);
});
