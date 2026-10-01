"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { cleanWaNumber } from "@/lib/wa";
import { MessageCircle, Smartphone } from "lucide-react";
import { ProductCard } from "@/components/public/product-card";
import { NotifyCard } from "@/components/public/notify-card";
import { StockFilter } from "@/components/public/stock-filter";
import {
  toCardItem,
  filterItems,
  sortItems,
  listProductsWithoutUnits,
  listSoldOutProducts,
  sellableUnits,
  type SortOrder,
} from "@/lib/shop";
import { noUnitSectionCopy, soldOutSectionCopy } from "@/lib/catalogue-notify";

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

  const availableUnits = sellableUnits(inventoryUnits);
  const noUnitCopy = noUnitSectionCopy(locale);

  // Dua kelompok yang tidak boleh tertukar.
  //
  // soldOutProducts adalah model yang pernah punya unit tapi sekarang tidak ada
  // yang bisa dijual. Dulu bagian ini disaring dari unit berstatus "sold",
  // padahal v_public_inventory hanya mengirim unit available, jadi di produksi
  // daftar ini selalu kosong dan bagian "Baru saja habis" tidak pernah muncul.
  // Sekarang sumbernya perproduk, bukan perunit.
  const soldOutProducts = listSoldOutProducts(products, inventoryUnits);
  const soldOutCopy = soldOutSectionCopy(locale);

  // Produk yang belum pernah punya unit satu pun. Batteri mana pun: bukan
  // sold, bukan in_service, bukan reserved.
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
          <section aria-label={soldOutCopy.heading} className="mt-10">
            <h2 className="max-w-xl text-2xl font-extrabold tracking-tight text-ink">
              {soldOutCopy.heading}
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted">
              {soldOutCopy.intro}
            </p>
            <p className="mt-1 max-w-xl text-[13px] text-muted">
              {soldOutCopy.requestNote}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {soldOutProducts.map((p) => (
                <NotifyCard
                  key={p.id}
                  product={p}
                  locale={locale}
                  waNumber={cleanWa}
                  copy={soldOutCopy}
                  alasan="sold_out"
                />
              ))}
            </div>
          </section>
        )}

        {newProducts.length > 0 && (
          <section aria-label={noUnitCopy.heading} className="mt-10">
            <h2 className="max-w-xl text-2xl font-extrabold tracking-tight text-ink">
              {noUnitCopy.heading}
            </h2>
            <p className="mt-1 max-w-xl text-[13px] text-muted">
              {noUnitCopy.intro}
            </p>
            <p className="mt-1 max-w-xl text-[13px] text-muted">
              {noUnitCopy.requestNote}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {newProducts.map((p) => (
                <NotifyCard
                  key={p.id}
                  product={p}
                  locale={locale}
                  waNumber={cleanWa}
                  copy={noUnitCopy}
                  alasan="never_had_unit"
                />
              ))}
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
