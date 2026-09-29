import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import type {
  buildTradeInMessage as BuildTradeInMessage,
  conditionLabel as ConditionLabel,
  resolveTradeInTarget as ResolveTradeInTarget,
  TradeInTarget,
} from "../src/lib/trade-in-request.ts";
import type { formatIDR as FormatIDR } from "../src/lib/utils.ts";
import type { InventoryUnit, Product } from "../src/types/index.ts";

/*
 * Gejala yang dilaporkan: "tuker tambah pada etalase tidak berkaitan dengan
 * produk yang di tanya".
 *
 * Tombol "Tukar tambah" di setiap kartu etalase dulu menuju /{locale}/trade-in
 * polos, tanpa membawa unit mana pun. Halaman trade-in pun tidak pernah
 * membaca query string, jadi isi pengajuan yang dikirim ke WhatsApp hanya
 * menyebut HP lama milik pelanggan ("saya mau tukar tambah iPhone 12 128GB")
 * dan berakhir dengan "Stok penggantinya apa saja?". Counter menerima
 * permintaan yang sama untuk semua produk, tanpa satu pun jejak produk mana
 * yang diproses.
 *
 * Repo ini tidak punya test runner React, jadi aturan yang mengikat diuji
 * lewat src/lib/trade-in-request.ts: modul murni yang menyusun isi pengajuan,
 * sama seperti tests/public-seed.test.ts menguji resolveSeed di
 * src/lib/public-seed.ts. Dua hal tidak bisa diuji lewat modul itu dan
 * diuji lewat sumbernya di bawah, dengan alasan yang sama seperti yang
 * dipakai tests/public-seed.test.ts untuk susunan prop publicSeed.
 */

// Import dinamis plus registerHooks dipakai karena static import tidak bisa
// bekerja di sini: src/lib/trade-in-request.ts mengimpor formatIDR dari
// "./utils" tanpa ekstensi, yang ditolak resolver ESM Node. Pola yang sama
// sudah dipakai tests/trade-in-product-linkage.test.ts.
const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

// registerHooks sudah ada di Node-nya, tapi belum ada di @types/node v20
// yang terpasang di repo, jadi repo ini masih butuh satu cast kecil.
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
    const relative =
      specifier.startsWith("@/") ||
      specifier.startsWith("./") ||
      specifier.startsWith("../");
    if (!relative) return next(specifier, context);
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

// Import dinamis di sini bukan pilihan gaya: registerHooks di atas baru
// terdaftar setelah berkas ini dievaluasi, jadi import statis ke
// src/lib/trade-in-request.ts akan gagal sebelum hook itu ada.
const { buildTradeInMessage, resolveTradeInTarget, conditionLabel } = (await import(
  "../src/lib/trade-in-request.ts"
)) as {
  buildTradeInMessage: typeof BuildTradeInMessage;
  resolveTradeInTarget: typeof ResolveTradeInTarget;
  conditionLabel: typeof ConditionLabel;
};

const { formatIDR } = (await import("../src/lib/utils.ts")) as {
  formatIDR: typeof FormatIDR;
};

const productCard = readFileSync(
  new URL("../src/components/public/product-card.tsx", import.meta.url),
  "utf8"
);
const tradeInPage = readFileSync(
  new URL("../src/app/(public)/[locale]/trade-in/page.tsx", import.meta.url),
  "utf8"
);
const tradeInContent = readFileSync(
  new URL("../src/app/(public)/[locale]/trade-in/trade-in-content.tsx", import.meta.url),
  "utf8"
);

const product = (over: Partial<Product>): Product => ({
  id: 1,
  brand: "Samsung",
  model_name: "Galaxy S26 5G 12/256GB",
  specs: "Snapdragon 8 Elite, AMOLED 2X 120Hz, 200MP",
  default_price: 18_999_000,
  image_url: "/products/galaxy-s26.jpg",
  official_images: ["/products/galaxy-s26.jpg"],
  second_images: [],
  created_at: "2026-09-01T00:00:00.000Z",
  ...over,
});

