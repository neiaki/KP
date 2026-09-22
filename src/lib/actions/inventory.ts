"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryUnits, products, type InventoryUnitRow } from "@/db/schema";
import {
  registerUnitsSchema,
  updateUnitStatusSchema,
  type RegisterUnitsInput,
  type UpdateUnitStatusInput,
} from "@/lib/validations";
import type { InventoryUnit } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  toISO,
  toNumber,
  type ActionResult,
} from "./_helpers";

function mapUnit(u: InventoryUnitRow): InventoryUnit {
  return {
    id: u.id,
    product_id: u.productId,
    imei: u.imei,
    condition: u.condition,
    status: u.status,
    purchase_cost: toNumber(u.purchaseCost),
    selling_price: toNumber(u.sellingPrice),
    created_at: toISO(u.createdAt),
  };
}

/** Daftar unit fisik dengan filter opsional (staf saja; purchase_cost internal). */
export async function listUnits(opts?: {
  productId?: number;
  status?: InventoryUnit["status"];
  limit?: number;
}): Promise<ActionResult<InventoryUnit[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  // Filter disusun dinamis: hanya kondisi yang diisi yang ikut ke WHERE.
  const filters = [
    opts?.productId ? eq(inventoryUnits.productId, opts.productId) : undefined,
    opts?.status ? eq(inventoryUnits.status, opts.status) : undefined,
  ].filter((f) => f !== undefined);
  const rows = await db
    .select()
    .from(inventoryUnits)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(inventoryUnits.createdAt))
    .limit(opts?.limit ?? 200);
  return ok(rows.map(mapUnit));
}

/** Unit `available` per produk untuk picker IMEI di POS (anti double-sell di UI). */
export async function getAvailableUnitsByProduct(
  productId: number
): Promise<ActionResult<InventoryUnit[]>> {
  return listUnits({ productId, status: "available", limit: 500 });
}

/** Registrasi batch IMEI di bawah katalog Admin (Sales/Admin). FR-A-01. */
export async function registerUnits(
  raw: RegisterUnitsInput
): Promise<ActionResult<InventoryUnit[]>> {
  const guard = await requireRole(["admin", "sales"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = registerUnitsSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input IMEI tidak valid.");
  const { productId, condition, purchaseCost, sellingPrice, imeis } = parsed.data;
  const db = getDb();
  if (!db) return backendOffline();
  const [product] = await db
    .select({ id: products.id, isActive: products.isActive })
    .from(products)
    .where(eq(products.id, productId));
  if (!product || !product.isActive) return fail("Katalog produk tidak aktif.");
  try {
    // Satu insert untuk seluruh batch, .returning() kembalikan semua baris baru.
    const rows = await db
      .insert(inventoryUnits)
      .values(
        imeis.map((imei) => ({
          productId,
          imei: imei.trim(),
          condition,
          status: "available" as const,
          purchaseCost: String(purchaseCost),
          sellingPrice: String(sellingPrice),
        }))
      )
      .returning();
    revalidatePath("/portal/inventory");
    return ok(rows.map(mapUnit));
  } catch (e) {
    // 23505 = unique violation: ada IMEI yang sudah terdaftar di DB.
    if ((e as { code?: string }).code === "23505") {
      return fail("Ada IMEI yang sudah terdaftar di inventaris. Periksa lagi batch-nya.");
    }
    return fail("Gagal mendaftarkan unit: " + (e as Error).message);
  }
}

/** Mutasi status unit (reserved/in_service/returned/dll). Jual via POS, bukan di sini. */
export async function updateUnitStatus(
  raw: UpdateUnitStatusInput
): Promise<ActionResult<InventoryUnit>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = updateUnitStatusSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Status tidak valid.");
  if (parsed.data.status === "sold") {
    return fail("Status sold hanya boleh lewat transaksi POS agar nota tercatat.");
  }
  const db = getDb();
  if (!db) return backendOffline();
  const [updated] = await db
    .update(inventoryUnits)
    .set({ status: parsed.data.status })
    .where(eq(inventoryUnits.id, parsed.data.unitId))
    .returning();
  if (!updated) return fail("Unit tidak ditemukan.");
  revalidatePath("/portal/inventory");
  return ok(mapUnit(updated));
}
