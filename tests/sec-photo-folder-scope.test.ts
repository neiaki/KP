import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BATAS_PATH_FOTO,
  filterFotoMilikSendiri,
  objectKeyBentukSah,
} from "../src/lib/validations.ts";

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

function bacaBerkas(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
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

test("action memakai filter pemanggil, bukan filter longgar", () => {
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  assert.match(
    action,
    /filterFotoMilikSendiri\(guard\.profile\.id, kandidat\)/,
    "signPhotoPaths harus menyaring path ke folder staf pemanggil"
  );
  assert.doesNotMatch(
    action,
    /new Set\(paths\.filter\(Boolean\)\)/,
    "filter(Boolean) yang lama tidak membatasi folder sama sekali"
  );
});

/* -------------------------------------------------------------------------- */
/* Foto milik staf lain yang sudah tersimpan di tiket                          */
/* -------------------------------------------------------------------------- */

/*
 * Aturan folder sendiri saja menutup satu masalah dan membuka yang lain.
 * Foto progres servis diunggah siapa pun yang menerima unit di konter, lalu
 * dibaca teknisi lain yang mengerjakan perbaikan. Kalau hanya folder sendiri
 * yang boleh ditandatangani, teknisi itu tidak bisa melihat foto yang
 * sondernu diunggah kasir, padahal keduanya sudah boleh membuka tiket yang
 * sama.
 *
 * Batas yang benar bukan "siapa yang mengunggah", tapi "path-nya benar-benar
 * menempel pada data yang boleh dilihat pemanggil". Setiap foto privat masuk
 * ke database sebagai bagian dari photo_urls pada service_tickets atau
 * trade_in_records, jadi itulah yang dicek.
 *
 * Test di bawah membaca sumber action-nya, karena signPhotoPaths tidak bisa
 * diimpor di runner Node: berkasnya "use server" dan menarik next/cache.
 */

test("foto yang terpakai di tiket tetap boleh ditandatangani", () => {
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  // Dua gerbang, dan keduanya harus ada: folder sendiri untuk foto yang baru
  // diunggah, dan database untuk foto yang sudah tersimpan.
  assert.match(
    action,
    /const terpakai = await pathsYangTerpakai\(kandidat\)/,
    "path harus dicek terhadap foto yang benar-benar terpakai di data"
  );
  assert.match(
    action,
    /const boleh = kandidat\.filter\(\(p\) => terpakai\.has\(p\) \|\| milikSendiri\.has\(p\)\)/,
    "path yang terpakai di tiket atau milik sendiri boleh lewat"
  );
});

test("pencarian foto terpakai hanya membaca tabel yang ditulis mati", () => {
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  // Nama tabel tidak boleh datang dari input. Kalau nanti disambung dari
  // nilai kiriman, ini jadi SQL injection.
  assert.match(
    action,
    /const BAHAN_FOTO = \["service_tickets", "trade_in_records"\] as const;/,
    "daftar tabel foto harus ditulis mati"
  );
  assert.doesNotMatch(action, /\$\{tabel\}/, "nama tabel tidak boleh disambung dari input");
});

test("daftar path dikirim sebagai parameter, bukan dirangkai jadi SQL", () => {
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  // Path datang dari HTTP dan bebas berisi tanda kutip, jadi harus jadi
  // parameter. Operator ?| jsonb menutup seluruh daftar dalam satu query.
  assert.match(action, /photo_urls \?\| \$\{paths\}/);
  assert.doesNotMatch(
    action,
    /ARRAY\[\$\{/,
    "merangkai array path jadi teks SQL membuka jalan injeksi"
  );
});

test("hasil query disaring ulang terhadap daftar yang diminta", () => {
  // Operator jsonb membandingkan sebagai teks, jadi baris yang kembali bisa
  // punya entri yang tidak diminta. Tanpa penyaringan ulang, semua foto di
  // satu tiket bisa ikut keluar hanya karena satu path-nya cocok.
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  assert.match(
    action,
    /if \(typeof p === "string" && paths\.includes\(p\)\) boleh\.add\(p\);/,
    "hanya path yang benar-benar ada di daftar permintaan yang boleh lewat"
  );
});

test("bentuk object key diperiksa sebelum masuk query", () => {
  // Gerbang pertama: nilai yang tidak bisa jadi object key tidak perlu sampai
  // ke database maupun Storage. typeof diperiksa lebih dulu, jadi accessor
  // milik pemanggil tidak pernah tersentuh.
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  assert.match(
    action,
    /typeof p === "string" && objectKeyBentukSah\(p\)[\s\S]*?slice\(0, BATAS_PATH_FOTO\)/
  );
  // Sisa input yang bukan string tidak boleh diteruskan ke mana pun: bukan ke
  // query, bukan ke Storage. Ini yang membuat daftar dari HTTP aman dimakan.
  assert.doesNotMatch(
    action,
    /paths\.filter\(Boolean\)|paths\.filter\(\(p\) => p\)/,
    "input mentah tidak boleh diteruskan lewat filter longgar"
  );
});

test("object key yang tidak berbentuk ditolak", () => {
  // Fungsi ini adalah gerbang pertama sebelum query dan Storage, jadi ia harus
  // menolak bentuk yang tidak mungkin jadi kunci objek: tanpa garis miring,
  // memanjai prefix dengan "..", dan karakter di luar yang diizinkan.
  for (const buruk of [
    "tanpa-folder.jpg",
    "../naik.jpg",
    "staf-a/../staf-b/foto.jpg",
    "https://contoh.supabase.co/storage/v1/object/public/x.jpg",
    "",
  ]) {
    assert.equal(objectKeyBentukSah(buruk), false, `${JSON.stringify(buruk)} harus ditolak`);
  }
  for (const sah of [
    "8f14e45f-ceea-467a-9575-2b8a1a2f4c11/kondisi-depan.jpg",
    "staf-a/foto_1.png",
  ]) {
    assert.equal(objectKeyBentukSah(sah), true, `${JSON.stringify(sah)} harus diterima`);
  }
});

test("batas jumlah path dipakai dari modul yang sama", () => {
  // Action mengambil BATAS_PATH_FOTO dari validations, bukan angka yang
  // ditulis ulang, jadi batas yang dijalankan dan batas yang diuji tidak
  // bisa berbeda.
  assert.equal(typeof BATAS_PATH_FOTO, "number");
  assert.ok(BATAS_PATH_FOTO > 0 && BATAS_PATH_FOTO <= 200);
  const action = readFileSync(new URL("../src/lib/actions/storage.ts", import.meta.url), "utf8");
  assert.match(action, /slice\(0, BATAS_PATH_FOTO\)/);
  assert.doesNotMatch(action, /slice\(0, 50\)/, "angka batas tidak boleh ditulis ulang");
});

test("bucket katalog publik tetap terjangkau tanpa signed URL", () => {
  // product-images sengaja publik dan dibaca lewat getPublicUrl, jadi jalur itu
  // tidak boleh ikut tersaring oleh filter folder staf.
  const action = bacaBerkas("../src/lib/actions/storage.ts");
  assert.match(
    action,
    /if \(!perluTandaTangan\(bucket\)\) return ok\(\{\}\)/,
    "bucket yang tidak butuh tanda tangan harus keluar sebelum penyaringan"
  );
  assert.match(action, /return role !== "product-images"|bucket !== "product-images"/);
});
