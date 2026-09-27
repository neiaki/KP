"use server";

import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryUnits } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import type {
  InventoryUnit,
  Product,
  Profile,
  ServiceTicket,
  StoreSettings,
  Transaction,
  UserRole,
} from "@/types";
import {
  fail,
  ok,
  requireRole,
  toISO,
  toNumber,
  type ActionResult,
} from "./_helpers";
import { mapTransaction, mapUnit } from "./_mappers";
import { getPublicSnapshot, getPublicStoreSettings } from "./public";

const TRANSACTION_SELECT =
  "*,transaction_items(*,inventory_units(*)),trade_in_records(*)";

export type PortalSnapshot = {
  profile: Profile;
  storeSettings: StoreSettings;
  products: Product[];
  inventoryUnits: InventoryUnit[];
  transactions: Transaction[];
  serviceTickets: ServiceTicket[];
  profiles: Profile[];
};

/** Baris trade_in_records yang dipakai untuk melabeli unit tanpa katalog. */
type TradeInLabelRow = {
  resulting_unit_id: number | null;
  original_brand_model: string;
};

type ProductDbRow = {
  id: number;
  brand: string;
  model_name: string;
  specs: string;
  default_price: unknown;
  image_url: string;
  official_images: string[] | null;
  second_images: string[] | null;
  created_at: string;
};

type ProfileDbRow = {
  id: string;
  full_name: string;
  role: UserRole;
  phone_number: string;
  // Wajib ikut dipetakan: halaman /portal/staff menampilkannya sebagai
  // "@username", dan tanpa ini semua kartu berbunyi "@tanpa username".
  username: string;
  created_at: string;
};

type ServiceTicketDbRow = {
  id: number;
  ticket_code: string;
  customer_id: string | null;
  technician_id: string | null;
  customer_name: string;
  customer_phone: string;
  device_model: string;
  device_name: string | null;
  imei_or_sn: string;
  issue_notes: string;
  problem_description: string | null;
  technician_notes: string | null;
  repair_status: ServiceTicket["repair_status"];
  photo_urls: string[] | null;
  sparepart_fee: unknown;
  labor_fee: unknown;
  total_fee: unknown;
  warranty_days: number;
  cost_breakdown: ServiceTicket["cost_breakdown"];
  created_at: string;
  updated_at: string;
};

function mapProduct(row: ProductDbRow): Product {
  return {
    id: Number(row.id),
    brand: row.brand,
    model_name: row.model_name,
    specs: row.specs,
    default_price: toNumber(row.default_price),
    image_url: row.image_url,
    official_images: row.official_images ?? [],
    second_images: row.second_images ?? [],
    created_at: toISO(row.created_at),
  };
}

function mapProfile(row: ProfileDbRow, email?: string): Profile {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    phone_number: row.phone_number,
    email,
    username: row.username,
    created_at: toISO(row.created_at),
  };
}

function mapTicket(row: ServiceTicketDbRow): ServiceTicket {
  return {
    id: row.id,
    ticket_code: row.ticket_code,
    customer_id: row.customer_id,
    technician_id: row.technician_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    device_model: row.device_model,
    device_name: row.device_name ?? row.device_model,
    imei_or_sn: row.imei_or_sn,
    imei: row.imei_or_sn,
    issue_notes: row.issue_notes,
    problem_description: row.problem_description ?? row.issue_notes,
    technician_notes: row.technician_notes ?? undefined,
    repair_status: row.repair_status,
    photo_urls: row.photo_urls ?? [],
    sparepart_fee: toNumber(row.sparepart_fee),
    labor_fee: toNumber(row.labor_fee),
    total_fee: toNumber(row.total_fee),
    warranty_days: row.warranty_days,
    cost_breakdown: row.cost_breakdown ?? [],
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

/**
 * Ambil satu snapshot data portal setelah role tervalidasi. Provider client
 * memakai ini sebagai sumber data live; query tetap mengikuti RLS Supabase.
 */
export async function getPortalSnapshot(): Promise<ActionResult<PortalSnapshot>> {
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
    let publicResult: Awaited<ReturnType<typeof getPublicSnapshot>>;
    try {
      publicResult = await getPublicSnapshot();
    } catch {
      return fail("Gagal memuat data portal.");
    }
    if ("error" in publicResult) return fail(publicResult.error);
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

  const productRows = productsResult.data as unknown as ProductDbRow[];
  const transactionRows = transactionsResult.data as unknown as Parameters<typeof mapTransaction>[0][];
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
  const ticketRows = ticketsResult.data as unknown as ServiceTicketDbRow[];
  const profileRows =
    guard.profile.role === "customer"
      ? [guard.profile]
      : (profilesResult.data as unknown as ProfileDbRow[]).map((row) => mapProfile(row));

  let settingsResult: Awaited<ReturnType<typeof getPublicStoreSettings>>;
  try {
    settingsResult = await getPublicStoreSettings();
  } catch {
    return fail("Gagal memuat pengaturan toko.");
  }
  if ("error" in settingsResult) return fail(settingsResult.error);

  return ok({
    profile: guard.profile,
    storeSettings: settingsResult.data,
    products: productRows.map(mapProduct),
    inventoryUnits: portalInventoryUnits,
    transactions: transactionRows.map((row) =>
      mapTransaction(row, guard.profile.role !== "customer")
    ),
    serviceTickets: ticketRows.map(mapTicket),
    profiles: profileRows,
  });
}
