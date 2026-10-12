import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Halaman error dan 404 adalah halaman tanpa store: tidak ada
 * store_settings yang bisa dibaca, dan keduanya boleh diprerender. Akibatnya
 * tombol WA di dalamnya tidak punya akses ke nomor sungguhan.
 *
 * Yang dulu terjadi: kartu bantuan memakai cleanWaNumber() tanpa argumen,
 * yaitu angka cadangan sintetis 6280000000000. Ada satu tempat di etalase
 * live yang tetap menerbitkan wa.me/6280000000000 karena ini, dan tombol itu
 * mengarah ke nomor mati. Angka sintetis yang tampil sebagai nomor toko lebih
 * buruk daripada tidak ada tombol, jadi komponen sekarang tidak menampilkan
 * tombolnya sama sekali.
 *
 * Penjaga ini membaca teks berkas seperti tests/locale-not-found-boundary:
 * berkas .tsx tidak bisa diimpor runner node.
 */

const ERROR_STATE = new URL("../src/components/error-state.tsx", import.meta.url);

test("ErrorState tidak memakai angka cadangan untuk tombol WA", async () => {
  const isi = await readFile(ERROR_STATE, "utf8");
  assert.doesNotMatch(
    isi,
    /cleanWaNumber\(\)/,
    "cleanWaNumber() tanpa argumen menghasilkan angka sintetis, dan itu pernah terbit sebagai nomor toko"
  );
  assert.doesNotMatch(
    isi,
    /6280000000000/,
    "angka sintetis tidak boleh muncul di komponen ini"
  );
});

test("tombol WA hanya dirender kalau nomornya ada", async () => {
  const isi = await readFile(ERROR_STATE, "utf8");
  assert.ok(
    isi.includes("WA_NUMBER: string | null = null"),
    "halaman error memang tidak punya nomor sungguhan, itu yang harus dinyatakan eksplisit"
  );
  assert.ok(
    /waHref \?/.test(isi),
    "tautan WA wajib bersyarat, tanpa itu href kosong tetap bisa dirender"
  );
  assert.match(
    isi,
    /\{waHref \? \([\s\S]*?Chat WA toko[\s\S]*?\) : null\}/,
    "tombolnya sendiri wajib di dalam percabangan yang sama"
  );
});
