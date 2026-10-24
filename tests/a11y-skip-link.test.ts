import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Skip link ke konten utama wajib ada di layout publik.
 *
 * Tanpa ini, pengguna keyboard harus menekan Tab melewati seluruh tautan
 * navbar sebelum sampai ke konten. Audit aksesibilitas 25 Oktober 2026:
 * satu-satunya celah terukur di halaman publik (alt, lang, 1 h1, label form,
 * Escape lightbox semuanya sudah benar). Test ini menjaga agar link dan
 * targetnya tidak hilang diam-diam lewat refactor layout.
 */

const layout = readFileSync(
  new URL("../src/app/(public)/[locale]/layout.tsx", import.meta.url),
  "utf8"
);

test("layout publik punya skip link ke id konten utama", () => {
  assert.match(layout, /href="#konten-utama"/, "tautan lewati-ke-konten wajib menunjuk #konten-utama");
});

test("target skip link adalah elemen main", () => {
  assert.match(
    layout,
    /<main[^>]*id="konten-utama"/,
    "main wajib memuat id konten-utama sebagai target skip link"
  );
});

test("skip link tersembunyi sampai difokuskan", () => {
  assert.match(layout, /sr-only[^\n]*focus:not-sr-only/, "pola sr-only + focus:not-sr-only menjaga tata letak");
});

test("label skip link dua bahasa", () => {
  assert.match(layout, /Skip to main content/, "label EN wajib ada");
  assert.match(layout, /Lewati ke konten utama/, "label ID wajib ada");
});
