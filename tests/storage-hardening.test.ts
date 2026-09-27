import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Akses Storage dan grant tabel dijaga di sini karena dua kesalahan yang
 * pernah nyata di repo ini tidak tertangkap test lain.
 *
 * 1. product_images dibuat jauh setelah 0001 memberi grant eksplisit ke anon
 *    untuk products dan store_settings. Tanpa grant eksplisit, tabel itu
 *    hanya memegang default privilege Supabase, yaitu anon=arwdDxtm, sehingga
 *    menjadi satu-satunya tabel public yang memberi anon hak tulis.
 *
 * 2. storage_public_read dibuat di 0002, saat bucket yang ada hanya
 *    trade-in-photos dan service-photos, jadi policy itu menempel ke dua
 *    bucket foto pelanggan, bukan ke product-images yang memang publik.
 *    Untuk bucket public, path /object/public/ dilayani tanpa token dan
 *    tanpa cek RLS, jadi foto servis bisa diambil siapa pun yang punya URL.
 *
 * Test ini membaca berkas migrasi, bukan database, supaya jalan tanpa
 * koneksi. Keadaan database diverifikasi terpisah saat migrasi diterapkan.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);

const storageMigration = await readFile(
  repoFile("../supabase/migrations/20260927160000_harden_storage_access.sql"),
  "utf8"
);
const grantsMigration = await readFile(
  repoFile(
    "../supabase/migrations/20260927150000_revoke_anon_write_on_product_images.sql"
  ),
  "utf8"
);
const validations = await readFile(repoFile("../src/lib/validations.ts"), "utf8");
const storageActions = await readFile(repoFile("../src/lib/actions/storage.ts"), "utf8");

/** Bucket yang isinya milik pelanggan, bukan aset publik. */
const BUCKET_PRIBAT = ["service-photos", "trade-in-photos"] as const;

test("bucket foto pelanggan tidak lagi public", () => {
  // Pernyataan harus menutup bucket privat secara eksplisit. Menyebut
  // "where id in (...)" saja tidak cukup, karena public = true yang membuat
  // path /object/public/ dilayani tanpa token.
  assert.match(
    storageMigration,
    /update storage\.buckets\s+set public = false\s+where id in \('service-photos', 'trade-in-photos'\);/,
    "kedua bucket foto pelanggan harus di-set public = false"
  );

  // product-images tetap publik, karena katalog publik memakai img biasa dan
  // repo ini belum memakai signed URL.
  assert.ok(
    storageActions.includes("getPublicUrl"),
    "storage actions masih memakai getPublicUrl, jadi product-images harus tetap public"
  );
});

test("storage_public_read hanya mencakup bucket katalog", () => {
  assert.match(
    storageMigration,
    /drop policy if exists storage_public_read on storage\.objects;[\s\S]*?create policy storage_public_read on storage\.objects\s+for select to anon, authenticated\s+using \(bucket_id = 'product-images'\);/,
    "storage_public_read harus dibatasi ke product-images"
  );

  // Policy lama memberi SELECT ke dua bucket foto pelanggan. Kalau qual lama
  // itu masih ikut terbawa, policy baru hanya menambah, bukan mengganti.
  // Potong dari definisi policy-nya, bukan dari penyebutan pertama di
  // komentar header yang menjelaskan asal usul policy ini.
  const mulai = storageMigration.indexOf("create policy storage_public_read");
  const selesai = storageMigration.indexOf("create policy storage_staff_read");
  assert.ok(mulai > -1 && selesai > mulai, "kedua policy tidak ditemukan di migrasi");
  const blokPolicy = storageMigration.slice(mulai, selesai);
  for (const bucket of BUCKET_PRIBAT) {
    assert.ok(
      !blokPolicy.includes(bucket),
      `blok storage_public_read masih menyebut ${bucket}, policy lama belum tergantikan`
    );
  }
});

test("foto pelanggan hanya bisa dibaca staf", () => {
  assert.match(
    storageMigration,
    /create policy storage_staff_read on storage\.objects\s+for select to authenticated\s+using \(\s*bucket_id in \('trade-in-photos', 'service-photos'\)\s+and \(select private\.is_staff\(\)\)\s*\);/,
    "perlu policy baca khusus staf untuk dua bucket privat"
  );
  assert.doesNotMatch(
    storageMigration,
    /create policy storage_staff_read[\s\S]*?to anon/,
    "storage_staff_read tidak boleh menyertakan anon"
  );
});

