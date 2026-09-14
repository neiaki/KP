"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export function TermsContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");

  const sections = (
    locale === "en"
      ? [
          {
            title: "General",
            body: [
              "At Cell is a physical phone shop in Paku Jaya, Serpong Utara. These terms apply to every purchase, trade-in, and repair at our counter.",
              "By transacting with us, you agree to the policies on this page plus the warranty, payment, and pickup pages linked below.",
            ],
          },
          {
            title: "Prices and stock",
            body: [
              "Prices in the etalase are final retail prices including store warranty and may change as stock rotates.",
              "Stock follows first come first served at the counter, except confirmed WhatsApp bookings which lock a unit for 1x24 hours.",
            ],
          },
          {
            title: "Purchase and IMEI",
            body: [
              "Every unit sold is bound to its 15 digit IMEI printed on the receipt. The IMEI on the unit must match the receipt.",
              "Check the unit at the counter before paying. Once paid and taken home, the unit is considered accepted in the stated condition.",
            ],
          },
          {
            title: "Warranty",
            body: [
              "New sealed phones carry a 12 month store warranty for factory defects plus the official distributor warranty.",
              "Second phones carry a 30 day machine warranty plus a 7 day unit exchange for factory defects.",
              "Full terms live on the warranty page and override any verbal promise.",
            ],
          },
          {
            title: "Trade-in",
            body: [
              "Trade-in prices are estimates until a physical inspection at the counter. The final price is agreed face to face.",
              "The old unit must be free of iCloud or Google account locks and legal disputes.",
            ],
          },
          {
            title: "Repairs",
            body: [
              "Repair costs are quoted and approved before any work starts. Sparepart and labor are stated separately.",
              "Unclaimed units are held for 90 days, after which we contact you before any further action.",
            ],
          },
          {
            title: "Personal data",
            body: [
              "We record buyer name and phone number only for warranty proof, repair status, and booking holds.",
              "Your data is never sold or shared for marketing. Ask at the counter to correct it.",
            ],
          },
          {
            title: "Fraud",
            body: [
              "At Cell only transacts in store and on the official number listed on this site.",
              "We never send payment links by chat and never ask for transfers to personal accounts.",
            ],
          },
        ]
      : [
          {
            title: "Umum",
            body: [
              "At Cell adalah toko HP fisik di Paku Jaya, Serpong Utara. Aturan ini berlaku untuk setiap pembelian, tukar tambah, dan servis di konter kami.",
              "Dengan bertransaksi, Anda menyetujui aturan di halaman ini plus halaman garansi, pembayaran, dan pengambilan yang tertaut di bawah.",
            ],
          },
          {
            title: "Harga dan stok",
            body: [
              "Harga di etalase adalah harga jual final termasuk garansi toko dan bisa berubah mengikuti perputaran stok.",
              "Stok ikut siapa cepat dia dapat di konter, kecuali booking WhatsApp yang sudah dikonfirmasi dan mengunci unit 1x24 jam.",
            ],
          },
          {
            title: "Pembelian dan IMEI",
            body: [
              "Setiap unit yang terjual terikat pada IMEI 15 digit yang tercetak di nota. IMEI di unit wajib sama dengan di nota.",
              "Cek unit di konter sebelum bayar. Setelah dibayar dan dibawa pulang, unit dianggap diterima sesuai kondisi yang dinyatakan.",
            ],
          },
          {
            title: "Garansi",
            body: [
              "HP baru segel punya garansi toko 12 bulan untuk cacat bawaan plus garansi resmi distributor.",
              "HP second punya garansi mesin 30 hari plus tukar unit 7 hari untuk cacat bawaan.",
              "Ketentuan lengkap ada di halaman garansi dan mengalahkan janji lisan apa pun.",
            ],
          },
          {
            title: "Tukar tambah",
            body: [
              "Harga tukar tambah bersifat taksiran sampai ada inspeksi fisik di konter. Harga final disepakati tatap muka.",
              "Unit lama wajib bebas kunci akun iCloud atau Google dan bebas sengketa.",
            ],
          },
          {
            title: "Servis",
            body: [
              "Biaya servis diinfokan dan disetujui dulu sebelum dikerjakan. Sparepart dan jasa dinyatakan terpisah.",
              "Unit yang tidak diambil disimpan 90 hari, setelah itu kami hubungi Anda sebelum langkah berikutnya.",
            ],
          },
          {
            title: "Data pribadi",
            body: [
              "Kami mencatat nama dan nomor telepon pembeli hanya untuk bukti garansi, status servis, dan tahan booking.",
              "Data Anda tidak dijual atau dibagikan untuk pemasaran. Minta koreksi di konter bila ada yang salah.",
            ],
          },
          {
            title: "Penipuan",
            body: [
              "At Cell hanya bertransaksi di toko dan nomor resmi yang tercantum di situs ini.",
              "Kami tidak pernah mengirim link pembayaran lewat chat dan tidak pernah meminta transfer ke rekening pribadi.",
            ],
          },
        ]
  );

  const links = [
    { href: `/${locale}/warranty`, label: locale === "en" ? "Warranty policy" : "Kebijakan garansi" },
    { href: `/${locale}/payment`, label: locale === "en" ? "Payment policy" : "Kebijakan pembayaran" },
    { href: `/${locale}/shipping`, label: locale === "en" ? "Pickup policy" : "Kebijakan pengambilan" },
  ];

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Store terms" : "Syarat dan ketentuan toko"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "Short rules for buying, trading in, and repairing at At Cell."
            : "Aturan singkat untuk belanja, tukar tambah, dan servis di At Cell."}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted">
          {locale === "en" ? "Last updated: September 2026" : "Terakhir diperbarui: September 2026"}
        </p>

        <div className="mt-6 space-y-6">
          {sections.map((s) => (
            <section key={s.title} className="rounded-xl border border-line bg-card p-5 sm:p-6">
              <h2 className="text-lg font-extrabold tracking-tight text-ink">{s.title}</h2>
              <div className="mt-2 space-y-2">
                {s.body.map((p) => (
                  <p key={p.slice(0, 24)} className="text-[13px] leading-relaxed text-muted">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Button variant="outline" size="sm">
                {l.label}
              </Button>
            </Link>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-extrabold text-ink">
              {locale === "en" ? "Something unclear?" : "Ada yang kurang jelas?"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              {locale === "en" ? "Ask before you buy, not after." : "Tanya sebelum beli, bukan sesudahnya."}
            </p>
          </div>
          <a
            href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
              locale === "en"
                ? "Hello At Cell, I want to ask about the store terms."
                : "Halo At Cell, saya mau tanya soal aturan toko."
            )}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0"
          >
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
