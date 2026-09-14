CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'qris', 'debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."repair_status" AS ENUM('received', 'diagnosing', 'waiting_approval', 'in_progress', 'testing', 'completed', 'picked_up', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."unit_condition" AS ENUM('new', 'second');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('available', 'reserved', 'sold', 'in_service', 'returned');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'sales', 'technician', 'customer');--> statement-breakpoint
CREATE TABLE "inventory_units" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" bigint NOT NULL,
	"imei" text NOT NULL,
	"condition" "unit_condition" NOT NULL,
	"status" "unit_status" DEFAULT 'available' NOT NULL,
	"purchase_cost" numeric DEFAULT '0' NOT NULL,
	"selling_price" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_units_imei_unique" UNIQUE("imei"),
	CONSTRAINT "inventory_units_imei_15_digits" CHECK ("inventory_units"."imei" ~ '^\d{15}$')
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"brand" text NOT NULL,
	"model_name" text NOT NULL,
	"specs" text DEFAULT '' NOT NULL,
	"default_price" numeric DEFAULT '0' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"official_images" text[] DEFAULT '{}' NOT NULL,
	"second_images" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"phone_number" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_tickets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "service_tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ticket_code" text DEFAULT '' NOT NULL,
	"customer_id" uuid,
	"technician_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"device_model" text NOT NULL,
	"device_name" text,
	"imei_or_sn" text DEFAULT '' NOT NULL,
	"issue_notes" text DEFAULT '' NOT NULL,
	"problem_description" text,
	"technician_notes" text,
	"repair_status" "repair_status" DEFAULT 'received' NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sparepart_fee" numeric DEFAULT '0' NOT NULL,
	"labor_fee" numeric DEFAULT '0' NOT NULL,
	"total_fee" numeric DEFAULT '0' NOT NULL,
	"warranty_days" integer DEFAULT 30 NOT NULL,
	"cost_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_tickets_ticket_code_unique" UNIQUE("ticket_code")
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"store_name" text DEFAULT 'At Cell' NOT NULL,
	"description_id" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"latitude" numeric,
	"longitude" numeric,
	"maps_url" text,
	"phone_number" text DEFAULT '' NOT NULL,
	"whatsapp_number" text,
	"opening_hours" jsonb DEFAULT '{"monday_friday":"09:00 - 21:00","saturday_sunday":"10:00 - 22:00"}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_singleton" CHECK ("store_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "trade_in_records" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trade_in_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"transaction_id" bigint,
	"resulting_unit_id" bigint,
	"original_brand_model" text NOT NULL,
	"imei" text NOT NULL,
	"grading_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offered_price" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transaction_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"transaction_id" bigint NOT NULL,
	"unit_id" bigint NOT NULL,
	"unit_price" numeric DEFAULT '0' NOT NULL,
	"warranty_duration_months" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"invoice_number" text,
	"sales_id" uuid,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"total_amount" numeric DEFAULT '0' NOT NULL,
	"trade_in_deduction" numeric DEFAULT '0' NOT NULL,
	"final_payment" numeric DEFAULT '0' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_technician_id_profiles_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_records" ADD CONSTRAINT "trade_in_records_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_in_records" ADD CONSTRAINT "trade_in_records_resulting_unit_id_inventory_units_id_fk" FOREIGN KEY ("resulting_unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_unit_id_inventory_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."inventory_units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sales_id_profiles_id_fk" FOREIGN KEY ("sales_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_units_product_status_idx" ON "inventory_units" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "inventory_units_status_idx" ON "inventory_units" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand") WHERE "products"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "service_tickets_code_idx" ON "service_tickets" USING btree ("ticket_code");--> statement-breakpoint
CREATE INDEX "service_tickets_status_idx" ON "service_tickets" USING btree ("repair_status");--> statement-breakpoint
CREATE INDEX "service_tickets_tech_idx" ON "service_tickets" USING btree ("technician_id");--> statement-breakpoint
CREATE INDEX "transaction_items_tx_idx" ON "transaction_items" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_created_idx" ON "transactions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_sales_idx" ON "transactions" USING btree ("sales_id");