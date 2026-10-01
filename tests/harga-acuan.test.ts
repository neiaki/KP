import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hargaAcuanLayak, productSchema, productUpdateSchema } from "../src/lib/validations.ts";

/*
 * `default_price` boleh bernilai nol, dan itu bukan kelalaian.
 *
 * Produk hasil tukar tambah sering belum punya harga acuan karena angkanya
 * harus diisi staf yang tahu, dan tidak ada yang boleh mengarangnya. Nol berarti
 * "belum dikonfirmasi", bukan "harga Rp0". Aturan itu dulu hidup inline di
 * dalam komponen React, jadi tidak ada satu pun test yang bisa mengunci
 * `< 0`: satu karakter yang berubah menjadi `<= 0` lolos tanpa apa pun yang
 * memberitahu, dan gejalanya persis bug yang sudah pernah terjadi, yaitu
 * produk tanpa harga mustahil disimpan dari portal sehingga satu-satunya jalan
 * memperbaikinya adalah SQL.
 *
 * Test di sini mengunci dua sisi sekaligus. Sisi fungsi lewat
 * hargaAcuanLayak, sisi form lewat pembacaan sumber, karena formnya tidak bisa
 * diimpor ke runner test. Keduanya harus agreeing: kalau form kembali
 memeriksa inline dengan aturan berbeda, test kedua akan menangkapnya.
 */

const formSrc = readFileSync(
  new URL("../src/app/(portal)/portal/products/page.tsx", import.meta.url),
  "utf8"
);

/* Test 1: nol harus tetap lolos, dan tidak hanya pada 0 persis. */
test("harga acuan nol tetap sah, karena artinya belum dikonfirmasi", () => {
  for (const sah of [0, 1, 1000, 5_999_000, 999_999_999_999]) {
    assert.ok(
      hargaAcuanLayak(sah),
      `${sah} harusnya sah sebagai harga acuan, termasuk 0 yang berarti belum dikonfirmasi`
    );
  }

  // 0 harus lolos lewat skema juga, bukan hanya lewat fungsi form. Kalau
  // skema ikut menolak nol, produk id 11 tidak bisa disimpan dari mana pun.
  const hasil = productSchema.safeParse({
    brand: "Apple",
    model_name: "iPhone 14 Plus",
    default_price: 0,
  });
  assert.ok(
    hasil.success,
    `schema produk menolak default_price 0: ${hasil.success ? "" : hasil.error.issues[0]?.message}`
  );
  assert.equal(hasil.success && hasil.data.default_price, 0);
});

