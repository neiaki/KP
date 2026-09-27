"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldCheck,
  Smartphone,
  BadgeCheck,
  Wrench,
  ReceiptText,
  ScanBarcode,
  PackageCheck,
  Store,
  MessageCircle,
  CircleCheck,
  CircleX,
  ChevronDown,
} from "lucide-react";

export function WarrantyContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");
  const waClaim = `https://wa.me/${cleanWa}?text=${encodeURIComponent(
    locale === "en"
      ? "Hello At Cell, I want to claim store warranty. My invoice number is:"
      : "Halo At Cell, saya mau klaim garansi toko. Nomor nota saya:"
  )}`;

  const durations = [
    {
      icon: Smartphone,
      title: locale === "en" ? "New sealed phones" : "HP baru segel",
      length: locale === "en" ? "12 months" : "12 bulan",
      desc:
        locale === "en"
          ? "Store warranty for factory defects, plus the official distributor warranty stated on the warranty card."
          : "Garansi toko untuk cacat bawaan pabrik, plus garansi resmi distributor sesuai kartu garansi.",
      featured: true,
    },
    {
      icon: BadgeCheck,
      title: locale === "en" ? "Second phones" : "HP second",
      length: locale === "en" ? "30 days" : "30 hari",
      desc:
        locale === "en"
          ? "Machine warranty for 30 days, plus a 7 day unit exchange if a factory defect slipped through our initial check."
          : "Garansi mesin 30 hari, plus tukar unit 7 hari kalau ada cacat bawaan yang lolos dari cek awal kami.",
      featured: false,
    },
    {
      icon: Wrench,
      title: locale === "en" ? "Repairs" : "Hasil servis",
      length: locale === "en" ? "30 to 90 days" : "30 sampai 90 hari",
      desc:
        locale === "en"
          ? "Workmanship warranty for 30 days, up to 90 days for stated sparepart replacements. The exact period is printed on your receipt."
          : "Garansi pengerjaan 30 hari, sampai 90 hari untuk ganti sparepart tertentu. Masa pastinya tertulis di nota.",
      featured: false,
    },
  ];

  const covered =
    locale === "en"
      ? [
          "Dead pixels, ghost touch, or lines appearing on their own",
          "Camera, speaker, mic, or fingerprint failing without impact",
          "Battery draining abnormally fast within the warranty period",
          "Signal or charging faults from the factory",
          "Repaired part failing again within the service warranty",
        ]
      : [
          "Layar bergaris, ghost touch, atau dead pixel yang muncul sendiri",
          "Kamera, speaker, mic, atau fingerprint mati tanpa benturan",
          "Baterai boros tidak wajar selama masa garansi",
          "Sinyal atau charging bermasalah dari pabrik",
          "Part hasil servis rusak lagi selama masa garansi pengerjaan",
        ];

  const notCovered =
    locale === "en"
      ? [
          "Cracked screen or dented body from drops and impacts",
          "Water damage or corrosion from liquids",
          "Units opened or repaired elsewhere, broken store seal",
          "Rooted, jailbroken, or unofficial firmware",
          "Normal wear such as gradual battery health decline and light scratches",
        ]
      : [
          "Layar pecah atau bodi penyok karena jatuh dan terbentur",
          "Mati total atau korosi karena kena air dan cairan",
          "Unit pernah dibuka atau diservis di tempat lain, segel toko rusak",
          "Sudah di root, jailbreak, atau pakai firmware tidak resmi",
          "Aus wajar seperti battery health turun bertahap dan lecet pemakaian",
        ];

  const claimSteps = [
    {
      icon: ReceiptText,
      verb: locale === "en" ? "Bring the receipt" : "Bawa nota pembelian",
      desc:
        locale === "en"
          ? "Invoice or service ticket proves the purchase date and warranty period."
          : "Nota atau tiket servis jadi bukti tanggal beli dan masa garansi.",
    },
    {
      icon: ScanBarcode,
      verb: locale === "en" ? "Match the IMEI" : "Cocokkan IMEI",
      desc:
        locale === "en"
          ? "We check the 15 digit IMEI on the unit against the receipt."
          : "Kami cek IMEI 15 digit di unit dengan yang tertulis di nota.",
    },
    {
      icon: PackageCheck,
      verb: locale === "en" ? "Bring the box set" : "Bawa kelengkapannya",
      desc:
        locale === "en"
          ? "Box, charger, and freebies from the purchase speed up verification."
          : "Dus, charger, dan bonus pembelian mempercepat verifikasi.",
    },
    {
      icon: Store,
      verb: locale === "en" ? "Come to the counter" : "Datang ke konter",
      desc:
        locale === "en"
          ? "Claims are handled in store so a technician can test the unit directly."
          : "Klaim dilayani di toko supaya teknisi bisa tes unitnya langsung.",
    },
  ];

  const faqs = (
    locale === "en"
      ? [
          {
            q: "What if I lost the receipt?",
            a: "Tell us the buyer name and purchase date. If the transaction is recorded and the IMEI matches our stock history, we can still process the claim.",
          },
          {
            q: "Can someone else claim on my behalf?",
            a: "Yes. Bring the receipt, the unit, and a photo of the buyer ID. We confirm by phone with the buyer before handing anything over.",
          },
          {
            q: "Does servicing elsewhere void the store warranty?",
            a: "Yes. Once the store seal is broken or another shop opens the unit, the store warranty ends. The official distributor warranty may still apply for new sealed phones.",
          },
          {
            q: "My second phone has an issue on day 5. Exchange or repair?",
            a: "Within the first 7 days, factory defects qualify for a unit exchange to an equivalent unit. After that, we repair it under the 30 day machine warranty.",
          },
          {
            q: "How long does a claim take?",
            a: "Light checks finish the same day. If a sparepart must be ordered, we give a firm date before any work starts and you can track a service claim from the tracking page.",
          },
        ]
      : [
          {
            q: "Nota pembelian hilang, masih bisa klaim?",
            a: "Bisa. Sebutkan nama pembeli dan tanggal belinya. Kalau transaksinya tercatat dan IMEI cocok dengan riwayat stok, klaim tetap kami proses.",
          },
          {
            q: "Klaim boleh diwakilkan orang lain?",
            a: "Boleh. Bawa nota, unitnya, dan foto KTP pembeli. Kami konfirmasi lewat telepon ke pembeli sebelum menyerahkan apa pun.",
          },
          {
            q: "Servis di tempat lain bikin garansi hangus?",
            a: "Iya. Segel toko rusak atau unit pernah dibuka tempat lain berarti garansi toko berakhir. Untuk HP baru segel, garansi resmi distributor biasanya masih berlaku.",
          },
          {
            q: "HP second bermasalah di hari ke 5, tukar atau servis?",
            a: "Dalam 7 hari pertama, cacat bawaan bisa tukar unit yang setara. Lewat dari itu, kami perbaiki dengan garansi mesin 30 hari.",
          },
          {
            q: "Klaim garansi makan waktu berapa lama?",
            a: "Cek ringan selesai hari itu juga. Kalau sparepart harus dipesan, kami kasih tanggal pasti sebelum dikerjakan dan klaim servis bisa dilacak dari halaman pelacakan.",
          },
        ]
  );

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Store warranty, stated clearly" : "Garansi toko, tertulis jelas"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "Every unit leaves with its IMEI on the receipt. If a factory defect shows up, bring it back and we handle it."
            : "Setiap unit keluar dengan IMEI tertulis di nota. Kalau muncul cacat bawaan, bawa kembali dan kami urus."}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          {locale === "en" ? "Last updated: September 2026" : "Terakhir diperbarui: September 2026"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={waClaim} target="_blank" rel="noreferrer">
            <Button variant="wa">
              <MessageCircle className="h-4 w-4" />
              {locale === "en" ? "Claim via WhatsApp" : "Klaim via WhatsApp"}
            </Button>
          </a>
          <Link href={`/${locale}/tracking`}>
            <Button variant="outline">
              {locale === "en" ? "Track a service claim" : "Lacak klaim servis"}
            </Button>
          </Link>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "How long each warranty lasts" : "Masa garansi tiap pembelian"}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {durations.map((d) =>
            d.featured ? (
              <div
                key={d.title}
                className="rounded-xl border border-line bg-accent-soft p-6 lg:col-span-2"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-card">
                    <d.icon className="h-6 w-6 text-accent-deep" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold text-ink">{d.title}</p>
                    <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-accent-deep">
                      {d.length}
                    </p>
                    <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{d.desc}</p>
                  </div>
                </div>
              </div>
            ) : (
              <Card key={d.title}>
                <CardContent className="flex items-start gap-4 p-5 pt-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
                    <d.icon className="h-5 w-5 text-accent-deep" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="text-[15px] font-extrabold text-ink">{d.title}</p>
                    <p className="mt-0.5 text-lg font-extrabold text-accent-deep">{d.length}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{d.desc}</p>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Covered and not covered" : "Ditanggung dan tidak ditanggung"}
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="border-good/30">
            <CardContent className="p-5 pt-5">
              <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
                <ShieldCheck className="h-5 w-5 text-good" strokeWidth={1.75} />
                {locale === "en" ? "Covered" : "Ditanggung"}
              </p>
              <ul className="mt-3 space-y-2.5">
                {covered.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-good" strokeWidth={2} />
                    {c}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-bad/30">
            <CardContent className="p-5 pt-5">
              <p className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
                <CircleX className="h-5 w-5 text-bad" strokeWidth={1.75} />
                {locale === "en" ? "Not covered" : "Tidak ditanggung"}
              </p>
              <ul className="mt-3 space-y-2.5">
                {notCovered.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
                    <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-bad" strokeWidth={2} />
                    {c}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "How to claim" : "Cara klaim"}
        </h2>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-card px-6">
          {claimSteps.map((s) => (
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

        <h2 className="mt-10 text-2xl font-extrabold tracking-tight text-ink">
          {locale === "en" ? "Common questions" : "Pertanyaan umum"}
        </h2>
        <div className="mt-4 space-y-2">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl border border-line bg-card px-5 py-4"
            >
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
              {locale === "en" ? "Unsure if your case qualifies?" : "Ragu kasus Anda masuk garansi?"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {locale === "en"
                ? "Send the invoice number and a photo of the issue first."
                : "Kirim nomor nota dan foto kerusakannya dulu."}
            </p>
          </div>
          <a href={waClaim} target="_blank" rel="noreferrer" className="shrink-0">
            <Button variant="wa">
              <MessageCircle className="h-4 w-4" />
              {locale === "en" ? "Ask on WhatsApp" : "Tanya via WhatsApp"}
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
