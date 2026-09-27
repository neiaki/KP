import test from "node:test";
import assert from "node:assert/strict";
import { cleanWaNumber, FALLBACK_WA_NUMBER } from "../src/lib/wa.ts";

/*
 * cleanWaNumber melindungi satu hal: link wa.me tidak boleh pernah menunjuk
 * ke nomor mati.
 *
 * Insiden nyata yang menyetumkan fungsi ini: store_settings.whatsapp_number
 * berisi angka contoh 081234567890, bukan nomor asli. Karena kolom itu terisi,
 * nilai cadangan di kode tidak pernah dipakai, dan halaman publik menghasilkan
 * https://wa.me/081234567890. WhatsApp tidak mengenali format nomor lokal
 * tanpa kode negara, jadi setiap pelanggan yang menekan tombol itu tidak sampai
 * ke mana pun, tanpa ada error yang terlihat di server mana pun.
 *
 * Karena itu setiap format yang mungkin diketik staf harus menghasilkan link
 * yang benar. Kalau angka contoh itu masuk lagi lewat portal settings, test ini
 * yang menangkapnya.
 */

const EWA = "6285775398389";

test("nomor lokal Indonesia dinormalkan ke format internasional", () => {
  // 08xx adalah format yang dipakai orang Indonesia dan juga format yang paling
  // sering diketik ke kolom WhatsApp di portal settings.
  assert.equal(cleanWaNumber("081234567890"), "6281234567890");
  assert.equal(cleanWaNumber("0812-3456-7890"), "6281234567890");
  // Nomor landline diawali 0 juga, jadi bukan 62.
  assert.equal(cleanWaNumber("0211234567"), "62211234567");
});

test("nomor yang sudah internasional dipakai apa adanya", () => {
  assert.equal(cleanWaNumber(EWA), EWA);
  assert.equal(cleanWaNumber("+62 857-7539-8389"), EWA);
  assert.equal(cleanWaNumber("62 857-7539-8389"), EWA);
  assert.equal(cleanWaNumber("(62) 857-7539-8389"), EWA);
});

test("nomor tanpa prefix 0 maupun 62 tetap mendapat kode negara", () => {
  assert.equal(cleanWaNumber("85775398389"), EWA);
  assert.equal(cleanWaNumber("857-7539-8389"), EWA);
});

test("prefix operator internasional 00 dan 011 dibuang", () => {
  // 0062... yang tidak dibuang akan jadi 620628..., diawali 62 sehingga lolos
  // pemeriksaan format tapi menunjuk ke nomor yang tidak pernah ada.
  assert.equal(cleanWaNumber("00628123456789"), "628123456789");
  assert.equal(cleanWaNumber("0116285775398389"), EWA);
  // Angka di awal yang bukan 00 atau 011 harus tetap utuh.
  assert.equal(cleanWaNumber("081234567890"), "6281234567890");
});

test("nomor kosong, null, dan undefined jatuh ke nomor cadangan", () => {
  // Falls through ini yang mencegah <a href="https://wa.me/"> tanpa nomor.
  assert.equal(cleanWaNumber(""), FALLBACK_WA_NUMBER);
  assert.equal(cleanWaNumber(null), FALLBACK_WA_NUMBER);
  assert.equal(cleanWaNumber(undefined), FALLBACK_WA_NUMBER);
  // Kolom yang terisi spasi atau tanda baca saja dianggap tidak diisi.
  assert.equal(cleanWaNumber("   "), FALLBACK_WA_NUMBER);
  assert.equal(cleanWaNumber("- - +"), FALLBACK_WA_NUMBER);
});

test("hasil normalisasi selalu aman untuk URL wa.me", () => {
  const inputs = [
    "081234567890",
    "0812-3456-7890",
    "+62 857-7539-8389",
    "85775398389",
    "00628123456789",
    "",
    null,
    undefined,
  ];
  for (const input of inputs) {
    const result = cleanWaNumber(input);
    assert.match(result, /^\d+$/, `harus hanya angka untuk input ${JSON.stringify(input)}`);
    assert.ok(
      result.startsWith("62"),
      `harus diawali 62 untuk input ${JSON.stringify(input)}, dapat ${result}`
    );
  }
});
