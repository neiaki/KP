import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNotifyMeHref,
  buildNotifyMeMessage,
  noUnitSectionCopy,
  notifyMeTargetFrom,
  referencePriceNote,
  soldOutSectionCopy,
} from "../src/lib/catalogue-notify.ts";
import {
  listProductsWithoutUnits,
  listSoldOutProducts,
  pernahPunyaUnit,
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

test("copy stok habis tidak pernah memakai bahasa model yang belum ada", () => {
  // Dua kelompok ini tidak boleh tertukar. "Belum ada unitnya di toko" untuk
  // model yang sudah pernah terjual adalah pernyataan yang salah, jadi
  // kalimatnya harus berbeda dari yang dipakai model tanpa unit.
  for (const locale of ["id", "en"] as const) {
    const copy = soldOutSectionCopy(locale);
    assert.match(copy.badge, /habis|sold out/i);
    assert.doesNotMatch(
      copy.intro,
      /belum ada (satu pun )?unit/i,
      `intro ${locale} untuk stok habis tidak boleh bilang modelnya belum punya unit`
    );
    assert.match(copy.intro, /pernah|has had/i);
    assert.match(copy.requestNote, /not an order|bukan pesan beli/i);
  }
});

test("pesan WhatsApp membedakan alasan habis dan belum pernah ada", () => {
  const target = { productId: 1, brand: "Apple", modelName: "iPhone 13 128GB" };
  const habis = buildNotifyMeMessage({ locale: "id", target, alasan: "sold_out" });
  const belum = buildNotifyMeMessage({ locale: "id", target, alasan: "never_had_unit" });
  assert.notEqual(habis, belum, "kedua alasan harus punya kalimat sendiri");
  // Keduanya harus menyebut modelnya, karena chat dibaca counter yang tidak
  // melihat halaman pelanggan.
  for (const pesan of [habis, belum]) {
    assert.match(pesan, /Apple iPhone 13 128GB/);
    assert.match(pesan, /Belum pesan/);
  }
  // Default harus aman: pemanggil yang lupa mengirim alasan dapat kalimat
  // "belum pernah ada", bukan "baru saja habis".
  assert.equal(
    buildNotifyMeMessage({ locale: "id", target }),
    belum
  );
  assert.match(buildNotifyMeHref({ locale: "id", waNumber: "628123", target, alasan: "sold_out" }), /text=/);
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

/* -------------------------------------------------------------------------- */
/* Pemisahan stok habis dan belum pernah ada unit                             */
/* -------------------------------------------------------------------------- */

/*
 * Test di bawah memakai bentuk data yang sama dengan yang diterima browser
 * dari getPublicSnapshot: InventoryUnit-nya statusnya selalu "available",
 * karena v_public_inventory memfilter begitu. Padahal database punya unit
 * sold dan in_service. Itulah sebabnya produk yang sudah pernah terjual ikut
 * terbaca sebagai "belum punya unit" kalau sumber kebenaran cuma unit yang
 * terlihat, dan penandanya wajib datang dari database.
 */
function unitPublik(over: Partial<InventoryUnit> = {}): InventoryUnit {
  return {
    id: 1,
    product_id: 1,
    imei: "****1234",
    condition: "new",
    purchase_cost: 0,
    selling_price: 5_000_000,
    status: "available",
    created_at: "2026-02-01T00:00:00Z",
    ...over,
  } as InventoryUnit;
}

test("produk yang sudah terjual tidak pernah dilabeli belum ada unit", () => {
  // Produk 1 sudah terjual dua unit, jadi di database pernah_punya_unit-nya true.
  // Browser tidak melihat unit itu, jadi tanpa penanda produk ini salah label.
  const products = [
    product({ id: 1, pernah_punya_unit: true }),
    product({ id: 2, model_name: "Belum ada", pernah_punya_unit: false }),
  ];
  const units = [unitPublik({ id: 9, product_id: 2 })];
  assert.deepEqual(
    listProductsWithoutUnits(products, units).map((p) => p.id),
    [2],
    "produk yang pernah punya unit tidak boleh masuk kelompok model tanpa unit"
  );
});

test("produk yang sedang diservis juga bukan model tanpa unit", () => {
  // Handset-nya ada di konter, jadi "belum ada satu pun unitnya di toko" salah.
  const products = [product({ id: 1, pernah_punya_unit: true })];
  assert.deepEqual(listProductsWithoutUnits(products, []), []);
});

test("produk stok habis masuk kelompok sendiri, bukan kelompok tanpa unit", () => {
  const products = [
    product({ id: 1, model_name: "Habis", pernah_punya_unit: true }),
    product({ id: 2, model_name: "Belum", pernah_punya_unit: false }),
    product({ id: 3, model_name: "Ada", pernah_punya_unit: true }),
  ];
  const units = [unitPublik({ id: 8, product_id: 3 })];
  assert.deepEqual(
    listSoldOutProducts(products, units).map((p) => p.id),
    [1]
  );
  assert.deepEqual(
    listProductsWithoutUnits(products, units).map((p) => p.id),
    [2]
  );
});

test("unit reserved juga membuat produknya bukan model tanpa unit", () => {
  // Reservedunit-nya sedang 약속 ke pelanggan, jadi masih ada di rak.
  const products = [product({ id: 1, pernah_punya_unit: true })];
  const units = [unitPublik({ id: 7, product_id: 1, status: "reserved" })];
  assert.deepEqual(listProductsWithoutUnits(products, units), []);
  assert.deepEqual(
    listSoldOutProducts(products, units).map((p) => p.id),
    [1],
    "unit reserved tidak bisa dibeli, jadi produknya stok habis"
  );
});

test("penanda dari database menang atas hitungan unit di tangan", () => {
  // Ini inti perbaikannya. Penanda bernilai true sementara tidak ada unit sama
  // sekali di tangan: itu keadaan nyata di sisi publik untuk produk yang
  // semua unitnya sudah sold. Kalau penanda diabaikan karena array kosong,
  // produk itu salah label lagi.
  const produkSold = product({ id: 1, pernah_punya_unit: true });
  assert.equal(pernahPunyaUnit(produkSold, []), true);
  assert.equal(pernahPunyaUnit(product({ id: 2, pernah_punya_unit: false }), []), false);
});

test("tanpa penanda, hitungan unit dipakai sebagai cadangan", () => {
  // Portal dan mode demo tidak mengisi penanda, dan keduanya melihat semua
  // unit, jadi hitungan di tangan benar di sana.
  const tanpaPenanda = product({ id: 1 });
  assert.equal(pernahPunyaUnit(tanpaPenanda, [unit(101, 1, "sold")]), true);
  assert.equal(pernahPunyaUnit(tanpaPenanda, []), false);
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
