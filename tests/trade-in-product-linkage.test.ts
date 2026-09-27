import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { inventoryUnits, type InventoryUnitRow } from "../src/db/schema.ts";
import type { InventoryUnit } from "../src/types/index.ts";
// Import dinamis karena modul di bawah hanya bisa diresolve setelah hook di
// bawah terdaftar; import statis akan gagal sebelum hook itu ada.
import type { tagForUnit as TagForUnit, toCardItem as ToCardItem, unitLabel as UnitLabel } from "../src/lib/shop.ts";

/*
 * Unit trade-in tidak punya baris katalog, jadi `inventory_units.product_id`
 * boleh NULL. Yang dijaga di sini:
 * 1. jalur insert trade-in tidak pernah menyalin product_id unit baru;
 * 2. NULL benar-benar diterima kolomnya di database dan di tipe frontend;
 * 3. helper baca yang dipakai etalase dan daftar inventaris tetap aman.
 */

// registerHooks sudah ada di Node-nya, tapi belum ada di @types/node v20 yang
// terpasang di repo, jadi diambil lewat cast di sini.
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};

/**
 * Modul src/ ditulis untuk bundler Next, jadi import-nya tanpa ekstensi dan
 * memakai alias `@/`. Node tidak bisa keduanya, jadi hook ini hanya melengkapi
 * resolusi. Logikanya tetap dijalankan apa adanya, bukan disalin ke test.
 */
const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith("@/") && !specifier.startsWith("./") && !specifier.startsWith("../")) {
      return next(specifier, context);
    }
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

const { tagForUnit, toCardItem, unitLabel } = (await import("../src/lib/shop.ts")) as {
  tagForUnit: typeof TagForUnit;
  toCardItem: typeof ToCardItem;
  unitLabel: typeof UnitLabel;
};

