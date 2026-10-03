import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Repo ini publik, jadi LICENSE dan SECURITY.md bukan hiasan.
 *
 * Tanpa LICENSE, hak cipta berlaku penuh secara default. Orang
 * boleh membaca dan menjalankan, tapi tidak boleh menyalin,
 *modify, atau memakainya. Itu bukan open source, dan itu bukan
 * hal yang bisa ditebak pembaca dari tampilan repo.
 *
 * Tanpa SECURITY.md, tidak ada kanal yang jelas untuk melaporkan
 * kerentanan, dan ISSUE publik adalah cara terburuk untuk
 * menjelaskan kerentanan yang baru saja ditemukan.
 *
 * Test ini menjaga keduanya tetap ada dan tetap konsisten dengan
 * package.json, supaya tidak bisa hilang atau berbeda diam-diam.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

function baca(rel: string): string {
  try {
    return readFileSync(`${root}${rel}`, "utf8");
  } catch {
    return "";
  }
}

const packageJson = JSON.parse(baca("package.json") || "{}") as {
  license?: string;
};

test("LICENSE ada di root repo", () => {
  const isi = baca("LICENSE");
  assert.ok(
    isi.length > 0,
    "LICENSE tidak ada di root. Repo publik tanpa LICENSE berarti " +
      "hak cipta penuh, bukan open source."
  );
});

test("LICENSE yang dipakai adalah MIT dan utuh", () => {
  const isi = baca("LICENSE");
  // Daftar frasa pendek tidak cukup: menghapus satu klausa saja,
  // misalnya Responsibilities, tetap lolos. Jadi seluruh teks MIT
  // dipakai acuan, bukan cuma beberapa penanda.
  // Baris panjang di bawah adalah teks MIT verbatim, jadi tidak
  // ditulis ulang agar hemat kolom. Tidak masalah: kedua sisi
  // dirapikan dulu, jadi pemenggalan baris di sini tidak
  // berpengaruh pada perbandingan.
  const MIT_LENGKAP = [
    "MIT License",
    "",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    "of this software and associated documentation files (the \"Software\"), to deal",
    "in the Software without restriction, including without limitation the rights",
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
    "copies of the Software, and to permit persons to whom the Software is",
    "furnished to do so, subject to the following conditions:",
    "",
    "The above copyright notice and this permission notice shall be included in all",
    "copies or substantial portions of the Software.",
    "",
    "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
    "SOFTWARE.",
  ].join("\n");
  const rapikan = (teks: string) => teks.replace(/\s+/g, " ").trim();
  const target = rapikan(isi);

  // Baris copyright dikecualikan karena isinya berbeda per pemilik.
  const wajib = MIT_LENGKAP.split("\n")
    .map(rapikan)
    .filter((baris) => baris.length > 0 && !baris.startsWith("Copyright"));
  const hilang = wajib.filter((baris) => !target.includes(baris));
  assert.deepEqual(
    hilang,
    [],
    `LICENSE bukan MIT yang utuh. ` +
      `Bagian yang hilang: ${hilang.join(", ")}`
  );
});

test("package.json dan LICENSE menyebut lisensi yang sama", () => {
  const isi = baca("LICENSE");
  assert.equal(
    packageJson.license,
    "MIT",
    "package.json harus menyebut lisensi yang sama dengan LICENSE"
  );
  assert.ok(
    isi.includes("MIT License"),
    "LICENSE di root bukan MIT, tapi package.json menyebut MIT"
  );
});

test("LICENSE mencantumkan pemilik hak cipta", () => {
  const isi = baca("LICENSE");
  const hakCipta = isi.match(/Copyright \(c\) (\d{4}) (.+)/);
  assert.ok(
    hakCipta,
    "LICENSE harus punya baris 'Copyright (c) <tahun> <pemilik>'"
  );
  assert.match(
    hakCipta[1],
    /^\d{4}$/,
    `tahun tidak sah: ${hakCipta[1]}`
  );
  assert.ok(hakCipta[2].trim().length > 0, "pemilik hak cipta kosong");
});

test("SECURITY.md ada dan menyebut kanal pelaporan", () => {
  const isi = baca("SECURITY.md");
  assert.ok(isi.length > 0, "SECURITY.md tidak ada di root repo");
  const kanal = isi.toLowerCase();
  assert.ok(
    kanal.includes("report a vulnerability") ||
      kanal.includes("private advisory"),
    "SECURITY.md harus menyebut kanal pelaporan yang tidak publik. " +
      "Issue publik adalah cara terburuk melaporkan kerentanan."
  );
  assert.ok(
    kanal.includes("kerentanan") || kanal.includes("vulnerab"),
    "SECURITY.md harus menjelaskan apa yang dilaporkan"
  );
});

test("SECURITY.md dan LICENSE tidak punya karakter rusak", () => {
  // Berkas ini dibaca orang dari luar tim, jadi teksnya harus
  // benar. Karakter CJK atau Cyrillic yang nyasar biasanya
  // penulisan yang gagal, dan enak disalahartikan.
  const rusak = /[\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/;
  for (const rel of ["LICENSE", "SECURITY.md"]) {
    const isi = baca(rel);
    const baris = isi
      .split("\n")
      .map((teks, i) => ({ teks, i: i + 1 }))
      .filter(({ teks }) => rusak.test(teks));
    assert.deepEqual(
      baris.map((b) => b.i),
      [],
      `${rel} punya karakter CJK atau Cyrillic di baris ` +
        `${baris.map((b) => b.i).join(", ")}`
    );
  }
});