/* Test 2: negatif dan bukan-number finite tetap ditolak. */
test("harga acuan negatif dan nilai bukan angka tetap ditolak", () => {
  for (const buruk of [-1, -1000, -999_999_999_999, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(
      hargaAcuanLayak(buruk),
      false,
      `${String(buruk)} tidak punya makna sebagai harga acuan, jadi harus ditolak`
    );
  }

  // Bentuk yang mungkin masuk dari input form atau JSON, bukan dari number
  // bertipe. String kosong adalah hasil paling nyata: Number("") = 0, dan
  // bentuk-bentuk string lain akan dikembalikan apa adanya oleh fungsi ini
  // supaya tidak ada yang lolos lewat jalan samping.
  for (const bukanNumber of ["", "abc", "1000", null, undefined, {}, [], true]) {
    assert.equal(
      hargaAcuanLayak(bukanNumber),
      false,
      `${JSON.stringify(bukanNumber)} bukan number, jadi tidak boleh dianggap harga`
    );
  }

  const hasil = productSchema.safeParse({
    brand: "Apple",
    model_name: "iPhone 14 Plus",
    default_price: -1,
  });
  assert.ok(!hasil.success, "schema produk harus menolak default_price negatif");

  const hasilUpdate = productUpdateSchema.safeParse({ default_price: -1 });
  assert.ok(!hasilUpdate.success, "schema update produk harus menolak default_price negatif");
});

/*
 * Test 3: form portal benar-benar memakai fungsi itu.
 *
 * Tanpa test ini, fungsi hargaAcuanLayak bisa saja benar-benar tidak pernah
 * dipanggil, dan penjagaan di form kembali jadi versi inline yang tidak
 * teruji. Yang dicek hanya pemanggilannya, bukan alur lengkap form.
 */
test("form portal memakai hargaAcuanLayak, bukan penjagaan inline sendiri", () => {
  assert.ok(
    formSrc.includes('from "@/lib/validations"'),
    "form produk harus mengimpor hargaAcuanLayak dari lib/validations"
  );
  assert.ok(
    formSrc.includes("!hargaAcuanLayak(defaultPrice)"),
    "form produk harus memanggil hargaAcuanLayak(defaultPrice)"
  );

  // Bentuk inline yang dulu ada. Kalau muncul lagi, ada dua sumber kebenaran
  // dan hanya salah satu yang teruji.
  for (const pola of [
    /Number\.isFinite\(defaultPrice\)/,
    /defaultPrice\s*<\s*0/,
    /defaultPrice\s*<=\s*0/,
  ]) {
    assert.ok(
      !pola.test(formSrc),
      `form produk masih punya penjagaan inline (${pola}). Aturan harus satu sumber di hargaAcuanLayak.`
    );
  }
});

/*
 * Test 4: sisi baca etalase tetap menyembunyikan baris harga saat nol.
 *
 * Dua aturan ini harus tetap live bersamaan. Sisi tulis mengizinkan 0 supaya
 * produk tanpa harga bisa disimpan, sisi baca menyembunyikan baris harga supaya
 * "Rp0" tidak pernah tayang ke pembeli. Kalau salah satu hilang, produk tanpa
 * harga akan tampil dengan baris "Perkiraan harga saat unitnya masuk Rp0",
 * yang terbaca seperti barang seharga nol.
 */
test("harga acuan 0 tetap bisa ditulis tanpa pernah tampil sebagai Rp0", async () => {
  const { referencePriceNote, referencePriceOf } = await import(
    "../src/lib/catalogue-notify.ts"
  );

  assert.equal(
    referencePriceOf(0),
    undefined,
    "sisi baca harus memperlakukan 0 sebagai belum ada harga, bukan harga Rp0"
  );
  assert.equal(
    referencePriceNote(0, "id"),
    null,
    "baris harga harus hilang, bukan menuliskan Rp0"
  );

  // Hanya angka nol yang punya perlakuan khusus. Harga asli tetap tampil utuh.
  assert.equal(referencePriceOf(5_999_000), 5_999_000);
  assert.ok(referencePriceNote(5_999_000, "id")?.includes("Rp"));
});

/*
 * Test 5: form tambah model tidak boleh mem-prefill harga tebasan.
 *
 * Bug ini sudah pernah terjadi dan tidak ketahuan oleh empat test di atas.
 * `handleOpenAdd` mengisi `setDefaultPrice(10000000)`, jadi staf yang membuka
 * form, mengetik nama model, lalu menyimpan tanpa menyentuh field harga akan
 * menyimpan Rp10.000.000 sebagai harga acuan unit yang tidak pernah ia harga.
 *
 * Yang membuatnya lolos adalah dua hal yang bertumpuk. Aturan di server
 * mengizinkan nol, jadi prefill angka tebasan tidak ditolak, dan sisi baca
 * etalase hanya menyembunyikan baris harga saat nilainya nol, jadi hasil
 * karangan itu justru tampil penuh seperti harga biasa di halaman publik.
 *
 * Test ini membaca body `handleOpenAdd` dan `handleOpenEdit` secara terpisah.
 * Versi pertama yang hanya cari `setDefaultPrice(` terlalu longgar dan ikut
 * menangkap `onChange`, jadi testnya hijau tanpa pernah menyentuh prefill.
 */
test("form tambah model mulai dari harga kosong, bukan angka tebasan", () => {
  const bodyOf = (nama: string): string => {
    const mulai = formSrc.indexOf(`const ${nama} = `);
    assert.notEqual(mulai, -1, `produk portal harus punya ${nama}`);
    const selesai = formSrc.indexOf("\n  };", mulai);
    assert.notEqual(selesai, -1, `body ${nama} tidak ditemukan utuh`);
    return formSrc.slice(mulai, selesai);
  };

  const tambah = bodyOf("handleOpenAdd");
  const ubah = bodyOf("handleOpenEdit");

  // Prefill harus nol, persis seperti useState di awal komponen.
  assert.ok(
    /setDefaultPrice\(\s*0\s*\)/.test(tambah),
    "handleOpenAdd harus prefill setDefaultPrice(0), karena 0 berarti belum diisi"
  );

  // Setiap angka selain nol di prefill adalah karangan harga.
  const angkaLain = tambah.match(/setDefaultPrice\(\s*([0-9_]+)\s*\)/g) ?? [];
  for (const kemunculan of angkaLain) {
    const angka = kemunculan.replace(/[^\d]/g, "");
    assert.equal(
      angka,
      "0",
      `handleOpenAdd mem-prefill ${kemunculan}. Angka selain nol di prefill adalah harga yang dikarang.`
    );
  }

  // Form ubah tetap memakai harga tersimpan, bukan tebakan.
  assert.ok(
    /setDefaultPrice\(\s*p\.default_price\s*\)/.test(ubah),
    "handleOpenEdit harus memakai p.default_price, bukan angka tetap"
  );

  // Penjaga yang sama harus berlaku di kedua form: nol sah, negatif tidak.
  assert.ok(!/setDefaultPrice\(\s*10000000\s*\)/.test(formSrc));
});