"use server";

import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  productImages as productImagesTable,
  products as productsTable,
  storeSettings,
} from "@/db/schema";
import type { Db } from "@/db/client";
import type {
  InventoryUnit,
  Product,
  StoreSettings,
  UnitCondition,
} from "@/types";
import { attemptWithRetry, pesanError } from "@/lib/retry";
import { consumeRateLimit } from "@/lib/rate-limit";
import { pickClientIp } from "@/lib/client-ip";
import { backendOffline, fail, ok, toISO, toNumber, type ActionResult } from "./_helpers";
import { mapStoreSettings } from "./_mappers";

/**
 * Batas baca etalase publik per IP, untuk getPublicInventory,
 * getPublicSnapshot, dan getPublicImageUrls.
 *
 * Ketiganya action `use server` tanpa login, jadi tanpa kuota siapa pun bisa
 * menyapu seluruh katalog. Nilainya sengaja jauh di atas pemakaian nyata:
 * satu render halaman publik memakai sekitar 4 token (snapshot di layout,
 * peta gambar di generateMetadata dan di komponen JSON-LD, dan satu token
 * lagi untuk getPublicInventory yang dipanggil di dalam snapshot), dan
 * etalase ini cuma 12 halaman x 2 locale. Satu crawl penuh memakai sekitar
 * 96 token, jadi 600/menit memberi ruang 6x lipatan, cukup untuk Googlebot
 * maupun satu kantor yang banyak orangnya browsing lewat satu IP,
 * sementara penyapu tetap terikat di 600 permintaan per menit.
 */
const PUBLIK_PER_IP_LIMIT = 600;
const PUBLIK_PER_IP_WINDOW_MS = 60_000;

/**
 * Pembaca IP pengunjung untuk menjadi kunci rate limit. Logikanya sama
 * dengan yang dipakai login dan tracking, di src/lib/client-ip.ts, supaya
 * keduanya tidak bisa berbeda. Kalau headernya hilang, semua permintaan
 * digabung ke satu kunci global, yang membuat batasnya lebih ketat, bukan
 * lebih longgar.
 */
async function getPublicClientId(): Promise<string> {
  return pickClientIp(await headers());
}

/**
 * Potong satu kuota baca publik. Kembalikan null kalau boleh lewat, atau
 * pesan penolakan kalau sudah habis. Kuncinya sengaja satu bucket untuk
 * ketiga action, supaya menyapu ketiganya bergantian tidak menambah kuota.
 */
async function consumePublicQuota(): Promise<string | null> {
  const clientId = await getPublicClientId();
  const hasil = consumeRateLimit(
    `publik-ip:${clientId}`,
    PUBLIK_PER_IP_LIMIT,
    PUBLIK_PER_IP_WINDOW_MS
  );
  if (hasil.allowed) return null;
  return `Terlalu banyak permintaan. Coba lagi dalam ${hasil.retryAfterSeconds} detik.`;
}

export type PublicStockItem = {
  unitId: number;
  productId: number;
  brand: string;
  modelName: string;
  specs: string;
  imageUrl: string;
  officialImages: string[];
  secondImages: string[];
  condition: UnitCondition;
  sellingPrice: number;
  createdAt: string;
  imeiTail: string;
};

type PublicInventoryRow = {
  brand: string;
  model_name: string;
  specs: string;
  image_url: string;
  official_images: string[] | null;
  second_images: string[] | null;
  condition: UnitCondition;
  selling_price: string;
  unit_created_at: Date | string;
  unit_id: number | string;
  imei_tail: string;
  product_id: number | string;
};

/**
 * Etalase ready-stock publik (FR-D-01). Baca dari view v_public_inventory:
 * hanya kolom aman, purchase_cost tidak pernah keluar. Tanpa login.
 * View didefinisikan sekali di migrasi SQL, jadi di sini dibaca lewat SQL
 * berparameter (aman dari injection) lewat koneksi Drizzle yang sama.
 */
