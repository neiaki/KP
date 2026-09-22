"use server";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { storeSettings } from "@/db/schema";
import type { StoreSettings, UnitCondition } from "@/types";
import { backendOffline, fail, ok, toNumber, type ActionResult } from "./_helpers";
import { mapStoreSettings } from "./_mappers";

export type PublicStockItem = {
  productId: number;
  brand: string;
  modelName: string;
  specs: string;
  imageUrl: string;
  officialImages: string[];
  secondImages: string[];
  condition: UnitCondition;
  sellingPrice: number;
};

type PublicInventoryRow = {
  brand: string;
  model_name: string;
  specs: string;
  image_url: string;
  official_images: string[] | null;
  second_images: string[] | null;
  condition: UnitCondition;
  selling_price: string;
  unit_created_at: Date | string;
  product_id: number;
};

/**
 * Etalase ready-stock publik (FR-D-01). Baca dari view v_public_inventory:
 * hanya kolom aman, purchase_cost tidak pernah keluar. Tanpa login.
 * View didefinisikan sekali di migrasi SQL, jadi di sini dibaca lewat SQL
 * berparameter (aman dari injection) lewat koneksi Drizzle yang sama.
 */
export async function getPublicInventory(opts?: {
  brand?: string;
  condition?: UnitCondition;
  limit?: number;
}): Promise<ActionResult<PublicStockItem[]>> {
  const db = getDb();
  if (!db) return backendOffline();
  const brand = opts?.brand?.trim() || null;
  const condition = opts?.condition ?? null;
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  const result = await db.execute<PublicInventoryRow>(sql`
    select brand, model_name, specs, image_url, official_images, second_images,
           condition, selling_price, unit_created_at, product_id
      from public.v_public_inventory
     where (${brand}::text is null or brand ilike '%' || ${brand} || '%')
       and (${condition}::text is null or condition::text = ${condition})
     order by unit_created_at desc
     limit ${limit}
  `);
  return ok(
    result.map((r) => ({
      productId: Number(r.product_id),
      brand: r.brand,
      modelName: r.model_name,
      specs: r.specs,
      imageUrl: r.image_url,
      officialImages: r.official_images ?? [],
      secondImages: r.second_images ?? [],
      condition: r.condition,
      sellingPrice: toNumber(r.selling_price),
    }))
  );
}

/** Profil toko publik untuk landing page (FR-D-01). Tanpa login. */
export async function getPublicStoreSettings(): Promise<ActionResult<StoreSettings>> {
  const db = getDb();
  if (!db) return backendOffline();
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (!row) return fail("Pengaturan toko tidak ditemukan.");
  return ok(mapStoreSettings(row));
}
