import test from "node:test";
import assert from "node:assert/strict";
import { listProductsWithoutUnits } from "../src/lib/shop.ts";
import type { Product, InventoryUnit } from "../src/types/index.ts";

/*
 * Produk baru yang belum punya unit tidak boleh hilang dari etalase.
 * Helper ini dipakai katalog dan beranda untuk bagian "Baru masuk katalog".
 */

function product(id: number): Product {
  return {
    id,
    brand: "Apple",
    model_name: `Model ${id}`,
    specs: "Spesifikasi contoh",
    default_price: 1000000,
    image_url: "/products/contoh.jpg",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function unit(id: number, productId: number | null, status: InventoryUnit["status"]): InventoryUnit {
  return {
    id,
    product_id: productId,
    imei: String(100000000000000 + id),
    condition: "new",
    purchase_cost: 800000,
    selling_price: 1000000,
    status,
    created_at: "2026-03-01T00:00:00Z",
  };
}

test("produk tanpa unit sama sekali dilaporkan agar tampil Stok Habis", () => {
  const products = [product(1), product(2), product(3)];
  const units = [unit(101, 1, "available"), unit(102, 2, "sold")];
  const result = listProductsWithoutUnits(products, units);
  assert.deepEqual(
    result.map((p) => p.id),
    [3]
  );
});

test("produk dengan unit available atau sold tidak ikut bagian baru", () => {
  const products = [product(1), product(2)];
  const units = [unit(101, 1, "available"), unit(102, 2, "sold")];
  assert.equal(listProductsWithoutUnits(products, units).length, 0);
});

test("unit trade-in tanpa product_id tidak menyembunyikan produk katalog", () => {
  const products = [product(9)];
  const units = [unit(201, null, "available")];
  assert.equal(listProductsWithoutUnits(products, units).length, 1);
});
