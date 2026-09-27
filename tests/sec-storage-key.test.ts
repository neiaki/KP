import test from "node:test";
import assert from "node:assert/strict";
import { buildPhotoObjectKey } from "../src/lib/validations.ts";
import type { uploadPhoto } from "../src/lib/actions/storage.ts";

/*
 * Sisi tulis kunci Storage dulu menerima prefix bebas dari pemanggil, tanpa
 * validasi, sementara sisi baca (photoRefSchema) menolak "..". Staf mana pun
 * yang bisa memanggil action itu langsung karena itu bisa menulis berkas ke
 * folder staf lain.
 *
 * Perbaikannya menghapus prefix dari tipe publik, jadi satu-satunya prefix
 * yang mungkin adalah id staf dari requireRole, dan foldernya tetap
 * diperiksa buildPhotoObjectKey.
 * diimpor di sini. Karena itu yang diuji adalah batas yang dibuat untuknya:
 * buildPhotoObjectKey untuk perilaku, dan bentuk tipe opsi uploadPhoto untuk
 * menjaga prefix tidak bisa dikembalikan diam-diam.
 */

const FOLDER = "3f1c8a52-0d4e-4a77-9b21-5c0e6d8a1f34";

/** Bagian direktori kunci, yaitu yang harus selalu sama dengan folder staf. */
function folderDari(kunci: string): string {
  return kunci.split("/")[0] ?? "";
}

test("prefix berbentuk traversal ditolak", () => {
  const traversal = [
    "../../other-user-id",
    "..",
    "../..",
    "a/../../b",
    "./x",
    "x/..",
    "/etc/passwd",
    "/",
    "folder/child",
    "folder\\child",
    "  ",
    "",
  ];
  for (const prefix of traversal) {
    assert.equal(
      buildPhotoObjectKey(prefix, "acak-1", "foto.jpg"),
      null,
      `prefix ${JSON.stringify(prefix)} harus ditolak`
    );
  }
});

test("prefix kepanjangan ditolak, batas panjangnya tetap dipakai", () => {
  assert.equal(buildPhotoObjectKey("a".repeat(101), "acak-1", "foto.jpg"), null);
  assert.equal(
    buildPhotoObjectKey("a".repeat(100), "acak-1", "foto.jpg"),
    `${"a".repeat(100)}/acak-1-foto.jpg`
  );
});

test("folder staf yang sah menghasilkan kunci di dalam folder itu", () => {
  const kunci = buildPhotoObjectKey(FOLDER, "acak-1", "kondisi-depan.jpg");
  assert.equal(kunci, `${FOLDER}/acak-1-kondisi-depan.jpg`);
  assert.ok(kunci);
  assert.equal(folderDari(kunci), FOLDER);
  assert.equal(kunci.startsWith("/"), false);
  assert.equal(kunci.includes("/../"), false);
});

test("nama file berisi traversal tetap berakhir di dalam folder staf", () => {
  // Sanitasi nama file ada di dalam buildPhotoObjectKey, bukan di pemanggil,
  // jadi nama file apa pun tetap jadi satu segmen di dalam folder staf.
  for (const nama of ["../../etc/passwd", "..%2F..%2Fkunci", "/etc/passwd", "a/b/c.jpg", ".."]) {
    const kunci = buildPhotoObjectKey(FOLDER, "acak-2", nama);
    assert.ok(kunci, `nama ${JSON.stringify(nama)} harus tetap menghasilkan kunci`);
    assert.equal(folderDari(kunci), FOLDER, `nama ${JSON.stringify(nama)} keluar dari folder`);
    assert.equal(kunci.startsWith("/"), false);
    // Tidak boleh ada segmen direktori tambahan selain folder staf.
    assert.equal(kunci.split("/").length, 2);
  }
});

/*
 * Penjaga kedua: prefix tidak boleh muncul lagi di tipe publik uploadPhoto.
 * Berkas test ini ikut diperiksa npx tsc --noEmit karena tsconfig-nya
 * mencakup semua berkas .ts, jadi begitu prefix dikembalikan ke
 * Parameters<typeof uploadPhoto>[1], baris di bawah gagal compile.
 */
type OpsiUploadPhoto = Parameters<typeof uploadPhoto>[1];

function harusBenar<T extends true>(nilai: T): T {
  return nilai;
}

test("opsi uploadPhoto tidak punya prefix lagi", () => {
  const cek = harusBenar<"prefix" extends keyof OpsiUploadPhoto ? false : true>(true);
  assert.equal(cek, true);
});
