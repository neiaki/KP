// Mapper baris DB ke tipe frontend (modul biasa, tanpa "use server",
// agar boleh mengekspor fungsi sinkron dan dipakai banyak action).
import { storeSettings } from "@/db/schema";
import type { InventoryUnit, StoreSettings, Transaction } from "@/types";
import { toISO, toNumber } from "./_helpers";

export type UnitRow = {
  id: number;
  product_id: number;
  imei: string;
  condition: InventoryUnit["condition"];
  status: InventoryUnit["status"];
  purchase_cost: unknown;
  selling_price: unknown;
  created_at: string;
};

export function mapUnit(u: UnitRow): InventoryUnit {
  return {
    id: u.id,
    product_id: u.product_id,
    imei: u.imei,
    condition: u.condition,
    status: u.status,
    purchase_cost: toNumber(u.purchase_cost),
    selling_price: toNumber(u.selling_price),
    created_at: u.created_at,
  };
}

export type TransactionRow = {
  id: number;
  invoice_number: string | null;
  sales_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  total_amount: unknown;
  trade_in_deduction: unknown;
  final_payment: unknown;
  payment_method: Transaction["payment_method"];
  created_at: string;
  transaction_items?: Array<{
    id: number;
    transaction_id: number;
    unit_id: number;
    unit_price: unknown;
    warranty_duration_months: number;
    inventory_units?: UnitRow | null;
  }>;
  trade_in_records?: Array<{
    id: number;
    original_brand_model: string;
    imei: string;
    grading_details: Record<string, unknown>;
    photo_urls: string[];
    offered_price: unknown;
    created_at: string;
  }>;
};

export function mapTransaction(t: TransactionRow): Transaction {
  const items = (t.transaction_items ?? []).map((i) => ({
    id: i.id,
    transaction_id: i.transaction_id,
    inventory_unit_id: i.unit_id,
    unit_id: i.unit_id,
    unit_price: toNumber(i.unit_price),
    warranty_duration_months: i.warranty_duration_months,
    warranty_period_days: i.warranty_duration_months * 30,
    unit: i.inventory_units ? mapUnit(i.inventory_units) : undefined,
  }));
  const trade = t.trade_in_records?.[0];
  return {
    id: t.id,
    invoice_number: t.invoice_number ?? undefined,
    sales_id: t.sales_id ?? "",
    customer_id: t.customer_id,
    customer_name: t.customer_name,
    customer_phone: t.customer_phone,
    total_amount: toNumber(t.total_amount),
    trade_in_deduction: toNumber(t.trade_in_deduction),
    final_payment: toNumber(t.final_payment),
    final_paid_amount: toNumber(t.final_payment),
    payment_method: t.payment_method,
    created_at: t.created_at,
    items,
    trade_in: trade
      ? {
          id: trade.id,
          transaction_id: t.id,
          original_brand_model: trade.original_brand_model,
          imei: trade.imei,
          grading_details: trade.grading_details,
          photo_urls: trade.photo_urls,
          offered_price: toNumber(trade.offered_price),
          agreed_price: toNumber(trade.offered_price),
          created_at: trade.created_at,
        }
      : undefined,
  };
}

type StoreSettingsRow = typeof storeSettings.$inferSelect;

export function mapStoreSettings(row: StoreSettingsRow): StoreSettings {
  const hours = row.openingHours ?? {};
  return {
    id: row.id,
    store_name: row.storeName,
    description_id: row.descriptionId,
    description_en: row.descriptionEn,
    address: row.address,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    maps_url: row.mapsUrl ?? undefined,
    phone_number: row.phoneNumber,
    whatsapp_number: row.whatsappNumber ?? undefined,
    opening_hours: {
      monday_friday: hours.monday_friday ?? "",
      saturday_sunday: hours.saturday_sunday ?? "",
      holidays: hours.holidays,
    },
    updated_at: toISO(row.updatedAt),
  };
}
