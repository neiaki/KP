"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryUnits, products, type InventoryUnitRow } from "@/db/schema";
import {
  bolehTeknisiSetUnitStatus,
  registerUnitsSchema,
  updateUnitDetailsSchema,
  updateUnitStatusSchema,
  type RegisterUnitsInput,
  type UpdateUnitDetailsInput,
  type UpdateUnitStatusInput,
} from "@/lib/validations";
import { formatIDR } from "@/lib/utils";
import type { InventoryUnit } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  setAuditActor,
  toISO,
  toNumber,
  type ActionResult,
} from "./_helpers";

type InventoryStatusResult =
  | { error: string; updated?: never }
  | { error?: never; updated: InventoryUnitRow };

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
  // Panjang status dibatasi supaya string bebas yang sangat panjang tidak
  // ikut masuk ke query. Nilai di luar enum tidak akan match apa pun juga.
  if (opts?.status && opts.status.length > 20) return fail("Filter status tidak valid.");
  const db = getDb();
  if (!db) return backendOffline();
  // Filter disusun dinamis: hanya kondisi yang diisi yang ikut ke WHERE.
  const filters = [
    opts?.productId ? eq(inventoryUnits.productId, opts.productId) : undefined,
    opts?.status ? eq(inventoryUnits.status, opts.status) : undefined,
  ].filter((f) => f !== undefined);
  try {
    const rows = await db
      .select()
      .from(inventoryUnits)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(inventoryUnits.createdAt))
      .limit(Math.min(Math.max(opts?.limit ?? 200, 1), 200));
    return ok(rows.map(mapUnit));
  } catch {
    return fail("Gagal memuat unit inventaris. Coba lagi.");
  }
}

/**
 * Unit `available` per produk untuk picker IMEI di POS (anti double-sell di UI).
 *
 * CATATAN: listUnits meng-clamp limit di 200 baris, jadi 500 di sini cuma
 * permintaan, bukan jaminan. listUnits belum punya paging, jadi lebih dari
 * 200 unit available untuk satu model memang tidak bisa diambil sekaligus.
 */
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
  let product: { id: number; isActive: boolean } | undefined;
  try {
    const [row] = await db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(eq(products.id, productId));
    product = row;
  } catch {
    return fail("Gagal memuat katalog produk. Coba lagi.");
  }
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
    return fail("Gagal mendaftarkan unit. Periksa koneksi dan coba lagi.");
  }
}

/**
 * Mutasi status unit (reserved/in_service/returned/dll). Jual via POS, bukan di sini.
 *
 * Daftar peran di sini sengaja lebih longgar daripada matriks route di
 * src/lib/access.ts, dan selisihnya disengaja: /portal/inventory hanya untuk
 * admin dan sales, sementara Server Action adalah endpoint HTTP dan route
 * guard sama sekali tidak menyentuhnya. Action inilah batasnya.
 *
 * Yang dibatasi adalah statusnya, bukan perannya. Teknisi tetap boleh menarik
 * unit masuk dan keluar dari in_service karena itu pekerjaannya, tetapi tidak
 * boleh menulis available karena status itu yang menerbitkan unit ke etalase
 * publik lewat v_public_inventory, dan tidak boleh menulis reserved karena itu
 * keputusan penjualan. Daftar yang mengikat ada di UNIT_STATUS_OLEH_TEKNISI
 * (src/lib/validations.ts).
 */
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
  if (
    guard.profile.role === "technician" &&
    !bolehTeknisiSetUnitStatus(parsed.data.status)
  ) {
    return fail("Peran technician hanya boleh menukar unit ke in_service atau returned.");
  }
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const result = (await db.transaction(async (tx) => {
      // Aktor ditulis ke transaction-local supaya trigger audit tahu siapa yang
      // mengubah status (NFR-07). Harus di dalam transaction yang sama.
      await setAuditActor(tx, guard.profile.id);
      const [current] = await tx
        .select({ status: inventoryUnits.status })
        .from(inventoryUnits)
        .where(eq(inventoryUnits.id, parsed.data.unitId))
        .for("update");
      if (!current) return { error: "Unit tidak ditemukan." } as const;
      if (current.status === "sold") {
        return { error: "Unit sudah sold dan tidak dapat dikembalikan menjadi available." } as const;
      }
      const [updated] = await tx
        .update(inventoryUnits)
        .set({ status: parsed.data.status })
        .where(eq(inventoryUnits.id, parsed.data.unitId))
        .returning();
      if (!updated) return { error: "Unit tidak ditemukan." } as const;
      return { updated } as const;
    })) as InventoryStatusResult;
    if (result.error || !result.updated) {
      return fail(result.error ?? "Unit tidak ditemukan.");
    }
    revalidatePath("/portal/inventory");
    return ok(mapUnit(result.updated));
  } catch {
    return fail("Gagal memperbarui status unit. Coba lagi.");
  }
}

