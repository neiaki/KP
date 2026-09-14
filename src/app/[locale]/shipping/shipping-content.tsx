"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Store,
  MessageCircle,
  ReceiptText,
  ScanBarcode,
  PackageCheck,
  UserCheck,
  ChevronDown,
} from "lucide-react";

export function ShippingContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");
  const waBook = `https://wa.me/${cleanWa}?text=${encodeURIComponent(
    locale === "en"
      ? "Hello At Cell, I want to reserve a unit. The model is:"
      : "Halo At Cell, saya mau booking unit. Tipenya:"
  )}`;

  const steps = [
    {
      icon: MessageCircle,
      verb: locale === "en" ? "Reserve on WhatsApp" : "Booking via WhatsApp",
      desc:
        locale === "en"
          ? "Send the model name and the last 4 digits of the IMEI from the etalase."
          : "Kirim nama model dan 4 digit terakhir IMEI dari etalase.",
    },
    {
      icon: PackageCheck,
      verb: locale === "en" ? "We hold it 1x24 hours" : "Kami tahan 1x24 jam",
      desc:
        locale === "en"
          ? "Free hold, no down payment. The unit is taken off the shelf for you."
          : "Tahan gratis, tanpa DP. Unitnya diturunkan dari rak untuk Anda.",
    },
    {
      icon: ScanBarcode,
      verb: locale === "en" ? "Check it in store" : "Cek di toko",
      desc:
        locale === "en"
          ? "Open the box, match the IMEI, and test every function at the counter."
          : "Buka dusnya, cocokkan IMEI, dan tes semua fungsi di konter.",
    },
    {
      icon: ReceiptText,
      verb: locale === "en" ? "Pay and take it home" : "Bayar dan bawa pulang",
      desc:
        locale === "en"
          ? "Pay by cash, transfer, QRIS, debit, or installments. Receipt states the IMEI."
          : "Bayar tunai, transfer, QRIS, debit, atau cicilan. Nota mencantumkan IMEI.",
    },
  ];

  const faqs = (
    locale === "en"
      ? [
          {
            q: "Do you ship by courier?",
            a: "Not yet. Every unit is handed over in store so you can check it first. If you live far, message us on WhatsApp and we will arrange the safest option.",
          },
          {
            q: "Can someone pick up on my behalf?",
            a: "Yes. They must bring the booking name, a photo of the buyer ID, and the receipt or booking chat. We confirm by phone with the buyer before handover.",
          },
          {
            q: "What if the unit is sold before I arrive?",
            a: "A confirmed WhatsApp booking locks the unit for 1x24 hours. Without a booking, stock follows first come first served at the counter.",
          },
        ]
      : [
          {
            q: "Bisa kirim pakai ekspedisi?",
            a: "Belum bisa. Setiap unit diserahkan di toko supaya bisa dicek dulu. Kalau rumah Anda jauh, chat WhatsApp dan kami bantu atur opsi yang paling aman.",
          },
          {
            q: "Ambil unit boleh diwakilkan?",
            a: "Boleh. Bawa nama booking, foto KTP pembeli, dan nota atau chat booking. Kami konfirmasi lewat telepon ke pembeli sebelum serah terima.",
          },
          {
            q: "Bagaimana kalau unit keburu laku sebelum saya datang?",
            a: "Booking yang sudah dikonfirmasi lewat WhatsApp mengunci unit 1x24 jam. Tanpa booking, stok ikut siapa cepat dia dapat di konter.",
          },
        ]
  );

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Picked up in store, checked first" : "Diambil di toko, dicek dulu"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "At Cell is a walk-in shop. Units are handed over at the counter, never shipped unseen."
            : "At Cell itu toko fisik. Unit diserahkan di konter, tidak dikirim tanpa dicek."}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          {locale === "en" ? "Last updated: September 2026" : "Terakhir diperbarui: September 2026"}
        </p>

        <div className="mt-6 rounded-xl border border-line bg-accent-soft p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card">
              <Store className="h-6 w-6 text-accent-deep" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold text-ink">
                {locale === "en" ? "In-store pickup only" : "Hanya ambil di toko"}
              </p>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
                {locale === "en"
                  ? "No courier shipping, no cash on delivery. You hold the exact unit before paying a rupiah."
                  : "Tanpa kirim ekspedisi, tanpa COD. Anda pegang unit persisnya sebelum bayar sepeser pun."}
              </p>
            </div>
            <a href={waBook} target="_blank" rel="noreferrer" className="shrink-0">
              <Button variant="wa">
                <MessageCircle className="h-4 w-4" />
                {locale === "en" ? "Reserve a unit" : "Booking unit"}
              </Button>
            </a>
          </div>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "How pickup works" : "Alur pengambilan"}
        </h2>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-card px-6">
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

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="flex items-start gap-4 p-5 pt-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                <UserCheck className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-ink">
                  {locale === "en" ? "Pickup by representative" : "Diambil perwakilan"}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                  {locale === "en"
                    ? "Bring the booking name, buyer ID photo, and booking chat. We call the buyer first."
                    : "Bawa nama booking, foto KTP pembeli, dan chat booking. Kami telepon pembeli dulu."}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-4 p-5 pt-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                <MessageCircle className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-ink">
                  {locale === "en" ? "Live far away?" : "Rumah jauh?"}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                  {locale === "en"
                    ? "Message us first. We can video-check the unit together before you travel."
                    : "Chat dulu. Kita bisa video-call cek unit bareng sebelum Anda jalan."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Common questions" : "Pertanyaan umum"}
        </h2>
        <div className="mt-4 space-y-2">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-line bg-card px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-extrabold text-ink [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>

        <Link
          href={`/${locale}/payment`}
          className="mt-6 inline-block text-[13px] font-bold text-accent-deep hover:underline"
        >
          {locale === "en" ? "See accepted payment methods" : "Lihat cara bayar yang diterima"}
        </Link>
      </div>
    </div>
  );
}
