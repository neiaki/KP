// Core Data Models according to PRD_AtCell(1).md and Database Schema

export type UserRole = "admin" | "sales" | "technician" | "customer";

export type UnitCondition = "new" | "second";

export type UnitStatus = "available" | "reserved" | "sold" | "in_service" | "returned";

/* Tag etalase berbasis data (bukan tempelan): bestseller dari unit
   yang benar-benar terjual, laststock bila tinggal 1 unit. */
export type UnitTag = "bestseller" | "laststock";

export type RepairStatus =
  | "received"
  | "diagnosing"
  | "waiting_approval"
  | "in_progress"
  | "testing"
  | "completed"
  | "picked_up"
  | "cancelled";

export type PaymentMethod = "cash" | "transfer" | "qris" | "debit" | "credit";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  phone_number: string;
  email?: string;
  created_at: string;
}

export interface StoreSettings {
  id: number;
  store_name: string;
  description_id: string;
  description_en: string;
  address: string;
  latitude: number;
  longitude: number;
  maps_url?: string;
  phone_number: string;
  whatsapp_number?: string;
  opening_hours: {
    monday_friday: string;
    saturday_sunday: string;
    holidays?: string;
  };
  updated_at: string;
}

export interface Product {
  id: number;
  brand: string;
  model_name: string;
  specs: string;
  default_price: number;
  image_url: string;
  official_images?: string[];
  second_images?: string[];
  created_at: string;
}

export interface InventoryUnit {
  id: number;
  product_id: number;
  imei: string; // strict 15 digits
  condition: UnitCondition;
  purchase_cost: number; // Internal only, never leak to public
  selling_price: number;
  status: UnitStatus;
  created_at: string;
}

export interface TradeInRecord {
  id: number;
  transaction_id?: number;
  resulting_unit_id?: number;
  original_brand_model: string;
  imei: string;
  grading_details?: {
    screen?: string;
    body?: string;
    battery?: number;
    battery_health?: number;
    cameras?: string;
    face_id?: string;
    notes?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // kolom grading fleksibel (spesifikasi per perangkat)
  };
  photo_urls?: string[];
  offered_price: number;
  agreed_price?: number;
  physical_condition_notes?: string;
  created_at: string;
}

export interface TransactionItem {
  id: number;
  transaction_id?: number;
  inventory_unit_id?: number;
  unit_id?: number;
  unit_price: number;
  warranty_period_days?: number;
  warranty_duration_months?: number;
  unit?: InventoryUnit;
}

export interface Transaction {
  id: number;
  invoice_number?: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  sales_id: string;
  total_amount: number;
  trade_in_id?: number;
  trade_in_deduction?: number;
  final_payment?: number;
  final_paid_amount?: number;
  payment_method: PaymentMethod;
  created_at: string;
  items: TransactionItem[];
  trade_in?: TradeInRecord;
}

export interface ServiceCostItem {
  id: string;
  name: string;
  cost: number;
  type: "sparepart" | "labor";
}

export interface ServiceTicket {
  id: number | string;
  ticket_code: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  technician_id?: string | null;
  device_name?: string;
  device_model: string;
  imei?: string;
  imei_or_sn?: string;
  issue_notes: string;
  problem_description?: string;
  technician_notes?: string;
  repair_status: RepairStatus;
  sparepart_fee: number;
  labor_fee: number;
  total_fee: number;
  warranty_days?: number;
  photo_urls: string[];
  created_at: string;
  updated_at: string;
  cost_breakdown?: ServiceCostItem[];
}
