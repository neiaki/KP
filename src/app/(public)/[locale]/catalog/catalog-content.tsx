"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  filterProducts,
  sellableUnits,
  type SortOrder,
} from "@/lib/shop";
import { noUnitSectionCopy, soldOutSectionCopy } from "@/lib/catalogue-notify";

export function CatalogContent({ locale }: { locale: Locale }) {
  const { products, inventoryUnits, storeSettings } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const cleanWa = cleanWaNumber(storeSettings.whatsapp_number);

  // Nilai dari URL tidak dipercaya begitu saja. `brand` hanya diterima kalau
  // merek itu benar-benar ada, `sort` hanya menerima nilai yang memang
  // ditawarkan StockFilter, dan `cond` sama. Tanpa penyaringan ini, URL yang diedit
  // tangan bisa membuat etalase tampak rusak padahal server-nya sehat.
  const BRAND_DARI_URL = (searchParams.get("brand") || "").trim();
  const COND_DARI_URL = searchParams.get("cond") || "";
  const SORT_DARI_URL = searchParams.get("sort") || "";

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedBrand, setSelectedBrand] = useState(
    products.some((p) => p.brand === BRAND_DARI_URL) ? BRAND_DARI_URL : "all"
  );
  const [selectedCondition, setSelectedCondition] = useState(
    COND_DARI_URL === "new" || COND_DARI_URL === "second" ? COND_DARI_URL : "all"
  );
  const [sortOrder, setSortOrder] = useState<SortOrder>(
    SORT_DARI_URL === "lowest" || SORT_DARI_URL === "highest" || SORT_DARI_URL === "az"
      ? SORT_DARI_URL
      : "newest"
  );

  /*
   * `DitulisSendiri` menyimpan query string terakhir yang ditulis efek di bawah, jadi
   * efek pembacaan URL bisa membedakan tulisan kita sendiri dari navigasi yang
   * datang dari tempat lain.
   */
  const DitulisSendiri = useRef<string | null>(null);

  /*
   * Status filter ditulis balik ke query string.
   *
   * Sebelumnya `useState(searchParams.get(...))` hanya dibaca satu kali lalu
   * tidak pernah menulis apa pun, jadi hasil filter hilang saat halaman
   * dimuat ulang, tidak bisa di-bookmark atau dibagikan, dan tombol Back
   * browser tidak membataskannya. Padahal footer sudah menautkan
   * `/id/catalog?cond=new`, jadi mekanismenya sudah ada di sisi lain.
   *
   * `replace` dipakai supaya setiap ketukan tidak menumpuk riwayat, dan
   * `scroll: false` supaya daftar tidak melompat ke atas tiap filter berubah.
   * Nilai yang sedang default dihapus dari URL, bukan ditulis sebagai
   * `all`/`newest`, supaya alamat tanpa parameter tetap tanpa parameter.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);

    const pasang = (kunci: string, nilai: string, bawaan: string) => {
      if (nilai === bawaan || nilai === "") params.delete(kunci);
      else params.set(kunci, nilai);
    };

    pasang("q", search, "");
    pasang("brand", selectedBrand, "all");
    pasang("cond", selectedCondition, "all");
    pasang("sort", sortOrder, "newest");

    const berikutnya = params.toString();
    const sekarang = window.location.search;
    if (berikutnya === sekarang.replace(/^\?/, "")) return;
    DitulisSendiri.current = berikutnya;
    router.replace(`${url.pathname}${berikutnya ? `?${berikutnya}` : ""}`, {
      scroll: false,
    });
  }, [search, selectedBrand, selectedCondition, sortOrder, router]);

  /*
   * Query string dibaca balik ke state.
   *
   * `useState(searchParams.get(...))` hanya berjalan di render pertama.
   * Navigasi klien yang mengganti query string, misalnya tombol Back, tautan
   * `?cond=new` di footer, atau tautan katalog di navbar, hanya mengubah URL.
   * Akibatnya state tetap memakai nilai render pertama: address bar menulis
   * `/id/catalog` tanpa filter, sementara etalase masih menampilkan hanya
   * Apple. Alamat yang di-bookmark atau dibagikan membuka tampilan yang
   * berbeda dari yang dilihat pengguna, dan tombol Back tidak membatalkan
   * filter.
   *
   * Arah ini hanya dipakai kalau URL berubah karena navigasi dari luar. Kalau
   * perubahannya adalah tulisan efek di atas, nilainya dicocokkan dengan
   * `DitulisSendiri` dan efek ini dilewati, supaya keduanya tidak saling
   * menimpa.
   */
  const KunciUrl = searchParams.toString();
  useEffect(() => {
    if (KunciUrl === DitulisSendiri.current) {
      DitulisSendiri.current = null;
      return;
    }

    const params = new URLSearchParams(KunciUrl);
    const brand = (params.get("brand") || "").trim();
    const cond = params.get("cond") || "";
    const sort = params.get("sort") || "";

    setSearch(params.get("q") || "");
    setSelectedBrand(products.some((p) => p.brand === brand) ? brand : "all");
    setSelectedCondition(cond === "new" || cond === "second" ? cond : "all");
    setSortOrder(
      sort === "lowest" || sort === "highest" || sort === "az" ? sort : "newest"
    );
  }, [KunciUrl, products]);

  const availableUnits = sellableUnits(inventoryUnits);
  const noUnitCopy = noUnitSectionCopy(locale);

  // Dua kelompok yang tidak boleh tertukar.
  //
  // soldOutProducts adalah model yang pernah punya unit tapi sekarang tidak ada
  // yang bisa dijual. Dulu bagian ini disaring dari unit berstatus "sold",
  // padahal v_public_inventory hanya mengirim unit available, jadi di produksi
  // daftar ini selalu kosong dan bagian "Baru saja habis" tidak pernah muncul.
  // Sekarang sumbernya perproduk, bukan perunit.
  const filterOpts = { brand: selectedBrand, condition: selectedCondition, query: search };
  const soldOutProducts = filterProducts(
    listSoldOutProducts(products, inventoryUnits),
    filterOpts
  );
  const soldOutCopy = soldOutSectionCopy(locale);

  // Produk yang belum pernah punya unit satu pun. Batteri mana pun: bukan
  // sold, bukan in_service, bukan reserved.
  const newProducts = filterProducts(
    listProductsWithoutUnits(products, inventoryUnits),
    filterOpts
  );

  const items = sortItems(
    filterItems(
      availableUnits.map((u) => toCardItem(u, products, inventoryUnits)),
      filterOpts
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