const unit = (over: Partial<InventoryUnit>): InventoryUnit => ({
  id: 42,
  product_id: 1,
  // Snapshot publik menyensor IMEI jadi "****7788"; empat digit terakhirnya
  // tetap sama dengan aslinya, jadi target bisa disebut tanpa membuka IMEI.
  imei: "****7788",
  condition: "new",
  purchase_cost: 0,
  selling_price: 18_999_000,
  status: "available",
  created_at: "2026-09-02T00:00:00.000Z",
  ...over,
});

const products: Product[] = [
  product({}),
  product({ id: 2, brand: "Apple", model_name: "iPhone 15 Pro 128GB", default_price: 15_499_000 }),
];

const units: InventoryUnit[] = [
  unit({}),
  unit({
    id: 77,
    product_id: 2,
    imei: "****1122",
    condition: "second",
    selling_price: 12_750_000,
  }),
  // Unit hasil tukar tambah: product_id NULL karena tidak punya baris katalog.
  unit({ id: 90, product_id: null, imei: "****3344", condition: "second", selling_price: 2_500_000 }),
];

/** Bentuk pengajuan seperti yang dikirim halaman trade-in publik. */
function pengajuan(target: TradeInTarget | null, over: { imei?: string; photoCount?: number } = {}) {
  return buildTradeInMessage({
    locale: "id",
    oldPhone: "iPhone 12 128GB",
    estimate: 3_250_000,
    grade: "Grade B, wajar",
    imei: over.imei ?? "",
    photoCount: over.photoCount ?? 0,
    target,
  });
}

test("pengajuan dari etalase menyebut handset yang sedang dilihat", () => {
  const target = resolveTradeInTarget("42", units, products);
  assert.notEqual(target, null, "unit 42 harus ketemu sebagai target");

  const pesan = pengajuan(target);
  assert.ok(
    pesan.includes("Samsung Galaxy S26 5G 12/256GB"),
    `pesan harus menyebut model etalase, dapat: ${pesan}`
  );
  assert.ok(pesan.includes(conditionLabel("new", "id")), "kondisi unit ikut disebut");
  assert.ok(pesan.includes(formatIDR(18_999_000)), "harga etalase ikut disebut");
  assert.ok(pesan.includes("7788"), "empat digit IMEI unit ikut disebut");
  // Pertanyaan generik hanya berlaku saat tidak ada target yang diketahui.
  assert.ok(
    !pesan.includes("Stok penggantinya apa saja?"),
    "kalau produknya sudah diketahui, jangan lagi menanyakan stok apa saja"
  );
});

test("dua unit etalase berbeda menghasilkan pengajuan yang berbeda", () => {
  const samsung = pengajuan(resolveTradeInTarget("42", units, products));
  const iphone = pengajuan(resolveTradeInTarget("77", units, products));

  assert.notEqual(samsung, iphone, "pengajuan harus mengikuti unit yang dilihat");
  assert.ok(iphone.includes("Apple iPhone 15 Pro 128GB"), `dapat: ${iphone}`);
  assert.ok(iphone.includes(conditionLabel("second", "id")), "kondisi second ikut disebut");
  assert.ok(!iphone.includes("Galaxy S26"), "pengajuan unit 77 tidak boleh menyebut unit 42");
  assert.ok(!samsung.includes("iPhone 15 Pro"), "pengajuan unit 42 tidak boleh menyebut unit 77");
});

test("unit yang tidak dikenal tidak pernah mengarang nama produk", () => {
  for (const param of ["999", "90", "abc", "", "  ", "-1"]) {
    assert.equal(
      resolveTradeInTarget(param, units, products),
      null,
      `param ${JSON.stringify(param)} tidak boleh jadi target`
    );
  }
  assert.equal(resolveTradeInTarget(null, units, products), null);
  assert.equal(resolveTradeInTarget(undefined, units, products), null);

  // Tanpa target, pesan tetap menanyakan stok penggantinya seperti entry point
  // navbar, footer, dan kartu alasan di beranda.
  const pesan = pengajuan(null);
  assert.ok(pesan.includes("Stok penggantinya apa saja?"), `dapat: ${pesan}`);
  assert.ok(pesan.includes("iPhone 12 128GB"), "HP lama pelanggan tetap ikut disebut");
  assert.ok(!pesan.includes("Galaxy S26"), "tanpa target tidak boleh menyebut produk etalase");
});

