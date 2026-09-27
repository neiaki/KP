import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import type { unitLabel as UnitLabel } from "../src/lib/shop.ts";
import type { buildPosNotaHtml as BuildPosNotaHtml } from "../src/lib/print-nota.ts";
import type { InventoryUnit, Product } from "../src/types/index.ts";

/*
 * C-1: unit trade-in punya product_id NULL, jadi products.find(p => p.id ===
 * unit.product_id) selalu undefined untuk unit itu. Halaman POS mencari
 * produknya sendiri, sehingga:
 *
 *  - baris di pemilih IMEI tercetak tanpa merek dan tanpa model sama sekali,
 *  - nota garansi pelanggan tercetak menamai handset "At Cell Smartphone",
 *    padahal IMEI yang tertulis di nota itu handset asli.
 *
 * Nota garansi adalah dokumen yang disimpan pelanggan, jadi ini bukan
 * kosmetik. Uji di sini mengunci perilaku yang baru: nama unit SELALU
 * berasal dari unitLabel(), dan kalau tidak ada data yang bisa dipercaya,
 * nota mengatakannya terus terang serta menunjuk IMEI sebagai penanda sah.
 * Resolusi label itu sendiri sudah diuji di trade-in-product-linkage.test.ts.
 */

// Import dinamis plus registerHooks dipakai karena static import tidak bisa
// bekerja di sini: src/lib/shop.ts dan src/lib/print-nota.ts memakai import
// relatif tanpa ekstensi ("./utils"), yang ditolak resolver ESM Node. Pola
// yang sama sudah dipakai tests/trade-in-product-linkage.test.ts.
const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

// registerHooks sudah ada di Node-nya, tapi belum ada di @types/node v20,
// jadi repo ini masih butuh satu cast kecil.
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};

registerHooks({
  resolve(specifier, context, next) {
    const relative = specifier.startsWith("@/") || specifier.startsWith("./") || specifier.startsWith("../");
    if (!relative) return next(specifier, context);
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

const { UNIT_LABEL_UNKNOWN, unitLabel } = (await import("../src/lib/shop.ts")) as {
  UNIT_LABEL_UNKNOWN: string;
  unitLabel: typeof UnitLabel;
};

const { buildPosNotaHtml } = (await import("../src/lib/print-nota.ts")) as {
  buildPosNotaHtml: typeof BuildPosNotaHtml;
};

const products: Product[] = [
  {
    id: 7,
    brand: "Samsung",
    model_name: "Galaxy S24",
    specs: "",
    default_price: 12_000_000,
    image_url: "",
    official_images: [],
    second_images: [],
    created_at: "2026-09-01T00:00:00.000Z",
  },
];

/** Unit berkatalog: labelnya harus persis merek dan model dari katalog. */
const unitKatalog: InventoryUnit = {
  id: 1,
    product_id: 7,
    imei: "350000111111111",
    condition: "new",
    purchase_cost: 10_000_000,
    selling_price: 12_000_000,
  status: "available",
  created_at: "2026-09-01T00:00:00.000Z",
};

/** Unit hasil trade-in: product_id NULL, model asli ada di trade_in_records. */
const unitTradeIn: InventoryUnit = {
  ...unitKatalog,
  id: 2,
  product_id: null,
  condition: "second",
  trade_in_model: "Samsung Galaxy S9",
};

/** product_id NULL tanpa trade_in_model: datanya hilang, tidak boleh ditebak. */
const unitTanpaData: InventoryUnit = { ...unitTradeIn, id: 3, trade_in_model: undefined };

/** Bentuk nota seperti yang dikirim halaman POS. */
function notaFor(unit: InventoryUnit) {
  const unitModel = unitLabel(unit, products);
  return buildPosNotaHtml({
    storeName: "At Cell",
    address: "Paku Jaya, Serpong Utara",
    phone: "0812",
    invoiceNo: "INV-77",
    date: "2026-09-27",
    customerName: "Budi",
    unitModel,
    unitModelKnown: unitModel !== UNIT_LABEL_UNKNOWN,
    imei: unit.imei,
    warrantyMonths: 3,
    paymentMethod: "cash",
    total: 12_000_000,
  });
}

test("nota garansi menyebut handset trade-in dengan model aslinya, bukan tebakan", () => {
  const html = notaFor(unitTradeIn);
  assert.match(html, /Samsung Galaxy S9/);
  // Nilai yang pernah benar-benar tercetak di nota pelanggan.
  assert.doesNotMatch(html, /At Cell Smartphone/);
  // IMEI unit-nya wajib ada persis di nota.
  assert.match(html, /350000111111111/);
});

test("nota garansi tidak berpura-pura tahu saat modelnya tidak tercatat", () => {
  const html = notaFor(unitTanpaData);
  // Dinyatakan terus terang, bukan diganti tebakan yang meyakinkan.
  assert.match(html, /nama model tidak tercatat/);
  assert.doesNotMatch(html, /At Cell Smartphone/);
});

test("IMEI jadi penanda sah unit di nota, bukan sekadar angka", () => {
  const html = notaFor(unitTradeIn);
  assert.match(html, /IMEI \(kode unit, penanda sah\)/);
  // Angkanya ditebalkan supaya dibaca lebih dulu daripada nama model.
  assert.match(html, /<strong>350000111111111<\/strong>/);
  assert.match(html, /IMEI adalah penanda sah unit ini/);
});

test("nota unit berkatalog tidak menampilkan catatan model yang tidak tercatat", () => {
  const html = notaFor(unitKatalog);
  assert.doesNotMatch(html, /nama model tidak tercatat/);
  assert.match(html, /Samsung Galaxy S24/);
});

test("halaman POS tidak lagi mencari produknya sendiri", () => {
  // Penjaga regresi untuk call site-nya. Uji perilaku di atas yang membuktikan
  // akibatnya; ini hanya memastikan tidak ada jalur kedua yang menimpanya.
  const posPage = readFileSync(
    new URL("../src/app/(portal)/portal/pos/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(posPage, /import \{[^}]*unitLabel[^}]*\} from "@\/lib\/shop"/);
  assert.doesNotMatch(posPage, /products\.find\(\(p\) => p\.id === unit\.product_id\)/);
  assert.doesNotMatch(posPage, /selectedProduct/);
  assert.doesNotMatch(posPage, /\?\? "At Cell"/);
});
