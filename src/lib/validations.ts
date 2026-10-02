import { z } from "zod";
import type { RepairStatus } from "@/types";

// Validasi IMEI: tepat 15 digit angka (PRD Bab 7) + cek duplikat ke DB di action.
export const imeiSchema = z
  .string()
  .trim()
  .regex(/^\d{15}$/, "Nomor IMEI wajib tepat 15 digit angka.");

// Alfabet base32 tanpa I, L, O, U, sama persis dengan fungsi SQL
// generate_ticket_code(). Kode 4 digit lama tetap diterima supaya nota yang
// sudah tercetak tidak ikut invalid.
const TICKET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TICKET_CODE_PATTERN = /^SRV-\d{8}-(?:\d{4}|[0-9A-HJKMNP-TV-Z]{8})$/i;

/* Satu-satunya contoh kode tiket di seluruh situs.
 *
 * Nilai ini dulu ditulis ulang di tujuh tempat dan tidak semuanya sama: kolom
 * validasi memakai 20260913 sementara placeholder di halaman lacak, landing
 * page, dan widget live chat memakai 20260912. Pelanggan yang salah ketik
 * diarahkan ke kode SRV-YYYYMMDD-XXXXXXXX, lalu diklik "Cek nota", lalu diberi
 * pesan yang menyodorkan contoh berbeda dari yang tadi dia baca. Formatnya
 * sama, jadi kesalahannya tidak kelihatan sampai kode itu ditolak.
 *
 * Kode ini bukan contoh karangan. Migrasi 20260927170000 membuatkannya sebagai
 * tiket demo sungguhan yang sudah berjalan sampai status testing, jadi siapa
 * pun yang mengikutinya mendapat halaman lacak yang benar-benar berfungsi.
 */
export const TICKET_CODE_EXAMPLE = "SRV-20260912-7K4M2QX9";

/**
 * Sufiks 8 karakter untuk mode lokal tanpa Supabase. Di produksi kode ini
 * dibuat trigger SQL dengan gen_random_bytes(), jadi jangan dipakai di server.
 */
export function generateTicketSuffix(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += TICKET_ALPHABET[Math.floor(Math.random() * TICKET_ALPHABET.length)];
  }
  return out;
}

export const ticketCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    TICKET_CODE_PATTERN,
    `Format kode tiket: SRV-YYYYMMDD-XXXXXXXX, contoh ${TICKET_CODE_EXAMPLE}.`
  );

export const phoneSchema = z
  .string()
  .trim()
  .min(9, "Nomor telepon minimal 9 digit.")
  .max(16, "Nomor telepon maksimal 16 digit.")
  .regex(/^[0-9+()\-.\s]+$/, "Nomor telepon hanya boleh berisi angka dan +()-.");

// Username portal. Aturan ini harus sama dengan check
// profiles_username_format_check di supabase/migrations/0005_username_login.sql
// supaya client menolak lebih dulu dan tidak membuang satu round-trip ke DB.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username minimal 3 karakter.")
  .max(32, "Username maksimal 32 karakter.")
  .regex(
    /^[a-z0-9._-]+$/,
    "Username hanya boleh huruf kecil, angka, titik, garis bawah, atau strip."
  );

export const passwordSchema = z
  .string()
  .min(8, "Kata sandi minimal 8 karakter.")
  .max(128, "Kata sandi maksimal 128 karakter.");

export const customerSignUpSchema = z.object({
  fullName: z.string().trim().min(2, "Nama minimal 2 huruf.").max(120),
  email: z.string().trim().email("Email tidak valid.").max(254),
  password: passwordSchema,
  phoneNumber: phoneSchema,
});

export const staffInviteSchema = customerSignUpSchema.extend({
  username: usernameSchema,
  role: z.enum(["admin", "sales", "technician"]),
});

const rupiah = (label: string) =>
  z.coerce.number().min(0, `${label} tidak boleh negatif.`).max(999_999_999_999, `${label} terlalu besar.`);

