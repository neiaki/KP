import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SECOND_PRICE_RATIO,
  isPriceAutoSeeded,
  misleadingSecondPriceWarning,
  resolvePriceOnConditionChange,
  suggestedSellingPrice,
} from "../src/lib/unit-pricing.ts";

/*
 * Cacat: unit second bisa tayang dengan harga yang sama persis dengan harga
 * baru produknya.
 *
 * Rantainya: form registrasi batch mengisi `sellingPrice` dari
 * `default_price` produk tiap kali produk berganti (inventory/page.tsx, blok
 * `lastPricedProductId !== activeProductId`). Setelah itu kondisi diubah ke
 * seken tanpa menurunkan harga, jadi `selling_price` tetap sama dengan
 * `default_price`.
 *
 * Di etalase (src/lib/shop.ts) angka "Barunya" pada unit second diambil dari
 * `product.default_price`. Dua angka identik berdampingan, dan pelanggan
 * membaca diskon rusak. Di sisi toko, unit itu bisa terjual dengan margin nol.
 *
 * Aturan yang diuji di sini: harga hanya diturunkan kalau field-nya masih
 * berisi angka yang diisi form secara otomatis. Angka yang diketik staf itu
 * niat dan tidak boleh ditimpa diam-diam.
 *
 * Logikanya murni dan tidak menyentuh React, jadi diuji langsung tanpa
 * browser. Bagian terakhir mengunci bahwa form benar-benar memakai aturan ini
 * dan bukan logika inline yang bisa kembali menyimpang.
 */

const NEW_PRICE = 12_000_000;

test("saran harga seken selalu di bawah harga baru produk", () => {
  // Syarat ketat yang menutup cacat: berapa pun harga barunya, saran tidak
  // pernah menyentuh atau melampaui harga baru.
  for (const newPrice of [
    100_000, 250_000, 500_000, 1_050_000, 3_500_000, 9_999_000, 12_000_000,
    25_000_000, 99_500_000,
  ]) {
    const suggestion = suggestedSellingPrice("second", newPrice);
    assert.ok(
      suggestion < newPrice,
      `saran ${suggestion} harus di bawah harga baru ${newPrice}`
    );
  }
});

test("saran mengikuti rasio yang ditentukan dan dibulatkan ke kelipatan bersih", () => {
  assert.equal(suggestedSellingPrice("second", NEW_PRICE), 9_600_000);
  assert.equal(suggestedSellingPrice("second", 3_500_000), 2_800_000);
  // Saran untuk unit baru sama saja dengan harga baru produk, tanpa diskon.
  assert.equal(suggestedSellingPrice("new", NEW_PRICE), NEW_PRICE);
  // Harga baru yang tidak masuk akal tidak menghasilkan saran palsu.
  assert.equal(suggestedSellingPrice("second", 0), 0);
  assert.equal(suggestedSellingPrice("new", -1), 0);
});

test("harga yang diketik staf tidak pernah ditimpa saat kondisi diganti", () => {
  // Staf mengetik 9 juta di atas seed 12 juta. Menukar kondisi ke seken tidak
  // boleh bergerakkan angka itu, hanya saran yang boleh muncul.
  const staffTyped = resolvePriceOnConditionChange({
    condition: "second",
    currentPrice: 9_000_000,
    seededPrice: NEW_PRICE,
    newPrice: NEW_PRICE,
  });
  assert.equal(staffTyped.nextPrice, 9_000_000, "angka staf harus utuh");
  assert.equal(staffTyped.applied, false, "tidak boleh ada penulisan otomatis");
  assert.equal(staffTyped.keptStaffPrice, true);
  assert.equal(staffTyped.suggestion, 9_600_000, "saran tetap dihitung untuk ditampilkan");

  // Seed null berarti form belum pernah menurunkan harga, jadi angka di field
  // pasti dari staf dan juga tidak boleh ditimpa.
  const noSeedYet = resolvePriceOnConditionChange({
    condition: "second",
    currentPrice: 8_500_000,
    seededPrice: null,
    newPrice: NEW_PRICE,
  });
  assert.equal(noSeedYet.nextPrice, 8_500_000);
  assert.equal(noSeedYet.applied, false);
});

