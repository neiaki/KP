"use server";

import { createClient } from "@/lib/supabase/server";
import { uploadPhotoSchema } from "@/lib/validations";
import { fail, ok, requireRole, type ActionResult } from "./_helpers";

const ALLOWED_BUCKETS = ["trade-in-photos", "service-photos"] as const;

/**
 * Unggah foto kondisi ke Supabase Storage (FR-C-01, FR-B-01).
 * Dipanggil dari form trade-in/servis dengan FormData { file }.
 * URL publik hasil unggahan disimpan ke photo_urls via action terkait.
 */
export async function uploadPhoto(
  formData: FormData,
  opts: { bucket: (typeof ALLOWED_BUCKETS)[number]; prefix?: string }
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
  const path = `${opts.prefix ?? guard.profile.id}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabase.storage.from(opts.bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return fail("Gagal mengunggah foto: " + error.message);
  const {
    data: { publicUrl },
  } = supabase.storage.from(opts.bucket).getPublicUrl(path);
  return ok({ url: publicUrl, path });
}
