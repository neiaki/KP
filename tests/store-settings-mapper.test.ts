import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * mapStoreSettings di src/lib/actions/_mappers.ts pernah tidak memetakan
 * owner_name sama sekali. Akibatnya berlapis dan tidak ada yang terlihat
 * salah di layar: form portal/settings selalu tampil kosong untuk kolom
 * nama, widget live chat selalu jatuh ke "Admin At Cell", dan setiap
 * penyimpanan menulis balik string kosong ke database.
 *
 * Test ini membaca berkas sumbernya langsung, bukan mengimpornya. Modul
 * _mappers mengimpor "@/db/schema" yang tidak bisa di-resolve runner node,
 * jadi pola yang dipakai sama dengan tests/migration-safety.test.ts:
 * isi berkas dibaca sebagai teks lalu strukturnya dikunci.
 */

const root = fileURLToPath(new URL("../", import.meta.url));

function badanMapStoreSettings(): string {
  const isi = readFileSync(`${root}src/lib/actions/_mappers.ts`, "utf8");
  const mulai = isi.indexOf("export function mapStoreSettings");
  assert.ok(mulai !== -1, "mapStoreSettings tidak ditemukan di _mappers.ts");
  const akhir = isi.indexOf("\n}\n", mulai);
  assert.ok(akhir !== -1, "akhir mapStoreSettings tidak ditemukan");
  return isi.slice(mulai, akhir);
}

test("mapStoreSettings meneruskan owner_name dari baris database", () => {
  const badan = badanMapStoreSettings();
  assert.match(
    badan,
    /owner_name\s*:\s*row\.ownerName/,
    "mapStoreSettings harus memetakan owner_name dari row.ownerName"
  );
});

test("mapStoreSettings tetap meneruskan kontak toko", () => {
  // Penjaga arah sebaliknya: perbaikan owner tidak boleh mengorbankan
  // kolom yang sudah benar.
  const badan = badanMapStoreSettings();
  assert.match(badan, /phone_number\s*:\s*row\.phoneNumber/);
  assert.match(badan, /whatsapp_number\s*:\s*row\.whatsappNumber/);
});
