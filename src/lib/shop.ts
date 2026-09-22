import { formatIDR } from "./utils";
import type { InventoryUnit, Product, UnitTag } from "@/types";
import type { ProductCardItem } from "@/components/public/product-card";

/* Boilerplate etalase: satu-satunya tempat untuk daftar merek,
   format harga, nomor WA, mapping unit, dan logika filter.
   Dipakai beranda + katalog agar tidak ada duplikasi. */

export const BRANDS = ["all", "Apple", "Samsung", "Xiaomi", "Oppo", "Vivo"] as const;
export type BrandFilter = (typeof BRANDS)[number];
export type ConditionFilter = "all" | "new" | "second";
export type SortOrder = "newest" | "lowest" | "highest" | "az";

/* Host foto generik yang tidak boleh tampil di etalase. Unit second yang
   belum punya foto asli memakai foto resmi model yang sama, bukan render
   acak dari internet. */
const DUMMY_HOSTS = ["images.unsplash.com", "picsum.photos", "placehold.co", "via.placeholder.com"];

function isRealPhoto(src: string | undefined | null): src is string {
  return !!src && !DUMMY_HOSTS.some((h) => src.includes(h));
}

export function cleanWaNumber(raw?: string | null) {
  return (raw || "6285775398389").replace(/\D/g, "");
}

/* Rp8.499.000 menjadi Rp8,5 jt untuk headline yang ringkas */
export function shortIDR(n: number) {
  if (!Number.isFinite(n)) return formatIDR(0);
  if (n >= 1_000_000) {
    const jt = Math.round(n / 100_000) / 10;
    return `Rp${String(jt).replace(".", ",")} jt`;
  }
  if (n >= 1_000) return `Rp${Math.round(n / 1_000)} rb`;
  return formatIDR(n);
}

export function toCardItem(
  unit: InventoryUnit,
  products: Product[],
  allUnits: InventoryUnit[] = []
): ProductCardItem {
  const product = products.find((p) => p.id === unit.product_id);
  const price = unit.selling_price;
  const official = (product?.official_images ?? []).filter(isRealPhoto);
  const officialOrFallback =
    official.length > 0
      ? official
      : isRealPhoto(product?.image_url)
        ? [product.image_url as string]
        : [];
  const secondReal = (product?.second_images ?? []).filter(isRealPhoto);
  const used = secondReal.length > 0 ? secondReal : officialOrFallback;
  return {
    unitId: unit.id,
    imeiTail: unit.imei.slice(-4),
    brand: product?.brand || "HP",
    modelName: product?.model_name || "Smartphone",
    specs: product?.specs || "",
    images: unit.condition === "new" ? official : used,
    condition: unit.condition,
    price,
    newPrice: unit.condition === "second" ? product?.default_price : undefined,
    monthly: Math.round(price / 12),
    created_at: unit.created_at,
    tag: tagForUnit(unit, allUnits),
  };
}

/* Tag jujur dari data inventaris: produk dengan unit terjual terbanyak
   dapat "bestseller" (bila ada penjualan), produk yang tinggal 1 unit
   available dapat "laststock". Bestseller menang bila keduanya cocok. */
export function tagForUnit(
  unit: InventoryUnit,
  allUnits: InventoryUnit[]
): UnitTag | undefined {
  if (unit.status !== "available" || allUnits.length === 0) return undefined;
  const soldByProduct = new Map<number, number>();
  for (const u of allUnits) {
    if (u.status === "sold") {
      soldByProduct.set(u.product_id, (soldByProduct.get(u.product_id) ?? 0) + 1);
    }
  }
  let bestId = -1;
  let bestCount = 0;
  soldByProduct.forEach((count, pid) => {
    if (count > bestCount) {
      bestCount = count;
      bestId = pid;
    }
  });
  if (bestCount > 0 && unit.product_id === bestId) return "bestseller";
  const availableCount = allUnits.filter(
    (u) => u.product_id === unit.product_id && u.status === "available"
  ).length;
  if (availableCount === 1) return "laststock";
  return undefined;
}

export function filterItems(
  items: ProductCardItem[],
  opts: { brand: string; condition: string; query: string }
) {
  const q = opts.query.trim().toLowerCase().replace(/\s+/g, " ");
  return items.filter((item) => {
    if (opts.brand !== "all" && item.brand !== opts.brand) return false;
    if (opts.condition !== "all" && item.condition !== opts.condition) return false;
    if (q === "") return true;
    return (
      item.modelName.toLowerCase().includes(q) ||
      item.brand.toLowerCase().includes(q) ||
      item.specs.toLowerCase().includes(q)
    );
  });
}

export function sortItems(items: ProductCardItem[], order: SortOrder) {
  if (order === "lowest") return [...items].sort((a, b) => a.price - b.price);
  if (order === "highest") return [...items].sort((a, b) => b.price - a.price);
  if (order === "az")
    return [...items].sort((a, b) =>
      `${a.brand} ${a.modelName}`.localeCompare(`${b.brand} ${b.modelName}`, "id")
    );
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}