export async function getPublicInventory(opts?: {
  brand?: string;
  condition?: UnitCondition;
  limit?: number;
}): Promise<ActionResult<PublicStockItem[]>> {
  // Action tanpa login, jadi kuota dipotong sebelum query apa pun. getDb()
  // tidak disebut dulu supaya permintaan yang sudah habis kuota tidak sampai
  // ke database.
  const kuota = await consumePublicQuota();
  if (kuota) return fail(kuota);
  const db = getDb();
  if (!db) return backendOffline();
  const brand = opts?.brand?.trim() || null;
  const condition = opts?.condition ?? null;
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500);
  let result: PublicInventoryRow[];
  try {
    result = await db.execute<PublicInventoryRow>(sql`
      select brand, model_name, specs, image_url, official_images, second_images,
             condition, selling_price, unit_created_at, product_id, unit_id, imei_tail
        from public.v_public_inventory
       where (${brand}::text is null or brand ilike '%' || ${brand} || '%')
         and (${condition}::text is null or condition::text = ${condition})
       order by unit_created_at desc
       limit ${limit}
    `);
  } catch {
    return fail("Katalog sedang tidak dapat dimuat. Coba lagi sebentar.");
  }
  return ok(
    result.map((r) => ({
      unitId: Number(r.unit_id),
      productId: Number(r.product_id),
      brand: r.brand,
      modelName: r.model_name,
      specs: r.specs,
      imageUrl: r.image_url,
      officialImages: r.official_images ?? [],
      secondImages: r.second_images ?? [],
      condition: r.condition,
      sellingPrice: toNumber(r.selling_price),
      createdAt:
        r.unit_created_at instanceof Date
          ? r.unit_created_at.toISOString()
          : String(r.unit_created_at),
      imeiTail: r.imei_tail,
    }))
  );
}

/** Profil toko publik untuk landing page (FR-D-01). Tanpa login. */
export async function getPublicStoreSettings(): Promise<ActionResult<StoreSettings>> {
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const [row] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
    if (!row) return fail("Pengaturan toko tidak ditemukan.");
    return ok(mapStoreSettings(row));
  } catch {
    return fail("Pengaturan toko sedang tidak dapat dimuat.");
  }
}

/**
 * Peta path -> URL publik untuk SELURUH file di product_images.
 *
 * Slide carousel dan kartu alasan di halaman depan memuat copy pemasaran yang
 * dikurasi manusia, jadi daftar fotonya tidak bisa dibangkitkan dari database;
 * yang bisa dipindah ke database hanya lokasi filenya. Peta ini dibaca di server
 * component lalu dikasih ke komponen klien sebagai prop, supaya tidak ada dua
 * daftar lokasi yang bisa berbeda dan peta ini tidak ikut tersimpan ke
 * localStorage milik store.
 *
 * Filter kind sengaja tidak dipakai. Dulu fungsi ini hanya mengambil baris
 * kind = "hero", padahal foto yang dirujuk halaman depan tidak semuanya
 * hero: kartu "IMEI ditulis di nota" memakai foto produk second, dan
 * "Cicilan dan tukar tambah" memakai foto Samsung A55. Keduanya kind official,
 * jadi dengan filter itu keduanya diam-diam jatuh kembali ke path lokal
 * tanpa ada yang salah terlihat.
 *
 * Seluruh registry cuma 38 baris dengan URL sekitar 100 karakter, jadi
 * seluruhnya dikirim, bukan disaring per halaman. Menyaringnya memang hemat
 * sedikit, tapi pemanggil jadi harus tahu daftar path-nya sebelum menanyakan
 * lokasi file, sementara daftar itu justru hidup di komponen klien.
 *
 * Kegagalan di sini sengaja tidak fatal: pemanggil memakai path lokal sebagai
 * cadangan, jadi lebih baik peta kosong daripada halaman depan tidak termuat.
 */
export async function getPublicImageUrls(): Promise<Record<string, string>> {
  // Kuota habis diperlakukan sama dengan kegagalan biasa di bawah: peta
  // kosong, bukan halaman depan yang tidak termuat.
  if (await consumePublicQuota()) return {};
  const db = getDb();
  if (!db) return {};
  try {
    const rows = await db
      .select({
        path: productImagesTable.path,
        publicUrl: productImagesTable.publicUrl,
      })
      .from(productImagesTable);
    return Object.fromEntries(rows.map((r) => [r.path, r.publicUrl]));
  } catch {
    return {};
  }
}