test("batas ukuran dan tipe ditegakkan di bucket, bukan hanya di aplikasi", () => {
  assert.match(
    storageMigration,
    /set file_size_limit = 5242880,\s+allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp'\]\s+where id in \('service-photos', 'trade-in-photos'\);/,
    "bucket privat harus punya file_size_limit dan allowed_mime_types"
  );
});

test("batas bucket tidak melenceng dari validasi aplikasi", () => {
  // Pemeriksaan di aplikasi bisa dilewati kalau Storage API dipanggil
  // langsung dengan token staf, jadi bucketnya harus menegakkan batas yang
  // sama. Kalau salah satu sisi berubah, test ini yang mengingatkan.
  const barisSize = validations.match(/size: z\.coerce\.number\(\)[^\n]*?\.max\(([^,]+),/);
  assert.ok(barisSize, "batas ukuran di uploadPhotoSchema tidak ditemukan");

  const ukuranMaks = barisSize[1]
    .split("*")
    .map((b) => Number(b.trim()))
    .reduce((a, b) => a * b, 1);
  assert.equal(ukuranMaks, 5 * 1024 * 1024, "batas ukuran aplikasi berubah, sesuaikan migrasi");

  const barisMime = validations.match(/contentType: z\.enum\(\[([^\]]+)\]\)/);
  assert.ok(barisMime, "daftar contentType di uploadPhotoSchema tidak ditemukan");
  const mimeAplikasi = barisMime[1]
    .split(",")
    .map((m) => m.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .sort();

  assert.deepEqual(mimeAplikasi, ["image/jpeg", "image/png", "image/webp"]);

  const mimeBucket = storageMigration.match(/allowed_mime_types = array\[([^\]]+)\]/);
  assert.ok(mimeBucket, "allowed_mime_types di migrasi tidak ditemukan");
  const mimeMigrasi = mimeBucket[1]
    .split(",")
    .map((m) => m.trim().replace(/^'|'$/g, ""))
    .sort();

  assert.deepEqual(
    mimeMigrasi,
    mimeAplikasi,
    "daftar MIME di bucket harus sama dengan yang divalidasi aplikasi"
  );
});

test("product_images tidak memberi hak tulis ke anon", () => {
  assert.match(
    grantsMigration,
    /revoke all on public\.product_images from anon;/,
    "harus pakai revoke all supaya privilege MAINTAIN bawaan Supabase ikut dicabut"
  );
  assert.match(
    grantsMigration,
    /grant select on public\.product_images to anon;/,
    "SELECT tetap diberikan karena daftar gambar dibaca halaman publik"
  );

  // Pola revoke all lalu grant select harus sama dengan 0001 untuk products
  // dan store_settings, supaya tiga tabel public itu seragam.
  const blok = grantsMigration.match(/revoke all[\s\S]*?grant select[\s\S]*?;/);
  assert.ok(blok, "blok revoke lalu grant tidak lengkap");
  assert.doesNotMatch(
    blok[0],
    /grant (?:insert|update|delete|truncate)/,
    "grant anon tidak boleh lebih dari select"
  );
});

test("hanya tiga bucket yang boleh ditulis aplikasi", () => {
  // ALLOWED_BUCKETS adalah satu-satunya daftar putih di sisi aplikasi, jadi
  // bucket baru tidak bisa masuk tanpa sengaja lewat uploadPhoto.
  const blok = storageActions.match(/ALLOWED_BUCKETS = \[([\s\S]*?)\] as const;/);
  assert.ok(blok, "ALLOWED_BUCKETS tidak ditemukan");
  const bucket = [...blok[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(bucket, ["product-images", "service-photos", "trade-in-photos"]);
});

test("komentar migrasi mencatat kenapa hak tulis storage.objects tidak dicabut", () => {
  // Percobaan pertama untuk revoke hak anon di storage.objects gagal. Hak itu
  // diberikan role supabase_storage_admin, sedangkan REVOKE hanya bisa mencabut
  // hak dari role yang sedang berjalan. Test ini menjaga supaya ada yang
  // mencoba lagi tahu lebih dulu bahwa ini sudah diselidiki.
  assert.match(
    storageMigration,
    /supabase_storage_admin/,
    "komentar harus menyebut role pemberi hak"
  );
  assert.match(
    storageMigration,
    /REVOKE hanya bisa/,
    "komentar harus menjelaskan keterbatasan REVOKE lintas role"
  );
  assert.doesNotMatch(
    storageMigration,
    /^\s*revoke[^;]*on storage\.objects/m,
    "jangan mengulang revoke di storage.objects, sudah diketahui tidak berhasil dari role postgres"
  );
});