const migrationName = "20260927180000_nullable_inventory_unit_product";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}.sql`, import.meta.url),
  "utf8"
);
const posAction = readFileSync(new URL("../src/lib/actions/pos.ts", import.meta.url), "utf8");

/** Blok yang menyisipkan unit trade-in, dari `if (v.tradeIn)` sampai sebelum return. */
const tradeInInsert = posAction.slice(
  posAction.indexOf("if (v.tradeIn) {"),
  posAction.indexOf("return t.id;")
);

const unit = (over: Partial<InventoryUnit>): InventoryUnit => ({
  id: 1,
  product_id: 4,
  imei: "352948110293841",
  condition: "second",
  purchase_cost: 1_000_000,
  selling_price: 1_500_000,
  status: "available",
  created_at: "2026-09-27T00:00:00.000Z",
  ...over,
});

test("kolom product_id di inventaris menerima NULL", () => {
  // Yang menentukan nilai apa yang boleh masuk ke kolom trade-in adalah
  // deklarasi Drizzle ini, bukan komentar di migrasi.
  assert.equal(inventoryUnits.productId.name, "product_id");
  assert.equal(inventoryUnits.productId.notNull, false);
});

test("tipe baris database dan unit frontend ikut menerima NULL", () => {
  // Dicek tsc, bukan runtime: kalau product_id dikembalikan jadi number wajib,
  // dua baris di bawah gagal dikompilasi dan mapping read path ikut rusak.
  const row: InventoryUnitRow = {
    id: 1,
    productId: null,
    imei: "352948110293841",
    condition: "second",
    status: "available",
    purchaseCost: "1000000",
    sellingPrice: "1500000",
    createdAt: new Date("2026-09-27T00:00:00.000Z"),
  };
  const fromClient: InventoryUnit = unit({ product_id: null });
  assert.equal(row.productId, null);
  assert.equal(fromClient.product_id, null);
});

test("insert trade-in tidak pernah memakai product_id unit baru", () => {
  assert.ok(tradeInInsert.length > 0, "blok trade-in harus ditemukan di pos.ts");
  assert.match(
    tradeInInsert,
    /productId:\s*null/,
    "unit trade-in harus ditulis tanpa product_id"
  );
  assert.doesNotMatch(
    tradeInInsert,
    /productId:\s*unit\.productId/,
    "menyalin product_id unit baru attaching handset lama ke katalog yang salah"
  );
  // Deskripsi handset lama tetap harus tersimpan: setelah product_id NULL, itu
  // satu-satunya sumber yang benar soal apa yang sebenarnya masuk.
  assert.match(tradeInInsert, /originalBrandModel:\s*v\.tradeIn\.originalBrandModel/);
});

test("migrasi melepas NOT NULL dan menyembunyikan unit tanpa katalog", () => {
  assert.match(
    migration,
    /alter table public\.inventory_units alter column product_id drop not null/i
  );
  // JOIN di view yang menyembunyikan unit trade-in, syaratnya ditulis eksplisit
  // supaya tidak hilang kalau JOIN someday diganti jadi LEFT JOIN.
  assert.match(migration, /create or replace view public\.v_public_inventory/);
  assert.match(migration, /where u\.product_id is not null/i);
  assert.match(migration, /join public\.products p on p\.id = u\.product_id/);
});

test("catatan perbaikan data ada tapi tidak dijalankan diam-diam", () => {
  // Cara mengenali baris salah harus terdokumentasi: join trade_in_records
  // balik ke unit lewat resulting_unit_id, lalu bandingkan model aslinya.
  assert.match(migration, /resulting_unit_id/);
  assert.match(migration, /original_brand_model/);

  // Perbaikannya harus tetap pilihan operator. Statement yang tidak
  // dikomentari akan ikut dijalankan SQL Editor dan ikut tersalin ke project
  // lain lewat RUN-ALL-PENDING.sql.
  const liveStatements = migration
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(update|delete|insert|alter|drop|truncate|create)\b/i.test(line));
  assert.deepEqual(
    liveStatements,
    [
      "alter table public.inventory_units alter column product_id drop not null;",
      "create or replace view public.v_public_inventory",
    ],
    "migrasi hanya boleh mengubah kolom dan view, tidak boleh memperbaiki data"
  );
});

test("tag etalase tidak salah label untuk unit tanpa katalog", () => {
  // Unit trade-in yang terjual akan terkumpul di satu kunci null kalau tidak
  // dikecualikan, lalu setiap kartu tanpa katalog ikut jadi "bestseller" dan
  // satu unit trade-in bisa salah jadi "laststock".
  const sold = unit({ id: 2, product_id: null, status: "sold" });
  const available = unit({ id: 3, product_id: null, status: "available" });
  const all = [sold, available];

  assert.equal(tagForUnit(available, all), undefined);
  assert.equal(tagForUnit(available, []), undefined);
});

test("kartu etalase tetap jalan untuk unit tanpa katalog", () => {
  // toCardItem tidak boleh melempar saat produk tidak ditemukan, dan tidak
  // boleh mengarang label dagangan untuk handset yang tak berkatalog.
  const tradeInUnit = unit({ product_id: null });
  const card = toCardItem(tradeInUnit, [], [tradeInUnit]);
  assert.equal(card.unitId, tradeInUnit.id);
  assert.equal(card.tag, undefined);

  // Unit berkatalog di sebelahnya tetap dapat tagnya seperti biasa, jadi
  // pengecualian tidak mematikan fitur yang sudah jalan.
  const catalogUnits = [
    unit({ id: 10, product_id: 4 }),
    unit({ id: 11, product_id: 4, status: "sold" }),
    unit({ id: 12, product_id: 4, status: "sold" }),
  ];
  assert.equal(tagForUnit(catalogUnits[0], catalogUnits), "bestseller");
});

test("label inventaris memakai model asli unit trade-in", () => {
  // Unit trade-in tidak ada di products, jadi tanpa trade_in_model kolom
  // "Model Handphone" kosong dan staf tidak tahu unit apa yang dilihat.
  const tradeInUnit = unit({ product_id: null, trade_in_model: "Samsung Galaxy S9" });
  assert.equal(unitLabel(tradeInUnit, []), "Samsung Galaxy S9");

  // Katalog tetap menang kalau unitnya memang ada di products.
  const catalogUnit = unit({ product_id: 4 });
  assert.equal(
    unitLabel(catalogUnit, [{ id: 4, brand: "Samsung", model_name: "Galaxy S24" } as never]),
    "Samsung Galaxy S24"
  );

  // Kasus ketiga: tidak ada katalog dan tidak ada data trade-in. Menampilkan
  // teks jujur lebih baik daripada kolom kosong yang terlihat seperti bug.
  assert.equal(unitLabel(unit({ product_id: null }), []), "Model tidak tercatat");
});

test("jalur demo juga menulis product_id null, bukan menyalin katalog unit baru", () => {
  // Demo harus menunjukkan perilaku yang sama dengan live, kalau tidak demo
  // compelled menampilkan bug yang sudah diperbaiki. store.ts tidak bisa
  // diimpor di test node (JSX dan import next/*), jadi yang diperiksa adalah
  // source-nya, mengikuti tests/tracking-safety.test.ts.
  const storeSource = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
  const demoBranch = storeSource.slice(
    storeSource.indexOf("if (params.tradeIn) {"),
    storeSource.indexOf("const newTransaction: Transaction")
  );
  assert.ok(demoBranch.length > 0, "cabang trade-in demo harus ditemukan di store.ts");
  assert.match(demoBranch, /product_id:\s*null/);
  assert.doesNotMatch(demoBranch, /product_id:\s*unit\.product_id/);
  // Label harus ikut ditulis, kalau tidak tabel inventaris demo kolomnya kosong.
  assert.match(demoBranch, /trade_in_model:\s*params\.tradeIn\.originalBrandModel/);
});

test("snapshot portal mengambil label trade-in lewat query terpisah", () => {
  // portal.ts tidak bisa diimpor di test node (import next/*), jadi yang
  // diperiksa adalah source-nya, mengikuti tests/tracking-safety.test.ts.
  const portalSource = readFileSync(
    new URL("../src/lib/actions/portal.ts", import.meta.url),
    "utf8"
  );
  const staffBranch = portalSource.slice(
    portalSource.indexOf("const tradeInLabels = new Map"),
    portalSource.indexOf("const productRows = productsResult.data")
  );
  assert.ok(staffBranch.length > 0, "cabang staf di portal snapshot harus ditemukan");
  // Label harus diambil dari trade_in_records, bukan ditebak dariIMEI.
  assert.match(staffBranch, /\.from\("trade_in_records"\)/);
  assert.match(staffBranch, /original_brand_model/);
  // Ditempelkan ke unit, kalau tidak halaman portal tidak punya apa pun untuk
  // ditampilkan di kolom model.
  assert.match(staffBranch, /trade_in_model:\s*tradeInLabels\.get\(unit\.id\)/);

  // Query terpisah, bukan embed di dalam unitsQuery. Embed akan mengalikan
  // baris inventory_units untuk unit yang punya lebih dari satu trade_in_records
  // (resulting_unit_id tidak punya UNIQUE) dan bisa menggeser urutan created_at.
  const unitsQuery = portalSource.slice(
    portalSource.indexOf('const unitsQuery = supabase'),
    portalSource.indexOf("const transactionsQuery")
  );
  assert.doesNotMatch(unitsQuery, /trade_in_records/);
});
