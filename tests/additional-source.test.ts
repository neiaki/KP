import test from "node:test";
import assert from "node:assert/strict";
import { loadAdditionalSource } from "../src/lib/actions/_additional-source.ts";

/*
 * Sumber tambahan di getPortalSnapshot, yaitu etalase publik untuk customer
 * dan pengaturan toko, dibaca terpisah dari query utama. Kalau salah satunya
 * melempar error, seluruh snapshot tidak boleh ikut gagal dengan error mentah
 * yang tidak bisa ditampilkan. Tes ini mengunci tiga perilaku:
 *
 * 1. Hasil sukses diteruskan apa adanya.
 * 2. Error yang sudah berbentuk ActionResult tidak diganti pesan cadangan.
 * 3. Loader yang melempar error memakai pesan cadangan.
 */

test("sumber tambahan yang berhasil diteruskan apa adanya", async () => {
  const hasil = await loadAdditionalSource(
    async () => ({ ok: true as const, data: { jumlah: 3 } }),
    "cadangan"
  );

  assert.equal(hasil.ok, true);
  if (hasil.ok) assert.deepEqual(hasil.data, { jumlah: 3 });
});

test("error dari sumber tambahan tidak diganti pesan cadangan", async () => {
  const hasil = await loadAdditionalSource(
    async () => ({ ok: false as const, error: "Pengaturan toko belum siap." }),
    "cadangan"
  );

  assert.equal(hasil.ok, false);
  if (!hasil.ok) assert.equal(hasil.error, "Pengaturan toko belum siap.");
});

test("loader yang melempar error memakai pesan cadangan", async () => {
  const hasil = await loadAdditionalSource(
    async () => {
      throw new Error("koneksi putus");
    },
    "Gagal memuat data portal."
  );

  assert.equal(hasil.ok, false);
  if (!hasil.ok) assert.equal(hasil.error, "Gagal memuat data portal.");
});

test("loader yang melempar nilai bukan Error tetap tertangkap", async () => {
  const hasil = await loadAdditionalSource(
    async () => {
      throw "bukan error";
    },
    "Gagal memuat pengaturan toko."
  );

  assert.equal(hasil.ok, false);
  if (!hasil.ok) assert.equal(hasil.error, "Gagal memuat pengaturan toko.");
});
