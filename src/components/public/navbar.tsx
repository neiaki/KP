"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { translations, Locale } from "@/lib/translations";
import { Search, Menu, X, LogIn } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function PublicNavbar({ locale }: { locale: Locale }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const pathname = usePathname();
  const router = useRouter();
  const t = translations[locale];
  const isLoginPath = pathname === `/${locale}/login`;

  const getSwitchLocaleHref = (targetLocale: Locale) => {
    const segments = pathname.split("/");
    if (segments[1] === "id" || segments[1] === "en") {
      segments[1] = targetLocale;
      return segments.join("/") || `/${targetLocale}`;
    }
    return `/${targetLocale}`;
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    router.push(
      q ? `/${locale}/catalog?q=${encodeURIComponent(q)}` : `/${locale}/catalog`
    );
    setMobileMenuOpen(false);
  };

  const links = [
    { href: `/${locale}/catalog`, label: t.nav.catalog },
    { href: `/${locale}/trade-in`, label: t.nav.tradeIn },
    { href: `/${locale}/tracking`, label: t.nav.tracking },
  ];

  return (
    <>
      <p
        data-hide-on-login
        className="bg-accent px-4 py-2 text-center text-[11px] font-semibold leading-4 text-white sm:text-xs"
      >
        {locale === "en"
          ? "Free tempered glass and case for every new phone, 0% installment up to 12 months"
          : "Gratis tempered glass dan silikon untuk setiap HP baru, cicilan 0% sampai 12 bulan"}
      </p>
      <header className="sticky top-0 z-40 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-base font-extrabold text-white">
              AT
            </span>
            <span className="leading-tight">
              <span className="block text-[17px] font-extrabold tracking-tight text-ink">
                At Cell
              </span>
              <span className="block text-[11px] font-medium text-muted">
                {locale === "en" ? "Phones and service, Serpong" : "HP dan servis, Serpong"}
              </span>
            </span>
          </Link>

          <form onSubmit={submitSearch} className="hidden min-w-0 flex-1 md:block" role="search">
            <label htmlFor="nav-search" className="sr-only">
              {locale === "en" ? "Search phones" : "Cari HP"}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
              <input
                id="nav-search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t.hero.searchPlaceholder}
                className="h-10 w-full rounded-lg border border-line bg-paper pl-10 pr-20 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 h-8 rounded-md bg-accent px-4 text-xs font-bold text-white hover:bg-accent-deep"
              >
                {locale === "en" ? "Search" : "Cari"}
              </button>
            </div>
          </form>

          <nav className="ml-auto hidden shrink-0 items-center gap-1 lg:flex" aria-label="Utama">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-bold text-ink hover:bg-paper"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <div
              className="hidden items-center rounded-lg border border-line p-0.5 text-xs font-bold sm:flex"
              aria-label={locale === "en" ? "Language" : "Bahasa"}
            >
              <Link
                href={getSwitchLocaleHref("id")}
                className={`rounded-md px-2 py-1 ${locale === "id" ? "bg-accent text-white" : "text-muted"}`}
              >
                ID
              </Link>
              <Link
                href={getSwitchLocaleHref("en")}
                className={`rounded-md px-2 py-1 ${locale === "en" ? "bg-accent text-white" : "text-muted"}`}
              >
                EN
              </Link>
            </div>
            <ThemeToggle />
            {/* Aksi WhatsApp pindah ke footer dan live chat, jadi slot
                navbar ini dipakai pintu masuk portal staf. */}
            {!isLoginPath ? (
              <Link
                href={`/${locale}/login`}
                aria-label={
                  locale === "en" ? "Sign in to staff portal" : "Masuk ke portal staf"
                }
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-accent-deep sm:inline-flex"
              >
                <LogIn className="h-4 w-4" />
                {t.nav.signIn}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-ink hover:bg-paper lg:hidden"
              aria-label={mobileMenuOpen ? "Tutup menu" : "Buka menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 md:hidden">
          <form onSubmit={submitSearch} role="search">
            <label htmlFor="nav-search-m" className="sr-only">
              {locale === "en" ? "Search phones" : "Cari HP"}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-muted" />
              <input
                id="nav-search-m"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t.hero.searchPlaceholder}
                className="h-10 w-full rounded-lg border border-line bg-paper pl-10 pr-20 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="absolute right-1 top-1 h-8 rounded-md bg-accent px-3 text-xs font-bold text-white"
              >
                {locale === "en" ? "Search" : "Cari"}
              </button>
            </div>
          </form>
        </div>

        {mobileMenuOpen && (
          <div
            id="mobile-navigation"
            className="border-t border-line bg-card px-4 pb-5 pt-3 lg:hidden"
          >
            <div className="space-y-1">
              {[{ href: `/${locale}`, label: t.nav.home }, ...links].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-bold text-ink hover:bg-paper"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-line pt-3">
              <span className="text-xs font-bold text-muted">
                {locale === "en" ? "Language" : "Bahasa"}
              </span>
              <div
                className="flex items-center rounded-lg border border-line p-0.5 text-xs font-bold"
                aria-label={locale === "en" ? "Language" : "Bahasa"}
              >
                <Link
                  href={getSwitchLocaleHref("id")}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-md px-3 py-1.5 ${
                    locale === "id" ? "bg-accent text-white" : "text-muted"
                  }`}
                >
                  ID
                </Link>
                <Link
                  href={getSwitchLocaleHref("en")}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-md px-3 py-1.5 ${
                    locale === "en" ? "bg-accent text-white" : "text-muted"
                  }`}
                >
                  EN
                </Link>
              </div>
            </div>
            {!isLoginPath ? (
              <div className="mt-3">
                <Link
                  href={`/${locale}/login`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-bold text-white"
                >
                  <LogIn className="h-4 w-4" /> {t.nav.signIn}
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </header>
    </>
  );
}
