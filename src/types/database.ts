// Tipe baris database Supabase (cerminan supabase/migrations/0001_atcell_schema.sql).
// Jika nanti menjalankan `supabase gen types`, file ini boleh ditimpa hasilnya.

import type {
  PaymentMethod,
  RepairStatus,
  UnitCondition,
  UnitStatus,
  UserRole,
} from "./index";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          phone_number: string;
          email: string | null;
          username: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          phone_number?: string;
          email?: string | null;
          username?: string;
        };
        Update: {
          full_name?: string;
          role?: UserRole;
          phone_number?: string;
          email?: string | null;
          username?: string;
        };
        Relationships: [];
      };
      store_settings: {
        Row: {
          id: number;
          store_name: string;
          description_id: string;
          description_en: string;
          address: string;
          latitude: number | null;
          longitude: number | null;
          maps_url: string | null;
          phone_number: string;
          whatsapp_number: string | null;
          social_facebook: string | null;
          social_instagram: string | null;
          social_x: string | null;
          social_tiktok: string | null;
          opening_hours: Record<string, string>;
          updated_at: string;
        };
        Insert: {
          id: 1;
          store_name: string;
          description_id?: string;
          description_en?: string;
          address?: string;
          latitude?: number | null;
          longitude?: number | null;
          maps_url?: string | null;
          phone_number?: string;
          whatsapp_number?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_x?: string | null;
          social_tiktok?: string | null;
          opening_hours?: Record<string, string>;
        };
        Update: {
          store_name?: string;
          description_id?: string;
          description_en?: string;
          address?: string;
          latitude?: number | null;
          longitude?: number | null;
          maps_url?: string | null;
          phone_number?: string;
          whatsapp_number?: string | null;
          social_facebook?: string | null;
          social_instagram?: string | null;
          social_x?: string | null;
          social_tiktok?: string | null;
          opening_hours?: Record<string, string>;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: number;
          brand: string;
          model_name: string;
          specs: string;
          default_price: number;
          image_url: string;
          official_images: string[];
          second_images: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          brand: string;
          model_name: string;
          specs?: string;
          default_price?: number;
          image_url?: string;
          official_images?: string[];
          second_images?: string[];
          is_active?: boolean;
        };
        Update: {
          brand?: string;
          model_name?: string;
          specs?: string;
          default_price?: number;
          image_url?: string;
          official_images?: string[];
          second_images?: string[];
          is_active?: boolean;
        };
        Relationships: [];
      };
      inventory_units: {
        Row: {
          id: number;
          product_id: number;
          imei: string;
          condition: UnitCondition;
          status: UnitStatus;
          purchase_cost: number;
          selling_price: number;
          created_at: string;
        };
        Insert: {
          product_id: number;
          imei: string;
          condition: UnitCondition;
          status?: UnitStatus;
          purchase_cost?: number;
          selling_price?: number;
        };
        Update: {
          product_id?: number;
          imei?: string;
          condition?: UnitCondition;
          status?: UnitStatus;
          purchase_cost?: number;
          selling_price?: number;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: number;
          invoice_number: string | null;
          sales_id: string | null;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          total_amount: number;
          trade_in_deduction: number;
          final_payment: number;
          payment_method: PaymentMethod;
          created_at: string;
        };
        Insert: {
          sales_id?: string | null;
          customer_id?: string | null;
          customer_name: string;
          customer_phone?: string;
          total_amount?: number;
          trade_in_deduction?: number;
          final_payment?: number;
          payment_method: PaymentMethod;
        };
        Update: {
          customer_name?: string;
          customer_phone?: string;
        };
        Relationships: [];
      };
      transaction_items: {
        Row: {
          id: number;
          transaction_id: number;
          unit_id: number;
          unit_price: number;
          warranty_duration_months: number;
        };
        Insert: {
          transaction_id: number;
          unit_id: number;
          unit_price?: number;
          warranty_duration_months?: number;
        };
        Update: {
          unit_price?: number;
          warranty_duration_months?: number;
        };
        Relationships: [];
      };
      trade_in_records: {
        Row: {
          id: number;
          transaction_id: number | null;
          resulting_unit_id: number | null;
          original_brand_model: string;
          imei: string;
          grading_details: Record<string, unknown>;
          photo_urls: string[];
          offered_price: number;
          created_at: string;
        };
        Insert: {
          transaction_id?: number | null;
          resulting_unit_id?: number | null;
          original_brand_model: string;
          imei: string;
          grading_details?: Record<string, unknown>;
          photo_urls?: string[];
          offered_price?: number;
        };
        Update: {
          grading_details?: Record<string, unknown>;
          photo_urls?: string[];
          offered_price?: number;
        };
        Relationships: [];
      };
      service_tickets: {
        Row: {
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
          repair_status: RepairStatus;
          photo_urls: string[];
          sparepart_fee: number;
          labor_fee: number;
          total_fee: number;
          warranty_days: number;
          cost_breakdown: Array<{
            id: string;
            name: string;
            cost: number;
            type: "sparepart" | "labor";
          }>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          ticket_code?: string;
          customer_id?: string | null;
          technician_id?: string | null;
          customer_name: string;
          customer_phone?: string;
          device_model: string;
          device_name?: string | null;
          imei_or_sn?: string;
          issue_notes?: string;
          problem_description?: string | null;
          technician_notes?: string | null;
          repair_status?: RepairStatus;
          photo_urls?: string[];
          sparepart_fee?: number;
          labor_fee?: number;
          total_fee?: number;
          warranty_days?: number;
          cost_breakdown?: Array<{
            id: string;
            name: string;
            cost: number;
            type: "sparepart" | "labor";
          }>;
        };
        Update: {
          technician_id?: string | null;
          customer_name?: string;
          customer_phone?: string;
          device_model?: string;
          device_name?: string | null;
          imei_or_sn?: string;
          issue_notes?: string;
          problem_description?: string | null;
          technician_notes?: string | null;
          repair_status?: RepairStatus;
          photo_urls?: string[];
          sparepart_fee?: number;
          labor_fee?: number;
          total_fee?: number;
          warranty_days?: number;
          cost_breakdown?: Array<{
            id: string;
            name: string;
            cost: number;
            type: "sparepart" | "labor";
          }>;
        };
        Relationships: [];
      };
    };
    Views: {
      v_public_inventory: {
        Row: {
          brand: string;
          model_name: string;
          specs: string;
          image_url: string;
          official_images: string[];
          second_images: string[];
          condition: UnitCondition;
          selling_price: number;
          unit_created_at: string;
          product_id: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      process_trade_in_sale: {
        Args: {
          p_sales_id: string;
          p_unit_id: number;
          p_customer_name: string;
          p_customer_phone: string;
          p_payment_method: PaymentMethod;
          p_warranty_months: number;
          p_trade_brand_model?: string | null;
          p_trade_imei?: string | null;
          p_trade_grading?: Record<string, unknown>;
          p_trade_photo_urls?: string[];
          p_trade_price?: number;
        };
        Returns: number;
      };
    };
    Enums: {
      user_role: UserRole;
      unit_condition: UnitCondition;
      unit_status: UnitStatus;
      repair_status: RepairStatus;
      payment_method: PaymentMethod;
    };
  };
}