test("harga yang masih otomatis diturunkan ulang saat kondisi jadi seken", () => {
  // Ini akar cacatnya: field masih berisi 12 juta yang diisi form, jadi harus
  // ikut turun ke harga seken. Tanpa baris ini unit tayang di harga baru.
  const untouched = resolvePriceOnConditionChange({
    condition: "second",
    currentPrice: NEW_PRICE,
    seededPrice: NEW_PRICE,
    newPrice: NEW_PRICE,
  });
  assert.equal(untouched.applied, true);
  assert.equal(untouched.keptStaffPrice, false);
  assert.equal(untouched.nextPrice, 9_600_000);
  assert.ok(untouched.nextPrice < NEW_PRICE);

  // Menukar kondisi bolak-balik dengan field yang tidak disentuh harus
  // bolak-balik juga, tidak boleh meninggalkan harga basi di tengah.
  const backToNew = resolvePriceOnConditionChange({
    condition: "new",
    currentPrice: untouched.nextPrice,
    seededPrice: untouched.nextPrice,
    newPrice: NEW_PRICE,
  });
  assert.equal(backToNew.applied, true);
  assert.equal(backToNew.nextPrice, NEW_PRICE);
});

test("field harga yang kosong diperlakukan sebagai belum disentuh", () => {
  const empty = resolvePriceOnConditionChange({
    condition: "second",
    currentPrice: 0,
    seededPrice: 0,
    newPrice: NEW_PRICE,
  });
  assert.equal(empty.applied, true);
  assert.equal(empty.nextPrice, 9_600_000);
  assert.equal(isPriceAutoSeeded(0, 0), true);
  assert.equal(isPriceAutoSeeded(0, null), false, "tanpa seed, angka 0 bukan milik form");
});

test("peringatan menyala saat unit seken dihargai sama atau lebih mahal dari harga baru", () => {
  const equal = misleadingSecondPriceWarning({
    condition: "second",
    sellingPrice: NEW_PRICE,
    newPrice: NEW_PRICE,
  });
  assert.ok(equal, "harga sama dengan harga baru harus diperingatkan");
  assert.match(equal, /diskonnya rusak/);

  // Lebih mahal dari harga baru juga salah, bukan cuma sama.
  assert.ok(
    misleadingSecondPriceWarning({
      condition: "second",
      sellingPrice: NEW_PRICE + 1,
      newPrice: NEW_PRICE,
    })
  );

  // Harga di bawah harga baru sudah benar, tidak boleh diganggu.
  assert.equal(
    misleadingSecondPriceWarning({
      condition: "second",
      sellingPrice: 9_600_000,
      newPrice: NEW_PRICE,
    }),
    null
  );
  // Unit baru tidak punya harga coret, jadi tidak ada yang menyesatkan.
  assert.equal(
    misleadingSecondPriceWarning({
      condition: "new",
      sellingPrice: NEW_PRICE,
      newPrice: NEW_PRICE,
    }),
    null
  );
});

/*
 * Test sebelumnya hanya memeriksa bahwa peringatan MENYALA saat harga lebih
 * mahal, bukan apa yang tertulis di dalamnya. Karena itu kalimat yang selalu
 * berbunyi "sama dengan" lolos: penjaganya benar, kalimatnya berboh.
 * Test ini mengunci isi kalimatnya untuk kedua kasus.
 */
test("peringatan menulis 'sama dengan' hanya saat harganya memang sama", () => {
  const samaDengan = misleadingSecondPriceWarning({
    condition: "second",
    sellingPrice: NEW_PRICE,
    newPrice: NEW_PRICE,
  });
  assert.ok(samaDengan);
  assert.match(samaDengan, /sama dengan harga baru produknya/);
  assert.doesNotMatch(samaDengan, /lebih mahal dari/);

  // Kasus yang tadinya bocor: harga di atas harga baru tetap menyalakan
  // peringatan, tapi kalimatnya tidak boleh menyatakan sama dengan.
  const lebihMahal = misleadingSecondPriceWarning({
    condition: "second",
    sellingPrice: NEW_PRICE + 500_000,
    newPrice: NEW_PRICE,
  });
  assert.ok(lebihMahal, "harga di atas harga baru harus tetap diperingatkan");
  assert.match(lebihMahal, /lebih mahal dari harga baru produknya/);
  assert.doesNotMatch(
    lebihMahal,
    /sama dengan/,
    "harga di atas harga baru tidak boleh disebut sama dengan harga baru"
  );
  // "Dua angka sama persis" juga hanya benar di kasus sama. Di atas harga baru
  // pelanggan justru melihat unit seken lebih mahal dari barang baru.
  assert.doesNotMatch(lebihMahal, /dua angka sama persis/);
  assert.match(lebihMahal, /lebih mahal dari barang baru/);
  // Ajuran penutupnya sama untuk kedua kasus, jadi tidak hilang saat dipecah.
  assert.match(lebihMahal, /diskonnya rusak/);
  assert.match(lebihMahal, /Turunkan sedikit di bawah harga baru/);
});

