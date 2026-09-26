// Skema Drizzle: "cetak biru" 8 tabel + 5 enum dalam TypeScript.
// CERMINAN migrasi SQL supabase/migrations/0001_atcell_schema.sql — sumber
// kebenaran struktur DB tetap file SQL itu. Bila menambah tabel/kolom:
// 1) ubah file ini, 2) `npx drizzle-kit generate`, 3) terapkan SQL-nya ke DB.
// Jangan ubah nilai enum tanpa migrasi (data lama bisa rusak).
//
// CATATAN NAMA CHECK: constraint check yang ditulis inline di 0001 tidak diberi
// nama, jadi Postgres menamainya sendiri dengan pola <tabel>_<kolom>_check.
// Nama di bawah sengaja mengikuti pola itu supaya cermin Drizzle dan DB
// memakai nama yang sama. Kalau suatu saat nama constraint di DB diganti
// manual, sesuaikan juga di sini.
//
// ARTEFAK drizzle-generated/ hanya referensi offline (lihat drizzle.config.ts)
// dan tidak boleh dijalankan ke database production: canonical migration tetap
// file di supabase/migrations/.

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { ServiceCostItem } from "@/types";

// Setiap tabel butuh instance kolom baru (tidak boleh sharing instance),
// jadi kolom waktu dibuat lewat fungsi pabrik.
const createdAtCol = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAtCol = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// --- Enum native (nilai HARUS sama dengan SQL) ---
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "sales",
  "technician",
  "customer",
]);
export const unitConditionEnum = pgEnum("unit_condition", ["new", "second"]);
export const unitStatusEnum = pgEnum("unit_status", [
  "available",
  "reserved",
  "sold",
  "in_service",
  "returned",
]);
export const repairStatusEnum = pgEnum("repair_status", [
  "received",
  "diagnosing",
  "waiting_approval",
  "in_progress",
  "testing",
  "completed",
  "picked_up",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "transfer",
  "qris",
  "debit",
  "credit",
]);

// --- profiles (1:1 dengan auth.users; trigger SQL yang mengisinya) ---
// email dan username adalah denormalisasi dari auth.users supaya portal bisa
// login memakai username (lihat supabase/migrations/0005_username_login.sql).
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull().default("customer"),
  phoneNumber: text("phone_number").notNull().default(""),
  email: text("email"),
  username: text("username").notNull(),
  createdAt: createdAtCol(),
});

// --- store_settings (singleton id = 1, dikelola Admin) ---
export const storeSettings = pgTable(
  "store_settings",
  {
    id: integer("id").primaryKey(),
    storeName: text("store_name").notNull().default("At Cell"),
    descriptionId: text("description_id").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    address: text("address").notNull().default(""),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    mapsUrl: text("maps_url"),
    phoneNumber: text("phone_number").notNull().default(""),
    whatsappNumber: text("whatsapp_number"),
    // URL sosmed opsional. Null berarti platform itu tidak ditampilkan, jadi
    // tidak ada link placeholder yang mengarah ke domain orang lain.
    socialFacebook: text("social_facebook"),
    socialInstagram: text("social_instagram"),
    socialX: text("social_x"),
    socialTiktok: text("social_tiktok"),
    openingHours: jsonb("opening_hours")
      .$type<Record<string, string>>()
      .notNull()
      .default({ monday_friday: "09:00 - 21:00", saturday_sunday: "10:00 - 22:00" }),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    check("store_settings_id_check", sql`${t.id} = 1`)
  ]
);

// --- products (master katalog, eksklusif Admin) ---
export const products = pgTable(
  "products",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    brand: text("brand").notNull(),
    modelName: text("model_name").notNull(),
    specs: text("specs").notNull().default(""),
    defaultPrice: numeric("default_price").notNull().default("0"),
    imageUrl: text("image_url").notNull().default(""),
    officialImages: text("official_images")
      .array()
      .notNull()
      .default(sql`'{}'`),
    secondImages: text("second_images")
      .array()
      .notNull()
      .default(sql`'{}'`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAtCol(),
  },
  (t) => [
    index("products_brand_idx").on(t.brand).where(sql`${t.isActive}`),
    check("products_default_price_check", sql`${t.defaultPrice} >= 0`),
  ]
);

// --- inventory_units (satu baris = satu HP fisik ber-IMEI) ---
export const inventoryUnits = pgTable(
  "inventory_units",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    imei: text("imei").notNull().unique(),
    condition: unitConditionEnum("condition").notNull(),
    status: unitStatusEnum("status").notNull().default("available"),
    purchaseCost: numeric("purchase_cost").notNull().default("0"),
    sellingPrice: numeric("selling_price").notNull().default("0"),
    createdAt: createdAtCol(),
  },
  (t) => [
    check("inventory_units_imei_check", sql`${t.imei} ~ '^\\d{15}$'`),
    index("inventory_units_product_status_idx").on(t.productId, t.status),
    index("inventory_units_status_idx").on(t.status),
  ]
);

// --- transactions (nota kasir; customer nullable untuk walk-in) ---
export const transactions = pgTable(
  "transactions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // Dikosongkan saat insert: trigger SQL mengisi INV-YYYYMMDD-XXXXXX.
    invoiceNumber: text("invoice_number").unique(),
    salesId: uuid("sales_id").references(() => profiles.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => profiles.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull().default(""),
    totalAmount: numeric("total_amount").notNull().default("0"),
    tradeInDeduction: numeric("trade_in_deduction").notNull().default("0"),
    finalPayment: numeric("final_payment").notNull().default("0"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    createdAt: createdAtCol(),
  },
  (t) => [
    index("transactions_created_idx").on(t.createdAt.desc()),
    index("transactions_sales_idx").on(t.salesId),
  ]
);

export const transactionItems = pgTable(
  "transaction_items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    transactionId: bigint("transaction_id", { mode: "number" })
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    unitId: bigint("unit_id", { mode: "number" })
      .notNull()
      .references(() => inventoryUnits.id, { onDelete: "restrict" }),
    unitPrice: numeric("unit_price").notNull().default("0"),
    warrantyDurationMonths: integer("warranty_duration_months").notNull().default(3),
  },
  (t) => [
    index("transaction_items_tx_idx").on(t.transactionId),
    check(
      "transaction_items_warranty_duration_months_check",
      sql`${t.warrantyDurationMonths} >= 0`
    ),
  ]
);

