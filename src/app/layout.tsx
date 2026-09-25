import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/context/store-context";
import { DemoRoleBar } from "@/components/demo-role-bar";
import { BackendStatus } from "@/components/backend-status";
import { ThemeInit } from "@/components/theme-init";

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

export const metadata: Metadata = {
  title: "At Cell: Toko HP Baru, Second dan Servis di Serpong Utara",
  description:
    "At Cell Serpong Utara: jual HP baru dan second bergaransi dengan IMEI terdaftar, terima tukar tambah, dan servis HP. Tanya stok lewat WhatsApp.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      data-scroll-behavior="smooth"
      className={`${jakarta.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-paper text-ink"
        suppressHydrationWarning
      >
        <ThemeInit />
        <StoreProvider>
          <DemoRoleBar />
          <BackendStatus />
          <main className="flex-1 flex flex-col">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
