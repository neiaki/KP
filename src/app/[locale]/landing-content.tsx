"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/store-context";
import { translations, Locale } from "@/lib/translations";
import {
  BRANDS,
  toCardItem,
  filterItems,
  sortItems,
  shortIDR,
  cleanWaNumber,
  type SortOrder,
} from "@/lib/shop";
import {
  Smartphone,
  Wrench,
  ShieldCheck,
  ArrowRight,
  MapPin,
  MessageCircle,
  ArrowLeftRight,
  CreditCard,
  Store,
  BadgeCheck,
  Star,
  ExternalLink,
  ReceiptText,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/public/product-card";
import { Reveal } from "@/components/public/reveal";
import { ReviewsSection } from "@/components/public/reviews-section";
import { HeroCarousel, type HeroSlide } from "@/components/public/hero-carousel";
import { BrandLogo, brandChipClass } from "@/components/public/brand-mark";
import { StockFilter } from "@/components/public/stock-filter";
import { StoreMap } from "@/components/public/store-map";
import { BrandMarquee } from "@/components/public/brand-marquee";

const HERO_PHOTO = "/products/iphone-15-pro-1.jpg";

export function LandingContent({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { storeSettings, products, inventoryUnits } = useStore();
  const t = translations[locale];

  const [ticketQuery, setTicketQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedCondition, setSelectedCondition] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const availableInventory = inventoryUnits.filter((u) => u.status === "available");
  const waNumber = cleanWaNumber(storeSettings.whatsapp_number);

  const catalogList = sortItems(
    filterItems(
      availableInventory.map((u) => toCardItem(u, products, inventoryUnits)),
      { brand: selectedBrand, condition: selectedCondition, query: searchQuery }
    ),
    sortOrder
  );

  /* Slot foto: taruh file resmi di public/products dengan nama persis
     di bawah. Sebelum ada, carousel tampil jujur tanpa foto palsu. */
  const heroSlides: HeroSlide[] = [
    {
      src: "/products/iphone-18-pro.jpg",
      alt:
        locale === "en"
          ? "iPhone 18 Pro, coming soon at At Cell"
          : "iPhone 18 Pro, segera hadir di At Cell",
      model: "iPhone 18 Pro",
      fact:
        locale === "en"
          ? "A20 Pro chip. Global pre-order Sep 12, Indonesia October at the earliest."
          : "Chip A20 Pro. Pre-order global 12 Sep, Indonesia paling cepat Oktober.",
      waMessage:
        locale === "en"
          ? "Hello At Cell, notify me when the iPhone 18 Pro is ready."
          : "Halo At Cell, kabari saya kalau iPhone 18 Pro sudah ready.",
    },
    {
      src: "/products/iphone-duo.jpg",
      alt:
        locale === "en"
          ? "iPhone Duo, the first foldable iPhone, coming soon"
          : "iPhone Duo, iPhone lipat pertama, segera hadir",
      model: "iPhone Duo",
      fact:
        locale === "en"
          ? "First foldable iPhone, 7.6 inch inner display. Pre-order Oct 16, Indonesia later."
          : "iPhone lipat pertama, layar dalam 7,6 inci. Pre-order 16 Okt, Indonesia menyusul.",
      waMessage:
        locale === "en"
          ? "Hello At Cell, notify me when the iPhone Duo is ready."
          : "Halo At Cell, kabari saya kalau iPhone Duo sudah ready.",
    },
  ];

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketQuery.trim()) return;
    router.push(`/${locale}/tracking?ticket=${encodeURIComponent(ticketQuery.trim())}`);
  };

  const secondPrices = availableInventory
    .filter((u) => u.condition === "second")
    .map((u) => u.selling_price);
  const allPrices = availableInventory.map((u) => u.selling_price);
  const cheapestSecond =
    secondPrices.length > 0
      ? Math.min(...secondPrices)
      : allPrices.length > 0
        ? Math.min(...allPrices)
        : 0;  const storeAddress =
    storeSettings.address ||
    "Paku Jaya, Kec. Serpong Utara, Kota Tangerang Selatan, Banten 15220";

  const steps =
    locale === "en"
      ? [
          { icon: ReceiptText, verb: "Leave the phone at the counter", desc: "Tell us the issue, we record the initial condition, and you get a receipt code to track progress from your own phone." },
          { icon: ClipboardCheck, verb: "Approve the cost breakdown", desc: "Diagnosis results come first with sparepart and labor priced separately. Work starts only after you agree." },
          { icon: Wrench, verb: "We repair and test everything", desc: "Parts get replaced, then every function is tested one by one: touch screen, camera, signal, speaker, and charging." },
          { icon: ShieldCheck, verb: "Pick it up with warranty", desc: "Bring the receipt code at pickup. Workmanship warranty is 30 days, up to 90 days for stated sparepart replacements." },
        ]
      : [
          { icon: ReceiptText, verb: "Tinggalkan HP di konter", desc: "Ceritakan rusaknya, teknisi catat kondisi awal, dan Anda langsung dapat kode nota untuk melacak progres dari HP sendiri." },
          { icon: ClipboardCheck, verb: "Setujui rincian biaya", desc: "Hasil diagnosa diinfokan dulu dengan harga sparepart dan jasa ditulis terpisah. Dikerjakan hanya setelah Anda setuju." },
          { icon: Wrench, verb: "Kami kerjakan dan tes semua", desc: "Komponen diganti, lalu semua fungsi dites satu per satu: layar sentuh, kamera, sinyal, speaker, dan charging." },
          { icon: ShieldCheck, verb: "Ambil unit bergaransi", desc: "Bawa kode nota saat pengambilan. Garansi pengerjaan 30 hari, sampai 90 hari untuk ganti sparepart tertentu." },
        ];

  const reasons = [
    {
      icon: BadgeCheck,
      title: "IMEI ditulis di nota",
      desc: "Nomor unit yang Anda bayar sama dengan yang dibawa pulang. Cocokkan kapan pun.",
      photo: "/products/iphone-13-2.jpg",
      photoAlt: "Unit iPhone second yang siap dicek di konter",
      wide: true,
      href: `/${locale}/catalog`,
      linkLabel: locale === "en" ? "See live stock" : "Lihat stok live",
    },
    {
      icon: ShieldCheck,
      title: "Garansi toko yang jelas",
      desc: "Ada masalah bawaan, kembali ke konter dan kami urus. Masanya tercetak di nota.",
      tint: true,
      wide: false,
      href: `/${locale}/warranty`,
      linkLabel: locale === "en" ? "Read warranty terms" : "Baca ketentuan garansi",
    },
    {
      icon: CreditCard,
      title: "Cicilan dan tukar tambah",
      desc: "0% sampai 12 bulan, atau potong harga pakai HP lama.",
      photo: "/products/a55-1.jpg",
      photoAlt: "Unit Samsung Galaxy A55 di etalase toko",
      wide: false,
      href: `/${locale}/trade-in`,
      linkLabel: locale === "en" ? "Estimate trade-in" : "Hitung tukar tambah",
    },
    {
      icon: Store,
      title: "Beli dan servis satu tempat",
      desc: "Konter yang menjual HP Anda juga yang merawatnya. Riwayat unit tercatat.",
      photo: "/products/vivo-v30-2.jpg",
      photoAlt: "Dua unit Vivo V30 di meja display",
      wide: true,
      href: `/${locale}/tracking`,
      linkLabel: locale === "en" ? "Track a repair" : "Lacak servis",
    },
  ];

  return (
    <div className="bg-paper pb-16">
      {/* HERO: premium minimal, satu kolom besar di kiri */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6 lg:pt-24">
          <p className="rise text-sm font-semibold uppercase tracking-[0.25em] text-muted" style={{ animationDelay: "0ms" }}>
            {locale === "en" ? "Paku Jaya, Serpong" : "Paku Jaya, Serpong"}
          </p>
          <h1
            className="rise mt-6 max-w-2xl text-5xl font-extrabold leading-[1.02] tracking-tight text-ink md:text-6xl lg:text-7xl"
            style={{ animationDelay: "80ms" }}
          >
            {locale === "en"
              ? "A phone shop honest about condition."
              : "Toko HP yang jujur soal kondisinya."}
          </h1>
          <p className="rise mt-8 max-w-md text-xl leading-relaxed text-muted" style={{ animationDelay: "160ms" }}>
            {cheapestSecond > 0
              ? locale === "en"
                ? `Second from ${shortIDR(cheapestSecond)}. IMEI on the receipt, plus store warranty.`
                : `Second mulai ${shortIDR(cheapestSecond)}. IMEI tertulis di nota, plus garansi toko.`
              : locale === "en"
                ? "New and second phones with IMEI on the receipt, plus store warranty."
                : "HP baru dan second dengan IMEI di nota, plus garansi toko."}
          </p>
          <div className="rise mt-10 flex flex-wrap gap-4" style={{ animationDelay: "240ms" }}>
            <a href="#stok">
              <Button size="lg" className="rounded-full bg-ink px-8 py-4 text-base font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-ink dark:hover:bg-neutral-200">
                {locale === "en" ? "See stock" : "Lihat stok"}
              </Button>
            </a>
            <Link href={`/${locale}/trade-in`}>
              <Button size="lg" variant="outline" className="rounded-full px-8 py-4 text-base font-bold">
                <ArrowLeftRight className="h-4 w-4" />
                {locale === "en" ? "Trade in" : "Tukar tambah"}
              </Button>
            </Link>
          </div>
        </div>

        <div className="rise mx-auto mt-8 max-w-5xl px-4 sm:px-6 lg:mt-12" style={{ animationDelay: "200ms" }}>
          <HeroCarousel slides={heroSlides} locale={locale} />
        </div>
      </section>

      <BrandMarquee
        locale={locale}
        selected={selectedBrand}
        onSelect={setSelectedBrand}
      />

      {/* ETALASE */}
      <section id="stok" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-12 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="max-w-xl text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {locale === "en" ? "Take one home today" : "Bisa dibawa pulang hari ini"}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {availableInventory.length} {locale === "en" ? "units in store, price includes store warranty" : "unit ada di toko, harga termasuk garansi toko"}
          </p>
        </Reveal>
        {searchQuery.trim() !== "" && (
          <p className="mt-1 text-[13px] font-bold text-accent-deep" role="status">
            {locale === "en"
              ? `Showing ${catalogList.length} result${catalogList.length === 1 ? "" : "s"} for "${searchQuery.trim()}"`
              : `Menampilkan ${catalogList.length} unit untuk "${searchQuery.trim()}"`}
          </p>
        )}

        <div className="mt-5">
          <StockFilter
            locale={locale}
            search={searchQuery}
            onSearchChange={setSearchQuery}
            brand={selectedBrand}
            onBrandChange={setSelectedBrand}
            condition={selectedCondition}
            onConditionChange={setSelectedCondition}
            sort={sortOrder}
            onSortChange={setSortOrder}
            searchId="stok-search"
          />
        </div>

        {catalogList.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-card px-4 py-14 text-center">
            <p className="text-sm font-bold text-ink">
              {locale === "en" ? "No matching phones" : "Tidak ada HP yang cocok"}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
              {locale === "en"
                ? "Try another keyword, or ask on WhatsApp. New stock arrives often."
                : "Coba kata kunci lain, atau tanya via WhatsApp. Stok baru sering masuk."}
            </p>
            <a
              href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                "Halo At Cell, saya cari HP. Apa yang ready sekarang?"
              )}`}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-lg bg-wa px-5 text-xs font-bold text-white hover:bg-wa-deep"
            >
              <MessageCircle className="h-4 w-4" /> Tanya stok via WA
            </a>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalogList.map((item) => (
              <ProductCard key={item.unitId} item={item} locale={locale} waNumber={waNumber} />
            ))}
          </div>
        )}
        <div className="mt-5">
          <Link
            href={`/${locale}/catalog`}
            className="inline-flex items-center gap-1 text-sm font-bold text-accent-deep hover:underline"
          >
            {locale === "en" ? "Open the full catalog" : "Buka katalog lengkap"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* SERVIS */}
      <section id="servis" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-xl border border-line bg-card p-6 sm:p-8 lg:col-span-5">
            <Reveal>
              <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                {locale === "en" ? "Cracked screen? Dead phone?" : "Layar pecah? HP mati total?"}
              </h2>
            </Reveal>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              {locale === "en"
                ? "Bring it to the counter. We check it first and quote the cost before any work starts."
                : "Bawa ke konter. Kami cek dulu dan kasih tahu biayanya sebelum dikerjakan."}
            </p>
            <form onSubmit={handleTrackSubmit} className="mt-5 flex flex-col gap-2">
              <label htmlFor="hero-ticket" className="text-xs font-bold text-ink">
                {locale === "en" ? "Receipt code" : "Kode nota servis"}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="hero-ticket"
                  value={ticketQuery}
                  onChange={(e) => setTicketQuery(e.target.value)}
                  placeholder="SRV-20260912-0042"
                  className="h-10 flex-1 font-mono text-xs uppercase"
                />
                <Button type="submit" className="h-10 shrink-0">
                  {locale === "en" ? "Track" : "Lacak"}
                </Button>
              </div>
            </form>
            <Link
              href={`/${locale}/warranty`}
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-accent-deep hover:underline"
            >
              <ShieldCheck className="h-4 w-4" />
              {locale === "en"
                ? "Service warranty 30 to 90 days, read the terms"
                : "Garansi servis 30 sampai 90 hari, baca ketentuannya"}
            </Link>
          </div>
          <div className="lg:col-span-7">
            <ul className="divide-y divide-line rounded-xl border border-line bg-card px-6 sm:px-8">
              {steps.map((s) => (
                <li key={s.verb} className="flex items-start gap-4 py-5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                    <s.icon className="h-3.5 w-3.5 text-accent-deep" />
                  </span>
                  <div>
                    <p className="text-[15px] font-extrabold text-ink">{s.verb}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* KENAPA AT CELL: bento asimetris 2+1 / 1+2 */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="max-w-xl text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
            {locale === "en" ? "Why people shop here" : "Kenapa belanja di At Cell"}
          </h2>
        </Reveal>
        <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {reasons.map((f) => (
            <li
              key={f.title}
              className={`group overflow-hidden rounded-xl border border-line transition-colors hover:border-accent ${
                "tint" in f && f.tint ? "bg-accent-soft" : "bg-card"
              } ${"wide" in f && f.wide ? "lg:col-span-2" : ""}`}
            >
              {"photo" in f && f.photo ? (
                <div className={`flex h-full flex-col ${"wide" in f && f.wide ? "sm:grid sm:grid-cols-5 sm:flex-row" : ""}`}>
                  <div
                    className={`relative overflow-hidden bg-paper ${
                      "wide" in f && f.wide ? "min-h-56 sm:col-span-2 sm:min-h-full" : ""
                    }`}
                  >
                    <img
                      src={f.photo}
                      alt={f.photoAlt}
                      loading="lazy"
                      className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${
                        "wide" in f && f.wide
                          ? "aspect-[4/3] sm:absolute sm:inset-0 sm:aspect-auto sm:h-full"
                          : "aspect-[4/3]"
                      }`}
                    />
                  </div>
                  <div className={`flex flex-1 items-start gap-4 p-5 sm:p-6 ${"wide" in f && f.wide ? "sm:col-span-3" : ""}`}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                      <f.icon className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-[15px] font-extrabold text-ink">{f.title}</p>
                      <p className="mt-0.5 max-w-md text-[13px] leading-relaxed text-muted">{f.desc}</p>
                      <Link
                        href={f.href}
                        className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold text-accent-deep hover:underline"
                      >
                        {f.linkLabel}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-start gap-4 p-5 sm:p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-card">
                    <f.icon className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-[15px] font-extrabold text-ink">{f.title}</p>
                    <p className="mt-0.5 max-w-md text-[13px] leading-relaxed text-muted">{f.desc}</p>
                    <Link
                      href={f.href}
                      className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-bold text-accent-deep hover:underline"
                    >
                      {f.linkLabel}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div id="ulasan" className="scroll-mt-24">
        <ReviewsSection
          locale={locale}
          mapsUrl={storeSettings.maps_url || "https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A"}
        />
      </div>


      {/* TOKO */}
      <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Reveal>
              <h2 className="text-2xl font-extrabold tracking-tight text-ink">
                At Cell Serpong Utara
              </h2>
            </Reveal>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{storeAddress}</p>
            <div className="mt-4 space-y-2 text-[13px]">
              <p className="flex items-center gap-2 text-muted">
                <MapPin className="h-4 w-4 shrink-0 text-accent" />
                <a
                  href={storeSettings.maps_url || "https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-accent-deep hover:underline"
                >
                  Rute ke toko <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </p>
              <p className="text-muted">
                Senin-Jumat <span className="font-bold text-ink">{storeSettings.opening_hours.monday_friday}</span>
              </p>
              <p className="text-muted">
                Sabtu-Minggu <span className="font-bold text-ink">{storeSettings.opening_hours.saturday_sunday}</span>
              </p>
              <p className="font-mono text-muted">
                WA <span className="font-bold text-ink">{storeSettings.whatsapp_number}</span>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                  "Halo At Cell, saya mau tanya stok HP."
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="wa">
                  <MessageCircle className="h-4 w-4" />
                  Chat WhatsApp
                </Button>
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line lg:col-span-7">
            <StoreMap
              title={locale === "en" ? "At Cell store location" : "Lokasi toko At Cell"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