// --- trade_in_records (hasil grading unit lama) ---
export const tradeInRecords = pgTable(
  "trade_in_records",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    transactionId: bigint("transaction_id", { mode: "number" }).references(
      () => transactions.id,
      { onDelete: "set null" }
    ),
    resultingUnitId: bigint("resulting_unit_id", { mode: "number" }).references(
      () => inventoryUnits.id,
      { onDelete: "set null" }
    ),
    originalBrandModel: text("original_brand_model").notNull(),
    imei: text("imei").notNull(),
    gradingDetails: jsonb("grading_details")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    offeredPrice: numeric("offered_price").notNull().default("0"),
    createdAt: createdAtCol(),
  },
  (t) => [check("trade_in_records_imei_check", sql`${t.imei} ~ '^\\d{15}$'`)]
);

// --- service_tickets (tiket reparasi) ---
export const serviceTickets = pgTable(
  "service_tickets",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // Dikosongkan saat insert: trigger SQL mengisi SRV-YYYYMMDD-XXXX.
    // Tanpa DEFAULT supaya tetap sama dengan DB; trigger menerima null maupun
    // string kosong.
    ticketCode: text("ticket_code").notNull().unique(),
    customerId: uuid("customer_id").references(() => profiles.id, { onDelete: "set null" }),
    technicianId: uuid("technician_id").references(() => profiles.id, { onDelete: "set null" }),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull().default(""),
    deviceModel: text("device_model").notNull(),
    deviceName: text("device_name"),
    imeiOrSn: text("imei_or_sn").notNull().default(""),
    issueNotes: text("issue_notes").notNull().default(""),
    problemDescription: text("problem_description"),
    technicianNotes: text("technician_notes"),
    repairStatus: repairStatusEnum("repair_status").notNull().default("received"),
    photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sparepartFee: numeric("sparepart_fee").notNull().default("0"),
    laborFee: numeric("labor_fee").notNull().default("0"),
    totalFee: numeric("total_fee").notNull().default("0"),
    warrantyDays: integer("warranty_days").notNull().default(30),
    costBreakdown: jsonb("cost_breakdown")
      .$type<ServiceCostItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: createdAtCol(),
    updatedAt: updatedAtCol(),
  },
  (t) => [
    uniqueIndex("service_tickets_code_idx").on(t.ticketCode),
    index("service_tickets_status_idx").on(t.repairStatus),
    index("service_tickets_tech_idx").on(t.technicianId),
    // Bentuk kode yang didukung trigger strengthened: 4 digit lama atau
    // 8 karakter base32. Migrasi 20260926103000 menambahkannya di DB.
    check(
      "service_tickets_ticket_code_format_chk",
      sql`${t.ticketCode} ~ '^SRV-[0-9]{8}-([0-9]{4}|[0-9A-HJKMNP-TV-Z]{8})$'`
    ),
  ]
);

// --- Relasi antar tabel (hanya dipakai query bertingkat db.query, tidak
// mengubah struktur DB). Contoh: ambil transaksi beserta item dan unitnya.
export const profilesRelations = relations(profiles, ({ many }) => ({
  salesTransactions: many(transactions, { relationName: "sales" }),
  customerTransactions: many(transactions, { relationName: "customer" }),
  handledTickets: many(serviceTickets),
}));

export const productsRelations = relations(products, ({ many }) => ({
  units: many(inventoryUnits),
}));

export const inventoryUnitsRelations = relations(inventoryUnits, ({ one, many }) => ({
  product: one(products, { fields: [inventoryUnits.productId], references: [products.id] }),
  items: many(transactionItems),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  sales: one(profiles, {
    relationName: "sales",
    fields: [transactions.salesId],
    references: [profiles.id],
  }),
  customer: one(profiles, {
    relationName: "customer",
    fields: [transactions.customerId],
    references: [profiles.id],
  }),
  items: many(transactionItems),
  tradeIn: one(tradeInRecords, {
    fields: [transactions.id],
    references: [tradeInRecords.transactionId],
  }),
}));

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id],
  }),
  unit: one(inventoryUnits, {
    fields: [transactionItems.unitId],
    references: [inventoryUnits.id],
  }),
}));

export const tradeInRecordsRelations = relations(tradeInRecords, ({ one }) => ({
  transaction: one(transactions, {
    fields: [tradeInRecords.transactionId],
    references: [transactions.id],
  }),
  resultingUnit: one(inventoryUnits, {
    fields: [tradeInRecords.resultingUnitId],
    references: [inventoryUnits.id],
  }),
}));

export const serviceTicketsRelations = relations(serviceTickets, ({ one }) => ({
  technician: one(profiles, {
    fields: [serviceTickets.technicianId],
    references: [profiles.id],
  }),
}));

// Tipe baris siap pakai (Select = hasil baca, Insert = payload tulis).
export type ProductRow = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;
export type InventoryUnitRow = typeof inventoryUnits.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type ServiceTicketRow = typeof serviceTickets.$inferSelect;
