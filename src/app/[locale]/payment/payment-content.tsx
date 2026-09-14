"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Banknote,
  Landmark,
  QrCode,
  CreditCard,
  ReceiptText,
  ShieldAlert,
  CircleCheck,
} from "lucide-react";

export function PaymentContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");

  const methods = [
    {
      icon: Banknote,
      title: locale === "en" ? "Cash" : "Tunai",
      desc:
        locale === "en"
          ? "Pay at the counter and take the unit home the same day."
          : "Bayar di konter dan bawa pulang unitnya hari itu juga.",
    },
    {
      icon: Landmark,
      title: locale === "en" ? "Bank transfer" : "Transfer bank",
      desc:
        locale === "en"
          ? "Transfer to the shop account stated at the counter, then show the proof."
          : "Transfer ke rekening toko yang diinfokan di konter, lalu tunjukkan buktinya.",
    },
    {
      icon: QrCode,
      title: "QRIS",
      desc:
        locale === "en"
          ? "Scan the official shop QR at the counter from any banking app or e-wallet."
          : "Pindai QR resmi toko di konter dari m-banking atau e-wallet apa pun.",
    },
    {
      icon: CreditCard,
      title: locale === "en" ? "Debit card" : "Kartu debit",
      desc:
        locale === "en"
          ? "EDC available at the counter for all major debit cards."
          : "EDC tersedia di konter untuk semua kartu debit utama.",
    },
  ];

  const rules = (
    locale === "en"
      ? [
          "Every payment receives a printed receipt stating the unit IMEI.",
          "Booking a unit is free with a 1x24 hour hold, no down payment.",
          "Installment plans are processed in store with eligible cards only.",
          "Never transfer to personal accounts. The shop account is only ever stated at the counter.",
          "Prices in the etalase are final retail prices including store warranty.",
        ]
      : [
          "Setiap pembayaran dapat nota cetak yang mencantumkan IMEI unit.",
          "Booking unit gratis dengan masa tahan 1x24 jam, tanpa DP.",
          "Cicilan diproses di toko dan hanya untuk kartu yang memenuhi syarat.",
          "Jangan transfer ke rekening pribadi. Rekening toko hanya diinfokan di konter.",
          "Harga di etalase adalah harga jual final termasuk garansi toko.",
        ]
  );

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Pay in store, safely" : "Bayar di toko, aman"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "All payments happen at the counter. No payment links, no online checkout."
            : "Semua pembayaran terjadi di konter. Tanpa link pembayaran, tanpa checkout online."}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          {locale === "en" ? "Last updated: September 2026" : "Terakhir diperbarui: September 2026"}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {methods.map((m) => (
            <Card key={m.title}>
              <CardContent className="flex items-start gap-4 p-5 pt-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                  <m.icon className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[15px] font-extrabold text-ink">{m.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{m.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="rounded-xl border border-line bg-accent-soft p-6 sm:col-span-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card">
                <CreditCard className="h-6 w-6 text-accent-deep" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[15px] font-extrabold text-ink">
                  {locale === "en" ? "0% installments up to 12 months" : "Cicilan 0% sampai 12 bulan"}
                </p>
                <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
                  {locale === "en"
                    ? "Available for eligible credit cards, processed in store before you take the unit home."
                    : "Berlaku untuk kartu kredit yang memenuhi syarat, diproses di toko sebelum unit dibawa pulang."}
                </p>
              </div>
            </div>
          </div>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Payment rules" : "Aturan pembayaran"}
        </h2>
        <ul className="mt-4 space-y-2.5">
          {rules.map((r) => (
            <li key={r} className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" strokeWidth={2} />
              {r}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-bg p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" strokeWidth={1.75} />
          <p className="text-[13px] leading-relaxed text-ink">
            {locale === "en"
              ? "At Cell never sends payment links by chat. If someone asks for a transfer on our behalf, stop and confirm on the official number first."
              : "At Cell tidak pernah mengirim link pembayaran lewat chat. Kalau ada yang meminta transfer mengatasnamakan kami, berhenti dan konfirmasi ke nomor resmi dulu."}
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 rounded-xl border border-line bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
              <ReceiptText className="h-5 w-5 text-accent" />
              {locale === "en" ? "Receipt always states the IMEI" : "Nota selalu mencantumkan IMEI"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {locale === "en"
                ? "Keep it. It is your warranty proof."
                : "Simpan baik-baik. Itu bukti garansi Anda."}
            </p>
          </div>
          <a
            href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
              locale === "en"
                ? "Hello At Cell, I want to ask about payment options."
                : "Halo At Cell, saya mau tanya soal cara bayar."
            )}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0"
          >
            <Button variant="wa">
              {locale === "en" ? "Ask on WhatsApp" : "Tanya via WhatsApp"}
            </Button>
          </a>
        </div>

        <Link
          href={`/${locale}/terms`}
          className="mt-4 inline-block text-[13px] font-bold text-accent-deep hover:underline"
        >
          {locale === "en" ? "Read the store terms" : "Baca syarat dan ketentuan toko"}
        </Link>
      </div>
    </div>
  );
}
