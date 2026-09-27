import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attemptWithRetry, pesanError } from "../src/lib/retry.ts";

/*
 * Percobaan ulang pembacaan snapshot dijaga karena tanpa itu satu balapan
 * antara dua pembacaan pertama membuat etalase kosong tanpa tanda kesalahan
 * yang terlihat dari halaman.
 * Efeknya bukan halaman error, melainkan halaman yang tetap tampil dengan
 * "0 unit ada di toko" dan jam buka, telepon, serta alamat kosong, jadi tidak
 * ada yang realizes dari sisi pengunjung.
 *
 * Yang dijaga:
 *
 * 1. Hasil berhasil tidak kena penundaan. Penundaan hanya ada di jalur gagal.
 * 2. Percobaan kedua benar-benar menunggu event loop bergerak. Kalau hanya
 *    diulang di tick yang sama, balapan cache kolom array Drizzle terulang
 *    persis seperti sebelumnya dan tidak pernah membaik.
 * 3. Batas percobaan dipatuhi dan galat terakhir diteruskan apa adanya, bukan
 *    diganti pesan baru yang menyembunyikan penyebabnya.
 */

test("pembacaan yang berhasil tidak pernah ditunda", async () => {
  let panggil = 0;
  const hasil = await attemptWithRetry(async () => {
    panggil += 1;
    return "snapshot";
  });
  assert.equal(hasil.ok, true);
  assert.equal(panggil, 1, "tidak boleh ada percobaan kedua kalau pertama berhasil");
  if (hasil.ok) assert.equal(hasil.value, "snapshot");
});

test("percobaan kedua menunggu event loop bergerak, bukan hanya microtask", async () => {
  // Sambarannya ditirukan: cache kolom baru terisi di macrotask pertama, jadi
  // pembacaan kedua harus lewat macrotask juga. Kalau attemptWithRetry langsung
  // mengulang tanpa menunggu, pengaman ini gagal dan bug aslinya kembali.
  let cacheTerisi = false;
  setTimeout(() => {
    cacheTerisi = true;
  }, 0);

  let panggil = 0;
  const hasil = await attemptWithRetry(
    async () => {
      panggil += 1;
      if (!cacheTerisi) throw new TypeError("Cannot read properties of undefined (reading 'map')");
      return "snapshot setelah ulangan";
    },
    { waitMs: 5 }
  );

  assert.equal(hasil.ok, true, "percobaan kedua harus berhasil");
  assert.equal(panggil, 2, `harus tepat dua kali dipanggil, dapat ${panggil}`);
  if (hasil.ok) assert.equal(hasil.value, "snapshot setelah ulangan");
});

test("percobaan dibatasi dan galat terakhir diteruskan", async () => {
  const urutGalat: string[] = [];
  const hasil = await attemptWithRetry(
    async () => {
      const pesan = `percobaan ${urutGalat.length + 1}`;
      urutGalat.push(pesan);
      throw new Error(pesan);
    },
    { attempts: 3, waitMs: 1 }
  );
  assert.equal(hasil.ok, false);
  assert.equal(urutGalat.length, 3, "jumlah percobaan harus sama dengan batasnya");
  if (!hasil.ok) {
    assert.ok(hasil.error instanceof Error);
    assert.equal(hasil.error.message, "percobaan 3", "galat terakhir harus diteruskan");
  }
});

test("batas satu percobaan berarti tanpa ulangan sama sekali", async () => {
  let panggil = 0;
  const hasil = await attemptWithRetry(
    async () => {
      panggil += 1;
      throw new Error("gagal terus");
    },
    { attempts: 1, waitMs: 1 }
  );
  assert.equal(hasil.ok, false);
  assert.equal(panggil, 1, "attempts 1 tidak boleh mengulang");
});

test("batas percobaan tidak valid tetap menghasilkan nilai yang bisa dipakai", async () => {
  // Nilai tidakValid bisa datang dari environment. Tanpa penjaga, pemanggil
  // dapat hasil yang isinya error undefined dan tidak pernah tahu kenapa.
  let panggil = 0;
  const hasil = await attemptWithRetry(
    async () => {
      panggil += 1;
      return "snapshot";
    },
    { attempts: 0 }
  );
  assert.equal(hasil.ok, true);
  assert.equal(panggil, 1);
});

test("pesan galat diteruskan kalau ada, cadangan dipakai kalau tidak ada", () => {
  assert.equal(
    pesanError(new Error("Katalog sedang tidak dapat dimuat. Coba lagi sebentar."), "cadangan"),
    "Katalog sedang tidak dapat dimuat. Coba lagi sebentar.",
    "pesan dari action harus sampai ke staf apa adanya"
  );
  // TypeError dari balapan cache kolom tidak punya pesan yang layak dibaca.
  assert.equal(pesanError(new TypeError("x is not a function"), "cadangan"), "x is not a function");
  assert.equal(pesanError(new Error("   "), "cadangan"), "cadangan", "pesan kosong pakai cadangan");
  assert.equal(pesanError("bukan Error", "cadangan"), "cadangan");
  assert.equal(pesanError(undefined, "cadangan"), "cadangan");
});

/*
 * Test di bawah membaca berkas. Fungsi getPublicSnapshot tidak bisa diimpor di
 * sini karena berkas itu memakai "use server" dan drizzle, jadi penjaga yang
 * bisa diuji adalah sumbernya: selama attemptWithRetry masih dipanggil di
 * dalamnya, etalase tidak diam-diam turun jadi kosong.
 */
test("getPublicSnapshot memakai percobaan ulang, bukan gagal langsung", async () => {
  const isi = await readFile(new URL("../src/lib/actions/public.ts", import.meta.url), "utf8");
  assert.match(isi, /attemptWithRetry\(\(\) => bacaSnapshot\(db\)\)/);
  // Jalur gagal lama: Promise.all yang ditelan diam-diam tanpa mengulang.
  assert.ok(
    !/\)\)\s*\.catch\(\(\) => null\)/.test(isi),
    "pola catch(() => null) pada snapshot berarti gagal tanpa percobaan ulang"
  );
  // Snapshot kosong harus tetap menghasilkan pesan, bukan objek tanpa isinya.
  assert.match(isi, /fail\(pesanError\(hasil\.error, PESAN_GAGAL_SNAPSHOT\)\)/);
});
