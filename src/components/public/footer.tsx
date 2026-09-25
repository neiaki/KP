"use client";

import React from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { translations, Locale } from "@/lib/translations";
import { MapPin, Phone, Clock, MessageCircle, Banknote, Landmark, QrCode, CreditCard } from "lucide-react";

export function PublicFooter({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const t = translations[locale];

  const description =
    locale === "en" ? storeSettings.description_en : storeSettings.description_id;

  const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(
    /\D/g,
    ""
  );

  const linkClass = "text-white/75 hover:text-white";
  const headingClass = "text-sm font-extrabold text-white";

  return (
    <footer data-hide-on-login className="bg-[#0f172b]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          <div className="space-y-3">
            <h2 className={headingClass}>
              {locale === "en" ? "Shop" : "Belanja"}
            </h2>
            <ul className="space-y-2 text-[13px] font-medium">
              <li>
                <Link href={`/${locale}/catalog?cond=new`} className={linkClass}>
                  {locale === "en" ? "New phones" : "HP baru"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/catalog?cond=second`} className={linkClass}>
                  {locale === "en" ? "Second phones" : "HP second"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/trade-in`} className={linkClass}>
                  {t.nav.tradeIn}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/catalog`} className={linkClass}>
                  {locale === "en" ? "All stock" : "Semua stok"}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className={headingClass}>
              {locale === "en" ? "Help" : "Bantuan"}
            </h2>
            <ul className="space-y-2 text-[13px] font-medium">
              <li>
                <Link href={`/${locale}/tracking`} className={linkClass}>
                  {t.nav.tracking}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/customer-service`} className={linkClass}>
                  {locale === "en" ? "Customer service" : "Layanan pelanggan"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/about`} className={linkClass}>
                  {locale === "en" ? "About the shop" : "Tentang toko"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/contact`} className={linkClass}>
                  {locale === "en" ? "Contact us" : "Hubungi kami"}
                </Link>
              </li>
              <li>
                <a
                  href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(
                    "Halo At Cell, saya mau tanya soal garansi."
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                >
                  {locale === "en" ? "Warranty claim" : "Klaim garansi"}
                </a>
              </li>
              <li>
                <Link href={`/${locale}/login`} className={linkClass}>
                  {t.nav.operationalPortal}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className={headingClass}>
              {locale === "en" ? "Policies" : "Kebijakan"}
            </h2>
            <ul className="space-y-2 text-[13px] font-medium">
              <li>
                <Link href={`/${locale}/warranty`} className={linkClass}>
                  {locale === "en" ? "Warranty policy" : "Kebijakan garansi"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/payment`} className={linkClass}>
                  {locale === "en" ? "Payment policy" : "Kebijakan pembayaran"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/shipping`} className={linkClass}>
                  {locale === "en" ? "Pickup policy" : "Kebijakan pengambilan"}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/terms`} className={linkClass}>
                  {locale === "en" ? "Terms and conditions" : "Syarat dan ketentuan"}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className={`flex items-center gap-1.5 ${headingClass}`}>
              <Clock className="h-4 w-4 text-white" />
              {t.storeInfo.hoursLabel}
            </h2>
            <div className="space-y-1.5 text-[13px] text-white/75">
              <p>
                Senin-Jumat{" "}
                <span className="font-bold text-white">
                  {storeSettings.opening_hours.monday_friday}
                </span>
              </p>
              <p>
                Sabtu-Minggu{" "}
                <span className="font-bold text-white">
                  {storeSettings.opening_hours.saturday_sunday}
                </span>
              </p>
              <p className="pt-1 leading-relaxed">{description}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className={`flex items-center gap-1.5 ${headingClass}`}>
              <MapPin className="h-4 w-4 text-white" />
              {locale === "en" ? "Store" : "Toko"}
            </h2>
            <a
              href={storeSettings.maps_url || "https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A"}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] leading-relaxed text-white/80 underline decoration-white/40 underline-offset-4 hover:text-white"
            >
              {storeSettings.address}
            </a>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <a
                href={`https://wa.me/${cleanWa}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-white hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {storeSettings.whatsapp_number}
              </a>
              <span className="inline-flex items-center gap-1.5 text-white/75">
                <Phone className="h-3.5 w-3.5" />
                {storeSettings.phone_number}
              </span>
            </div>
            {/* TODO: ganti href di bawah dengan URL sosmed resmi toko */}
            <div className="flex items-center gap-2 pt-1" aria-label="Media sosial At Cell">
              {[
                { label: "Facebook", slug: "facebook", href: "https://facebook.com/" },
                { label: "Instagram", slug: "instagram", href: "https://instagram.com/" },
                { label: "X", slug: "x", href: "https://x.com/" },
                { label: "TikTok", slug: "tiktok", href: "https://tiktok.com/" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 transition-colors hover:bg-white/15"
                >
                  <img
                    src={`https://cdn.simpleicons.org/${s.slug}/white`}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-4 w-4"
                  />
                </a>
              ))}
              <a
                href={`https://wa.me/${cleanWa}`}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                title="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 transition-colors hover:bg-white/15"
              >
                <img
                  src="https://cdn.simpleicons.org/whatsapp/white"
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-4 w-4"
                />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-white/25 pt-5">
          <span className="mr-1 text-xs font-medium text-white/75">
            {locale === "en" ? "Payment methods" : "Metode pembayaran"}
          </span>
          {[
            { label: "Tunai", icon: Banknote },
            { label: "Transfer", icon: Landmark },
            { label: "QRIS", logo: "/payments/qris.svg" },
            { label: "Debit", icon: CreditCard },
            { label: "Kartu kredit", icon: CreditCard },
          ].map((m) => (
            <span
              key={m.label}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-bold text-white"
            >
              {"logo" in m && m.logo ? (
                <img
                  src={m.logo}
                  alt="Logo QRIS"
                  loading="lazy"
                  className="h-3.5 w-auto brightness-0 invert"
                />
              ) : (
                "icon" in m &&
                m.icon && <m.icon className="h-3.5 w-3.5 text-white" strokeWidth={1.75} />
              )}
              {m.label}
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-2 border-t border-white/25 pt-5 text-xs text-white/70 sm:flex-row">
          <p>© {new Date().getFullYear()} At Cell. {t.footer.rights}</p>
          <p className="font-mono text-[11px]">
            {locale === "en" ? "Every unit IMEI is written on the receipt" : "IMEI setiap unit tertulis di nota"}
          </p>
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/70 sm:text-left">
          {locale === "en"
            ? "Beware of scams using the At Cell name. We only transact in store and on the official number above."
            : "Waspada penipuan yang mengatasnamakan At Cell. Transaksi hanya di toko dan nomor resmi di atas."}
        </p>
      </div>
    </footer>
  );
}