export type PublicSnapshot = {
  storeSettings: StoreSettings;
  products: Product[];
  inventoryUnits: InventoryUnit[];
};

/* Cadangan untuk galat tanpa pesan, misalnya TypeError dari balapan cache kolom. */
const PESAN_GAGAL_SNAPSHOT = "Data publik sedang tidak dapat dimuat.";

/*
 * Satu kali pembacaan snapshot. Melempar galat, bukan mengembalikan
 * ActionResult, supaya attemptWithRetry bisa membedakan pembacaan yang berhasil
 * dengan pembacaan yang gagal. Kegagalan dari ketiga query jadi satu jalur
 * lempar yang sama, sehingga semuanya bisa diulang dengan aturan yang sama.
 */
async function bacaSnapshot(db: Db): Promise<PublicSnapshot> {
  const [settingsResult, inventoryResult, productRows] = await Promise.all([
    getPublicStoreSettings(),
    getPublicInventory({ limit: 500 }),
    db
      .select()
      .from(productsTable)
      .where(eq(productsTable.isActive, true))
      .orderBy(productsTable.createdAt),
  ]);
  if ("error" in settingsResult) throw new Error(settingsResult.error);
  if ("error" in inventoryResult) throw new Error(inventoryResult.error);

  const productMap = new Map<number, Product>();
  for (const row of productRows) {
    productMap.set(row.id, {
      id: row.id,
      brand: row.brand,
      model_name: row.modelName,
      specs: row.specs,
      default_price: toNumber(row.defaultPrice),
      image_url: row.imageUrl,
      official_images: row.officialImages ?? [],
      second_images: row.secondImages ?? [],
      created_at: toISO(row.createdAt),
    });
  }

  const inventoryUnits: InventoryUnit[] = inventoryResult.data.map((item) => {
    if (!productMap.has(item.productId)) {
      productMap.set(item.productId, {
        id: item.productId,
        brand: item.brand,
        model_name: item.modelName,
        specs: item.specs,
        default_price: item.sellingPrice,
        image_url: item.imageUrl,
        official_images: item.officialImages,
        second_images: item.secondImages,
        created_at: item.createdAt,
      });
    }
    return {
      id: item.unitId,
      product_id: item.productId,
      imei: `****${item.imeiTail}`,
      condition: item.condition,
      // Jangan pernah membawa purchase_cost ke client public.
      purchase_cost: 0,
      selling_price: item.sellingPrice,
      status: "available",
      created_at: item.createdAt,
    };
  });

  return {
    storeSettings: settingsResult.data,
    products: [...productMap.values()],
    inventoryUnits,
  };
}

/**
 * Snapshot minimum untuk komponen publik. View v_public_inventory tidak pernah
 * menyertakan purchase_cost, sehingga data ini aman untuk browser.
 *
 * Pembacaan diulang sekali saat gagal. Tanpa itu, satu balapan antara dua
 * pembacaan pertama yang berjalan bersamaan membuat seluruh etalase kosong:
 * komponen publik membaca inventoryUnits.length sehingga landing page
 * menulis "0 unit ada di toko", dan jam buka, telepon, serta alamat ikut
 * kosong karena snapshot yang gagal dikosongkan semua. Gejalanya tidak terlihat
 * dari halaman, hanya dari isi yang hilang, jadi lebih baik diulang sekali
 * daripada diturunkan ke status gagal.
 */
export async function getPublicSnapshot(): Promise<ActionResult<PublicSnapshot>> {
  // Kuota dipotong sebelum snapshot, tapi bacaSnapshot di bawah memanggil
  // getPublicInventory yang memotong satu token lagi dari bucket yang sama.
  const kuota = await consumePublicQuota();
  if (kuota) return fail(kuota);
  const db = getDb();
  if (!db) return backendOffline();
  const hasil = await attemptWithRetry(() => bacaSnapshot(db));
  if (!hasil.ok) return fail(pesanError(hasil.error, PESAN_GAGAL_SNAPSHOT));
  return ok(hasil.value);
}
