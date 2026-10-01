import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterFotoMilikSendiri } from "../src/lib/validations.ts";

/*
 * Bucket privat service-photos dan trade-in-photos memuat IMEI, nama pelanggan,
 * dan foto layar perangkat. Satu-satunya cara membacanya adalah signed URL,
 * jadi siapa pun yang bisa meminta signed URL untuk folder staf lain punya
 * akses ke PII itu.
 *
 * Aturan yang dijaga di sini adalah sepasang: uploadPhoto hanya menulis ke
 * folder staf pemanggil (buildPhotoObjectKey), dan filterFotoMilikSendiri
 * hanya menandatangani path di folder yang sama. Dulu action signPhotoPaths
 * hanya melakukan filter(Boolean) dan slice(0, 50), jadi daftar path milik
 * staf lain diteruskan apa adanya ke Storage.
 *
 * filterFotoMilikSendiri ada di src/lib/validations.ts, bukan ditulis inline
 * di action, supaya aturan ini bisa diuji sebagai perilaku. Action-nya sendiri
 * tidak bisa diimpor di runner Node karena alias @/ dan next/cache.
 */

const STAF_A = "8f14e45f-ceea-467a-9575-2b8a1a2f4c11";
const STAF_B = "3c59dc04-8e88-4a1c-9a1e-6f2b7c5d0e33";

async function bacaBerkas(rel: string): Promise<string> {
  return readFile(new URL(rel, import.meta.url), "utf8");
}

test("path milik staf lain tidak pernah ikut ditandatangani", () => {
  const hasil = filterFotoMilikSendiri(STAF_A, [
    `${STAF_B}/rahasia-layar.jpg`,
    `${STAF_A}/kondisi-depan.jpg`,
  ]);
  assert.deepEqual(hasil, [`${STAF_A}/kondisi-depan.jpg`]);
});

test("folder lain tidak bisa dikejar lewat awalan yang mirip", () => {
  // Folder staf adalah satu segmen persis, jadi id yang hanya menjadi awalan id
  // lain tidak boleh ikut terbawa.
  const mirip = `${STAF_A}x/curang.jpg`;
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [mirip]), []);
});

test("path tanpa folder sendiri bukan milik staf yang sedang masuk", () => {
  // buildPhotoObjectKey selalu menempelkan satu segmen folder di depan, jadi
  // path yang sah tidak mungkin tanpa garis miring.
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [STAF_A]), []);
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, ["kondisi-depan.jpg"]), []);
});

test("URL penuh bukan object key dan tidak boleh ditandatangani", () => {
  // photoUrls menerima URL penuh untuk baris lama dan mode mock, dan frontend
  // sudah menampilkannya langsung. Yang boleh ditandatangani tetap hanya key
  // di dalam bucket.
  const url = "https://abc.supabase.co/storage/v1/object/sign/service-photos/x?token=y";
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, [url]), []);
});

test("nilai yang bukan string dibuang, bukan dibaca", () => {
  // Daftarnya datang dari HTTP, jadi isinya bisa apa saja. Membaca properti dari
  // nilai asing berarti menjalankan accessor yang bukan milik kita.
  const aneh: unknown[] = [
    null,
    undefined,
    42,
    { path: `${STAF_A}/x.jpg` },
    [`${STAF_A}/x.jpg`],
    true,
  ];
  assert.deepEqual(filterFotoMilikSendiri(STAF_A, aneh), []);
});

test("duplikat dilipat dan jumlahnya dibatasi lima puluh", () => {
  // Batas 50 itu yang dipakai action sebelum createSignedUrls, jadi filter ini
  // harus selalu menghasilkan paling banyak 50 supaya tidak ada permintaan yang
  // diam-diam lebih besar dari yang dijanjikan.
  const banyak = Array.from({ length: 120 }, (_, i) => `${STAF_A}/foto-${i}.jpg`);
  const hasil = filterFotoMilikSendiri(STAF_A, [...banyak, ...banyak]);
  assert.equal(hasil.length, 50);
  assert.equal(new Set(hasil).size, 50, "duplikat harus dilipat");
  assert.equal(hasil[0], `${STAF_A}/foto-0.jpg`);
});

test("folder yang tidak aman membuat hasilnya kosong, bukan error", () => {
  // Folder di sini selalu profile.id dari requireRole, tapi pemanggilnya endpoint
  // HTTP dan aturan yang sama dipakai uploadPhoto, jadi bentuk yang tidak aman
  // harus ditolak tanpa melempar.
  for (const folder of ["", "a/b", "../escapes", "x".repeat(101)]) {
    assert.deepEqual(
      filterFotoMilikSendiri(folder, [`${folder}/foto.jpg`]),
      [],
      `folder ${JSON.stringify(folder)} harus ditolak`
    );
  }
});

test("action memakai filter pemanggil, bukan filter longgar", async () => {
  const action = await bacaBerkas("../src/lib/actions/storage.ts");
  assert.match(
    action,
    /filterFotoMilikSendiri\(guard\.profile\.id, paths\)/,
    "signPhotoPaths harus menyaring path ke folder staf pemanggil"
  );
  assert.doesNotMatch(
    action,
    /new Set\(paths\.filter\(Boolean\)\)/,
    "filter(Boolean) yang lama tidak membatasi folder sama sekali"
  );
});

test("bucket katalog publik tetap terjangkau tanpa signed URL", async () => {
  // product-images sengaja publik dan dibaca lewat getPublicUrl, jadi jalur itu
  // tidak boleh ikut tersaring oleh filter folder staf.
  const action = await bacaBerkas("../src/lib/actions/storage.ts");
  assert.match(
    action,
    /if \(!perluTandaTangan\(bucket\)\) return ok\(\{\}\)/,
    "bucket yang tidak butuh tanda tangan harus keluar sebelum penyaringan"
  );
  assert.match(action, /return role !== "product-images"|bucket !== "product-images"/);
});
