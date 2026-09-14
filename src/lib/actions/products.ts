"use server";

// Contoh migrasi ke Drizzle: query ditulis sebagai kode TypeScript
// (db.select/insert/update), bukan string SQL mentah dan bukan supabase.from().
// Keuntungan: salah ketik nama kolom langsung ketahuan saat `tsc`.
import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { products, type ProductRow } from "@/db/schema";
import { productSchema, type ProductInput } from "@/lib/validations";
import type { Product } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  toISO,
  toNumber,
  type ActionResult,
} from "./_helpers";

function mapRow(p: ProductRow): Product {
  return {
    id: p.id,
    brand: p.brand,
    model_name: p.modelName,
    specs: p.specs,
    default_price: toNumber(p.defaultPrice),
    image_url: p.imageUrl,
    official_images: p.officialImages ?? [],
    second_images: p.secondImages ?? [],
    created_at: toISO(p.createdAt),
  };
}

/** Katalog untuk portal (termasuk nonaktif). Etalase publik pakai getPublicInventory. */
export async function listProducts(
  opts?: { includeInactive?: boolean }
): Promise<ActionResult<Product[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  const base = db.select().from(products).orderBy(desc(products.createdAt));
  const rows = opts?.includeInactive
    ? await base
    : await db
        .select()
        .from(products)
        .where(eq(products.isActive, true))
        .orderBy(desc(products.createdAt));
  return ok(rows.map(mapRow));
}

/** Tambah entri katalog. Eksklusif Admin (ganda ditegakkan RLS). */
export async function createProduct(raw: ProductInput): Promise<ActionResult<Product>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input produk tidak valid.");
  const db = getDb();
  if (!db) return backendOffline();
  const v = parsed.data;
  // Kunci camelCase di kiri = nama di schema.ts, nilai kanan = input form.
  // .returning() meminta DB mengembalikan baris yang baru dibuat.
  const [created] = await db
    .insert(products)
    .values({
      brand: v.brand,
      modelName: v.model_name,
      specs: v.specs,
      defaultPrice: String(v.default_price), // numeric Postgres <-> string di TS
      imageUrl: v.image_url,
      officialImages: v.official_images,
      secondImages: v.second_images,
      isActive: v.is_active,
    })
    .returning();
  if (!created) return fail("Gagal menambah produk.");
  revalidatePath("/portal/products");
  revalidatePath("/id", "layout");
  return ok(mapRow(created));
}

export async function updateProduct(
  id: number,
  raw: Partial<ProductInput>
): Promise<ActionResult<Product>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = productSchema.partial().safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input produk tidak valid.");
  const db = getDb();
  if (!db) return backendOffline();
  const v = parsed.data;
  const [updated] = await db
    .update(products)
    .set({
      ...(v.brand !== undefined ? { brand: v.brand } : {}),
      ...(v.model_name !== undefined ? { modelName: v.model_name } : {}),
      ...(v.specs !== undefined ? { specs: v.specs } : {}),
      ...(v.default_price !== undefined ? { defaultPrice: String(v.default_price) } : {}),
      ...(v.image_url !== undefined ? { imageUrl: v.image_url } : {}),
      ...(v.official_images !== undefined ? { officialImages: v.official_images } : {}),
      ...(v.second_images !== undefined ? { secondImages: v.second_images } : {}),
      ...(v.is_active !== undefined ? { isActive: v.is_active } : {}),
    })
    .where(eq(products.id, id))
    .returning();
  if (!updated) return fail("Produk tidak ditemukan.");
  revalidatePath("/portal/products");
  revalidatePath("/id", "layout");
  return ok(mapRow(updated));
}

/** Nonaktifkan (soft-delete) katalog agar hilang dari etalase tanpa hapus histori. */
export async function setProductActive(
  id: number,
  isActive: boolean
): Promise<ActionResult<{ id: number }>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  await db.update(products).set({ isActive }).where(eq(products.id, id));
  revalidatePath("/portal/products");
  revalidatePath("/id", "layout");
  return ok({ id });
}
