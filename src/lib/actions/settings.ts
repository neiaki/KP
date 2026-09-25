"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { storeSettings } from "@/db/schema";
import {
  storeSettingsUpdateSchema,
  type StoreSettingsUpdateInput,
} from "@/lib/validations";
import type { StoreSettings } from "@/types";
import { backendOffline, fail, ok, requireRole, type ActionResult } from "./_helpers";
import { getPublicStoreSettings } from "./public";
import { mapStoreSettings } from "./_mappers";

export async function getStoreSettings(): Promise<ActionResult<StoreSettings>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  return getPublicStoreSettings();
}

/** Kelola konten publik toko tanpa ubah kode (FR-D-02). Eksklusif Admin. */
export async function updateStoreSettings(
  raw: StoreSettingsUpdateInput
): Promise<ActionResult<StoreSettings>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = storeSettingsUpdateSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input tidak valid.");
  const db = getDb();
  if (!db) return backendOffline();
  const v = parsed.data;
  try {
    const [updated] = await db
      .update(storeSettings)
      .set({
        ...(v.store_name !== undefined ? { storeName: v.store_name } : {}),
        ...(v.description_id !== undefined ? { descriptionId: v.description_id } : {}),
        ...(v.description_en !== undefined ? { descriptionEn: v.description_en } : {}),
        ...(v.address !== undefined ? { address: v.address } : {}),
        ...(v.latitude !== undefined ? { latitude: v.latitude === null ? null : String(v.latitude) } : {}),
        ...(v.longitude !== undefined ? { longitude: v.longitude === null ? null : String(v.longitude) } : {}),
        ...(v.maps_url !== undefined ? { mapsUrl: v.maps_url || null } : {}),
        ...(v.phone_number !== undefined ? { phoneNumber: v.phone_number } : {}),
        ...(v.whatsapp_number !== undefined ? { whatsappNumber: v.whatsapp_number || null } : {}),
        ...(v.opening_hours !== undefined ? { openingHours: v.opening_hours } : {}),
      })
      .where(eq(storeSettings.id, 1))
      .returning();
    if (!updated) return fail("Pengaturan toko tidak ditemukan.");
    revalidatePath("/id", "layout");
    revalidatePath("/en", "layout");
    revalidatePath("/portal/settings");
    return ok(mapStoreSettings(updated));
  } catch {
    return fail("Gagal menyimpan pengaturan toko. Coba lagi.");
  }
}
