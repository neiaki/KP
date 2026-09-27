import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

/*
 * README.md punya langkah "Jalankan migration berikut" yang pernah menyebut
 * 20260925142137_align_schema_contract.sql, padahal berkas itu tidak pernah
 * ada dengan nama itu (yang sebenarnya 0004_align_schema_contract.sql).
 *
 * tests/deployment-runbook.test.ts sudah menjaga hal yang sama untuk
 * docs/DEPLOYMENT-REDUNDANCY.md. README tidak dijaga, jadi kelas cacat yang
 * sama masih bisa muncul lagi di sana tanpa apa pun yang gagal.
 *
 * README sengaja tidak didokumentasikan sebagai daftar per berkas, karena
 * daftar itu akan basi setiap kali migrasi baru masuk. Yang dijaga di sini
 * hanya dua hal yang tidak bisa slebet: tidak ada nama migrasi palsu yang
 * disebut, dan semua migrasi yang disebut itu benar-benar ada.
 */

const MIGRASI = "supabase/migrations";

async function namaMigrasi(): Promise<string[]> {
  const isi = await readdir(MIGRASI);
  return isi.filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Ambil nama berkas migrasi yang disebut di sebuah dokumen.
 *
 * Hanya pola yang memang bentuk nama berkas migrasi: prefiks digit (urutan
 * atau timestamp) lalu garis bawah. Ini membuat test tidak ikut menandai kata
 * biasa yang kebetulan mengandung "sql".
 */
function migrasiYangDisebut(teks: string): string[] {
  const hasil = new Set<string>();
  for (const cocok of teks.matchAll(/\b\d{4,}[a-z0-9_]*_[a-z0-9_]+\.sql\b/g)) {
    hasil.add(cocok[0]);
  }
  return [...hasil].sort();
}

const readme = await readFile("README.md", "utf8");
const ada = await namaMigrasi();

test("README tidak menyebut nama berkas migrasi yang tidak ada", () => {
  const palsu = migrasiYangDisebut(readme).filter((f) => !ada.includes(f));
  assert.deepEqual(
    palsu,
    [],
    `README.md menyebut migrasi yang tidak ada di ${MIGRASI}: ${palsu.join(", ")}`
  );
});

test("README mengarahkan operator ke daftar migrasi yang lengkap", () => {
  // Kalau someday README mau mencantumkan daftar per berkas lagi, test ini
  // akan gagal dan memaksa penulis menyinkronkan ulang. Itu memang
  // yang kita mau: daftar yang sengaja dikelola, bukan
  // disalin dan ditinggalkan.
  assert.match(
    readme,
    /Jalankan seluruh berkas di `supabase\/migrations\/`/,
    "README harus menyuruh menjalankan seluruh berkas di supabase/migrations/, bukan menyalin sebagian daftar"
  );
  assert.match(
    readme,
    /docs\/DEPLOYMENT-REDUNDANCY\.md/,
    "README harus menunjuk ke docs/DEPLOYMENT-REDUNDANCY.md sebagai sumber urutan migrasi"
  );
});

test("test ini benar-benar menangkap nama migrasi yang salah", () => {
  // Penjaga terhadap test yang diam-diam tidak akan pernah gagal. Kalau regex
  // atau filter di atas rusak, kelas bug yang asli (salah nama) akan lolos
  // tanpa terdeteksi.
  const contohPalsu = "jalankan 20260925142137_align_schema_contract.sql";
  const contohBenar = "jalankan 0004_align_schema_contract.sql";
  const difilterPalsu = migrasiYangDisebut(contohPalsu).filter((f) => !ada.includes(f));
  const difilterBenar = migrasiYangDisebut(contohBenar).filter((f) => !ada.includes(f));

  assert.deepEqual(difilterPalsu, ["20260925142137_align_schema_contract.sql"]);
  assert.deepEqual(difilterBenar, []);
});
