import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  finalPaymentAmount,
  secondHandSellingPrice,
  SECOND_HAND_MARKUP,
} from "../src/lib/pricing.ts";

/*
 * Harga jual unit second dan sisa bayar nota adalah aturan uang yang dipakai
 * di tiga tempat: aksi POS (live), mesin demo, dan halaman kasir. Test ini
 * mengunci dua hal: rumusnya sendiri, dan fakta bahwa ketiga tempat itu
 * benar-benar memakai modul ini alih-alih menyalin rumusnya kembali.
 *
 * Salinan yang melenceng tidak menggagalkan apa pun sendirinya: nota demo
 * akan menagih angka berbeda dari nota live, dan itu cuma terlihat kalau ada
 * yang membandingkan dua nota secara manual.
 */

test("markup unit second membulatkan ke rupiah utuh", () => {
  assert.equal(SECOND_HAND_MARKUP, 1.25);
  assert.equal(secondHandSellingPrice(350000), 437500);
  // 333.333 x 1,25 = 416.666,25 -> harus bulat, bukan pecahan.
  assert.equal(secondHandSellingPrice(333333), 416666);
  assert.equal(secondHandSellingPrice(0), 0);
});

test("sisa bayar tidak pernah negatif", () => {
  assert.equal(finalPaymentAmount(1000000, 400000), 600000);
  assert.equal(finalPaymentAmount(1000000, 1000000), 0);
  // Nilai tukar tambah melebihi harga unit: toko tidak menerbitkan nota minus.
  assert.equal(finalPaymentAmount(500000, 900000), 0);
});

test("tiga pemakai memakai modul pricing, bukan salinan rumus", () => {
  const berkas = [
    "src/lib/actions/pos.ts",
    "src/lib/store-demo.ts",
    "src/app/(portal)/portal/pos/page.tsx",
  ];
  for (const relatif of berkas) {
    const sumber = readFileSync(new URL(`../${relatif}`, import.meta.url), "utf8");
    assert.match(
      sumber,
      /from "(?:@\/lib\/pricing|\.\/pricing\.ts)"/,
      `${relatif} harus memakai src/lib/pricing.ts`
    );
    assert.doesNotMatch(
      sumber,
      /\*\s*1\.25/,
      `${relatif} tidak boleh menulis markup 1,25 sendiri`
    );
    assert.doesNotMatch(
      sumber,
      /Math\.max\(0,\s*[A-Za-z_.]+ - [A-Za-z_.]+\)/,
      `${relatif} tidak boleh menulis clamp sisa bayar sendiri`
    );
  }
});
