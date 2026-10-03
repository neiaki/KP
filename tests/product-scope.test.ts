import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * At Cell adalah toko ponsel. Tidak ada tukar tambah laptop,
 * tidak ada katalog tablet, dan tidak ada produk smartwatch.
 *
 * Negatif ini pernah hilang begitu saja. Satu catatan penguji
 * yang ambigu berbunyi "kondisi laptop harga berubah (planing)"
 * dibaca literal, lalu diubah jadi dokumen fitur laptop
 * tersendiri lengkap dengan lampiran data dan tiga pertanyaan
 * untuk owner. Padahal PRD dan requirement tidak pernah
 * menyebut laptop sama sekali, dan tidak ada satu baris kode
 * pun yang menyentuhnya.
 *
 * Test ini menahanEsoyen.-product keywords hanya boleh muncul
 * pada baris yang tercatat terbuka di PENGECUALIAN, jadi
 * pemakaian baru harus diputuskan sadar, bukan lolos diam.
 */

const KATA_LUAR_CAKUPAN = /\b(laptop|tablet|smartwatch)\b/gi;

// Per berkas, frasa yang boleh muncul pada baris pemakai kata.
// Nilai di sini adalah pemakaian sah, bukan celah baru.
const PENGECUALIAN: Record<string, string[]> = {
  "docs/README.md": [
    "kondisi laptop harga berubah",
    "laptop",
    "tentuan tentang laptop",
    "fitur laptop yang pernah ada",
  ],
  "docs/COOLIFY-PANEL.md": ["browser laptop"],
  "src/app/(portal)/portal/dashboard/page.tsx": ["768px tablet"],
  "src/components/public/navbar.tsx": ["dari tablet"],
  "tests/supabase-key-precedence.test.ts":
    ["shell laptop"],
};

const DIRI_SENDIRI = "tests/product-scope.test.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

const terlacak = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString()
  .split("\0")
  .filter((p) => p && p !== DIRI_SENDIRI);

/*
 * Menghapus setiap frasa yang diizinkan dari baris, supaya kata produk
 * yang tidak ikut tercakup frasa itu masih bisa ditemukan.
 *
 * Panjang baris hasil Always sama dengan baris asal, jadi nomor baris
 * yang dilaporkan tetap benar.
 */
function frasa_terhapus(teks: string, boleh: string[]): string {
  let sisa = teks;
  for (const frasa of boleh) {
    if (!frasa) continue;
    for (let at = sisa.indexOf(frasa); at !== -1;
         at = sisa.indexOf(frasa, at + 1)) {
      sisa =
        sisa.slice(0, at) +
        " ".repeat(frasa.length) +
        sisa.slice(at + frasa.length);
    }
  }
  return sisa;
}

test("tidak ada produk luar fokus ponsel di repo", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    let isi: string;
    try {
      isi = readFileSync(`${root}${rel}`, "utf8");
    } catch {
      continue;
    }
    if (isi.includes("\0")) continue;
    const boleh = PENGECUALIAN[rel] ?? [];
    isi.split("\n").forEach((teks, i) => {
      // Pengecualian berlaku pada frasa yang tercatat, bukan pada
      // seluruh baris. Kalau hanya dicek "baris ini memuat frasa yang
      // diizinkan", satu baris yang sudah benar bisa menyelundupkan
      // kata produk lain: "browser laptop dan smartwatch" akan lolos
      // hanya karena memuat "browser laptop".
      //
      // Jadi frasa yang diizinkan dihapus lebih dulu dari baris, lalu
      // kata produk yang tersisa yang diperiksa.
      const sisa = frasa_terhapus(teks, boleh);
      const cocok = [...sisa.matchAll(KATA_LUAR_CAKUPAN)].map((m) =>
        m[1].toLowerCase()
      );
      if (cocok.length === 0) return;
      const kata = [...new Set(cocok)].join(", ");
      bermasalah.push(`${rel}:${i + 1} ${kata}`);
    });
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `kata produk di luar fokus toko tidak boleh masuk. ` +
      `At Cell hanya ponsel. Kalau memang perlu, catat di ` +
      `PENGECUALIAN dengan alasan: ${bermasalah.join(", ")}`
  );
});

test("daftar pengecualian benar-benar masih dipakai", () => {
  // Kalau frasa di PENGECUALIAN sudah tidak ada di mana pun,
  // daftar itu jadi Sampah dan mengelabui pembaca test.
  const laporan = new Map<string, string>();
  for (const rel of Object.keys(PENGECUALIAN)) {
    let isi: string;
    try {
      isi = readFileSync(`${root}${rel}`, "utf8");
    } catch {
      continue;
    }
    laporan.set(rel, isi);
  }
  const takDipakai: string[] = [];
  for (const [rel, frasa] of Object.entries(PENGECUALIAN)) {
    for (const f of frasa) {
      if (laporan.get(rel)?.includes(f) !== true) {
        takDipakai.push(`${rel}: "${f}"`);
      }
    }
  }
  assert.deepEqual(
    takDipakai.sort(),
    [],
    `frasa ini sudah tidak dipakai, hapus dari PENGECUALIAN: ` +
      `${takDipakai.join(", ")}`
  );
});
