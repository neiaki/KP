"use server";

import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { createClient } from "@/lib/supabase/server";
import {
  BATAS_PATH_FOTO,
  buildPhotoObjectKey,
  filterFotoMilikSendiri,
  objectKeyBentukSah,
  uploadPhotoSchema,
} from "@/lib/validations";
import { fail, ok, requireRole, type ActionResult } from "./_helpers";

const ALLOWED_BUCKETS = [
  "trade-in-photos",
  "service-photos",
  // Foto produk katalog. Daftar gambarnya ada di tabel public.product_images,
  // path di bucket ini yang jadi sumber kebenarannya.
  "product-images",
] as const;

type Bucket = (typeof ALLOWED_BUCKETS)[number];

/**
 * Tabel yang menyimpan photo_urls untuk bucket privat.
 *
 * Ditulis mati supaya sql.identifier tidak pernah menerima nama tabel dari
 * pemanggil, dan supaya menambah sumber foto baru kelihatan sebagai perubahan
 * di daftar ini.
 */
const BAHAN_FOTO = ["service_tickets", "trade_in_records"] as const;

/**
 * Masa berlaku signed URL. Cukup untuk satu sesi kerja di portal. Yang
 * disimpan ke database adalah path, bukan URL ini, jadi kedaluwarsa signed URL
 * tidak merusak data apa pun.
 */
const SIGNED_URL_TTL_SECONDS = 600;

/**
 * Bucket foto katalog tetap publik jadi bisa dibaca tanpa sesi. Dua bucket
 * lainnya sengaja privat, jadi isinya hanya boleh dibaca lewat signed URL.
 */
function perluTandaTangan(bucket: Bucket): boolean {
  return bucket !== "product-images";
}

/**
 * Unggah foto kondisi ke Supabase Storage (FR-C-01, FR-B-01).
 * Dipanggil dari form trade-in/servis dengan FormData { file }.
 *
 * Yang dikembalikan adalah `{ path, url }` dengan dua peran berbeda, dan
 * pemanggil wajib memperlakukannya begitu:
 *
 * - `path` untuk disimpan ke kolom photo_urls. Bucket trade-in-photos dan
 *   service-photos sengaja privat, jadi getPublicUrl tidak bisa dipakai di
 *   sana. Fungsi itu hanya menyusun URL /object/public/ tanpa memeriksa
 *   privatnya bucket, jadi diam-diam mengembalikan URL yang selalu gagal
 *   diambil. Path tidak pernah basi, jadi hanya itu yang layak disimpan.
 * - `url` untuk langsung ditampilkan. Untuk bucket privat ini signed URL
 *   berumur terbatas, jadi hanya boleh jadi pratinjau pada sesi berjalan dan
 *   tidak boleh dikirim balik ke database.
 */