/**
 * Koreksi kondisi dan harga jual unit yang ter-tag salah atau salah harga.
 *
 * Sebelumnya tidak ada jalur sama sekali untuk memperbaiki dua kolom ini:
 * satu-satunya .update() di berkas ini adalah updateUnitStatus, dan status
 * tidak bisa menyatakan kondisi. Unit yang ter-tag second padahal baru, atau
 * yang terdaftar dengan harga keliru, jadi terkunci selamanya karena satu-satunya
 * perubahan yang bisa dilakukan hanya statusnya.
 *
 * Peran mengikuti registerUnits, bukan updateUnitStatus, karena berkas ini
 * menulis kolom yang sama persis (condition dan selling_price) saat registrasi
 * dan harga jual itu keputusan sales. Teknisi boleh menukar status unit saja,
 * bukan menetapkan harga jual atau kondisi barang.
 *
 * Syarat harga hanya berlaku kalau harga benar-benar diubah. Ini penting:
 * form registrasi memakai "kurang dari", jadi unit yang terdaftar dengan harga
 * sama persis dengan modalnya itu sah dan sudah banyak di database. Kalau
 * penjaga ini menolak harga yang tidak berubah, unit impas tidak akan pernah
 * bisa dikoreksi sama sekali, bahkan hanya untuk membetulkan kondisinya, dan
 * baris itu lalu terkunci selamanya, yaitu cacat yang justru jadi alasan
 * action ini ada. Jadi harga yang sama dengan modal hanya ditolak kalau staf
 * sedang memasang angka baru di bawah atau sama dengan modal.
 */
export async function updateUnitDetails(
  raw: UpdateUnitDetailsInput
): Promise<ActionResult<InventoryUnit>> {
  const guard = await requireRole(["admin", "sales"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = updateUnitDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Data unit tidak valid.");
  }
  const { unitId, condition, sellingPrice } = parsed.data;
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const result = (await db.transaction(async (tx) => {
      // Aktor ditulis ke transaction-local supaya trigger audit tahu siapa yang
      // mengubah (NFR-07). Harus di dalam transaction yang sama, sama seperti
      // updateUnitStatus.
      await setAuditActor(tx, guard.profile.id);
      // purchase_cost dan selling_price lama tidak ada di payload, jadi keduanya
      // harus dibaca dari baris yang sama dan dikunci selama transaction ini
      // berjalan supaya angka modal dan harga lama tidak berubah di tengah jalan.
      const [current] = await tx
        .select({
          purchaseCost: inventoryUnits.purchaseCost,
          sellingPrice: inventoryUnits.sellingPrice,
          imei: inventoryUnits.imei,
        })
        .from(inventoryUnits)
        .where(eq(inventoryUnits.id, unitId))
        .for("update");
      if (!current) return { error: "Unit tidak ditemukan." } as const;

      // Aturan IMEI 15 digit tetap dijaga di jalur koreksi ini juga. Action ini
      // tidak mengubah IMEI, dan IMEI yang rusak bukan salah kondisi maupun
      // harga, jadi memperbaikinya bukan urusan form ini. Menolak di sini lebih
      // baik daripada menandai koreksi berhasil sementara baris yang dikoreksi
      // masih menyesatkan etalase.
      if (!/^\d{15}$/.test(current.imei)) {
        return { error: "IMEI unit ini tidak lengkap 15 digit, perbaiki dulu di katalog." } as const;
      }

      const cost = toNumber(current.purchaseCost);
      const previousPrice = toNumber(current.sellingPrice);
      // Penjaga ini hanya berlaku saat harga memang bergerak. Unit yang sudah
      // impas sejak dulu harus tetap bisa dikoreksi kondisinya, jadi harga impas
      // yang tidak diubah lolos, sedangkan angka baru yang di bawah atau sama
      // dengan modal ditolak.
      if (sellingPrice !== previousPrice && sellingPrice <= cost) {
        return {
          error: `Harga jual harus lebih besar dari harga beli (${formatIDR(cost)}).`,
        } as const;
      }

      // Penulisan dibatasi ke satu baris lewat eq(id), jadi koreksi satu unit
      // tidak pernah bisa menimpa unit lain di batch yang sama.
      const [updated] = await tx
        .update(inventoryUnits)
        .set({ condition, sellingPrice: String(sellingPrice) })
        .where(eq(inventoryUnits.id, unitId))
        .returning();
      if (!updated) return { error: "Unit tidak ditemukan." } as const;
      return { updated } as const;
    })) as InventoryStatusResult;
    if (result.error || !result.updated) {
      return fail(result.error ?? "Unit tidak ditemukan.");
    }
    // Sama seperti dua mutasi inventaris lain di berkas ini. Area publik
    // dirender per permintaan, jadi tidak ada cache yang perlu didaftarkan ulang
    // di sisi etalase.
    revalidatePath("/portal/inventory");
    return ok(mapUnit(result.updated));
  } catch {
    return fail("Gagal memperbaiki data unit. Coba lagi.");
  }
}
