"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MessageCircle,
  Phone,
  MapPin,
  Clock,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { StoreMap } from "@/components/public/store-map";

export function ContactContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");
  const waLink = `https://wa.me/${cleanWa}?text=${encodeURIComponent(
    locale === "en" ? "Hello At Cell, I want to ask something." : "Halo At Cell, saya mau tanya."
  )}`;

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Contact the shop" : "Hubungi toko"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "One official number, one physical counter. Every message is answered by shop staff."
            : "Satu nomor resmi, satu konter fisik. Setiap pesan dijawab staf toko."}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="border-accent/30">
            <CardContent className="flex flex-col gap-3 p-5 pt-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft">
                <MessageCircle className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-ink">WhatsApp</p>
                <p className="font-mono text-sm font-bold text-ink">{storeSettings.whatsapp_number}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {locale === "en"
                    ? "For stock, booking, warranty, and repair status. Replies during store hours."
                    : "Untuk stok, booking, garansi, dan status servis. Dibalas di jam toko."}
                </p>
              </div>
              <a href={waLink} target="_blank" rel="noreferrer">
                <Button variant="wa">
                  <MessageCircle className="h-4 w-4" />
                  Chat WhatsApp
                </Button>
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-3 p-5 pt-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft">
                <Phone className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-ink">
                  {locale === "en" ? "Phone" : "Telepon"}
                </p>
                <p className="font-mono text-sm font-bold text-ink">{storeSettings.phone_number}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {locale === "en"
                    ? "For urgent matters such as pickup timing and claim status."
                    : "Untuk hal mendesak seperti jadwal ambil dan status klaim."}
                </p>
              </div>
              <a href={`tel:${(storeSettings.phone_number || "").replace(/[^+\d]/g, "")}`}>
                <Button variant="outline">
                  <Phone className="h-4 w-4" />
                  {locale === "en" ? "Call the shop" : "Telepon toko"}
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-xl border border-line bg-card p-6 lg:col-span-5">
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              {storeSettings.address}
            </p>
            <div className="mt-4 space-y-1.5 text-[13px] text-muted">
              <p className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 shrink-0 text-accent" />
                {locale === "en" ? "Mon to Fri" : "Senin sampai Jumat"}{" "}
                <span className="font-bold text-ink">{storeSettings.opening_hours.monday_friday}</span>
              </p>
              <p className="pl-6">
                {locale === "en" ? "Sat to Sun" : "Sabtu sampai Minggu"}{" "}
                <span className="font-bold text-ink">{storeSettings.opening_hours.saturday_sunday}</span>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <a href={storeSettings.maps_url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm">
                  {locale === "en" ? "Directions" : "Rute ke toko"}
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
              <Link href={`/${locale}/customer-service`}>
                <Button variant="ghost" size="sm">
                  {locale === "en" ? "Customer service" : "Layanan pelanggan"}
                </Button>
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-line lg:col-span-7">
            <StoreMap
              title={locale === "en" ? "At Cell store location" : "Lokasi toko At Cell"}
            />
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-bg p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" strokeWidth={1.75} />
          <p className="text-[13px] leading-relaxed text-ink">
            {locale === "en"
              ? "Beware of scams using the At Cell name. We only transact in store and on the official number above. Never transfer to personal accounts."
              : "Waspada penipuan yang mengatasnamakan At Cell. Transaksi hanya di toko dan nomor resmi di atas. Jangan transfer ke rekening pribadi."}
          </p>
        </div>
      </div>
    </div>
  );
}
