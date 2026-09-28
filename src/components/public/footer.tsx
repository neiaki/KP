"use client";

import React, { type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { translations, Locale } from "@/lib/translations";
import { cleanWaNumber } from "@/lib/wa";
import { MapPin, Phone, Clock, MessageCircle, Banknote, Landmark, CreditCard } from "lucide-react";

export function PublicFooter({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const t = translations[locale];

  const description =
    locale === "en" ? storeSettings.description_en : storeSettings.description_id;

  const cleanWa = cleanWaNumber(storeSettings.whatsapp_number);

  /* py-1 memberi tinggi sentuh ~32px tanpa mengubah jarak antar baris
     (space-y-2 tetap di ul, jadi daftar tidak melar). */
  const linkClass = "inline-block py-1 text-muted hover:text-ink";
  const headingClass = "text-sm font-extrabold text-ink";

  /* Ikon merek simpleicons hanya tersedia sebagai gambar raster warna
     merek, jadi tidak bisa mengikuti currentColor. Mask image membuat
     glyph ikut warna teks, sehingga footer tetap terbaca di mode terang
     maupun gelap tanpa filter per mode. */
  const brandIconStyle = (slug: string): CSSProperties => ({
    WebkitMaskImage: `url(https://cdn.simpleicons.org/${slug})`,
    maskImage: `url(https://cdn.simpleicons.org/${slug})`,
    backgroundColor: "currentColor",
  });

  // Ikon sosmed selalu tampil. URL resmi diambil dari store_settings yang diisi
  // Admin lewat portal/settings. Selama kolomnya kosong, tautan diarahkan ke
  // halaman pencarian platform untuk nama toko, bukan ke profil rekaan yang
  // tidak pernah ada.
  //
  // Sebelumnya ikon disembunyikan kalau URL kosong, jadi seluruh blok sosmed
  // hilang. Pelanggan lalu mengira toko tidak punya kanal apa pun.
  const socialSearch = encodeURIComponent("At Cell Serpong");
  const socialFallback: Record<string, string> = {
    facebook: `https://www.facebook.com/search/pages/?q=${socialSearch}`,
    instagram: `https://www.instagram.com/explore/search/keyword/?q=${socialSearch}`,
    x: `https://x.com/search?q=${socialSearch}`,
    tiktok: `https://www.tiktok.com/search?q=${socialSearch}`,
  };
  const socialLinks = [
    { label: "Facebook", slug: "facebook", configured: storeSettings.social_facebook },
    { label: "Instagram", slug: "instagram", configured: storeSettings.social_instagram },
    { label: "X", slug: "x", configured: storeSettings.social_x },
    { label: "TikTok", slug: "tiktok", configured: storeSettings.social_tiktok },
  ].map((s) => {
    const resmi =
      s.configured && /^https?:\/\//.test(s.configured) ? s.configured : "";
    return {
      label: s.label,
      slug: s.slug,
      href: resmi || socialFallback[s.slug],
      resmi: Boolean(resmi),
    };
  });

  return (
    <footer data-hide-on-login className="border-t border-line bg-card text-muted">
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
              <Clock className="h-4 w-4 text-muted" />
              {t.storeInfo.hoursLabel}
            </h2>
            <div className="space-y-1.5 text-[13px] text-muted">
              <p>
                Senin-Jumat{" "}
                <span className="font-bold text-ink">
                  {storeSettings.opening_hours.monday_friday}
                </span>
              </p>
              <p>
                Sabtu-Minggu{" "}
                <span className="font-bold text-ink">
                  {storeSettings.opening_hours.saturday_sunday}
                </span>
              </p>
              <p className="pt-1 leading-relaxed">{description}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className={`flex items-center gap-1.5 ${headingClass}`}>
              <MapPin className="h-4 w-4 text-muted" />
              {locale === "en" ? "Store" : "Toko"}
            </h2>
            <a
              href={storeSettings.maps_url || "https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A"}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] leading-relaxed text-ink underline decoration-line underline-offset-4 hover:text-accent"
            >
              {storeSettings.address}
            </a>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <a
                href={`https://wa.me/${cleanWa}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-wa hover:underline"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                {storeSettings.whatsapp_number}
              </a>
              <span className="inline-flex items-center gap-1.5 text-muted">
                <Phone className="h-3.5 w-3.5" />
                {storeSettings.phone_number}
              </span>
            </div>
            <div
              className="flex items-center gap-2 pt-1"
              aria-label={
                locale === "en" ? "Social media" : "Media sosial At Cell"
              }
            >
              {/* Semua ikon dirender. Kalau URL resmi belum diisi, tautan
                  menuju halaman pencarian platform dan title menyebutkan hal
                  itu, jadi pelanggan tidak salah mengira akun resminya sudah
                  ada di sana. WhatsApp selalu ke nomor asli. */}
              {socialLinks.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  title={
                    s.resmi
                      ? s.label
                      : locale === "en"
                        ? `${s.label}: search for At Cell (official account not listed yet)`
                        : `${s.label}: cari At Cell (akun resmi belum dicantumkan)`
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-paper hover:text-accent"
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4"
                    style={brandIconStyle(s.slug)}
                  />
                </a>
              ))}
              <a
                href={`https://wa.me/${cleanWa}`}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                title="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-wa transition-colors hover:bg-paper"
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4"
                  style={brandIconStyle("whatsapp")}
                />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          <span className="mr-1 text-xs font-medium text-muted">
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
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-[11px] font-bold text-ink"
            >
              {"logo" in m && m.logo ? (
                /* Logo QRIS resmi berwarna hitam. Filter invert akan
                   menghilangkannya di footer terang, jadi logo diletakkan
                   di chip putih yang sama di kedua mode. */
                <span className="flex h-4 items-center rounded-sm bg-white px-1">
                  <Image
                    width={40}
                    height={12}
                    unoptimized
                    src={m.logo}
                    alt="Logo QRIS"
                    className="h-3 w-auto"
                  />
                </span>
              ) : (
                "icon" in m &&
                m.icon && <m.icon className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
              )}
              {m.label}
            </span>
          ))}
        </div>

        <div className="mt-5 flex flex-col items-center justify-between gap-2 border-t border-line pt-5 text-xs text-muted sm:flex-row">
          <p>© {new Date().getFullYear()} At Cell. {t.footer.rights}</p>
          <p className="font-mono text-[11px]">
            {locale === "en" ? "Every unit IMEI is written on the receipt" : "IMEI setiap unit tertulis di nota"}
          </p>
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted sm:text-left">
          {locale === "en"
            ? "Beware of scams using the At Cell name. We only transact in store and on the official number above."
            : "Waspada penipuan yang mengatasnamakan At Cell. Transaksi hanya di toko dan nomor resmi di atas."}
        </p>
      </div>
    </footer>
  );
}
