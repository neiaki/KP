"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BrandLogo, brandChipClass } from "@/components/public/brand-mark";
import { BRANDS, type SortOrder } from "@/lib/shop";
import { Locale } from "@/lib/translations";

/* Bilah filter etalase bersama (beranda + katalog).
   Desain: baris 1 search (+ sort), baris 2 satu strip scroll
   berisi grup Merek dan Kondisi berlabel agar tidak rancu. */

const CONDITIONS = [
  { key: "all", labelId: "Semua", labelEn: "All" },
  { key: "new", labelId: "Baru", labelEn: "New" },
  { key: "second", labelId: "Second", labelEn: "Second" },
] as const;

export function StockFilter({
  locale,
  search,
  onSearchChange,
  brand,
  onBrandChange,
  condition,
  onConditionChange,
  sort,
  onSortChange,
  searchId = "stock-search",
}: {
  locale: Locale;
  search: string;
  onSearchChange: (v: string) => void;
  brand: string;
  onBrandChange: (b: string) => void;
  condition: string;
  onConditionChange: (c: string) => void;
  sort?: SortOrder;
  onSortChange?: (s: SortOrder) => void;
  searchId?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            {locale === "en" ? "Search stock" : "Cari stok"}
          </label>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <Input
            id={searchId}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              locale === "en" ? "Search brand, model, specs" : "Cari merek, model, spek"
            }
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-10 bg-card pl-9 pr-9 text-sm"
          />
          {search !== "" && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label={locale === "en" ? "Clear search" : "Hapus pencarian"}
              className="absolute right-2.5 top-2.5 rounded p-0.5 text-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {sort !== undefined && onSortChange && (
          <div className="flex shrink-0 items-center gap-1.5">
            <label htmlFor={`${searchId}-sort`} className="hidden text-xs font-bold text-muted sm:block">
              {locale === "en" ? "Sort" : "Urutkan"}
            </label>
            <select
              id={`${searchId}-sort`}
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortOrder)}
              aria-label={locale === "en" ? "Sort" : "Urutkan"}
              className="h-10 cursor-pointer rounded-lg border border-line bg-card px-2 text-xs font-bold text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="newest">{locale === "en" ? "Newest" : "Terbaru"}</option>
              <option value="lowest">{locale === "en" ? "Lowest price" : "Harga terendah"}</option>
              <option value="highest">{locale === "en" ? "Highest price" : "Harga tertinggi"}</option>
              <option value="az">A-Z</option>
            </select>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto no-scrollbar" role="group" aria-label={locale === "en" ? "Brand" : "Merek"}>
          <span className="shrink-0 pl-1 text-[11px] font-bold text-muted">
            {locale === "en" ? "Brand" : "Brand"}
          </span>
          {BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onBrandChange(b)}
              aria-pressed={brand === b}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${brandChipClass(b, brand === b)}`}
            >
              {b === "all" ? (
                locale === "en" ? "All" : "Semua"
              ) : (
                <>
                  <BrandLogo brand={b} active={brand === b} />
                  {b}
                </>
              )}
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-line sm:block" />
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden shrink-0 text-[11px] font-bold text-muted sm:block">
            {locale === "en" ? "Condition" : "Kondisi"}
          </span>
          <span className="flex items-center gap-0.5 rounded-full bg-paper p-0.5" role="group" aria-label={locale === "en" ? "Condition" : "Kondisi"}>
            {CONDITIONS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => onConditionChange(c.key)}
                aria-pressed={condition === c.key}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  condition === c.key ? "bg-accent text-white shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {locale === "en" ? c.labelEn : c.labelId}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
