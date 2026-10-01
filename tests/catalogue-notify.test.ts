import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNotifyMeHref,
  buildNotifyMeMessage,
  noUnitSectionCopy,
  notifyMeTargetFrom,
  referencePriceNote,
} from "../src/lib/catalogue-notify.ts";
import {
  listProductsWithoutUnits,
  sellableUnits,
  toCardItem,
} from "../src/lib/shop.ts";
import type { InventoryUnit, Product } from "../src/types/index.ts";
import { formatIDR } from "../src/lib/utils.ts";

/*
 * Model tanpa unit boleh tampil di etalase, tapi harus jujur dan harus bisa
 * ditindaklanjuti.
 *
 * Dua aturan di sini yang paling mudah hilang diam-diam. Pertama, pesan
 * WhatsApp harus menyebut model yang sedang dilihat, karena chat itu dibaca
 * counter yang tidak melihat halaman pelanggan. Kedua, kartu model tanpa unit
 * tidak boleh menampilkan angka harga seolah-olah itu harga jual hari ini, dan
 * tidak boleh punya kartu di daftar ready stock karena memang tidak ada
 * hardware-nya di toko.
 */

function product(over: Partial<Product> = {}): Product {
  return {
    id: 1,
    brand: "Apple",
    model_name: "iPhone 16 Pro 256GB",
    specs: "Chip A18 Pro, RAM 8GB",
    default_price: 18_499_000,
    image_url: "/products/iphone-16-pro.jpg",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function unit(
  id: number,
  productId: number | null,
  status: InventoryUnit["status"]
): InventoryUnit {
  return {
    id,
    product_id: productId,
    imei: String(100000000000000 + id),
    condition: "new",
    purchase_cost: 15_000_000,
    selling_price: 18_499_000,
    status,
    created_at: "2026-03-01T00:00:00Z",
  };
}

/* -------------------------------------------------------------------------- */
/* Target pesan                                                               */
/* -------------------------------------------------------------------------- */

test("baris katalog tanpa nama model tidak jadi target pesan", () => {
  assert.equal(notifyMeTargetFrom(product({ model_name: "   " })), null);
  assert.equal(notifyMeTargetFrom(product({ brand: "" })), null);
  assert.equal(notifyMeTargetFrom(product({ id: Number.NaN })), null);
});

test("target pesan memakai nama model apa adanya setelah dirapikan", () => {
  assert.deepEqual(
    notifyMeTargetFrom(product({ brand: " Apple ", model_name: " iPhone 16 Pro 256GB " })),
    { productId: 1, brand: "Apple", modelName: "iPhone 16 Pro 256GB" }
  );
});

/* -------------------------------------------------------------------------- */
/* Isi pesan WhatsApp                                                          */
/* -------------------------------------------------------------------------- */

test("pesan Minta dikabari menyebut model yang sedang dilihat", () => {
  const target = notifyMeTargetFrom(product());
  assert.ok(target, "produk katalog yang utuh harus jadi target");
  for (const locale of ["id", "en"] as const) {
    const message = buildNotifyMeMessage({ locale, target });
    assert.ok(
      message.includes("Apple iPhone 16 Pro 256GB"),
      `pesan ${locale} tidak menyebut model: ${message}`
    );
  }
});

test("pesan Minta dikabari menyatakan unitnya belum ada dan bukan pesanan", () => {
  const target = notifyMeTargetFrom(product())!;
  const id = buildNotifyMeMessage({ locale: "id", target });
  const en = buildNotifyMeMessage({ locale: "en", target });
  assert.match(id, /unitnya belum ada di toko/);
  assert.match(id, /Belum pesan/);
  assert.match(en, /no unit of it in the shop yet/);
  assert.match(en, /Not booking anything/);
});

test("tautan Minta dikabari membuka wa.me dengan isi pesan yang sama persis", () => {
  const target = notifyMeTargetFrom(product())!;
  const href = buildNotifyMeHref({ locale: "id", waNumber: "6281234567890", target });
  assert.ok(href.startsWith("https://wa.me/6281234567890?text="), href);
  // wa.me menerima query sebagai-is. Spasi dan karakter pesan yang tidak
  // di-encode membuat browser memotong pesan di tengah kalimat.
  assert.ok(!href.includes(" "), `tautan masih punya spasi mentah: ${href}`);
  assert.ok(href.includes("%20"), `tautan belum di-encode: ${href}`);
  const encoded = href.slice("https://wa.me/6281234567890?text=".length);
  assert.equal(decodeURIComponent(encoded), buildNotifyMeMessage({ locale: "id", target }));
});

/* -------------------------------------------------------------------------- */
/* Copy kartu publik                                                          */
/* -------------------------------------------------------------------------- */

test("badge model tanpa unit tidak pernah berbunyi stok habis", () => {
  for (const locale of ["id", "en"] as const) {
    const copy = noUnitSectionCopy(locale);
    assert.ok(
      /unit/i.test(copy.badge),
      `badge ${locale} harus menyebut unit, bukan kesediaan stok: ${copy.badge}`
    );
    assert.doesNotMatch(copy.intro, /habis|sold out/i);
    assert.match(copy.requestNote, /not an order|bukan pesan beli/i);
  }
});

/* -------------------------------------------------------------------------- */
/* Harga                                                                      */
/* -------------------------------------------------------------------------- */

test("harga yang belum diisi tidak pernah ditulis sebagai angka di etalase", () => {
  assert.equal(referencePriceNote(0, "id"), null);
  assert.equal(referencePriceNote(-1, "id"), null);
  assert.equal(referencePriceNote(Number.NaN, "id"), null);
  assert.equal(referencePriceNote(Number.POSITIVE_INFINITY, "id"), null);
});

test("harga acuan ditulis sebagai perkiraan saat unitnya masuk, bukan harga jual", () => {
  // formatIDR memakai Intl currency, jadi angka dan spasinya ikut dari sana.
  // Yang dikunci di sini adalah kata-katanya: kalau labelnya kembali jadi
  // "Harga katalog", test ini harus merah.
  assert.equal(
    referencePriceNote(18_499_000, "id"),
    `Perkiraan harga saat unitnya masuk ${formatIDR(18_499_000)}`
  );
  assert.match(
    referencePriceNote(18_499_000, "en") ?? "",
    /Estimated price once one arrives/
  );
  assert.doesNotMatch(referencePriceNote(18_499_000, "id") ?? "", /Harga katalog/);
});

/* -------------------------------------------------------------------------- */
/* Model tanpa unit dan daftar ready stock                                    */
/* -------------------------------------------------------------------------- */

test("produk tanpa unit apa pun tidak pernah menyumbang kartu ready stock", () => {
  const products = [product({ id: 1 }), product({ id: 2, model_name: "Galaxy A55 5G" })];
  // Produk 2 punya satu unit sold dan satu in_service, jadi tidak ada satu pun
  // yang boleh masuk daftar kartu ready stock.
  const units = [unit(201, 2, "sold"), unit(202, 2, "in_service")];
  const cards = sellableUnits(units).map((u) => toCardItem(u, products, units));
  assert.deepEqual(
    cards.map((c) => c.modelName),
    []
  );
});

test("produk tanpa unit tetap dilaporkan agar tampil di etalase", () => {
  const products = [product({ id: 1 }), product({ id: 2 }), product({ id: 3 })];
  const units = [
    unit(101, 1, "available"),
    unit(102, 2, "sold"),
    unit(103, 2, "in_service"),
  ];
  assert.deepEqual(
    listProductsWithoutUnits(products, units).map((p) => p.id),
    [3]
  );
});

test("produk dengan satu unit pun tidak ikut bagian tanpa unit", () => {
  const products = [product({ id: 1 }), product({ id: 2 })];
  const units = [unit(101, 1, "sold"), unit(102, 2, "in_service")];
  assert.deepEqual(listProductsWithoutUnits(products, units), []);
});

test("unit trade-in tanpa product_id tidak menyembunyikan produk katalog", () => {
  assert.deepEqual(
    listProductsWithoutUnits([product({ id: 9 })], [unit(201, null, "available")]).map(
      (p) => p.id
    ),
    [9]
  );
});

test("hanya unit status available yang boleh masuk daftar kartu", () => {
  const products = [product({ id: 1 })];
  const units = [
    unit(101, 1, "available"),
    unit(102, 1, "sold"),
    unit(103, 1, "in_service"),
  ];
  const kartu = sellableUnits(units).map((u) => toCardItem(u, products, units));
  assert.deepEqual(
    kartu.map((c) => c.unitId),
    [101]
  );
});