/*
 * `default_price` punya aturan sendiri, dan aturannya dideklarasikan satu kali.
 *
 * Alasannya dua penjaga yang dulu berbeda. Schema memakai z.coerce.number(),
 * jadi "", null, dan [] ikut menjadi 0, sementara hargaAcuanLayak menolak
 * ketiganya karena bukan number. Form aman hanya karena ia memeriksa lebih
 * dulu, jadi panggilan updateProduct langsung masih bisa menulis 0 hasil
 * paksa. Dua penjaga yang berbeda itu bug laten: keduanya sama-sama terlihat
 * benar, dan hanya urutan pemanggil yang menjaga agar tidak berbeda.
 *
 * Bentuk barunya menutup celah di sumbernya. Guard tidak lagi menyalin
 * aturan, dia memanggil schema yang sama, jadi keduanya tidak mungkin
 * berbeda lagi walau salah satunya diubah. Nol tetap sah, karena itu artinya
 * "harga acuan belum dikonfirmasi", bukan "harga Rp0".
 *
 * Batas atas ikut ditegakkan di sini, bukan hanya di productSchema, supaya
 * pemanggilan guard dari form menjawab pertanyaan yang sama persis.
 */
const hargaAcuanSchema = z
  .number("Harga acuan harus berupa angka.")
  .min(0, "Harga acuan tidak boleh negatif.")
  .max(999_999_999_999, "Harga acuan terlalu besar.");

/**
 * Apakah angka ini layak disimpan sebagai `products.default_price`.
 *
 * Nol itu sah dan punya arti khusus: "harga acuan model ini belum dikonfirmasi",
 * bukan "harga Rp0". Produk hasil tukar tambah sering dimulai di kondisi itu karena
 * angkanya harus diisi staf yang tahu, dan tidak ada yang boleh mengarangnya.
 * Yang ditolak hanya angka negatif dan nilai yang bukan number finite, karena
 * keduanya tidak punya makna sebagai harga patokan.
 *
 * Fungsi ini dideklarasikan supaya form portal bisa memanggilnya. Sebelumnya
 * penjagaannya inline di dalam komponen React, jadi tidak ada satu pun test
 * yang bisa mengunci aturannya, dan mengubah `defaultPrice < 0` menjadi
 * `defaultPrice <= 0` akan lolos tanpa apa pun yang memberitahu. Gejalanya
 * persis bug yang sudah pernah terjadi: produk yang sengaja dibiarkan tanpa
 * harga tidak bisa disimpan dari portal, dan satu-satunya jalan untuk
 * memperbaikinya adalah SQL.
 *
 * Aturannya sengaja tidak ditulis ulang di sini. Fungsi ini memanggil
 * hargaAcuanSchema, jadi form dan schema tidak bisa berbeda jawaban, dan
 * setiap nilai yang ditolak di sini juga ditolak schema.
 */
export function hargaAcuanLayak(value: unknown): boolean {
  return hargaAcuanSchema.safeParse(value).success;
}

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
export type UnitStatusInput = z.infer<typeof updateUnitStatusSchema>;
export type UpdateUnitStatusInput = UnitStatusInput;

/**
 * Referensi foto yang disimpan di kolom photo_urls.
 *
 * Dua bucket foto pelanggan sengaja privat, jadi yang disimpan ke database
 * adalah path Storage, bukan URL. getPublicUrl tidak bisa dipakai di sana
 * karena hanya menyusun URL /object/public/ tanpa memeriksa privatnya bucket.
 * Path tidak pernah kedaluwarsa, sedangkan signed URL iya, jadi path yang
 * disimpan dan URL yang ditampilkan harus dipisahkan.
 *
 * URL penuh tetap diterima supaya baris lama yang sudah terlanjur menyimpan
 * URL dan seluruh mode mock lokal tidak ikut rusak. Path yang naik ke folder
 * induk juga ditolak walau karakternya lolos, supaya tidak ada kunci Storage
 * yang keluar dari folder stafnya sendiri.
 */
/**
 * Bentuk yang sah untuk satu referensi foto, dipakai bersama oleh sisi tulis
 * (photoRefSchema) dan sisi baca (filterFotoMilikSendiri).
 *
 * Satu fungsi, bukan dua: sebelumnya sisi baca hanya cocok-checking prefix
 * folder dan sama sekali tidak menolak "..", jadi path seperti
 * `<id-saya>/../<id-lain>/foto.jpg` lolos ke createSignedUrls. Aturan yang
 * berbeda antara tulis dan baca adalah bug, bukan pilihan.
 */
