"use server";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { products as productsTable, storeSettings } from "@/db/schema";
import type {
  InventoryUnit,
  Product,
  StoreSettings,
  UnitCondition,
} from "@/types";
import { backendOffline, fail, ok, toISO, toNumber, type ActionResult } from "./_helpers";
import { mapStoreSettings } from "./_mappers";

export type PublicStockItem = {
  unitId: number;
  productId: number;
  brand: string;
  modelName: string;
  specs: string;
  imageUrl: string;
  officialImages: string[];
  secondImages: string[];
  condition: UnitCondition;
  sellingPrice: number;
  createdAt: string;
  imeiTail: string;
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
  unit_id: number | string;
  imei_tail: string;
  product_id: number | string;
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
  let result: PublicInventoryRow[];
  try {
    result = await db.execute<PublicInventoryRow>(sql`
      select brand, model_name, specs, image_url, official_images, second_images,
             condition, selling_price, unit_created_at, product_id, unit_id, imei_tail
        from public.v_public_inventory
       where (${brand}::text is null or brand ilike '%' || ${brand} || '%')
         and (${condition}::text is null or condition::text = ${condition})
       order by unit_created_at desc
       limit ${limit}
    `);
  } catch {
    return fail("Katalog sedang tidak dapat dimuat. Coba lagi sebentar.");
  }
  return ok(
    result.map((r) => ({
      unitId: Number(r.unit_id),
      productId: Number(r.product_id),
      brand: r.brand,
      modelName: r.model_name,
      specs: r.specs,
      imageUrl: r.image_url,
      officialImages: r.official_images ?? [],
      secondImages: r.second_images ?? [],
      condition: r.condition,
      sellingPrice: toNumber(r.selling_price),
      createdAt:
        r.unit_created_at instanceof Date
          ? r.unit_created_at.toISOString()
          : String(r.unit_created_at),
      imeiTail: r.imei_tail,
    }))
  );
}

/** Profil toko publik untuk landing page (FR-D-01). Tanpa login. */
export async function getPublicStoreSettings(): Promise<ActionResult<StoreSettings>> {
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
    if (!row) return fail("Pengaturan toko tidak ditemukan.");
    return ok(mapStoreSettings(row));
  } catch {
    return fail("Pengaturan toko sedang tidak dapat dimuat.");
  }
}

export type PublicSnapshot = {
  storeSettings: StoreSettings;
  products: Product[];
  inventoryUnits: InventoryUnit[];
};

/**
 * Snapshot minimum untuk komponen publik. View v_public_inventory tidak
 * pernah menyertakan purchase_cost, sehingga data ini aman untuk browser.
 */
export async function getPublicSnapshot(): Promise<ActionResult<PublicSnapshot>> {
  const db = getDb();
  if (!db) return backendOffline();
  const snapshotResults = await Promise.all([
    getPublicStoreSettings(),
    getPublicInventory({ limit: 500 }),
    db
      .select()
      .from(productsTable)
      .where(eq(productsTable.isActive, true))
      .orderBy(productsTable.createdAt),
  ]).catch(() => null);
  if (!snapshotResults) return fail("Data publik sedang tidak dapat dimuat.");
  const [settingsResult, inventoryResult, productRows] = snapshotResults;
  if ("error" in settingsResult) return fail(settingsResult.error);
  if ("error" in inventoryResult) return fail(inventoryResult.error);

  const productMap = new Map<number, Product>();
  for (const row of productRows) {
    productMap.set(row.id, {
      id: row.id,
      brand: row.brand,
      model_name: row.modelName,
      specs: row.specs,
      default_price: toNumber(row.defaultPrice),
      image_url: row.imageUrl,
      official_images: row.officialImages ?? [],
      second_images: row.secondImages ?? [],
      created_at: toISO(row.createdAt),
    });
  }

  const inventoryUnits: InventoryUnit[] = inventoryResult.data.map((item) => {
    if (!productMap.has(item.productId)) {
      productMap.set(item.productId, {
        id: item.productId,
        brand: item.brand,
        model_name: item.modelName,
        specs: item.specs,
        default_price: item.sellingPrice,
        image_url: item.imageUrl,
        official_images: item.officialImages,
        second_images: item.secondImages,
        created_at: item.createdAt,
      });
    }
    return {
      id: item.unitId,
      product_id: item.productId,
      imei: `****${item.imeiTail}`,
      condition: item.condition,
      // Jangan pernah membawa purchase_cost ke client public.
      purchase_cost: 0,
      selling_price: item.sellingPrice,
      status: "available",
      created_at: item.createdAt,
    };
  });

  return ok({
    storeSettings: settingsResult.data,
    products: [...productMap.values()],
    inventoryUnits,
  });
}
