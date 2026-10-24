"use server";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryUnits } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import type { InventoryUnit } from "@/types";
import {
  fail,
  ok,
  requireRole,
  toISO,
  type ActionResult,
} from "./_helpers";
import { mapUnit, type TransactionRow } from "./_mappers";
import { getPublicSnapshot, getPublicStoreSettings } from "./public";
import { loadAdditionalSource } from "./_additional-source";
import { assemblePortalSnapshot } from "./_portal-snapshot";
import type { PortalSnapshot as PortalSnapshotResult } from "./_portal-snapshot";

export type { PortalSnapshot } from "./_portal-snapshot";

const TRANSACTION_SELECT =
  "*,transaction_items(*,inventory_units(*)),trade_in_records(*)";

/** Baris trade_in_records yang dipakai untuk melabeli unit tanpa katalog. */
type TradeInLabelRow = {
  resulting_unit_id: number | null;
  original_brand_model: string;
};

/**
 * Ambil satu snapshot data portal setelah role tervalidasi. Provider client
 * memakai ini sebagai sumber data live; query tetap mengikuti RLS Supabase.
 */
export async function getPortalSnapshot(): Promise<ActionResult<PortalSnapshotResult>> {
  const guard = await requireRole(["admin", "sales", "technician", "customer"]);
  if ("error" in guard) return fail(guard.error);
  const supabase = await createClient();

  const productsQuery = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  const unitsQuery = supabase
    .from("inventory_units")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  const transactionsQuery = supabase
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  const ticketsQuery = supabase
    .from("service_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  const profilesQuery = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (guard.profile.role === "customer") {
    transactionsQuery.eq("customer_id", guard.profile.id);
    ticketsQuery.eq("customer_id", guard.profile.id);
  }

  const queryResults = await Promise.all([
    productsQuery,
    unitsQuery,
    transactionsQuery,
    ticketsQuery,
    guard.profile.role === "customer"
      ? Promise.resolve({ data: [], error: null })
      : profilesQuery,
  ]).catch(() => null);
  if (!queryResults) return fail("Gagal memuat data portal.");
  const [productsResult, unitsResult, transactionsResult, ticketsResult, profilesResult] =
    queryResults;

  const firstError =
    productsResult.error ??
    unitsResult.error ??
    transactionsResult.error ??
    ticketsResult.error ??
    profilesResult.error;
  if (firstError) return fail("Gagal memuat data portal.");
  if (
    !Array.isArray(productsResult.data) ||
    !Array.isArray(unitsResult.data) ||
    !Array.isArray(transactionsResult.data) ||
    !Array.isArray(ticketsResult.data) ||
    (guard.profile.role !== "customer" && !Array.isArray(profilesResult.data))
  ) {
    return fail("Gagal memuat data portal.");
  }

  // Inventory tidak diexpos oleh RLS untuk customer. Public snapshot hanya
  // memuat unit available dan tidak pernah membawa purchase_cost.
  let portalInventoryUnits: InventoryUnit[];
  if (guard.profile.role === "customer") {
    const publicResult = await loadAdditionalSource(
      () => getPublicSnapshot(),
      "Gagal memuat data portal."
    );
    if (!publicResult.ok) return fail(publicResult.error);
    portalInventoryUnits = publicResult.data.inventoryUnits;
  } else {
    // Unit trade-in punya product_id NULL karena tidak punya baris katalog,
    // jadi dari products tidak ada apa pun yang bisa ditampilkan. Label
    // aslinya ada di trade_in_records.original_brand_model.
    //
    // Query ini sengaja terpisah dari unitsQuery, bukan di-embed. Embed lewat
    // PostgREST akan mengalikan baris inventory_units untuk unit yang punya
    // lebih dari satu trade_in_records (resulting_unit_id tidak punya UNIQUE),
    // dan itu juga bisa menggeser urutan created_at. Dengan query terpisah,
    // himpunan baris inventory_units dan urutannya dijamin tidak berubah.
    const tradeInLabels = new Map<number, string>();
    const { data: tradeInRows } = await supabase
      .from("trade_in_records")
      .select("resulting_unit_id, original_brand_model")
      .limit(2000);
    for (const row of (tradeInRows ?? []) as TradeInLabelRow[]) {
      if (row.resulting_unit_id === null) continue;
      // Baris pertama yang menang kalau-kalau ada duplikat. Isinya sama
      // untuk satu unit, jadi hasilnya tidak bergantung urutan.
      if (!tradeInLabels.has(row.resulting_unit_id)) {
        tradeInLabels.set(row.resulting_unit_id, row.original_brand_model);
      }
    }
    portalInventoryUnits = (
      unitsResult.data as unknown as Array<Parameters<typeof mapUnit>[0]>
    ).map((unit) => ({
      ...mapUnit(unit),
      trade_in_model: tradeInLabels.get(unit.id),
    }));
  }

  const productRows = productsResult.data as unknown as Parameters<
    typeof assemblePortalSnapshot
  >[0]["productRows"];
  const transactionRows = transactionsResult.data as unknown as TransactionRow[];
  if (guard.profile.role === "customer") {
    // Nested inventory_units tidak diexpos oleh RLS kepada customer. Ambil
    // hanya unit yang sudah terikat ke transaksi milik akun ini lewat DB
    // server-side, lalu jangan kirim purchase_cost ke browser.
    const unitIds = Array.from(
      new Set(
        transactionRows.flatMap((row) =>
          (row.transaction_items ?? []).map((item) => item.unit_id)
        )
      )
    );
    if (unitIds.length > 0) {
      const db = getDb();
      if (!db) return fail("Gagal memuat data portal.");
      let unitRows: Array<typeof inventoryUnits.$inferSelect>;
      try {
        unitRows = await db
          .select()
          .from(inventoryUnits)
          .where(inArray(inventoryUnits.id, unitIds));
      } catch {
        return fail("Gagal memuat data portal.");
      }
      const unitsById = new Map(
        unitRows.map((unit) => [
          unit.id,
          {
            id: unit.id,
            product_id: unit.productId,
            imei: unit.imei,
            condition: unit.condition,
            status: unit.status,
            purchase_cost: unit.purchaseCost,
            selling_price: unit.sellingPrice,
            created_at: toISO(unit.createdAt),
          },
        ])
      );
      transactionRows.forEach((row) => {
        if (!row.transaction_items) return;
        row.transaction_items = row.transaction_items.map((item) => ({
          ...item,
          inventory_units: unitsById.get(item.unit_id) ?? item.inventory_units,
        }));
      });
    }
  }
  const ticketRows = ticketsResult.data as unknown as Parameters<
    typeof assemblePortalSnapshot
  >[0]["serviceTicketRows"];
  const profileRows =
    guard.profile.role === "customer"
      ? []
      : (profilesResult.data as unknown as Parameters<
          typeof assemblePortalSnapshot
        >[0]["profileRows"]);

  const settingsResult = await loadAdditionalSource(
    () => getPublicStoreSettings(),
    "Gagal memuat pengaturan toko."
  );
  if (!settingsResult.ok) return fail(settingsResult.error);

  return ok(
    assemblePortalSnapshot({
      profile: guard.profile,
      storeSettings: settingsResult.data,
      productRows,
      inventoryUnits: portalInventoryUnits,
      transactionRows,
      serviceTicketRows: ticketRows,
      profileRows,
    })
  );
}
