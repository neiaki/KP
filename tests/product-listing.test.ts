import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Halaman Etalase & Harga (/portal/listing) dan action updateProductListing.
 *
 * Latar: model katalog yang belum menerima unit tampil ke pembeli dengan
 * harga acuan dan "Foto menyusul". Admin sudah bisa mengeditnya lewat Master
 * Produk; sales sebelumnya tidak punya jalur apa pun. Permintaan pemilik
 * (24 Oktober 2026): sales ikut boleh memperbarui harga dan gambar model itu.
 *
 * Yang dikunci di sini adalah batasnya. Memberi sales akses edit produk
 * seutuhnya berarti memberi hak mengubah merek, nama model, dan status aktif
 * katalog — bukan itu yang diminta. Action wajib:
 *   1. guard admin+sales (bukan admin saja, bukan teknisi),
 *   2. hanya menulis default_price dan official_images,
 *   3. tidak menulis brand, model_name, specs, second_images, is_active.
 * Pembatasan peran yang sama ada di RLS (products_sales_update), yang
 * dijaga tests/run-all-pending.test.ts lewat daftar migrasi.
 */

const action = readFileSync(
  new URL("../src/lib/actions/products.ts", import.meta.url),
  "utf8"
);

test("updateProductListing terbuka untuk admin dan sales, bukan teknisi", () => {
  const mulai = action.indexOf("export async function updateProductListing");
  assert.ok(mulai > -1, "aksi updateProductListing harus ada");
  const badan = action.slice(mulai, action.indexOf("export async function", mulai + 1));
  assert.ok(
    badan.includes('requireRole(["admin", "sales"])'),
    "guard harus admin+sales"
  );
  assert.ok(
    !badan.includes('"technician"'),
    "teknisi tidak boleh masuk guard etalase"
  );
  assert.ok(badan.includes("requireWriteAccess()"), "gerbang tulis wajib ada");
});

test("updateProductListing hanya menulis harga acuan dan foto resmi", () => {
  const mulai = action.indexOf("export async function updateProductListing");
  const badan = action.slice(mulai, action.indexOf("export async function", mulai + 1));
  const setBlok = badan.slice(badan.indexOf(".set("), badan.indexOf(".where("));
  assert.ok(setBlok.includes("defaultPrice"), "harga acuan harus ditulis");
  assert.ok(setBlok.includes("officialImages"), "foto resmi harus ditulis");
  for (const terlarang of ["brand", "modelName", "specs", "secondImages", "isActive"]) {
    assert.ok(
      !setBlok.includes(terlarang),
      `kolom identitas katalog ${terlarang} tidak boleh ditulis oleh aksi etalase`
    );
  }
});

test("halaman listing memanggil dispatcher store, bukan action langsung", () => {
  const page = readFileSync(
    new URL("../src/app/(portal)/portal/listing/page.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(
    page.includes("updateProductListing, currentRole"),
    "halaman mengambil dispatcher dari useStore"
  );
  assert.ok(
    !page.includes("@/lib/actions/products"),
    "halaman tidak boleh mengimpor server action langsung"
  );
  const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
  assert.ok(
    store.includes("updateProductListingAction(id,"),
    "dispatcher meneruskan ke server action di mode live"
  );
});

test("aksi etalase memakai schema khusus, bukan schema produk penuh", () => {
  const mulai = action.indexOf("export async function updateProductListing");
  const badan = action.slice(mulai, action.indexOf("export async function", mulai + 1));
  assert.ok(
    badan.includes("productListingSchema.safeParse"),
    "aksi etalase wajib memvalidasi dengan productListingSchema"
  );
  assert.ok(
    !badan.includes("productUpdateSchema"),
    "aksi etalase tidak boleh memakai schema update penuh milik admin"
  );
});
