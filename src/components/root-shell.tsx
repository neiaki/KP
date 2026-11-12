import React from "react";
import localFont from "next/font/local";
import { StoreProvider } from "@/context/store-context";
import { DemoRoleBar } from "@/components/demo-role-bar";
import { BackendStatus } from "@/components/backend-status";
import { ThemeInit } from "@/components/theme-init";
import type { PublicSnapshot } from "@/lib/actions/public";

/*
 * Root layout sekarang ada dua: area publik di bawah [locale] dan portal
 * staf di route group sendiri. Keduanya butuh html, body, font, dan
 * provider yang sama, jadi bagian itu dikumpulkan di sini supaya definisi
 * font tidak ganda dan tidak bisa melenceng di satu sisi.
 *
 * next/font harus dipanggil di level modul, bukan di dalam komponen.
 *
 * Berkas font disimpan di repo dan dimuat lewat next/font/local, bukan
 * next/font/google. Versi google mengunduh CSS dan woff2 dari
 * fonts.googleapis.com saat dev/build, sehingga mesin tanpa akses internet
 * (atau di belakang proxy) hanya mendapat fallback dan log peringatan di
 * setiap render. Dua berkas di bawah adalah subset latin variable font dari
 * Google Fonts, jadi tampilan dan bobot yang tersedia tetap sama.
 */

const jakarta = localFont({
  src: "../app/fonts/plus-jakarta-sans-latin.woff2",
  variable: "--font-sans",
  weight: "400 800",
  display: "swap",
});

const plexMono = localFont({
  src: "../app/fonts/jetbrains-mono-latin.woff2",
  variable: "--font-mono",
  weight: "400 700",
  display: "swap",
});

export const fontVars = `${jakarta.variable} ${plexMono.variable}`;

/* Class yang dipakai dua root layout untuk elemen <html>. */
export const htmlClass = `${fontVars} h-full antialiased`;

export const bodyClass = "min-h-full flex flex-col bg-paper text-ink";

export function RootProviders({
  children,
  publicSeed,
}: {
  children: React.ReactNode;
  /* Hanya layout area publik yang mengisinya. Portal sengaja tidak. */
  publicSeed?: PublicSnapshot | null;
}) {
  return (
    <>
      <ThemeInit />
      <StoreProvider publicSeed={publicSeed}>
        <DemoRoleBar />
        <BackendStatus />
        {children}
      </StoreProvider>
    </>
  );
}
