"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  Phone,
  Store,
  Clock,
  ChevronDown,
  Send,
} from "lucide-react";

const TOPICS_ID = ["Garansi", "Stok HP", "Servis", "Trade-in", "Lainnya"];
const TOPICS_EN = ["Warranty", "Stock", "Repair", "Trade-in", "Other"];

export function CustomerServiceContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");
  const topics = locale === "en" ? TOPICS_EN : TOPICS_ID;

  const [name, setName] = useState("");
  const [topic, setTopic] = useState(topics[0]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const sendViaWa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      setError(
        locale === "en"
          ? "Fill in your name and message first so we can reply properly."
          : "Isi nama dan pesan dulu supaya kami bisa balas dengan benar."
      );
      return;
    }
    setError("");
    const text =
      locale === "en"
        ? `Hello At Cell, I am ${name.trim()}.\nTopic: ${topic}\n${message.trim()}`
        : `Halo At Cell, saya ${name.trim()}.\nTopik: ${topic}\n${message.trim()}`;
    window.open(`https://wa.me/${cleanWa}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const channels = [
    {
      icon: MessageCircle,
      title: "WhatsApp",
      value: storeSettings.whatsapp_number,
      desc:
        locale === "en"
          ? "Fastest reply during store hours, usually within minutes."
          : "Balasan tercepat di jam toko, biasanya dalam hitungan menit.",
      href: `https://wa.me/${cleanWa}?text=${encodeURIComponent(
        locale === "en" ? "Hello At Cell, I want to ask something." : "Halo At Cell, saya mau tanya."
      )}`,
      action: locale === "en" ? "Chat now" : "Chat sekarang",
      wa: true,
    },
    {
      icon: Phone,
      title: locale === "en" ? "Phone" : "Telepon",
      value: storeSettings.phone_number,
      desc:
        locale === "en"
          ? "For urgent matters such as pickup timing and claim status."
          : "Untuk hal mendesak seperti jadwal ambil dan status klaim.",
      href: `tel:${(storeSettings.phone_number || "").replace(/[^+\d]/g, "")}`,
      action: locale === "en" ? "Call the shop" : "Telepon toko",
      wa: false,
    },
  ];

  const faqs = (
    locale === "en"
      ? [
          {
            q: "What are the store hours?",
            a: `Monday to Friday ${storeSettings.opening_hours.monday_friday}, Saturday to Sunday ${storeSettings.opening_hours.saturday_sunday}. WhatsApp stays open for questions outside those hours and we reply the next morning.`,
          },
          {
            q: "Can I reserve a unit before coming?",
            a: "Yes. Send the model name and the last 4 digits of the IMEI shown in the catalog. We hold it for 1x24 hours with no down payment.",
          },
          {
            q: "What payment methods do you accept?",
            a: "Cash, bank transfer, QRIS, debit, and 0% installments up to 12 months for eligible cards. Every payment comes with a printed receipt stating the IMEI.",
          },
          {
            q: "Do you buy phones without a trade-in purchase?",
            a: "Yes, we buy selected second phones after a physical check at the counter. The price follows the same grading as trade-ins.",
          },
          {
            q: "My repair is taking long. Who do I contact?",
            a: "Reply with your service ticket code on WhatsApp or check the tracking page. If the sparepart is ordered, we always confirm the date before work starts.",
          },
        ]
      : [
          {
            q: "Toko buka jam berapa?",
            a: `Senin sampai Jumat ${storeSettings.opening_hours.monday_friday}, Sabtu sampai Minggu ${storeSettings.opening_hours.saturday_sunday}. WhatsApp tetap bisa dihubungi di luar jam itu dan kami balas pagi berikutnya.`,
          },
          {
            q: "Bisa booking unit sebelum datang?",
            a: "Bisa. Kirim nama model dan 4 digit terakhir IMEI yang tampil di katalog. Kami tahan 1x24 jam tanpa DP.",
          },
          {
            q: "Bayar bisa pakai apa saja?",
            a: "Tunai, transfer bank, QRIS, debit, dan cicilan 0% sampai 12 bulan untuk kartu yang memenuhi syarat. Setiap pembayaran dapat nota cetak yang mencantumkan IMEI.",
          },
          {
            q: "Jual HP saja tanpa beli, bisa?",
            a: "Bisa untuk tipe tertentu setelah cek fisik di konter. Harganya ikut grading yang sama dengan tukar tambah.",
          },
          {
            q: "Servis kok lama, hubungi ke mana?",
            a: "Balas dengan kode tiket servis lewat WhatsApp atau cek halaman pelacakan. Kalau sparepart harus dipesan, tanggalnya selalu kami pastikan sebelum dikerjakan.",
          },
        ]
  );

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Talk to a real person" : "Ngobrol dengan orang beneran"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "Questions about stock, warranty, repairs, or trade-in go straight to the shop counter. No bots, no tickets."
            : "Tanya soal stok, garansi, servis, atau tukar tambah langsung dijawab konter toko. Tanpa bot, tanpa antrean tiket."}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="flex flex-col gap-4 p-5 pt-5 sm:flex-row sm:items-center">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                <MessageCircle className="h-6 w-6 text-accent-deep" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-ink">WhatsApp At Cell</p>
                <p className="font-mono text-sm font-bold text-ink">{storeSettings.whatsapp_number}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {locale === "en"
                    ? "Fastest reply during store hours, usually within minutes."
                    : "Balasan tercepat di jam toko, biasanya dalam hitungan menit."}
                </p>
              </div>
              <a
                href={channels[0].href}
                target="_blank"
                rel="noreferrer"
                className="shrink-0"
              >
                <Button variant="wa">{channels[0].action}</Button>
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 pt-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent-soft">
                <Phone className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
              </span>
              <p className="mt-3 text-[15px] font-extrabold text-ink">{channels[1].title}</p>
              <p className="font-mono text-sm font-bold text-ink">{channels[1].value}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{channels[1].desc}</p>
              <a href={channels[1].href} className="mt-3 inline-block">
                <Button variant="outline" size="sm">
                  {channels[1].action}
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
              <Store className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-extrabold text-ink">
                {locale === "en" ? "Visit the shop" : "Datang langsung ke toko"}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{storeSettings.address}</p>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
                <Clock className="h-4 w-4 shrink-0 text-accent" />
                {locale === "en" ? "Mon to Fri" : "Senin sampai Jumat"}{" "}
                <span className="font-bold text-ink">{storeSettings.opening_hours.monday_friday}</span>
              </p>
              <p className="mt-1 pl-6 text-[13px] text-muted">
                {locale === "en" ? "Sat to Sun" : "Sabtu sampai Minggu"}{" "}
                <span className="font-bold text-ink">{storeSettings.opening_hours.saturday_sunday}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={storeSettings.maps_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    {locale === "en" ? "Open maps" : "Buka peta"}
                  </Button>
                </a>
                <Link href={`/${locale}/about`}>
                  <Button variant="ghost" size="sm">
                    {locale === "en" ? "More about the shop" : "Kenalan dengan toko"}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Write once, send via WhatsApp" : "Tulis sekali, kirim via WhatsApp"}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "Arrange your question below so the counter can answer in one reply."
            : "Susun pertanyaan di bawah supaya konter bisa jawab dalam sekali balas."}
        </p>
        <form onSubmit={sendViaWa} className="mt-4 rounded-xl border border-line bg-card p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="cs-name" className="text-xs font-bold text-ink">
                {locale === "en" ? "Your name" : "Nama Anda"}
              </label>
              <Input
                id="cs-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={locale === "en" ? "e.g. Rizky" : "mis. Rizky"}
                autoComplete="name"
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-2">
              <span id="cs-topic-label" className="text-xs font-bold text-ink">
                {locale === "en" ? "Topic" : "Topik"}
              </span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="cs-topic-label">
                {topics.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTopic(t)}
                    aria-pressed={topic === t}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      topic === t
                        ? "bg-accent text-white"
                        : "border border-line bg-card text-muted hover:border-accent hover:text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="cs-message" className="text-xs font-bold text-ink">
                {locale === "en" ? "Message" : "Pesan"}
              </label>
              <textarea
                id="cs-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder={
                  locale === "en"
                    ? "e.g. Is the second iPhone 13 with IMEI ending 1029 still available?"
                    : "mis. iPhone 13 second IMEI belakang 1029 masih ada?"
                }
                className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-[11px] text-muted">
                {locale === "en"
                  ? "Include the model name and IMEI tail for stock questions, or the ticket code for repairs."
                  : "Cantumkan nama model dan ekor IMEI untuk tanya stok, atau kode tiket untuk servis."}
              </p>
            </div>
          </div>
          {error !== "" && (
            <p role="alert" className="mt-3 rounded-lg bg-bad-bg px-3 py-2 text-[13px] font-bold text-bad">
              {error}
            </p>
          )}
          <Button type="submit" variant="wa" className="mt-4">
            <Send className="h-4 w-4" />
            {locale === "en" ? "Send via WhatsApp" : "Kirim via WhatsApp"}
          </Button>
        </form>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Asked often" : "Sering ditanyakan"}
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

        <div className="mt-10 flex flex-col gap-3 rounded-xl border border-line bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-extrabold text-ink">
              {locale === "en" ? "Repair stuck somewhere?" : "Servis mandek di suatu tahap?"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {locale === "en"
                ? "Check the live progress yourself with the receipt code."
                : "Cek progresnya sendiri pakai kode nota."}
            </p>
          </div>
          <Link href={`/${locale}/tracking`} className="shrink-0">
            <Button>{locale === "en" ? "Track repair" : "Lacak servis"}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