function photoRefBentukSah(v: string): boolean {
  if (/^https?:\/\//i.test(v)) return true;
  if (v.includes("..")) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(v);
}

const photoRefSchema = z
  .string()
  .trim()
  .min(1, "Referensi foto tidak boleh kosong.")
  .max(600, "Referensi foto terlalu panjang.")
  .refine(photoRefBentukSah, "Referensi foto harus berupa path Storage atau URL.");

/** Daftar foto, maksimal sepuluh, sama untuk tiket servis dan trade-in. */
const photoRefsSchema = z.array(photoRefSchema).max(10, "Maksimal 10 foto.");

// Grading kondisi unit lama (FR-C-01). Foto diunggah terpisah via uploadPhoto.
export const tradeInGradingSchema = z.object({
  originalBrandModel: z.string().trim().min(3, "Isi merek dan tipe unit lama."),
  imei: imeiSchema,
  gradingDetails: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  offeredPrice: rupiah("Nilai taksiran"),
  photoUrls: photoRefsSchema.default([]),
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
  photoUrls: photoRefsSchema.default([]),
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
  // Foto progres perbaikan ditambahkan dari meja kerja, bukan hanya saat intake,
  // jadi update perlu bisa menambah URL tanpa menimpa daftar yang ada.
  photoUrls: photoRefsSchema.optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// Master produk, eksklusif Admin (FR-D-04). Schema create dan update sengaja
// dipisah: `.partial()` pada schema yang memiliki default akan mengaktifkan
// kembali default saat field tidak dikirim, sehingga edit dapat menimpa data.
const productBrand = z.string().trim().min(2, "Merek minimal 2 huruf.");
const productModel = z.string().trim().min(2, "Nama model minimal 2 huruf.");
const productSpecs = z.string().trim();
/**
 * image_url produk: kosong berarti tidak ada foto, atau nilai yang benar-benar
 * bisa dirender.
 *
 * Schema ini sengaja satu sumber kebenaran yang sama dengan sisi baca.
 * src/lib/shop.ts (isUsablePhoto) sudah memutuskan bentuk yang sah: path
 * same-origin yang diawali satu garis miring, atau URL http/https absolut,
 * dan TIDAK "//host/path" karena browser membacanya sebagai protocol-relative
 * URL ke host lain. Migrasi 20260927201000_clear_unparseable_product_image_url.sql
 * membersihkan nilai di luar bentuk yang sama.
 *
 * Sebelumnya schema ini z.string().trim() polos, jadi "products/foo.jpg" tanpa
 * garis miring dan string "undefined/..." hasil template literal yang gagal
 * semuanya diterima, lalu dibersihkan belakangan oleh migrasi. Menulis lalu
 * menghapus adalah dua langkah; lebih baik nilainya tidak bisa ditulis.
 *
 * ".." ditolak pada bentuk path supaya tidak ada kunci yang keluar dari direktori
 * aset, meski isUsablePhoto tidak memeriksanya.
 */
/**
 * Bentuk satu alamat foto, dipakai bersama oleh image_url, official_images,
 * dan second_images.
 *
 * Satu fungsi, bukan tiga. Sebelumnya hanya image_url yang diperiksa, jadi
 * official_images dan second_images menerima "javascript:alert(1)",
 * "//evil.example/x.jpg", dan "../../etc/passwd" apa adanya. Sisi baca
 * menyaringnya sebelum menulis ke src, jadi tidak ada yang bisa dirender dari
 * nilai-nilai itu, tapi aturan yang berbeda antara sisi tulis dan sisi baca
 * adalah bug, bukan pilihan: begitu sisi baca berubah, nilai yang dulu ditolak
 * diam-diam ikut lolos.
 *
 * Bentuk yang sah sama persis dengan isUsablePhoto di src/lib/shop.ts: path
 * same-origin yang diawali satu garis miring, atau URL http/https absolut.
 * "//host/path" tidak sah karena browser membacanya sebagai protocol-relative
 * URL ke host lain, bukan path di server sendiri.
 */
function alamatFotoSah(v: string): boolean {
  if (v === "") return false;
  if (v.startsWith("//")) return false;
  if (v.startsWith("/")) return !v.includes("..");
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * image_url produk: kosong berarti tidak ada foto, atau nilai yang benar-benar
 * bisa dirender.
 *
 * Schema ini sengaja satu sumber kebenaran yang sama dengan sisi baca.
 * src/lib/shop.ts (isUsablePhoto) sudah memutuskan bentuk yang sah: path
 * same-origin yang diawali satu garis miring, atau URL http/https absolut,
 * dan TIDAK "//host/path" karena browser membacanya sebagai protocol-relative
 * URL ke host lain. Migrasi 20260927201000_clear_unparseable_product_image_url.sql
 * membersihkan nilai di luar bentuk yang sama.
 *
 * Sebelumnya schema ini z.string().trim() polos, jadi "products/foo.jpg" tanpa
 * garis miring dan string "undefined/..." hasil template literal yang gagal
 * semuanya diterima, lalu dibersihkan belakangan oleh migrasi. Menulis lalu
 * menghapus adalah dua langkah; lebih baik nilainya tidak bisa ditulis.
 *
 * ".." ditolak pada bentuk path supaya tidak ada kunci yang keluar dari direktori
 * aset, meski isUsablePhoto tidak memeriksanya.
 */
const productImage = z
  .string()
  .trim()
  .max(2048, "Alamat foto terlalu panjang.")
  .refine((v) => v === "" || alamatFotoSah(v), "Foto harus berupa URL http/https atau path yang diawali /.");

/**
 * Satu entri galeri foto produk.
 *
 * Bentuknya sama dengan image_url dan tidak boleh lebih longgar: galeri dan
 * sampul berakhir di atribut src yang sama, jadi perbedaan aturan di sini
 * hanya akan berarti satu jalur bisa ditulis nilai yang di jalur lain ditolak.
 * Entri kosong juga ditolak supaya galeri tidak punya lubang yang dirender
 * sebagai fotorusak.
 */
const productGalleryImage = z
  .string()
  .trim()
  .max(2048, "Alamat foto terlalu panjang.")
  .refine(alamatFotoSah, "Foto harus berupa URL http/https atau path yang diawali /.");

const productOfficialImages = z.array(productGalleryImage).max(10);
const productSecondImages = z.array(productGalleryImage).max(10);

export const productSchema = z.object({
  brand: productBrand,
  model_name: productModel,
  specs: productSpecs.default(""),
  default_price: hargaAcuanSchema.default(0),
  image_url: productImage.default(""),
  official_images: productOfficialImages.default([]),
  second_images: productSecondImages.default([]),
  is_active: z.boolean().default(true),
});
export type ProductInput = z.infer<typeof productSchema>;

export const productUpdateSchema = z.object({
  brand: productBrand.optional(),
  model_name: productModel.optional(),
  specs: productSpecs.optional(),
  default_price: hargaAcuanSchema.optional(),
  image_url: productImage.optional(),
  official_images: productOfficialImages.optional(),
  second_images: productSecondImages.optional(),
  is_active: z.boolean().optional(),
});
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

// Konten profil publik toko, Admin (FR-D-02).
const storeName = z.string().trim().min(3, "Nama toko minimal 3 huruf.");
const storeDescriptionId = z.string().trim().min(10, "Deskripsi ID minimal 10 huruf.");
const storeDescriptionEn = z.string().trim().min(10, "Deskripsi EN minimal 10 huruf.");
const storeAddress = z.string().trim().min(5, "Alamat minimal 5 huruf.");
const storeLatitude = z.coerce.number().min(-90).max(90).nullable().optional();
const storeLongitude = z.coerce.number().min(-180).max(180).nullable().optional();
const storeMapsUrl = z.string().trim().url("URL peta tidak valid.").max(500).or(z.literal(""));
const storePhone = z.string().trim().min(5, "Nomor telepon toko wajib diisi.");
const storeWhatsapp = z.string().trim().max(16);
// Menerima format apa pun yang diketik staf, termasuk 0812..., lalu
// cleanWaNumber yang menormalkan ke 62812... untuk link wa.me. Validasi di sini
// hanya menjaga panjang masuk akal, bukan menolak format lokal.
const storeOwnerName = z.string().trim().max(80);
// Hanya http dan https. Menolak skema lain mencegah form settings dipakai
// menyuntik javascript: atau data: lewat kolom URL.
const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//.test(v), {
    message: "URL sosmed harus diawali http:// atau https://.",
  });
const openingHours = z.record(z.string(), z.string());

export const storeSettingsSchema = z.object({
  store_name: storeName,
  description_id: storeDescriptionId,
  description_en: storeDescriptionEn,
  address: storeAddress,
  latitude: storeLatitude,
  longitude: storeLongitude,
  maps_url: storeMapsUrl.optional(),
  phone_number: storePhone,
  whatsapp_number: storeWhatsapp.optional(),
  owner_name: storeOwnerName.optional(),
  social_facebook: socialUrl.optional(),
  social_instagram: socialUrl.optional(),
  social_x: socialUrl.optional(),
  social_tiktok: socialUrl.optional(),
  opening_hours: openingHours.default({}),
});
export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

export const storeSettingsUpdateSchema = z.object({
  store_name: storeName.optional(),
  description_id: storeDescriptionId.optional(),
  description_en: storeDescriptionEn.optional(),
  address: storeAddress.optional(),
  latitude: storeLatitude,
  longitude: storeLongitude,
  maps_url: storeMapsUrl.optional(),
  phone_number: storePhone.optional(),
  whatsapp_number: storeWhatsapp.optional(),
  owner_name: storeOwnerName.optional(),
  social_facebook: socialUrl.optional(),
  social_instagram: socialUrl.optional(),
  social_x: socialUrl.optional(),
  social_tiktok: socialUrl.optional(),
  opening_hours: openingHours.optional(),
});
export type StoreSettingsUpdateInput = z.infer<typeof storeSettingsUpdateSchema>;

// Upload foto kondisi (trade-in / servis). Validasi ringan di server.
export const uploadPhotoSchema = z.object({
  bucket: z.enum(["trade-in-photos", "service-photos"]),
  fileName: z.string().trim().min(3).max(160),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.coerce.number().int().positive().max(5 * 1024 * 1024, "Maksimal 5MB per foto."),
});
export type UploadPhotoInput = z.infer<typeof uploadPhotoSchema>;

/**
 * Folder Storage milik satu staf, satu-satunya prefix yang boleh dipakai
 * untuk menyusun kunci objek.
 *
 * Sisi baca (photoRefSchema di atas) menolak ".." dan karakter di luar
 * [A-Za-z0-9._\-/]. Sisi tulis tidak boleh lebih longgar dari sisi baca:
 * prefix yang lolos akan menulis berkas ke folder staf lain, jadi prefix
 * tidak lagi jadi parameter publik uploadPhoto dan nilainya selalu
 * profile.id dari requireRole. Pemeriksaan ini tetap ada supaya penjaga
 * di sisi aplikasi tidak bisa hilang tanpa terlihat.
 */
const storageFolderSchema = z
  .string()
  .min(1, "Folder foto tidak boleh kosong.")
  .max(100, "Folder foto terlalu panjang.")
  .refine(
    (v) => /^[A-Za-z0-9._-]+$/.test(v) && !v.includes(".."),
    "Folder foto harus satu segmen tanpa garis miring."
  );

/**
 * Susun kunci objek Storage untuk satu foto: `<folder>/<acak>-<nama>`.
 *
 * Nama file dibersihkan di sini, bukan di pemanggil, supaya tidak ada jalur
 * yang melewatkan pembersihan itu. Kembalikan null kalau folder tidak aman;
 * pemanggil membalas dengan fail(...).
 */
export function buildPhotoObjectKey(
  folder: string,
  randomPart: string,
  fileName: string
): string | null {
  const parsed = storageFolderSchema.safeParse(folder);
  if (!parsed.success) return null;
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${parsed.data}/${randomPart}-${safeName}`;
}

/**
 * Batas jumlah path foto yang ditandatangani dalam satu permintaan.
 *
 * Diekspor karena action signPhotoPaths ikut memakainya, supaya batas di
 * modul ini dan batas yang benar-benar dijalankan tidak bisa berbeda.
 */
export const BATAS_PATH_FOTO = 50;

/**
 * Bentuk yang harus dimiliki sebuah object key Storage.
 *
 * Dipakai sebagai gerbang pertama di signPhotoPaths, sebelum nama path
 * apa pun masuk ke query atau Storage. Nilai yang tidak berbentuk object key
 * tidak mungkin jadi hasil filterFotoMilikSendiri maupun hasil pencarian foto yang
 * terpakai, jadi memfilternya di sini tidak mengubah apa pun yang boleh
 * ditandatangani, hanya menghemat pekerjaan.
 */
export function objectKeyBentukSah(v: string): boolean {
  if (v === "") return false;
  if (v.includes("..")) return false;
  return /^[A-Za-z0-9._\-/]+$/.test(v) && v.includes("/");
}

/**
 * Ambil hanya path foto yang benar-benar ada di folder staf pemanggil.
 *
 * Aturan ini adalah pasangan dari buildPhotoObjectKey di atas: unggah hanya
 * bisa menulis ke folder staf pemanggil, jadi membaca balik juga harus
 * dibatasi ke folder itu. Tanpa batasnya, signPhotoPaths menjadi cara
 * menandatangani foto milik staf lain, dan dua bucket privat itu memuat IMEI,
 * nama pelanggan, serta foto layar perangkat.
 *
 * Sisi lain yang sudah ada: filterFotoMilikSendiri bukan lagi satu-satunya
 * gerbang di signPhotoPaths. Foto yang diunggah staf lain dan sudah tersimpan
 * ke photo_urls tiket memang boleh ditandatangani, karena foto itu bagian
 * dari tiket yang sedang dibuka pemanggil. Yang tetap ditolak di sini adalah
 * folder orang lain yang tidak pernah muncul di data mana pun.
 *
 * Masukan diketik unknown karena pemanggilnya Server Action, jadi daftar path
 * datang langsung dari HTTP dan isinya bisa apa saja. Nilai bukan string
 * dibuang, bukan dibaca, supaya tidak ada accessor yang dipanggil di luar
 * kendali. Path https:// juga dibuang: URL penuh bukan object key, dan yang
 * boleh ditandatangani tetap hanya key di dalam bucket.
 *
 * Bentuk path diperiksa dengan photoRefBentukSah yang sama dengan sisi tulis,
 * jadi ".." yang bisa memanjai prefix seolah-olah folder lain ikut ditolak di sini
 * juga. Prefix saja tidak cukup: `<id-saya>/../<id-lain>/foto.jpg` memang
 * diawali folder pemanggil, tapi Storage akan menafsirkan object key itu sebagai
 * folder milik orang lain.
 */
export function filterFotoMilikSendiri(
  folder: string,
  paths: readonly unknown[]
): string[] {
  const parsed = storageFolderSchema.safeParse(folder);
  if (!parsed.success) return [];
  const prefiks = `${parsed.data}/`;
  return [
    ...new Set(
      paths.filter(
        (p): p is string =>
          typeof p === "string" && p.startsWith(prefiks) && photoRefBentukSah(p)
      )
    ),
  ].slice(0, BATAS_PATH_FOTO);
}

/**
 * Status unit yang boleh ditulis teknisi, dan hanya itu.
 *
 * Alasannya bukan struktur peran, melainkan siapa yang berhak menerbitkan unit
 * ke etalase publik. v_public_inventory pada migrasi
 * 20260927180000_nullable_inventory_unit_product.sql memfilter
 * status = available, jadi available adalah satu-satunya status yang mengirim
 * unit ke halaman publik. reserved adalah keputusan penjualan, dan sold hanya
 * boleh lewat transaksi POS supaya nota tercatat.
 *
 * Yang tersisa, in_service dan returned, adalah pekerjaan reparasi itu
 * sendiri: teknisi menarik unit masuk dan mengembalikannya. Keduanya arah
 * bolak-balik, jadi daftar ini sekaligus menjawab "boleh masuk in_service"
 * dan "boleh keluar dari in_service".
 */
export const UNIT_STATUS_OLEH_TEKNISI = ["in_service", "returned"] as const;

/** True kalau teknisi boleh menulis status ini (lihat daftar di atas). */
export function bolehTeknisiSetUnitStatus(status: UnitStatusInput["status"]): boolean {
  return (UNIT_STATUS_OLEH_TEKNISI as readonly string[]).includes(status);
}

/** Nilai yang boleh tersimpan di profiles.role, sama dengan enum user_role. */
export const staffRoleSchema = z.enum(["admin", "sales", "technician", "customer"]);
export type StaffRoleInput = z.infer<typeof staffRoleSchema>;

/**
 * True kalau perubahan peran atau penonaktifan ini akan meninggalkan NOL
 * admin, jadi aksi harus ditolak.
 *
 * adminCount diambil dari database, targetIsAdmin adalah peran target
 * sekarang, dan nextIsAdmin adalah peran sesudahnya (false untuk
 * penonaktifan). Yang dihitung hanya admin yang benar-benar hilang, jadi
 * promosi ke admin tidak pernah ikut tersentuh.
 */
export function wouldLeaveNoAdmin(input: {
  adminCount: number;
  targetIsAdmin: boolean;
  nextIsAdmin: boolean;
}): boolean {
  return input.targetIsAdmin && !input.nextIsAdmin && input.adminCount <= 1;
}
