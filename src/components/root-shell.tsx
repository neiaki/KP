import React from "react";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { StoreProvider } from "@/context/store-context";
import { DemoRoleBar } from "@/components/demo-role-bar";
import { BackendStatus } from "@/components/backend-status";
import { ThemeInit } from "@/components/theme-init";

/*
 * Root layout sekarang ada dua: area publik di bawah [locale] dan portal
 * staf di route group sendiri. Keduanya butuh html, body, font, dan
 * provider yang sama, jadi bagian itu dikumpulkan di sini supaya definisi
 * font tidak ganda dan tidak bisa melenceng di satu sisi.
 *
 * next/font harus dipanggil di level modul, bukan di dalam komponen.
 */

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plexMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const fontVars = `${jakarta.variable} ${plexMono.variable}`;

/* Class yang dipakai dua root layout untuk elemen <html>. */
export const htmlClass = `${fontVars} h-full antialiased`;

export const bodyClass = "min-h-full flex flex-col bg-paper text-ink";

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ThemeInit />
      <StoreProvider>
        <DemoRoleBar />
        <BackendStatus />
        {children}
      </StoreProvider>
    </>
  );
}
