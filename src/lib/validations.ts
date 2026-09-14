import { z } from "zod";
import type { RepairStatus } from "@/types";

// Validasi IMEI: tepat 15 digit angka (PRD Bab 7) + cek duplikat ke DB di action.
export const imeiSchema = z
  .string()
  .trim()
  .regex(/^\d{15}$/, "Nomor IMEI wajib tepat 15 digit angka.");

export const ticketCodeSchema = z
  .string()
  .trim()
  .regex(/^SRV-\d{8}-\d{4}$/, "Format kode tiket: SRV-YYYYMMDD-XXXX.");

export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Nomor telepon minimal 9 digit.")
  .max(16, "Nomor telepon maksimal 16 digit.")
  .regex(/^[0-9+()\-.\s]+$/, "Nomor telepon hanya boleh berisi angka dan +()-.");

const rupiah = (label: string) =>
  z.coerce.number().min(0, `${label} tidak boleh negatif.`).max(999_999_999_999, `${label} terlalu besar.`);

// Registrasi batch IMEI di bawah katalog produk (Sales). FR-A-01.
export const registerUnitsSchema = z
  .object({
    productId: z.coerce.number().int().positive("Pilih katalog produk dulu."),
    condition: z.enum(["new", "second"]),
    purchaseCost: rupiah("Modal beli"),
    sellingPrice: rupiah("Harga jual"),
    imeis: z
      .array(imeiSchema)
      .min(1, "Minimal 1 IMEI.")
      .max(200, "Maksimal 200 IMEI per batch."),
  })
  .refine((v) => new Set(v.imeis.map((i) => i.trim())).size === v.imeis.length, {
    message: "Ada IMEI ganda di dalam batch ini.",
    path: ["imeis"],
  });
export type RegisterUnitsInput = z.infer<typeof registerUnitsSchema>;

// Mutasi status unit fisik (reserved/sold/in_service/returned/dll).
export const updateUnitStatusSchema = z.object({
  unitId: z.coerce.number().int().positive(),
  status: z.enum(["available", "reserved", "sold", "in_service", "returned"]),
});
export type UpdateUnitStatusInput = z.infer<typeof updateUnitStatusSchema>;

// Grading kondisi unit lama (FR-C-01). Foto diunggah terpisah via uploadPhoto.
export const tradeInGradingSchema = z.object({
  originalBrandModel: z.string().trim().min(3, "Isi merek dan tipe unit lama."),
  imei: imeiSchema,
  gradingDetails: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  offeredPrice: rupiah("Nilai taksiran"),
  photoUrls: z.array(z.string().url("URL foto tidak valid.")).max(10).default([]),
});
export type TradeInGradingInput = z.infer<typeof tradeInGradingSchema>;

// Checkout POS, opsional dengan trade-in (FR-A-02, FR-C-03).
export const posSaleSchema = z.object({
  unitId: z.coerce.number().int().positive("Pilih unit fisik (IMEI) dulu."),
  customerName: z.string().trim().min(2, "Nama pelanggan minimal 2 huruf."),
  customerPhone: phoneSchema,
  paymentMethod: z.enum(["cash", "transfer", "qris", "debit", "credit"]),
  warrantyDurationMonths: z.coerce.number().int().min(0).max(36).default(3),
  tradeIn: tradeInGradingSchema.optional(),
});
export type PosSaleInput = z.infer<typeof posSaleSchema>;

// Pendaftaran tiket servis (FR-B-01). Kode dibuat trigger DB, bukan aplikasi.
export const createTicketSchema = z.object({
  customerName: z.string().trim().min(2, "Nama pelanggan minimal 2 huruf."),
  customerPhone: phoneSchema,
  deviceModel: z.string().trim().min(2, "Isi merek dan tipe perangkat."),
  deviceName: z.string().trim().max(120).optional(),
  imeiOrSn: z.string().trim().max(20, "IMEI/SN maksimal 20 karakter.").default(""),
  issueNotes: z.string().trim().min(5, "Jelaskan keluhan minimal 5 huruf."),
  technicianId: z.string().uuid("ID teknisi tidak valid.").optional(),
  photoUrls: z.array(z.string().url("URL foto tidak valid.")).max(10).default([]),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

// Alur status resmi (FR-B-02). `cancelled` boleh dari tahap mana pun sebelum completed.
export const REPAIR_FLOW: Record<RepairStatus, RepairStatus[]> = {
  received: ["diagnosing", "cancelled"],
  diagnosing: ["waiting_approval", "cancelled"],
  waiting_approval: ["in_progress", "cancelled"],
  in_progress: ["testing", "cancelled"],
  testing: ["completed", "in_progress", "cancelled"],
  completed: ["picked_up"],
  picked_up: [],
  cancelled: [],
};

export function isAllowedTransition(from: RepairStatus, to: RepairStatus): boolean {
  return REPAIR_FLOW[from]?.includes(to) ?? false;
}

const costItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Nama biaya minimal 2 huruf."),
  cost: rupiah("Nominal biaya"),
  type: z.enum(["sparepart", "labor"]),
});

export const updateTicketSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  repairStatus: z.enum([
    "received",
    "diagnosing",
    "waiting_approval",
    "in_progress",
    "testing",
    "completed",
    "picked_up",
    "cancelled",
  ]),
  technicianId: z.string().uuid("ID teknisi tidak valid.").optional(),
  technicianNotes: z.string().trim().max(2000).optional(),
  sparepartFee: rupiah("Biaya sparepart").optional(),
  laborFee: rupiah("Biaya jasa").optional(),
  warrantyDays: z.coerce.number().int().min(0).max(365).optional(),
  costBreakdown: z.array(costItemSchema).max(50).optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// Master produk, eksklusif Admin (FR-D-04).
export const productSchema = z.object({
  brand: z.string().trim().min(2, "Merek minimal 2 huruf."),
  model_name: z.string().trim().min(2, "Nama model minimal 2 huruf."),
  specs: z.string().trim().default(""),
  default_price: rupiah("Harga acuan"),
  image_url: z.string().trim().default(""),
  official_images: z.array(z.string()).max(10).default([]),
  second_images: z.array(z.string()).max(10).default([]),
  is_active: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productSchema>;

// Konten profil publik toko, Admin (FR-D-02).
export const storeSettingsSchema = z.object({
  store_name: z.string().trim().min(3, "Nama toko minimal 3 huruf."),
  description_id: z.string().trim().min(10, "Deskripsi ID minimal 10 huruf."),
  description_en: z.string().trim().min(10, "Deskripsi EN minimal 10 huruf."),
  address: z.string().trim().min(5, "Alamat minimal 5 huruf."),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  maps_url: z.string().trim().url("URL peta tidak valid.").max(500).or(z.literal("")).optional(),
  phone_number: z.string().trim().min(5, "Nomor telepon toko wajib diisi."),
  whatsapp_number: z.string().trim().max(16).optional(),
  opening_hours: z.record(z.string(), z.string()).default({}),
});
export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

// Upload foto kondisi (trade-in / servis). Validasi ringan di server.
export const uploadPhotoSchema = z.object({
  bucket: z.enum(["trade-in-photos", "service-photos"]),
  fileName: z.string().trim().min(3).max(160),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.coerce.number().int().positive().max(5 * 1024 * 1024, "Maksimal 5MB per foto."),
});
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;