export async function uploadPhoto(
  formData: FormData,
  opts: { bucket: Bucket }
): Promise<ActionResult<{ url: string; path: string }>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  if (!ALLOWED_BUCKETS.includes(opts.bucket)) return fail("Bucket tidak dikenal.");
  const file = formData.get("file");
  if (!(file instanceof File)) return fail("File foto wajib disertakan.");
  const parsed = uploadPhotoSchema.safeParse({
    bucket: opts.bucket,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "File tidak valid.");
  const supabase = await createClient();
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Tidak ada opsi prefix lagi. Satu-satunya folder yang mungkin adalah id
  // staf dari requireRole, jadi file tidak bisa ditulis ke folder staf lain.
  // buildPhotoObjectKey tetap memeriksanya, jadi penjaganya tidak hilang
  // diam-diam kalau bentuk id profil berubah di kemudian hari.
  const path = buildPhotoObjectKey(guard.profile.id, randomPart, file.name);
  if (!path) return fail("Folder foto tidak valid.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage.from(opts.bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return fail("Gagal mengunggah foto. Coba lagi.");
  if (!perluTandaTangan(opts.bucket)) {
    const {
      data: { publicUrl },
    } = supabase.storage.from(opts.bucket).getPublicUrl(path);
    return ok({ url: publicUrl, path });
  }
  const { data: signed, error: signError } = await supabase.storage
    .from(opts.bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    // Berkasnya sudah naik ke Storage, jadi jangan diamkan begitu saja.
    // Pesannya harus jujur: berkasnya sudah masuk, tapi tidak tampil.
    return fail("Foto terunggah tapi tidak bisa ditampilkan. Muat ulang halamannya.");
  }
  return ok({ url: signed.signedUrl, path });
}

/**
 * Path foto yang benar-benar menempel pada tiket atau transaksi trade-in.
 *
 * Setiap foto privat di bucket ini masuk ke database sebagai bagian dari
 * photo_urls pada satu baris: service_tickets untuk foto servis,
 * trade_in_records untuk foto kondisi unit tukar tambah. Kalau path-nya ada di
 * sana, foto itu bagian dari pekerjaan orang yang boleh melihat baris itu, dan
 * memintanya untuk pratinjau adalah bagian dari pekerjaan itu.
 *
 * Batasnya penting: pemanggil tidak boleh memilih baris mana pun. Semua staf
 * sudah melihat semua tiket lewat getPortalSnapshot, jadi satu query tanpa
 * filter peran cukup. Yang tidak boleh adalah menebak path di folder staf lain
 * tanpa pernah menempel pada data mana pun, dan itulah yang dicek di sini:
 * bukan "path-nya di folder saya", tapi "path-nya benar-benar terpakai".
 *
 * Karena itu filterFotoMilikSendiri tidak lagi menjadi satu-satunya gerbang.
 * Ia tetap dipakai untuk foto yang baru diunggah dan belum disimpan ke
 * database, karena foto seperti itu belum punya baris pemilik.
 */
async function pathsYangTerpakai(paths: string[]): Promise<Set<string>> {
  const boleh = new Set<string>();
  if (paths.length === 0) return boleh;
  const db = getDb();
  if (!db) return boleh;
  /*
   * Operator ?| pada jsonb memeriksa apakah salah satu nilai ada sebagai elemen
   * array, jadi satu query menutup seluruh daftar dan tidak perlu satu query
   * per path. Daftar dikirim sebagai parameter dan bukan dirangkai jadi teks
   * SQL, karena path-nya datang dari HTTP dan bebas berisi tanda kutip.
   *
   * Nama tabelnya ditulis mati di daftar BAHAN_FOTO, bukan disambung dari
   * input, jadi tidak ada identifier yang bisa datang dari pemanggil.
   */
  for (const tabel of BAHAN_FOTO) {
    try {
      const baris = await db.execute<{ photo_urls: string[] | null }>(sql`
        select photo_urls from ${sql.identifier(tabel)} where photo_urls ?| ${paths}
      `);
      for (const row of baris) {
        // Disaring ulang di JavaScript: operator jsonb membandingkan sebagai
        // teks, dan baris yang dikembalikan bisa punya entri lain yang tidak
        // diminta. Hanya path yang benar-benar ada di daftar permintaan yang
        // boleh lewat.
        for (const p of row.photo_urls ?? []) {
          if (typeof p === "string" && paths.includes(p)) boleh.add(p);
        }
      }
    } catch {
      // Database tidak bisa dibaca. Tidak ada path yang bisa dibuktikan, jadi
      // yang lolos tinggal folder sendiri di bawah. Kegagalan di sini tidak
      // merusak apa pun: pemanggil tetap melihat pratinjau fotonya sendiri.
    }
  }
  return boleh;
}

/**
 * Ubah daftar path foto menjadi signed URL untuk ditampilkan.
 *
 * Dipanggil saat portal membuka tiket yang fotonya sudah tersimpan, karena
 * signed URL punya masa berlaku dan harus dibuat ulang tiap kali dibutuhkan.
 * Kegagalan di sini tidak merusak apa pun: pemanggil memakainya hanya untuk
 * pratinjau, sedangkan path yang tersimpan tetap utuh.
 *
 * Sebuah path ditandatangani kalau salah satu dari dua hal benar:
 *
 * 1. Path-nya ada di photo_urls service_tickets atau trade_in_records, jadi
 *    foto itu benar-benar bagian dari pekerjaan yang sedang dipanggil.
 * 2. Path-nya ada di folder staf pemanggil, jadi foto itu diunggah oleh
 *    pemanggil sendiri dan belum sempat tersimpan ke database.
 *
 * Dulu aturan kedua saja yang dipakai, dan akibatnya foto progres yang
 * diunggah kasir tidak bisa dipratinjau teknisi yang menanganinya, padahal
 * keduanya sudah boleh membuka tiket yang sama. Aturan pertama menutup
 * jalur di mana pun tanpa kehilangan kegunaannya: path yang tidak menempel
 * pada data mana pun tidak akan ditandatangani, berapa pun miripnya dengan
 * folder staf mana pun.
 *
 * Bucket privat service-photos dan trade-in-photos memuat IMEI, nama pelanggan,
 * dan foto layar perangkat (lihat 20260927160000_harden_storage_access.sql),
 * jadi setiap path tetap harus lolos salah satu dari dua pemeriksaan di atas.
 * Nilai bukan string dan URL penuh tidak pernah ikut, karena keduanya bukan
 * object key di dalam bucket.
 *
 * Bucket katalog product-images bukan Bucket privat dan tidak pernah memakai
 * signed URL, jadi jalur publiknya tidak tersentuh oleh pembatasan ini.
 */
export async function signPhotoPaths(
  bucket: Bucket,
  paths: string[]
): Promise<ActionResult<Record<string, string>>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  if (!ALLOWED_BUCKETS.includes(bucket)) return fail("Bucket tidak dikenal.");
  if (!perluTandaTangan(bucket)) return ok({});
  // Batas jumlah path masuk bukan hiasan: filter di bawahnya jalan atas
  // seluruh array, dan array ini juga masuk ke query, jadi daftar yang sangat
  // panjang adalah beban gratis untuk pemanggil yang tidak punya hak atas satu
  // pun path di dalamnya.
  if (!Array.isArray(paths) || paths.length > 200) {
    return fail("Terlalu banyak referensi foto.");
  }
  // Bentuknya diperiksa lebih dulu supaya yang masuk ke query dan ke Storage
  // hanya nilai yang memang bisa jadi object key.
  const kandidat = [
    ...new Set(
      paths.filter(
        (p): p is string => typeof p === "string" && objectKeyBentukSah(p)
      )
    ),
  ].slice(0, BATAS_PATH_FOTO);
  if (kandidat.length === 0) return ok({});

  const terpakai = await pathsYangTerpakai(kandidat);
  const milikSendiri = new Set(filterFotoMilikSendiri(guard.profile.id, kandidat));
  const boleh = kandidat.filter((p) => terpakai.has(p) || milikSendiri.has(p));
  if (boleh.length === 0) return ok({});

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(boleh, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return fail("Foto tidak bisa dimuat. Coba lagi sebentar.");
  const peta: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl) peta[item.path] = item.signedUrl;
  }
  return ok(peta);
}
