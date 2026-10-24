"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  inventoryUnits,
  profiles,
  tradeInRecords,
  transactionItems,
  transactions,
  type InventoryUnitRow,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { finalPaymentAmount, secondHandSellingPrice } from "@/lib/pricing";
import { posSaleSchema, type PosSaleInput } from "@/lib/validations";
import type { Transaction } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  requireWriteAccess,
  setAuditActor,
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
  const write = requireWriteAccess();
  if ("error" in write) return fail(write.error);
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
  let committedCustomerName = v.customerName;
  let committedCustomerPhone = v.customerPhone;

  try {
    txId = await db.transaction(async (tx) => {
      // Aktor untuk trigger audit (NFR-07). POS mengubah status unit jadi sold,
      // dan perubahan itu wajib tercatat dengan identitas kasirnya.
      await setAuditActor(tx, guard.profile.id);
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
      // Unit demo hanya untuk riwayat akun contoh. UI sudah menyembunyikannya
      // dari daftar kasir, tapi Server Action bisa dipanggil langsung, jadi
      // penolakan wajib ada di sini juga.
      if (unit.isDemo) throw new Error("UNIT_IS_DEMO");
      committedUnit = unit;

      const price = toNumber(unit.sellingPrice);

      // Tautkan transaksi ke akun pelanggan terdaftar. Data profil dipakai
      // sebagai sumber kebenaran, bukan input dari browser.
      let customer: { id: string; fullName: string; phoneNumber: string } | null = null;
      if (v.customerId) {
        const [profile] = await tx
          .select({
            id: profiles.id,
            fullName: profiles.fullName,
            phoneNumber: profiles.phoneNumber,
            role: profiles.role,
          })
          .from(profiles)
          .where(eq(profiles.id, v.customerId))
          .limit(1);
        if (!profile || profile.role !== "customer") throw new Error("CUSTOMER_NOT_FOUND");
        customer = {
          id: profile.id,
          fullName: profile.fullName,
          phoneNumber: profile.phoneNumber,
        };
        // Akun pelanggan lama bisa punya nomor kosong. Nomor yang diketik
        // kasir saat checkout dipakai sebagai cadangan supaya transaksi tetap
        // punya kontak garansi, tanpa menimpa profil pelanggan.
        committedCustomerName = profile.fullName;
        committedCustomerPhone = profile.phoneNumber.trim() || v.customerPhone;
      }

      const [t] = await tx
        .insert(transactions)
        .values({
          salesId: guard.profile.id,
          customerId: customer?.id ?? v.customerId ?? null,
          customerName: committedCustomerName,
          customerPhone: committedCustomerPhone,
          totalAmount: String(price),
          tradeInDeduction: String(tradeVal),
          finalPayment: String(finalPaymentAmount(price, tradeVal)),
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
      //
      // productId sengaja NULL, bukan menyalin unit.productId. Handset yang
      // pelanggan tukar tidak punya baris di katalog products, karena katalog
      // produk eksklusif Admin (FR-D-04) dan kasir tidak boleh membuatnya di
      // tempat. Menyalin id produk unit BARU akan mendaftarkan handset lama
      // ke model yang salah: tukar S9 dengan S24 tercatat sebagai S24, lalu
      // unit salah itu naik ke etalase publik dan ke semua filter merek.
      // Deskripsi otoritatif handset lama ada di
      // trade_in_records.original_brand_model, lengkap dengan grading, IMEI,
      // dan fotonya. Lihat migrasi
      // 20260927180000_nullable_inventory_unit_product.sql.
      if (v.tradeIn) {
        const [second] = await tx
          .insert(inventoryUnits)
          .values({
            productId: null,
            imei: v.tradeIn.imei,
            condition: "second",
            status: "available",
            purchaseCost: String(tradeVal),
            sellingPrice: String(secondHandSellingPrice(tradeVal)),
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
      return fail("Unit sudah tidak tersedia (terjual/dipesan). Pilih IMEI lain.");
    }
    if (err.message === "UNIT_IS_DEMO") {
      return fail("Unit demo tidak bisa dijual lewat kasir. Pilih unit stok asli.");
    }
    if (err.message === "CUSTOMER_NOT_FOUND") {
      return fail("Akun pelanggan tidak ditemukan. Pilih pelanggan lain.");
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
      customer_id: v.customerId ?? null,
      customer_name: committedCustomerName,
      customer_phone: committedCustomerPhone,
      total_amount: unitPrice,
      trade_in_deduction: tradeVal,
      final_payment: finalPaymentAmount(unitPrice, tradeVal),
      final_paid_amount: finalPaymentAmount(unitPrice, tradeVal),
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

/** Riwayat transaksi untuk laporan (maksimal 200 terakhir, filter tanggal opsional). */
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
    // Laporan penjualan tidak boleh menghitung transaksi demo.
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts?.limit ?? 200, 1), 200));
  if (opts?.from) q = q.gte("created_at", opts.from);
  if (opts?.to) q = q.lte("created_at", opts.to);
  const { data, error } = await q;
  if (error) return fail("Gagal memuat transaksi. Coba lagi.");
  return ok(
    (data as unknown as TransactionRow[]).map((row) => mapTransaction(row))
  );
}
