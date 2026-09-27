"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadPhotoSchema } from "@/lib/validations";
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
  opts: { bucket: Bucket; prefix?: string }
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
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${opts.prefix ?? guard.profile.id}/${randomPart}-${safeName}`;
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
 * Ubah daftar path foto menjadi signed URL untuk ditampilkan.
 *
 * Dipanggil saat portal membuka tiket yang fotonya sudah tersimpan, karena
 * signed URL punya masa berlaku dan harus dibuat ulang tiap kali dibutuhkan.
 * Kegagalan di sini tidak merusak apa pun: pemanggil memakainya hanya untuk
 * pratinjau, sedangkan path yang tersimpan tetap utuh.
 */
export async function signPhotoPaths(
  bucket: Bucket,
  paths: string[]
): Promise<ActionResult<Record<string, string>>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  if (!ALLOWED_BUCKETS.includes(bucket)) return fail("Bucket tidak dikenal.");
  if (!perluTandaTangan(bucket)) return ok({});
  const unik = [...new Set(paths.filter(Boolean))].slice(0, 50);
  if (unik.length === 0) return ok({});
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(unik, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return fail("Foto tidak bisa dimuat. Coba lagi sebentar.");
  const peta: Record<string, string> = {};
  for (const item of data) {
    if (item.path && item.signedUrl) peta[item.path] = item.signedUrl;
  }
  return ok(peta);
}
