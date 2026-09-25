"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  inventoryUnits,
  tradeInRecords,
  transactionItems,
  transactions,
  type InventoryUnitRow,
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

  const tradeVal = v.tradeIn?.offeredPrice ?? 0;
  let txId: number;
  let committedUnit: InventoryUnitRow | null = null;

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
       committedUnit = unit;

      const price = toNumber(unit.sellingPrice);


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
    return fail("Gagal memproses penjualan. Silakan coba lagi.");
  }

  // Nota dibaca via supabase-js agar RLS ikut berlaku, seperti semula.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", txId)
    .single();
  if (error || !data) {
    // Transaksi sudah commit. Jangan mengembalikan error yang mendorong kasir
    // menekan tombol checkout dua kali; kembalikan nota minimal dari input
    // yang sudah tervalidasi.
    let invoiceNumber: string | undefined;
    try {
      const [stored] = await db
        .select({ invoiceNumber: transactions.invoiceNumber })
        .from(transactions)
        .where(eq(transactions.id, txId));
      invoiceNumber = stored?.invoiceNumber ?? undefined;
    } catch {
      // Detail nota tetap bisa dibuild dari input yang sudah tervalidasi.
    }
    const unit = committedUnit as InventoryUnitRow | null;
    const unitPrice = unit ? toNumber(unit.sellingPrice) : 0;
    const fallback: Transaction = {
      id: txId,
      invoice_number: invoiceNumber,
      sales_id: guard.profile.id,
      customer_id: null,
      customer_name: v.customerName,
      customer_phone: v.customerPhone,
      total_amount: unitPrice,
      trade_in_deduction: tradeVal,
      final_payment: Math.max(0, unitPrice - tradeVal),
      final_paid_amount: Math.max(0, unitPrice - tradeVal),
      payment_method: v.paymentMethod,
      created_at: new Date().toISOString(),
      items: unit
        ? [
            {
              id: txId,
              transaction_id: txId,
              unit_id: unit.id,
              unit_price: unitPrice,
              warranty_duration_months: v.warrantyDurationMonths,
              unit: {
                id: unit.id,
                product_id: unit.productId,
                imei: unit.imei,
                condition: unit.condition,
                status: "sold",
                purchase_cost: 0,
                selling_price: unitPrice,
                created_at:
                  unit.createdAt instanceof Date
                    ? unit.createdAt.toISOString()
                    : String(unit.createdAt),
              },
            },
          ]
        : [],
      trade_in: v.tradeIn
        ? {
            id: 0,
            transaction_id: txId,
            original_brand_model: v.tradeIn.originalBrandModel,
            imei: v.tradeIn.imei,
            grading_details: v.tradeIn.gradingDetails,
            photo_urls: v.tradeIn.photoUrls,
            offered_price: tradeVal,
            created_at: new Date().toISOString(),
          }
        : undefined,
    };
    revalidatePath("/portal/pos");
    revalidatePath("/portal/inventory");
    revalidatePath("/portal/dashboard");
    return ok(fallback);
  }
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
  if (error) return fail("Gagal memuat transaksi. Coba lagi.");
  return ok(
    (data as unknown as TransactionRow[]).map((row) => mapTransaction(row))
  );
}
