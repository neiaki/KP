"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldCheck,
  ReceiptText,
  Wrench,
  MessageCircle,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { BrandLogo } from "@/components/public/brand-mark";
import { StoreMap } from "@/components/public/store-map";

const BRANDS = ["Apple", "Samsung", "Xiaomi", "Oppo", "Vivo"];

export function AboutContent({ locale }: { locale: Locale }) {
  const { storeSettings, products, inventoryUnits } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");
  const available = inventoryUnits.filter((u) => u.status === "available");
  const brandCount = new Set(
    available.map((u) => products.find((p) => p.id === u.product_id)?.brand ?? "")
  ).size;

  const values = [
    {
      icon: ReceiptText,
      title: locale === "en" ? "Physical check together" : "Cek fisik bareng",
      desc:
        locale === "en"
          ? "We open the box, match the IMEI, and test the unit with you at the counter."
          : "Kami buka dusnya, cocokkan IMEI, dan tes unitnya bareng Anda di konter.",
    },
    {
      icon: ShieldCheck,
      title: locale === "en" ? "Warranty in writing" : "Garansi tertulis",
      desc:
        locale === "en"
          ? "Every unit carries a stated store warranty, printed on the receipt."
          : "Setiap unit punya garansi toko yang jelas, tercetak di nota.",
    },
    {
      icon: Wrench,
      title: locale === "en" ? "Repair under one roof" : "Servis satu atap",
      desc:
        locale === "en"
          ? "The counter that sold your phone is the same one that maintains it."
          : "Konter yang menjual HP Anda juga yang merawatnya.",
    },
    {
      icon: MessageCircle,
      title: locale === "en" ? "Reachable after purchase" : "Mudah dihubungi",
      desc:
        locale === "en"
          ? "Questions after purchase go to WhatsApp and get answered during store hours."
          : "Tanya apa pun setelah beli lewat WhatsApp dan dijawab di jam toko.",
    },
  ];

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "A phone shop you can visit" : "Toko HP yang bisa didatangi"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "At Cell sells new and quality second phones in Paku Jaya, Serpong Utara, and repairs them at the same counter."
            : "At Cell jual HP baru dan second berkualitas di Paku Jaya, Serpong Utara, sekaligus servis di konter yang sama."}
        </p>

        <figure className="mt-6">
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <img
              src="/products/iphone-15-pro-2.jpg"
              alt={
                locale === "en"
                  ? "A phone unit displayed at the At Cell counter"
                  : "Unit HP yang dipajang di konter At Cell"
              }
              className="aspect-[16/9] w-full object-cover"
              loading="lazy"
            />
          </div>
          <figcaption className="mt-2 text-[13px] text-muted">
            {locale === "en"
              ? "One of the display units at the counter. Hold it first before you decide."
              : "Salah satu unit display di konter. Pegang dulu sebelum memutuskan."}
          </figcaption>
        </figure>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line bg-accent-soft p-6">
            <p className="text-4xl font-extrabold tracking-tight text-accent-deep">
              {available.length} unit
            </p>
            <p className="mt-1 text-sm font-bold text-ink">
              {locale === "en" ? "ready in store today" : "ready di toko hari ini"}
            </p>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
              {locale === "en"
                ? "Live count from the shop etalase. Prices already include store warranty."
                : "Hitungan live dari etalase toko. Harga sudah termasuk garansi toko."}
            </p>
            <Link href={`/${locale}/catalog`} className="mt-4 inline-block">
              <Button size="sm">{locale === "en" ? "See the stock" : "Lihat stoknya"}</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardContent className="p-5 pt-5">
                <p className="text-2xl font-extrabold tracking-tight text-ink">
                  {brandCount} {locale === "en" ? "brands" : "merek"}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {locale === "en"
                    ? "Apple, Samsung, Xiaomi, Oppo, and Vivo on the shelf."
                    : "Apple, Samsung, Xiaomi, Oppo, dan Vivo ada di rak."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 pt-5">
                <p className="text-2xl font-extrabold tracking-tight text-ink">
                  {locale === "en" ? "Every unit" : "Semua unit"}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {locale === "en"
                    ? "IMEI written on the receipt, warranty stated up front."
                    : "IMEI tertulis di nota, garansi dijelaskan di awal."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "How we serve you" : "Cara kami melayani"}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {values.map((v) => (
            <Card key={v.title}>
              <CardContent className="flex items-start gap-4 p-5 pt-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                  <v.icon className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[15px] font-extrabold text-ink">{v.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{v.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Brands on the shelf" : "Merek yang dijual"}
        </h2>
        <ul className="mt-4 flex flex-wrap items-center gap-2" aria-label="Brand HP">
          {BRANDS.map((b) => (
            <li
              key={b}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-extrabold text-ink"
            >
              <BrandLogo brand={b} active={false} />
              {b}
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Come by the shop" : "Mampir ke toko"}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-xl border border-line bg-card p-6 lg:col-span-5">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              {storeSettings.address}
            </p>
            <div className="mt-4 space-y-1.5 text-[13px] text-muted">
              <p>
                {locale === "en" ? "Mon to Fri" : "Senin sampai Jumat"}{" "}
                <span className="font-bold text-ink">{storeSettings.opening_hours.monday_friday}</span>
              </p>
              <p>
                {locale === "en" ? "Sat to Sun" : "Sabtu sampai Minggu"}{" "}
                <span className="font-bold text-ink">{storeSettings.opening_hours.saturday_sunday}</span>
              </p>
              <p className="font-mono">
                WA <span className="font-bold text-ink">{storeSettings.whatsapp_number}</span>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
                  locale === "en"
                    ? "Hello At Cell, I want to ask about stock."
                    : "Halo At Cell, saya mau tanya stok HP."
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                <Button variant="wa" size="sm">
                  <MessageCircle className="h-4 w-4" />
                  Chat WhatsApp
                </Button>
              </a>
              <a href={storeSettings.maps_url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  {locale === "en" ? "Directions" : "Rute ke toko"}
                  <ExternalLink className="h-3.5 w-3.5" />
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
      </div>
    </div>
  );
}
