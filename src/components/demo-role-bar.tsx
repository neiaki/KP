"use client";

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
  type LucideIcon,
} from "lucide-react";

type DemoRole = {
  role: UserRole;
  label: string;
  icon: LucideIcon;
  defaultPath: string;
};

const ROLES: DemoRole[] = [
  {
    role: "admin",
    label: "Admin / Owner",
    icon: ShieldCheck,
    defaultPath: "/portal/dashboard",
  },
  {
    role: "sales",
    label: "Sales Kasir",
    icon: ShoppingBag,
    defaultPath: "/portal/pos",
  },
  {
    role: "technician",
    label: "Teknisi",
    icon: Wrench,
    defaultPath: "/portal/service",
  },
  {
    role: "customer",
    label: "Pelanggan",
    icon: User,
    defaultPath: "/portal/account",
  },
];

export function DemoRoleBar() {
  const { currentRole, switchRole, resetToInitialData, isLiveBackend } = useStore();
  const pathname = usePathname();
  const router = useRouter();

  const handleSwitchRole = (role: UserRole, defaultPath: string) => {
    switchRole(role);
    if (!pathname.startsWith(defaultPath)) {
      router.push(defaultPath);
    }
  };

  if (isLiveBackend) return null;

  const isPublicPath = pathname.startsWith("/id") || pathname.startsWith("/en");
  const isPortalPath = pathname.startsWith("/portal");
  const portalPath = ROLES.find((item) => item.role === currentRole)?.defaultPath ?? "/portal/dashboard";

  return (
    <header className="relative z-50 w-full border-b border-line bg-card/95 text-ink backdrop-blur">
      <div className="no-scrollbar mx-auto flex h-12 max-w-[1600px] items-center gap-2 overflow-x-auto px-3 sm:px-4 lg:px-6">
        <div className="flex shrink-0 items-center gap-2 pr-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[11px] font-extrabold text-white">
            AT
          </span>
          <span className="hidden text-xs font-extrabold sm:inline">At Cell</span>
          <span className="hidden text-xs text-muted lg:inline">Mode demo</span>
        </div>

        <div
          className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-paper p-0.5"
          aria-label="Pilih peran demo"
        >
          {ROLES.map((item) => {
            const Icon = item.icon;
            const isActive = currentRole === item.role;
            return (
              <button
                key={item.role}
                type="button"
                onClick={() => handleSwitchRole(item.role, item.defaultPath)}
                aria-label={item.label}
                aria-pressed={isActive}
                title={item.label}
                className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition-colors ${
                  isActive
                    ? "bg-accent text-white"
                    : "text-muted hover:bg-card hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          <Link
            href="/id"
            aria-label="Web Publik"
            title="Web Publik"
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold transition-colors ${
              isPublicPath
                ? "bg-accent-soft text-accent-deep"
                : "text-muted hover:bg-paper hover:text-ink"
            }`}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Web Publik</span>
          </Link>

          <Link
            href={portalPath}
            aria-label="Portal Tim"
            title="Portal Tim"
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold transition-colors ${
              isPortalPath
                ? "bg-accent-soft text-accent-deep"
                : "text-muted hover:bg-paper hover:text-ink"
            }`}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Portal Tim</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              if (confirm("Reset seluruh data ke kondisi awal demo?")) {
                resetToInitialData();
                window.location.reload();
              }
            }}
            aria-label="Reset ke data awal"
            title="Reset ke data awal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-bad-bg hover:text-bad"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
