import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Snapshot publik harus bisa menjawab satu pertanyaan yang tidak bisa
 * dijawab dari isinya sendiri: produk mana yang pernah punya unit.
 *
 * v_public_inventory memfilter status = 'available', jadi unit sold dan
 * in_service tidak pernah sampai ke browser. Padahal kedua status itu
 * menentukan label yang tampil di etalase: produk yang unitnya sudah terjual
 * bukan "belum ada unit", dan produk yang sedang diservis juga bukan.
 *
 * Siklus yang pernah terjadi: etalase menampilkan iPhone 13 128GB di
 * bagian "model tanpa unit" padahal produk itu sudah terjual dua unit, karena
 * satu-satunya data unit yang diterima browser adalah unit available. Test di
 * bawah mengunci bahwa penanda itu benar-benar dikirim, dan mengunci bahwa
 * yang dikirim tetap hanya product_id.
 *
 * getPublicSnapshot tidak bisa diimpor di sini (berkas "use server" dengan
 * drizzle), jadi yang diuji adalah bentuk query dan pemetaannya di sumbernya.
 */

const isi = readFileSync(
  new URL("../src/lib/actions/public.ts", import.meta.url),
  "utf8"
);
const shop = readFileSync(new URL("../src/lib/shop.ts", import.meta.url), "utf8");
const types = readFileSync(
  new URL("../src/types/index.ts", import.meta.url),
  "utf8"
);

test("snapshot menandai produk yang pernah punya unit", () => {
  // Query-nya harus membaca seluruh tabel inventory_units, bukan view yang
  // sudah difilter. Kalau ikut memakai v_public_inventory, penandanya
  // tautologis: view itu hanya berisi unit available, jadi produk yang
  // semuanya sold akan ditandai "belum pernah punya unit" lagi.
  assert.match(
    isi,
    /selectDistinct\(\{ productId: inventoryUnitsTable\.productId \}\)[\s\S]*?\.from\(inventoryUnitsTable\)/,
    "penanda harus dihitung dari tabel inventory_units, bukan dari view publik"
  );
  // product_id null adalah unit trade-in tanpa katalog, dan tidak boleh
  // membuat produk mana pun ditandai punya unit.
  assert.match(isi, /where\(isNotNull\(inventoryUnitsTable\.productId\)\)/);
  assert.match(isi, /if \(row\.productId !== null\) pernahPunyaUnit\.add/);
});

test("penanda diisi untuk setiap produk yang dikirim ke browser", () => {
  // Dua jalur membuat produk: dari tabel products dan dari baris view. Keduanya
  // wajib mengisi penanda, kalau tidak produk yang hanya muncul lewat view
  // akan kembali ke jalur cadangan yang menghitung unit di tangan.
  const kemunculan = isi.match(/pernah_punya_unit:/g) ?? [];
  assert.ok(
    kemunculan.length >= 2,
    `pernah_punya_unit harus diisi di kedua jalur pembuatan produk, dapat ${kemunculan.length}`
  );
});

test("yang dikirim ke browser tetap hanya product_id", () => {
  // Pertanyaan "pernah punya unit" dijawab dengan satu angka. Kalau query ini
  // ikut menarik kolom lain, data itu ikut ke browser dan guard ini tidak
  // bisa bergantung pada niat saja.
  assert.doesNotMatch(
    isi,
    /from\(inventoryUnitsTable\)[\s\S]{0,200}?(imei|purchaseCost|purchase_cost|sellingPrice|condition)/i,
    "query penanda tidak boleh menarik kolom unit selain product_id"
  );
  // Unit yang dikirim ke browser tetap purchase_cost 0 dan IMEI tersensor.
  assert.match(isi, /purchase_cost: 0/);
  assert.match(isi, /imei: `\*\*\*\*\$\{item\.imeiTail\}`/);
});

test("tipe Product menyatakan penandanya sebagai opsional", () => {
  // Opsional karena portal dan mode demo tidak mengisinya: keduanya
  // melihat seluruh unit jadi tidak butuh. Wajib ada di tipe supaya halaman
  // publik tidak bisa lupa mengirimnya tanpa error.
  assert.match(types, /pernah_punya_unit\?: boolean;/);
});

test("helper etalase membaca penanda, bukan hanya unit yang terlihat", () => {
  // Kalau listProductsWithoutUnits tetap menghitung unit di tangan, produk
  // yang semua unitnya sold akan masuk kelompok ini lagi, karena browser tidak
  // pernah menerima unit sold.
  assert.match(shop, /export function pernahPunyaUnit\(/);
  assert.match(
    shop,
    /if \(typeof product\.pernah_punya_unit === "boolean"\) \{\s*return product\.pernah_punya_unit;/
  );
  assert.match(shop, /return products\.filter\(\(p\) => !pernahPunyaUnit\(p, allUnits\)\)/);
});

test("produk yang tersedia tidak pernah masuk kelompok stok habis", () => {
  // Stok habis berarti pernah ada dan sekarang tidak. Produk yang masih punya
  // unit available bukan stok habis, dan tidak boleh muncul di dua bagian.
  assert.match(shop, /export function listSoldOutProducts\(/);
  assert.match(shop, /adaYangBisaDijual = new Set\([\s\S]*?status === "available"/);
  assert.match(shop, /pernahPunyaUnit\(p, allUnits\) && !adaYangBisaDijual\.has\(p\.id\)/);
});
