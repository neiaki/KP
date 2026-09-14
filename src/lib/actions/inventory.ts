"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  registerUnitsSchema,
  updateUnitStatusSchema,
  type RegisterUnitsInput,
  type UpdateUnitStatusInput,
} from "@/lib/validations";
import type { InventoryUnit } from "@/types";
import {
  fail,
  friendlyDbError,
  ok,
  requireRole,
  type ActionResult,
} from "./_helpers";
import { mapUnit, type UnitRow } from "./_mappers";

/** Daftar unit fisik dengan filter opsional (staf saja; purchase_cost internal). */
export async function listUnits(opts?: {
  productId?: number;
  status?: InventoryUnit["status"];
  limit?: number;
}): Promise<ActionResult<InventoryUnit[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const supabase = await createClient();
  let q = supabase
    .from("inventory_units")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.productId) q = q.eq("product_id", opts.productId);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) return fail("Gagal memuat inventaris: " + error.message);
  return ok((data as UnitRow[]).map(mapUnit));
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
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id,is_active")
    .eq("id", productId)
    .single();
  if (!product || !product.is_active) return fail("Katalog produk tidak aktif.");
  const { data, error } = await supabase
    .from("inventory_units")
    .insert(
      imeis.map((imei) => ({
        product_id: productId,
        imei: imei.trim(),
        condition,
        status: "available" as const,
        purchase_cost: purchaseCost,
        selling_price: sellingPrice,
      }))
    )
    .select("*");
  if (error || !data) {
    return fail(friendlyDbError(error?.code ?? "", "Gagal mendaftarkan unit: " + (error?.message ?? "unknown")));
  }
  revalidatePath("/portal/inventory");
  return ok((data as UnitRow[]).map(mapUnit));
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_units")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.unitId)
    .select("*")
    .single();
  if (error || !data) return fail("Gagal mengubah status unit: " + (error?.message ?? "unknown"));
  revalidatePath("/portal/inventory");
  return ok(mapUnit(data as UnitRow));
}
