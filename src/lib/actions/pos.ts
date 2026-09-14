"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  inventoryUnits,
  tradeInRecords,
  transactionItems,
  transactions,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { posSaleSchema, type PosSaleInput } from "@/lib/validations";
import type { Transaction } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  toNumber,
  type ActionResult,
} from "./_helpers";
import { mapTransaction, type TransactionRow } from "./_mappers";

const TX_SELECT =
  "*,transaction_items(*,inventory_units(*)),trade_in_records(*)";

/**
 * Checkout POS dalam SATU transaksi database (pengganti RPC process_trade_in_sale):
 * unit baru -> sold, unit lama -> second/available, nota tercatat.
 * Gagal di langkah mana pun = seluruhnya batal otomatis (FR-C-04).
 * Konsep ORM: db.transaction(async (tx) => ...) — semua query di dalamnya
 * memakai `tx`, bukan `db`, agar dieksekusi sebagai satu kesatuan.
 */
export async function executeSale(raw: PosSaleInput): Promise<ActionResult<Transaction>> {
  const guard = await requireRole(["admin", "sales"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = posSaleSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input kasir tidak valid.");
  const v = parsed.data;
  const db = getDb();
  if (!db) return backendOffline();

  let txId: number;
  try {
    txId = await db.transaction(async (tx) => {
      // Kunci baris unit (FOR UPDATE) agar tidak bisa double-sell.
      const found = await tx
        .select()
        .from(inventoryUnits)
        .where(
          and(eq(inventoryUnits.id, v.unitId), eq(inventoryUnits.status, "available"))
        )
        .for("update");
      const unit = found[0];
      if (!unit) throw new Error("UNIT_NOT_AVAILABLE");

      const price = toNumber(unit.sellingPrice);
      const tradeVal = v.tradeIn?.offeredPrice ?? 0;

      const [t] = await tx
        .insert(transactions)
        .values({
          salesId: guard.profile.id,
          customerName: v.customerName,
          customerPhone: v.customerPhone,
          totalAmount: String(price),
          tradeInDeduction: String(tradeVal),
          finalPayment: String(Math.max(0, price - tradeVal)),
          paymentMethod: v.paymentMethod,
        })
        .returning({ id: transactions.id });

      await tx.insert(transactionItems).values({
        transactionId: t.id,
        unitId: unit.id,
        unitPrice: String(price),
        warrantyDurationMonths: v.warrantyDurationMonths,
      });

      await tx
        .update(inventoryUnits)
        .set({ status: "sold" })
        .where(eq(inventoryUnits.id, unit.id));

      // Unit lama pelanggan langsung jadi stok second siap jual (FR-C-04).
      // Format IMEI sudah divalidasi Zod (15 digit) sebelum masuk sini.
      if (v.tradeIn) {
        const [second] = await tx
          .insert(inventoryUnits)
          .values({
            productId: unit.productId,
            imei: v.tradeIn.imei,
            condition: "second",
            status: "available",
            purchaseCost: String(tradeVal),
            sellingPrice: String(Math.round(tradeVal * 1.25)),
          })
          .returning({ id: inventoryUnits.id });

        await tx.insert(tradeInRecords).values({
          transactionId: t.id,
          resultingUnitId: second.id,
          originalBrandModel: v.tradeIn.originalBrandModel,
          imei: v.tradeIn.imei,
          gradingDetails: v.tradeIn.gradingDetails,
          photoUrls: v.tradeIn.photoUrls,
          offeredPrice: String(tradeVal),
        });
      }

      return t.id;
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.message === "UNIT_NOT_AVAILABLE") {
      return fail("Unit sudah tidak available (terjual/dipesan). Pilih IMEI lain.");
    }
    if (err.code === "23505") {
      return fail("IMEI unit trade-in sudah terdaftar di inventaris.");
    }
    return fail("Gagal memproses penjualan: " + (err.message || "unknown"));
  }

  // Nota dibaca via supabase-js agar RLS ikut berlaku, seperti semula.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", txId)
    .single();
  if (error || !data) return fail("Transaksi tersimpan, tapi nota gagal dimuat: " + (error?.message ?? "unknown"));
  revalidatePath("/portal/pos");
  revalidatePath("/portal/inventory");
  revalidatePath("/portal/dashboard");
  return ok(mapTransaction(data as unknown as TransactionRow));
}

/** Detail nota untuk cetak/ekspor faktur bergaransi (FR-A-03). */
export async function getTransactionDetail(
  transactionId: number
): Promise<ActionResult<Transaction>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", transactionId)
    .single();
  if (error || !data) return fail("Nota tidak ditemukan.");
  return ok(mapTransaction(data as unknown as TransactionRow));
}

/** Riwayat transaksi untuk laporan (batas 500 terakhir, filter tanggal opsional). */
export async function listTransactions(opts?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ActionResult<Transaction[]>> {
  const guard = await requireRole(["admin", "sales"]);
  if ("error" in guard) return fail(guard.error);
  const supabase = await createClient();
  let q = supabase
    .from("transactions")
    .select(TX_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.from) q = q.gte("created_at", opts.from);
  if (opts?.to) q = q.lte("created_at", opts.to);
  const { data, error } = await q;
  if (error) return fail("Gagal memuat transaksi: " + error.message);
  return ok((data as unknown as TransactionRow[]).map(mapTransaction));
}
