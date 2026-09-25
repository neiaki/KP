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
import { signOut } from "@/lib/actions/auth";

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
    full_name: "Staff At Cell",
    role: currentRole,
    email: "staff@atcell.my.id",
  };

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
      href: "/portal/settings",
      label: "Konten Profil Toko",
      icon: Settings,
      roles: ["admin"],
    },
    {
      href: "/portal/reports",
      label: "Laporan Teknisi",
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

    // Technician & Admin
    {
      href: "/portal/service",
      label: "Meja Kerja Servis",
      icon: Wrench,
      roles: ["admin", "technician"],
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

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

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
      <div className="flex items-center justify-between border-b border-slate-800 p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white shadow-md">
            AT
          </div>
          <div>
            <div className="text-sm font-bold tracking-wide text-white">
              AT CELL PORTAL
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              login.atcell.my.id
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup menu navigasi"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* User Info & Current Role Badge */}
      <div className="mx-3 my-3 rounded-xl border border-slate-700/60 bg-slate-800/80 p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Sesi Aktif
          </span>
          <Badge
            variant={
              currentRole === "admin"
                ? "purple"
                : currentRole === "sales"
                ? "success"
                : currentRole === "technician"
                ? "warning"
                : "info"
            }
            className="px-2 py-0 font-mono text-[10px] uppercase"
          >
            {currentRole}
          </Badge>
        </div>
        <div className="truncate text-xs font-semibold text-white">
          {currentProfile.full_name}
        </div>
        <div className="truncate text-[11px] text-slate-400">
          {currentProfile.email || "Email staff tidak ditampilkan"}
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
      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Menu operasional">
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Menu Operasional
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
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors ${
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

      {/* Footer / Links */}
      <div className="space-y-2 border-t border-slate-800 p-4">
        <Link
          href="/id"
          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <span className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Lihat Web Publik</span>
          </span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">/id</span>
        </Link>

        {isLiveBackend ? (
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-400 transition-colors hover:bg-slate-800 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Logout</span>
          </button>
        ) : (
          <Link
            href="/id/login"
            onClick={onClose}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-400 transition-colors hover:bg-slate-800 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Ganti Akun / Logout</span>
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: static dark chrome */}
      <aside className="hidden min-h-[calc(100dvh-3rem)] w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 lg:flex">
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
            className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-slate-900 text-slate-300 shadow-2xl"
          >
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
