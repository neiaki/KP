"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { formatIDR } from "@/lib/utils";
import { cleanWaNumber } from "@/lib/wa";
import { Smartphone, MessageCircle } from "lucide-react";
import { ProductCard } from "@/components/public/product-card";
import { StockFilter } from "@/components/public/stock-filter";
import {
  toCardItem,
  filterItems,
  sortItems,
  listProductsWithoutUnits,
  type SortOrder,
} from "@/lib/shop";

export function CatalogContent({ locale }: { locale: Locale }) {
  const { products, inventoryUnits, storeSettings } = useStore();
  const searchParams = useSearchParams();
  const cleanWa = cleanWaNumber(storeSettings.whatsapp_number);

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [selectedCondition, setSelectedCondition] = useState(
    searchParams.get("cond") === "new" || searchParams.get("cond") === "second"
      ? (searchParams.get("cond") as string)
      : "all"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const availableUnits = inventoryUnits.filter((u) => u.status === "available");

  const soldOutProducts = products
    .map((p) => {
      const sold = inventoryUnits
        .filter((u) => u.product_id === p.id && u.status === "sold")
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const availableCount = inventoryUnits.filter(
        (u) => u.product_id === p.id && u.status === "available"
      ).length;
      return { product: p, sold, availableCount };
    })
    .filter((g) => g.sold.length > 0 && g.availableCount === 0)
    .sort((a, b) => b.sold[0].created_at.localeCompare(a.sold[0].created_at));

  // Produk baru yang belum punya unit sama sekali tidak pernah masuk
  // etalase unit-driven di atas dan tidak masuk "Baru saja habis" karena
  // belum ada riwayat terjual. Tanpa bagian ini produk baru tidak terlihat
  // di mana pun sampai staf mendaftarkan unit pertamanya.
  const newProducts = listProductsWithoutUnits(products, inventoryUnits);

  const items = sortItems(
    filterItems(
      availableUnits.map((u) => toCardItem(u, products, inventoryUnits)),
      { brand: selectedBrand, condition: selectedCondition, query: search }
    ),
    sortOrder
  );

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Every phone in the shop" : "Semua HP yang ada di toko"}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {items.length} {locale === "en" ? "units, price includes store warranty" : "unit, harga termasuk garansi toko"}
        </p>

        <div className="mt-5">
          <StockFilter
            locale={locale}
            search={search}
            onSearchChange={setSearch}
            brand={selectedBrand}
            onBrandChange={setSelectedBrand}
            condition={selectedCondition}
            onConditionChange={setSelectedCondition}
            sort={sortOrder}
            onSortChange={setSortOrder}
            searchId="catalog-search"
          />
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-card px-4 py-14 text-center">
            <Smartphone className="mx-auto h-10 w-10 text-line" />
            <p className="mt-2 text-sm font-bold text-ink">Tidak ada yang cocok</p>
            <p className="mt-0.5 text-xs text-muted">Coba kata kunci atau filter lain.</p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ProductCard key={item.unitId} item={item} locale={locale} waNumber={cleanWa} />
            ))}
          </div>
        )}

        {soldOutProducts.length > 0 && (
          <section aria-label={locale === "en" ? "Sold out" : "Stok habis"} className="mt-10">
            <h2 className="max-w-xl text-2xl font-extrabold tracking-tight text-ink">
              {locale === "en" ? "Just sold out" : "Baru saja habis"}
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted">
              {locale === "en"
                ? "Gone from the shelf. Ask to be notified when a matching unit arrives."
                : "Sudah turun dari rak. Minta dikabari kalau unit sejenis masuk."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {soldOutProducts.map(({ product: p, sold }) => {
                const img =
                  (p.official_images && p.official_images[0]) || p.image_url;
                const lastPrice = sold[0].selling_price;
                return (
                  <article
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-line bg-card opacity-80 grayscale-[35%]"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                      {img && (
                        <Image
                          fill
                          sizes={"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
                          src={img}
                          alt={`${p.brand} ${p.model_name}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="mb-2 inline-flex w-fit items-center rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-paper">
                        {locale === "en" ? "Sold out" : "Stok habis"}
                      </p>
                      <h3 className="text-[15px] font-extrabold leading-snug text-ink">
                        {p.brand} {p.model_name}
                      </h3>
                      <p className="mt-1 text-[13px] font-bold text-muted">
                        {locale === "en" ? "Last sold" : "Terakhir terjual"}{" "}
                        {formatIDR(lastPrice)}
                      </p>
                      <a
                        href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
                          `Halo At Cell, kabari saya kalau ada ${p.brand} ${p.model_name} lagi.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-wa px-4 text-[13px] font-bold text-white hover:bg-wa-deep"
                      >
                        <MessageCircle className="h-4 w-4" />
                        {locale === "en" ? "Notify me" : "Kabari saya"}
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {newProducts.length > 0 && (
          <section aria-label={locale === "en" ? "Coming soon" : "Segera hadir"} className="mt-10">
            <h2 className="max-w-xl text-2xl font-extrabold tracking-tight text-ink">
              {locale === "en" ? "New in catalog" : "Baru masuk katalog"}
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted">
              {locale === "en"
                ? "No unit registered yet. Ask to be notified when the first unit arrives."
                : "Unitnya belum didaftarkan. Minta dikabari saat unit pertama masuk."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {newProducts.map((p) => {
                const img =
                  (p.official_images && p.official_images[0]) || p.image_url;
                return (
                  <article
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-line bg-card opacity-80 grayscale-[35%]"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                      {img && (
                        <Image
                          fill
                          sizes={"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
                          src={img}
                          alt={`${p.brand} ${p.model_name}`}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="mb-2 inline-flex w-fit items-center rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-paper">
                        {locale === "en" ? "Sold out" : "Stok habis"}
                      </p>
                      <h3 className="text-[15px] font-extrabold leading-snug text-ink">
                        {p.brand} {p.model_name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                        {p.specs}
                      </p>
                      <p className="mt-1 text-[13px] font-bold text-muted">
                        {locale === "en" ? "Catalog price" : "Harga katalog"}{" "}
                        {formatIDR(p.default_price)}
                      </p>
                      <a
                        href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
                          `Halo At Cell, kabari saya kalau ${p.brand} ${p.model_name} sudah ada unitnya.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-wa px-4 text-[13px] font-bold text-white hover:bg-wa-deep"
                      >
                        <MessageCircle className="h-4 w-4" />
                        {locale === "en" ? "Notify me" : "Kabari saya"}
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-8 rounded-xl border border-line bg-card p-5 text-center">
          <p className="text-sm font-bold text-ink">
            {locale === "en" ? "Looking for something else?" : "Cari yang lain?"}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
            {locale === "en"
              ? "Tell us the model. If a matching second unit comes in, you hear first."
              : "Sebutkan tipenya. Kalau unit second yang cocok masuk, Anda dikabari duluan."}
          </p>
          <a
            href={`https://wa.me/${cleanWa}?text=${encodeURIComponent("Halo At Cell, saya cari HP. Apa yang ready sekarang?")}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg bg-wa px-5 text-[13px] font-bold text-white hover:bg-wa-deep"
          >
            <MessageCircle className="h-4 w-4" /> Tanya via WA
          </a>
        </div>
      </div>
    </div>
  );
}
