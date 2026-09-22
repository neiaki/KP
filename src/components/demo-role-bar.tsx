"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/context/store-context";
import { UserRole } from "@/types";
import {
  ShieldCheck,
  ShoppingBag,
  Wrench,
  User,
  Globe,
  RotateCcw,
  ExternalLink,
} from "lucide-react";

export function DemoRoleBar() {
  const { currentRole, switchRole, resetToInitialData } = useStore();
  const pathname = usePathname();
  const router = useRouter();

  const handleSwitchRole = (role: UserRole, defaultPath: string) => {
    switchRole(role);
    if (!pathname.startsWith(defaultPath)) {
      router.push(defaultPath);
    }
  };

  const roles: { role: UserRole; label: string; icon: React.ReactNode; defaultPath: string }[] = [
    {
      role: "admin",
      label: "Admin / Owner",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      defaultPath: "/portal/dashboard",
    },
    {
      role: "sales",
      label: "Sales Kasir",
      icon: <ShoppingBag className="w-3.5 h-3.5" />,
      defaultPath: "/portal/pos",
    },
    {
      role: "technician",
      label: "Teknisi",
      icon: <Wrench className="w-3.5 h-3.5" />,
      defaultPath: "/portal/service",
    },
    {
      role: "customer",
      label: "Pelanggan",
      icon: <User className="w-3.5 h-3.5" />,
      defaultPath: "/portal/account",
    },
  ];

  return (
    <header className="w-full bg-slate-900 text-slate-200 text-xs border-b border-slate-800 sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Brand & Mode Tag */}
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wider text-amber-400 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            AT CELL
          </span>
          <span className="text-slate-400 hidden sm:inline">|</span>
          <span className="text-slate-300 font-mono text-[11px] hidden md:inline">
            Role Mode Demo:
          </span>
        </div>

        {/* Role Selectors */}
        <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 overflow-x-auto">
          {roles.map((item) => {
            const isActive = currentRole === item.role;
            return (
              <button
                key={item.role}
                onClick={() => handleSwitchRole(item.role, item.defaultPath)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm font-semibold"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Quick Portal / Public Navigation */}
        <div className="flex items-center gap-2">
          <Link
            href="/id"
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
              pathname.startsWith("/id") || pathname.startsWith("/en")
                ? "bg-emerald-700 text-white font-semibold"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web Publik</span>
          </Link>

          <Link
            href={
              currentRole === "admin"
                ? "/portal/dashboard"
                : currentRole === "sales"
                ? "/portal/pos"
                : currentRole === "technician"
                ? "/portal/service"
                : "/portal/account"
            }
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors ${
              pathname.startsWith("/portal")
                ? "bg-indigo-600 text-white font-semibold"
                : "text-slate-300 hover:text-white hover:bg-slate-800"
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Portal Tim</span>
          </Link>

          <button
            onClick={() => {
              if (confirm("Reset seluruh data ke kondisi awal demo?")) {
                resetToInitialData();
                window.location.reload();
              }
            }}
            title="Reset ke data awal"
            className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
