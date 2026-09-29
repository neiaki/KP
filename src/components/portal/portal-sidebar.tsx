"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/context/store-context";
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Wrench,
  PackagePlus,
  Users,
  Settings,
  UserCheck,
  LogOut,
  ExternalLink,
  Receipt,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/actions/auth";

/* Nilai enum peran dari database ditampilkan apa adanya di UI, jadi
   "technician" dan "customer" bocor ke layar. Peta ini satu-satunya tempat
   yang menerjemahkannya ke bahasa Indonesia. */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  sales: "Sales",
  technician: "Teknisi",
  customer: "Pelanggan",
};

export function PortalSidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentRole, profiles, isLiveBackend } = useStore();

  const currentProfile = profiles.find((p) => p.role === currentRole) || {
    full_name: "Staf At Cell",
    role: currentRole,
    email: "staf@atcell.my.id",
  };

  /* Host portal hanya ditampilkan kalau memang sedang berada di subdomain
     login. Di domain apex (atcell.my.id) label itu berbohong, karena portal
     dilayani dari root yang sama. */
  const isLoginSubdomain =
    typeof window !== "undefined" && window.location.hostname.startsWith("login.");

  const navItems = [
    // Admin Only
    {
      href: "/portal/dashboard",
      label: "Ringkasan Bisnis",
      icon: LayoutDashboard,
      roles: ["admin"],
    },
    {
      href: "/portal/products",
      label: "Master Produk",
      icon: Boxes,
      roles: ["admin"],
    },
    {
      href: "/portal/staff",
      label: "Kelola Staf",
      icon: Users,
      roles: ["admin"],
    },
    {
      // Namanya sama persis dengan judul halaman /portal/settings, jadi tidak
      // ada lagi dua sebutan untuk satu layar yang sama.
      href: "/portal/settings",
      label: "Profil Publik Toko",
      icon: Settings,
      roles: ["admin"],
    },
    {
      // Halaman ini melaporkan produktivitas teknisi sekaligus omzet jasa dan
      // total omzet meja servis, jadi "Laporan Meja Servis" lebih jujur
      // daripada "Laporan Teknisi".
      href: "/portal/reports",
      label: "Laporan",
      icon: FileSpreadsheet,
      roles: ["admin"],
    },

    // Sales & Admin
    {
      href: "/portal/pos",
      label: "Kasir POS & Trade-In",
      icon: ShoppingCart,
      roles: ["admin", "sales"],
    },
    {
      href: "/portal/inventory",
      label: "Inventaris Unit IMEI",
      icon: PackagePlus,
      roles: ["admin", "sales"],
    },

    // Technician, Sales & Admin. Sales ikut karena canAccessPortalPath
    // mengizinkan /portal/service untuk role sales, jadi kasir yang
    // menerima unit dari pelanggan punya jalan masuk ke antrian servis.
    // Guard di src/lib/access.ts tidak diubah.
    {
      href: "/portal/service",
      label: "Meja Kerja Servis",
      icon: Wrench,
      roles: ["admin", "sales", "technician"],
    },

    // Customer
    {
      href: "/portal/account",
      label: "Faktur & Garansi Saya",
      icon: Receipt,
      roles: ["admin", "customer"],
    },
  ];

  const visibleItems = navItems.filter((item) =>
    item.roles.includes(currentRole)
  );

  // Kunci scroll body selagi drawer terbuka. Tanpa ini, gestur gulir di area
  // kosong drawer tetap menggulir halaman di belakangnya dan kasir kehilangan
  // posisi daftar menu yang tadi baru ia buka. Dikembalikan saat drawer ditutup.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    if (isLiveBackend) {
      await signOut();
      router.push("/id/login");
      router.refresh();
      return;
    }
    router.push("/id/login");
  };

  const body = (
    <>
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-md">
            AT
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-wide text-white">
              At Cell Portal
            </div>
            {isLoginSubdomain && (
              <div className="truncate font-mono text-[10px] text-slate-400">
                login.atcell.my.id
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle variant="onDark" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu navigasi"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white sm:h-9 sm:w-9 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* User Info & Current Role Badge */}
      <div className="mx-3 my-3 rounded-xl border border-slate-700/60 bg-slate-800/80 p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-400">Sesi aktif</span>
          <Badge
            variant={
              currentRole === "admin"
                ? "info"
                : currentRole === "sales"
                ? "success"
                : currentRole === "technician"
                ? "warning"
                : "info"
            }
            className="px-2 py-0 font-mono text-[10px]"
          >
            {ROLE_LABEL[currentRole] ?? currentRole}
          </Badge>
        </div>
        <div className="truncate text-xs font-semibold text-white">
          {currentProfile.full_name}
        </div>
        <div className="truncate text-[11px] text-slate-400">
          {currentProfile.email || "Email staf tidak ditampilkan"}
        </div>
        {!isLiveBackend && (
          <Link
            href="/id/login"
            onClick={onClose}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[11px] font-bold text-ink hover:border-accent"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Ganti peran demo
          </Link>
        )}
      </div>

      {/* Navigation List */}
      {/* Spacer ada di footer (mt-auto), bukan di nav (flex-1). Secara visual
          hasilnya sama: blok Keluar tetap menempel di dasar sidebar dan
          tersisa celah kosong di atasnya kalau daftar menu pendek. Dipindah ke
          footer supaya saat menu bertambah panjang, footer ikut ter-scroll
          bersama nav alih-alih tertahan di bawah. */}
      <nav className="space-y-1 px-3 py-2" aria-label="Menu operasional">
        <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400">
          Menu operasional
        </div>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={isActive ? "page" : undefined}
              /* min-h-11 di HP: baris menu ini target sentuh utama saat sidebar
                 jadi drawer, dan 40px lama sering salah ketuk. */
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-0 sm:text-xs ${
                isActive
                  ? "bg-accent font-bold text-white shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-1 border-t border-slate-800 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href="/id"
          className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white sm:min-h-0 sm:text-xs"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span>Buka web publik</span>
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">/id</span>
        </Link>

        {isLiveBackend ? (
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-400 transition-colors hover:bg-slate-800 hover:text-rose-300 sm:min-h-0 sm:text-xs"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Keluar</span>
          </button>
        ) : (
          <Link
            href="/id/login"
            onClick={onClose}
            className="flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-slate-800 hover:text-rose-300 sm:min-h-0 sm:text-xs"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Ganti akun atau keluar</span>
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: dark chrome yang menempel di layar.
          Sebelumnya min-h, sekarang sticky + h dan overflow-y-auto supaya:
          1. menu tetap terlihat saat halaman panjang (mis. /portal/settings)
             digulir, dan
          2. kalau daftar menu bertambah panjang, sidebar-lah yang
             menggulir, bukan seluruh halaman. */}
      {/* h-[100dvh], bukan 100dvh-3rem. Sidebar ini sticky di top-0, jadi saat
          halaman sudah digulir ke bawah header publik 3rem ikut keluar layar.
          Kalau tingginya disisakan 3rem, ada strip putih setinggi 3rem di
          dasar sidebar dan kolom gelapnya terlihat melayang.

          overflow-y-auto tetap dipakai supaya menu panjang di layar pendek
          masih bisa digulir di sidebar. overscroll-contain justru dihapus:
          di layar normal daftar menu lebih pendek dari 100dvh, jadi sidebar
          tidak punya yang digulir, dan contain membuat wheel serta gestur
          touchpad di atas 256px kolom gelap itu hilang tanpa ada arah. Rantai
          gulir harus boleh lanjut ke dokumen, sama seperti area publik. */}
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900 text-slate-300 lg:flex">
        {body}
      </aside>

      {/* Mobile: drawer */}
      {mobileOpen && (
        <div className="lg:hidden">
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup menu navigasi"
            className="fixed inset-0 z-40 cursor-default bg-black/60"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu operasional portal"
            className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-y-auto overscroll-contain bg-slate-900 pb-[env(safe-area-inset-bottom)] text-slate-300 shadow-2xl"
          >
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
