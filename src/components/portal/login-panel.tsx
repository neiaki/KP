"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { UserRole } from "@/types";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  KeyRound,
  LogIn,
  ShieldCheck,
  ShoppingBag,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithUsername } from "@/lib/actions/auth";

type DemoAccount = {
  role: UserRole;
  roleLabel: string;
  name: string;
  username: string;
  target: string;
  destination: string;
  icon: LucideIcon;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "admin",
    roleLabel: "Admin",
    name: "Hendra Wijaya",
    username: "admin",
    target: "/portal/dashboard",
    destination: "Dashboard",
    icon: ShieldCheck,
  },
  {
    role: "sales",
    roleLabel: "Kasir",
    name: "Budi Santoso",
    username: "sales",
    target: "/portal/pos",
    destination: "Kasir POS",
    icon: ShoppingBag,
  },
  {
    role: "technician",
    roleLabel: "Teknisi",
    name: "Rian Pratama",
    username: "teknisi",
    target: "/portal/service",
    destination: "Meja servis",
    icon: Wrench,
  },
  {
    role: "customer",
    roleLabel: "Pelanggan",
    name: "Anisa Rahmawati",
    username: "anisa",
    target: "/portal/account",
    destination: "Faktur & garansi",
    icon: User,
  },
];

export function LoginPanel({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { switchRole, isLiveBackend } = useStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("admin");
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const frame = useRef<number>(0);

  // Samakan pola ThemeToggle: sinkronisasi pasca-mount lewat rAF agar
  // tidak kena lint react-hooks/set-state-in-effect.
  useEffect(() => {
    frame.current = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame.current);
  }, []);

  const handleDemoSelect = (account: DemoAccount) => {
    if (isLiveBackend) return;
    setSelectedRole(account.role);
    setUsername(account.username);
    switchRole(account.role);
    router.push(account.target);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (isLiveBackend) {
      setSubmitting(true);
      try {
        const result = await signInWithUsername(username, password);
        if (!result.ok) {
          setLoginError(result.error);
          return;
        }
        router.push(result.data.redirectTo);
        router.refresh();
      } catch {
        setLoginError("Login sedang tidak dapat diproses. Coba lagi sebentar.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    switchRole(selectedRole);
    if (selectedRole === "admin") router.push("/portal/dashboard");
    else if (selectedRole === "sales") router.push("/portal/pos");
    else if (selectedRole === "technician") router.push("/portal/service");
    else router.push("/portal/account");
  };

  // Input email/password rawan diinjeksi DOM oleh ekstensi browser
  // sebelum React hydrate. Tunda interaktif sampai mount agar server dan
  // render awal client sama-sama fallback.
  if (!mounted) {
    return (
      <div
        data-page="login"
        className="flex min-h-[calc(100dvh-4rem)] items-center bg-paper px-4 py-10 text-ink sm:px-6 lg:px-8"
      >
        <div
          className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-xl border border-line bg-card lg:grid-cols-[0.85fr_1.15fr]"
          aria-hidden="true"
        >
          <div className="min-h-64 bg-accent" />
          <div className="space-y-4 p-6 sm:p-9">
            <div className="h-7 w-44 animate-pulse rounded-lg bg-paper" />
            <div className="h-5 w-full max-w-sm animate-pulse rounded-lg bg-paper" />
            <div className="h-5 w-4/5 animate-pulse rounded-lg bg-paper" />
            <div className="h-5 w-3/5 animate-pulse rounded-lg bg-paper" />
          </div>
        </div>
      </div>
    );
  }

  const manualLoginForm = (
    <form onSubmit={handleManualLogin} className="mt-4 space-y-4">
      {loginError && (
        <p
          role="alert"
          className="rounded-lg border border-bad/30 bg-bad-bg px-3 py-2.5 text-sm text-bad"
        >
          {loginError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="login-username" className="block text-xs font-bold text-ink">
            Username
          </label>
          <Input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            suppressHydrationWarning
            className="h-11 bg-paper font-mono text-sm placeholder:text-muted"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="block text-xs font-bold text-ink">
            Kata sandi
          </label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan kata sandi"
            suppressHydrationWarning
            className="h-11 bg-paper text-sm placeholder:text-muted"
          />
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="h-11 w-full gap-2 text-sm">
        <LogIn className="h-4 w-4" />
        <span>{submitting ? "Memproses..." : "Masuk ke portal"}</span>
      </Button>
    </form>
  );

  return (
    <div
      data-page="login"
      className="relative isolate flex min-h-[calc(100dvh-4rem)] items-center overflow-hidden bg-[radial-gradient(circle_at_top_left,var(--accent-soft),transparent_42%)] bg-paper px-4 py-8 text-ink sm:px-6 sm:py-12 lg:px-8"
    >
      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-xl border border-line bg-card lg:grid-cols-[0.85fr_1.15fr]">
        <section className="bg-accent px-6 py-8 text-white sm:px-9 sm:py-10 lg:px-11 lg:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-lg font-extrabold text-accent">
              AT
            </div>
            <div>
              <div className="text-base font-extrabold">At Cell</div>
              <div className="font-mono text-xs">Portal staf</div>
            </div>
          </div>

          <div className="mt-10 max-w-md sm:mt-14">
            <h1 className="text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl">
              Kelola toko dari satu portal.
            </h1>
            <p className="mt-4 max-w-[42ch] text-sm font-medium leading-7 sm:text-base">
              Masuk sesuai peran untuk membuka kasir, servis, inventaris, dan laporan At Cell.
            </p>
          </div>

          <div className="mt-9 hidden space-y-5 border-t border-white/25 pt-7 sm:block">
            <div>
              <div className="text-sm font-extrabold">Akses sesuai peran</div>
              <p className="mt-1 text-xs font-medium leading-5">
                Menu dan data menyesuaikan tanggung jawab staf.
              </p>
            </div>
            <div>
              <div className="text-sm font-extrabold">
                {isLiveBackend ? "Akun staf terdaftar" : "Coba tanpa konfigurasi"}
              </div>
              <p className="mt-1 text-xs font-medium leading-5">
                {isLiveBackend
                  ? "Masuk memakai username dan kata sandi yang sudah terdaftar."
                  : "Pilih akun dan coba alur kerja tanpa mengatur database."}
              </p>
            </div>
            <div>
              <div className="text-sm font-extrabold">Data tetap terhubung</div>
              <p className="mt-1 text-xs font-medium leading-5">
                Kasir, servis, stok, dan laporan berada dalam satu sistem.
              </p>
            </div>
          </div>

          {isLiveBackend ? (
            <Link
              href={`/${locale}`}
              className="mt-9 inline-flex items-center gap-2 border-t border-white/25 pt-5 text-xs font-bold text-white transition-colors hover:bg-white/10 sm:mt-12"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke website
            </Link>
          ) : null}
        </section>

        <section className="px-5 py-7 sm:px-9 sm:py-10 lg:px-11 lg:py-12">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-accent-deep">
                <KeyRound className="h-4 w-4" />
                <span className="text-sm font-extrabold">
                  {isLiveBackend ? "Masuk ke portal" : "Pilih akun untuk masuk"}
                </span>
              </div>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
                {isLiveBackend
                  ? "Gunakan akun staf yang telah terdaftar."
                  : "Pilih satu profil dan langsung menuju modul yang tepat."}
              </p>
            </div>
            {!isLiveBackend && (
              <span className="rounded-full bg-accent-soft px-3 py-1.5 text-[11px] font-extrabold text-accent-deep">
                Data lokal
              </span>
            )}
          </div>

          {!isLiveBackend ? (
            <div className="mt-6 grid gap-2.5" aria-label="Akun demo">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = account.icon;
                return (
                  <button
                    key={account.role}
                    type="button"
                    onClick={() => handleDemoSelect(account)}
                    aria-label={`Masuk sebagai ${account.name}, ${account.roleLabel}`}
                    className="group flex w-full items-center gap-3 rounded-lg border border-line bg-paper px-3 py-3 text-left transition-[transform,border-color,background-color] hover:-translate-y-0.5 hover:border-accent hover:bg-accent-soft/50 active:translate-y-0 sm:px-4"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-deep transition-colors group-hover:bg-card">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="truncate text-sm font-extrabold text-ink">
                          {account.name}
                        </span>
                        <span className="text-[11px] font-bold text-accent-deep">
                          {account.roleLabel}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-xs text-muted">
                        {account.username}
                      </span>
                    </span>
                    <span className="hidden text-xs font-semibold text-muted xl:block">
                      {account.destination}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-deep" />
                  </button>
                );
              })}
            </div>
          ) : null}

          {isLiveBackend ? (
            manualLoginForm
          ) : (
            <details className="group mt-5 border-t border-line pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg py-1 text-sm font-extrabold text-ink [&::-webkit-details-marker]:hidden">
                {isLiveBackend ? "Masuk dengan username" : "Buka form login"}
                <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180" />
              </summary>
              {manualLoginForm}
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
