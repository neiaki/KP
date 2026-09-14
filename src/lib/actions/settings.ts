"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { storeSettingsSchema, type StoreSettingsInput } from "@/lib/validations";
import type { StoreSettings } from "@/types";
import { fail, ok, requireRole, toNumber, type ActionResult } from "./_helpers";
import { getPublicStoreSettings } from "./public";

export async function getStoreSettings(): Promise<ActionResult<StoreSettings>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  return getPublicStoreSettings();
}

/** Kelola konten publik toko tanpa ubah kode (FR-D-02). Eksklusif Admin. */
export async function updateStoreSettings(
  raw: Partial<StoreSettingsInput>
): Promise<ActionResult<StoreSettings>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = storeSettingsSchema.partial().safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input tidak valid.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_settings")
    .update({
      ...parsed.data,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
    })
    .eq("id", 1)
    .select("*")
    .single();
  if (error || !data) return fail("Gagal menyimpan pengaturan: " + (error?.message ?? "unknown"));
  revalidatePath("/id", "layout");
  revalidatePath("/en", "layout");
  revalidatePath("/portal/settings");
  return ok({
    id: data.id,
    store_name: data.store_name,
    description_id: data.description_id,
    description_en: data.description_en,
    address: data.address,
    latitude: toNumber(data.latitude),
    longitude: toNumber(data.longitude),
    maps_url: data.maps_url ?? undefined,
    phone_number: data.phone_number,
    whatsapp_number: data.whatsapp_number ?? undefined,
    opening_hours: {
      monday_friday: data.opening_hours.monday_friday ?? "",
      saturday_sunday: data.opening_hours.saturday_sunday ?? "",
      holidays: data.opening_hours.holidays,
    },
    updated_at: data.updated_at,
  });
}
