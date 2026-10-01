import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Docket "publikasi tanpa stok" untuk staf hanya hidup kalau bagian-bagiannya
 * benar-benar nyambung: form portal harus menjelaskan konsekuensinya, etalase
 * harus jujur soal harga dan tombolnya, dan dokumen staf harus menyebut label
 * form yang benar-benar ada di komponen.
 *
 * Dua dari tiga hal di sini tidak bisa diuji perilaku, karena kodenya hidup di
 * komponen React dan suite ini berjalan tanpa DOM. Test di bawah mengunci
 * bentuknya secara struktural: memindai sumber komponen. Ini sengaja, mengikuti
 * cara tests yang sudah ada di repo untuk hal yang sama. Yang dijaga adalah
 * teks dan urutan blok yang salah akan langsung terlihat di UI.
 */

const src = new URL("../src/", import.meta.url);
const baca = (rel: string) => readFileSync(new URL(rel, src), "utf8");

const productsPage = baca("app/(portal)/portal/products/page.tsx");
const catalogContent = baca("app/(public)/[locale]/catalog/catalog-content.tsx");
const landingContent = baca("app/(public)/[locale]/landing-content.tsx");
const staffDoc = readFileSync(
  new URL("../docs/PUBLIKASI-MODEL-TANPA-STOK.md", import.meta.url),
  "utf8"
);

const PUBLIK = [catalogContent, landingContent];

/* -------------------------------------------------------------------------- */
/* Form portal                                                                */
/* -------------------------------------------------------------------------- */

/** Isi form produk, dari tag form sampai tag penutupnya. */
function isiFormProduk(): string {
  const mulai = productsPage.indexOf("onSubmit={handleSubmit}");
  const selesai = productsPage.indexOf("</form>", mulai);
  assert.ok(mulai > 0 && selesai > mulai, "form produk tidak ditemukan di halaman Master Produk");
  return productsPage.slice(mulai, selesai);
}

test("form produk menjelaskan apa yang terjadi kalau modelnya tanpa unit", () => {
  const form = isiFormProduk();
  // Narasi konsekuensi harus ada di dalam form, bukan di halaman lain: staf
  // membacanya sambil mengisi, bukan sesudah menutup dialog.
  assert.match(form, /Kalau unitnya belum ada, model ini tetap tampil di etalase/);
  assert.match(form, /Belum ada unit/);
  assert.match(form, /Minta dikabari/);
});