test("param rusak tidak pernah dialihkan ke unit lain", () => {
  // Number("42.9") = 42.9, Number("1e3") = 1000, Number("0x2a") = 42. Bentuk
  // seperti ini harus ditolak, bukan menunjuk unit yang tidak dimaksud.
  assert.equal(resolveTradeInTarget("42.9", units, products), null);
  assert.equal(resolveTradeInTarget("1e3", units, products), null);
  assert.equal(resolveTradeInTarget("0x2a", units, products), null);
  assert.equal(resolveTradeInTarget("Infinity", units, products), null);
  assert.equal(resolveTradeInTarget("-42", units, products), null);
  assert.equal(resolveTradeInTarget("9007199254740993", units, products), null);
  // Nol dan negatif bukan id unit yang pernah ada.
  assert.equal(resolveTradeInTarget("0", units, products), null);
  // Spasi di sekeliling angka yang benar tetap diterima: tautan_card memang
  // menulis angka polos, tapi param ini datang dari URL yang bisa disalin.
  assert.equal(resolveTradeInTarget(" 42 ", units, products)?.unitId, 42);
});

test("IMEI 15 digit dan foto ikut terbawa seperti sebelumnya", () => {
  const target = resolveTradeInTarget("42", units, products);
  const pesan = pengajuan(target, { imei: "352948110293841", photoCount: 3 });
  assert.ok(pesan.includes("IMEI: 352948110293841"), `dapat: ${pesan}`);
  assert.ok(pesan.includes("3 foto"), "jumlah foto ikut disebut");
  // Tidak ada taksiran/foto yang berarti tidak ada baris tambahan sama sekali.
  const polos = pengajuan(target);
  assert.ok(!polos.includes("IMEI:"), "IMEI kosong tidak boleh menambah baris");
  assert.ok(!polos.includes("Foto kondisi"), "tanpa foto tidak boleh menambah baris");
});

test("pesan bahasa Inggris juga menyebut produk etalase", () => {
  const target = resolveTradeInTarget("77", units, products);
  const pesan = buildTradeInMessage({
    locale: "en",
    oldPhone: "iPhone 12 128GB",
    estimate: 3_250_000,
    grade: "Grade B, fair",
    imei: "",
    photoCount: 0,
    target,
  });
  assert.ok(pesan.includes("Apple iPhone 15 Pro 128GB"), `dapat: ${pesan}`);
  assert.ok(pesan.includes(formatIDR(12_750_000)), "harga etalase ikut disebut");
  assert.ok(!pesan.includes("Which replacement stock is available?"), "dapat: " + pesan);
});

test("kartu etalase meneruskan unit yang dilihat ke halaman trade-in", () => {
  assert.ok(
    /href=\{`\/\$\{locale\}\/trade-in\?unit=\$\{item\.unitId\}`\}/.test(productCard),
    "tombol Tukar tambah di kartu produk harus membawa ?unit= dari kartu itu"
  );
});

test("halaman trade-in memakai isi pengajuan yang sudah terikat target", () => {
  assert.ok(
    tradeInContent.includes("buildTradeInMessage"),
    "submitViaWa harus memakai pembangun pesan, bukan merangkai string sendiri"
  );
  assert.ok(
    /buildTradeInMessage\(\{[\s\S]*?\btarget,/.test(tradeInContent),
    "target dari query string harus diteruskan ke pembangun pesan"
  );
  // useSearchParams() tanpa batas Suspense adalah galat build di Next.js, dan
  // aturan "wajib di dalam <Suspense>" ada di AGENTS.md.
  assert.ok(
    /<Suspense>[\s\S]*?<TradeInContent/.test(tradeInPage),
    "halaman trade-in harus membungkus TradeInContent dengan Suspense"
  );
  // Komponen ini memakai useState dan useSearchParams. Tanpa direktif
  // "use client" di baris pertama, Next.js memperlakukannya sebagai server
  // component dan halamannya gagal dirender di browser. Kehilangan satu
  // baris ini lolos dari tsc dan dari seluruh suite, jadi harus dikunci.
  assert.ok(
    tradeInContent.startsWith('"use client";'),
    "trade-in-content.tsx harus diawali direktif use client"
  );
});
