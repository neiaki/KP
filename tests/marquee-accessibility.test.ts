import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Marquee berjalan lebih dari 5 detik, jadi WCAG 2.2.2 menuntut mekanisme
 * jeda yang bisa dipakai tanpa hover. Tes ini menjaga tiga jalur:
 *   1. tombol jeda eksplisit dengan aria-pressed di kedua marquee,
 *   2. jeda saat hover dan saat fokus keyboard,
 *   3. prefers-reduced-motion benar-benar mematikan animasi.
 *
 * Tes ini membaca sumber karena marquee dirender di client dan bergantung
 * pada kelas CSS; menjalankan browser sungguhan tidak tersedia di suite Node.
 */

const baca = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("brand marquee punya tombol jeda dan fokus keyboard menjeda", async () => {
  const sumber = await baca("src/components/public/brand-marquee.tsx");
  assert.match(sumber, /MarqueePauseButton/, "brand marquee wajib memakai tombol jeda");
  assert.match(sumber, /paused=\{paused\}/, "state jeda harus diteruskan ke tombol");
  assert.match(
    sumber,
    /group-focus-within:\[animation-play-state:paused\]/,
    "fokus keyboard di dalam marquee harus menjeda animasi"
  );
  assert.match(sumber, /motion-reduce:animate-none/, "prefers-reduced-motion harus mematikan animasi");
});

test("review marquee punya tombol jeda dan fokus keyboard menjeda", async () => {
  const sumber = await baca("src/components/public/reviews-section.tsx");
  assert.match(sumber, /MarqueePauseButton/, "review marquee wajib memakai tombol jeda");
  assert.match(sumber, /paused=\{paused\}/, "state jeda harus diteruskan ke tombol");
  assert.match(
    sumber,
    /group-focus-within:\[animation-play-state:paused\]/,
    "fokus keyboard di dalam marquee harus menjeda animasi"
  );
  assert.match(sumber, /motion-reduce:animate-none/, "prefers-reduced-motion harus mematikan animasi");
});

test("tombol jeda mengekspos status ke pembaca layar", async () => {
  const sumber = await baca("src/components/public/marquee-pause-button.tsx");
  assert.match(sumber, /aria-pressed=\{paused\}/, "status jeda harus diumumkan");
  assert.match(sumber, /aria-label=/, "tombol ikon wajib punya nama aksesibel");
  assert.match(sumber, /<Pause\b/, "ikon jeda wajib ada");
  assert.match(sumber, /<Play\b/, "ikon lanjutkan wajib ada");
});

test("CSS global mematikan animasi dan transisi di prefers-reduced-motion", async () => {
  const css = await baca("src/app/globals.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css, /transition-duration:\s*0\.01ms\s*!important/);
});