test("unit trade-in tanpa katalog tidak pernah ikut aturan diskon", () => {
  // pos.ts mendaftarkan unit hasil tukar tambah dengan productId null, jadi
  // tidak punya default_price pembanding. Jalur itu tidak boleh ikut aturan
  // ini dan tidak boleh diperingatkan.
  assert.equal(
    misleadingSecondPriceWarning({ condition: "second", sellingPrice: 1_250_000, newPrice: 0 }),
    null
  );
  assert.equal(suggestedSellingPrice("second", 0), 0);
});

test("form inventaris memakai aturan ini, bukan logika inline", () => {
  const page = readFileSync(
    new URL("../src/app/(portal)/portal/inventory/page.tsx", import.meta.url),
    "utf8"
  );

  // Penurunan harga harus lewat resolver, bukan setSellingPrice melompat-lompat.
  assert.match(page, /import \{\s*isPriceAutoSeeded,[\s\S]*?\} from "@\/lib\/unit-pricing"/);
  assert.match(
    page,
    /const handleBatchConditionChange = \(next: UnitCondition\) => \{[\s\S]*?resolvePriceOnConditionChange\(\{/,
    "perubahan kondisi harus lewat resolvePriceOnConditionChange"
  );
  assert.match(
    page,
    /handleBatchConditionChange\(e\.target\.value as UnitCondition\)/,
    "select kondisi harus memanggil handler itu, bukan setBatchCondition telanjang"
  );

  // Seed lama hanya mengingat produk, dan itulah akar cacatnya: tidak ada yang
  // tahu harga di field masih milik form atau sudah diketik staf.
  assert.match(page, /setSeededSellingPrice\(catalogNewPrice\)/);
  assert.match(page, /const priceIsAutoSeeded = isPriceAutoSeeded\(/);

  // Saran harus terlihat ke staf dan bisa dipakai, tidak diam-diam dipakai.
  assert.match(page, /Saran harga seken \{formatIDR\(priceSuggestion\)\}/);
  assert.match(page, /onClick=\{applyPriceSuggestion\}/);
  assert.match(page, /const applyPriceSuggestion = \(\) => \{/);

  // Peringatan harus benar-benar dirender, bukan cuma dihitung.
  assert.match(page, /\{secondPriceWarning && \(/);
  assert.match(
    page,
    /<span>\{secondPriceWarning\}<\/span>/,
    "teks peringatan harus masuk ke layar, bukan hanya ada di variabel"
  );

  // Peringatan juga harus muncul di dialog koreksi, bukan hanya di form batch.
  assert.match(page, /\{editingWarning && \(/);
});

test("etalase tetap memakai harga coret dari default_price, jadi aturannya tidak diubah diam-diam", () => {
  // shop.ts bukan milik perubahan ini. Kalau ia nanti ikut diubah, peringatan
  // di atas akan kehilangan arti karena tidak ada lagi harga coret.
  const shop = readFileSync(new URL("../src/lib/shop.ts", import.meta.url), "utf8");
  assert.match(
    shop,
    /newPrice:[\s\S]{0,120}unit\.condition === "second"[\s\S]{0,120}referencePriceOf\(product\?\.default_price\)/,
    "harga coret etalase harus tetap default_price produk"
  );
  assert.equal(SECOND_PRICE_RATIO, 0.8, "rasio saran adalah keputusan yang diuji");
});