test("form produk tidak mengarahkan staf ke foto stok pihak ketiga", () => {
  // images.unsplash.com ada di DUMMY_HOSTS src/lib/shop.ts karena foto model
  // yang tidak cocok dengan produknya pernah dipakai. Placeholder yang menunjuk
  // host itu mengajak staf mengulang kesalahan yang sama. Pola /products/...
  // juga dilarang karena tests/public-assets.test.ts menganggapnya rujukan ke
  // berkas yang harus benar-benar ada di public/.
  assert.doesNotMatch(productsPage, /unsplash/i);
  assert.doesNotMatch(productsPage, /placeholder="\/products\//);
  assert.match(productsPage, /Pakai foto resmi model ini/);
});

test("form produk menyebut tiga akibat yang paling sering dikira staf", () => {
  const form = isiFormProduk();
  // Tampil di etalase dengan badge, tidak dihitung di headline beranda, dan
  // tidak bisa dijual di kasir.
  assert.match(form, /unit ada di toko/);
  assert.match(form, /Kasir POS/);
  assert.match(form, /Inventaris Unit IMEI/);
});

test("kartu produk menandai model yang belum punya unit sama sekali", () => {
  assert.match(productsPage, /Belum ada unit, tampil di etalase/);
  // Angka di bawah harus dihitung dari peta unit, bukan angka tetap. Kalau
  // cuma dekorasi, kartu jadi berbohong sendiri soal berapa model yang belum
  // punya unit.
  assert.match(
    productsPage,
    /const productsWithoutUnit = products\.filter\(\(p\) => !unitCountByProductId\.has\(p\.id\)\)\.length;/
  );
  assert.match(productsPage, /\{productsWithoutUnit\} belum ada unit/);
});

test("form produk tidak mengarahkan staf ke foto stok pihak ketiga", () => {
  // images.unsplash.com ada di DUMMY_HOSTS src/lib/shop.ts karena foto model
  // yang tidak cocok dengan produknya pernah dipakai. Placeholder yang
  // menunjuk host itu mengajak staf mengulang kesalahan yang sama. Pola
  // placeholder="/products/..." juga dilarang karena
  // tests/public-assets.test.ts menganggapnya rujukan berkas yang harus ada.
  assert.doesNotMatch(productsPage, /unsplash/i);
  assert.doesNotMatch(productsPage, /placeholder="\/products\//);
  assert.match(productsPage, /Pakai foto resmi model ini/);
});

/* -------------------------------------------------------------------------- */
/* Etalase publik                                                             */
/* -------------------------------------------------------------------------- */

test("kedua halaman publik memakai satu sumber copy untuk model tanpa unit", () => {
  // Bukan sekadar memanggil helper-nya: kalau komponen menimpa hasilnya,
  // katalog dan beranda bisa diam-diam tampil beda lagi.
  for (const source of PUBLIK) {
    assert.match(source, /const noUnitCopy = noUnitSectionCopy\(locale\);/);
    assert.match(source, /noUnitCopy\.badge/);
  }
});

test("tombol Minta dikabari dibangun oleh helper yang menyebut model", () => {
  for (const source of PUBLIK) {
    assert.match(source, /buildNotifyMeHref\(\{/);
    assert.match(source, /notifyMeTargetFrom\(p\)/);
  }
  // String pesan yang ditulis tangan di dalam komponen bisa keluar dari sync
  // dengan modul pengujinya, jadi pola itu tidak boleh ada lagi di halaman.
  for (const source of PUBLIK) {
    assert.doesNotMatch(source, /kabari saya kalau \$\{p\.brand\}/);
  }
});
test("kartu model tanpa unit tidak menulis default_price sebagai harga jual", () => {
  for (const source of PUBLIK) {
    assert.match(source, /referencePriceNote\(p\.default_price, locale\)/);
    assert.match(source, /noUnitCopy\.priceCaveat/);
    assert.doesNotMatch(source, /\{formatIDR\(p\.default_price\)\}/);
  }
});

test("kartu model tanpa unit menyembunyikan tombol kalau modelnya tidak bernama", () => {
  for (const source of PUBLIK) {
    assert.match(source, /\{target && \(/);
  }
});

/* -------------------------------------------------------------------------- */
/* Dokumen staf                                                               */
/* -------------------------------------------------------------------------- */

/** Label yang dipakai dokumen dan harus benar-benar ada di komponen. */
const LABEL_FORM_PRODUK = [
  "Tambah Model Produk Baru",
  "Merek Handphone",
  "Nama Seri / Model",
  "Harga Acuan Dasar (Rp)",
  "Spesifikasi Utama",
  "URL Foto Produk",
  "Tambahkan Model",
  "Simpan Perubahan",
  "Belum ada unit",
];

const LABEL_FORM_INVENTARIS = [
  "Inventaris Unit IMEI",
  "Registrasi Batch IMEI",
  "Pilih Katalog Produk Master",
  "Kondisi Fisik",
  "Harga Modal / Beli (Rp)",
  "Harga Jual Toko (Rp)",
  "Daftar Nomor IMEI 15 Digit (Pisahkan per baris)",
  "Kasir POS & Trade-In",
];

test("dokumen staf memakai label form yang benar-benar ada", () => {
  const inventaris = baca("app/(portal)/portal/inventory/page.tsx");
  const sidebar = baca("components/portal/portal-sidebar.tsx");
  for (const label of [...LABEL_FORM_PRODUK, ...LABEL_FORM_INVENTARIS]) {
    assert.ok(
      staffDoc.includes(label),
      `docs/PUBLIKASI-MODEL-TANPA-STOK.md tidak menyebut label "${label}"`
    );
  }
  for (const label of [...LABEL_FORM_PRODUK, ...LABEL_FORM_INVENTARIS.slice(1)]) {
    assert.ok(
      productsPage.includes(label) ||
        inventaris.includes(label) ||
        sidebar.includes(label),
      `label "${label}" disebut di dokumen tapi tidak ada di komponen mana pun`
    );
  }
});

test("dokumen staf menjelaskan jalan tanpa mengarang IMEI", () => {
  assert.match(staffDoc, /IMEI asli/);
  assert.match(staffDoc, /mengarang nomor IMEI/);
  // Tidak boleh ada contoh IMEI sepanjang 15 digit di dokumen: staf akan
  // menyalinnya ke form registrasi batch dan itu jadi nomor palsu.
  assert.doesNotMatch(staffDoc, /\b\d{15}\b/);
});

test("label field di portal dan di dokumen tidak boleh terpisah jauh", () => {
  // Penjaga arah sebaliknya: kalau nama field diganti di portal, dokumen ini
  // harus ikut diperbarui, bukan diam-diam popol.
  assert.match(productsPage, /label\s*\n?\s*htmlFor="product-model"/);
  assert.ok(staffDoc.includes("Nama Seri / Model"));
});
