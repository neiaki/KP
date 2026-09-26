"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { UserRole } from "@/types";
import {
  ShieldCheck,
  ShoppingBag,
  Wrench,
  User,
  LogIn,
  KeyRound,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { signInWithPassword } from "@/lib/actions/auth";

export function LoginPanel({ locale }: { locale: Locale }) {
  const router = useRouter();
  const { switchRole, isLiveBackend } = useStore();

  const [email, setEmail] = useState(isLiveBackend ? "" : "admin@demo.local");
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

  const demoAccounts: {
    role: UserRole;
    name: string;
    email: string;
    target: string;
    icon: React.ReactNode;
    color: string;
  }[] = [
    {
      role: "admin",
      name: "Hendra Wijaya (Owner)",
      email: "admin@demo.local",
      target: "/portal/dashboard",
      icon: <ShieldCheck className="w-5 h-5 text-accent-deep" />,
      color: "border-accent/40 hover:border-accent",
    },
    {
      role: "sales",
      name: "Budi Santoso (Kasir)",
      email: "sales@demo.local",
      target: "/portal/pos",
      icon: <ShoppingBag className="w-5 h-5 text-emerald-400" />,
      color: "border-amber-500/40 hover:border-amber-400",
    },
    {
      role: "technician",
      name: "Rian Pratama (Teknisi)",
      email: "teknisi@demo.local",
      target: "/portal/service",
      icon: <Wrench className="w-5 h-5 text-amber-400" />,
      color: "border-amber-500/40 hover:border-emerald-400",
    },
    {
      role: "customer",
      name: "Anisa Rahmawati (Pelanggan)",
      email: "anisa@demo.local",
      target: "/portal/account",
      icon: <User className="w-5 h-5 text-sky-400" />,
      color: "border-sky-500/40 hover:border-sky-400",
    },
  ];

  const handleDemoSelect = (account: (typeof demoAccounts)[0]) => {
    if (isLiveBackend) return;
    setSelectedRole(account.role);
    setEmail(account.email);
    switchRole(account.role);
    router.push(account.target);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (isLiveBackend) {
      setSubmitting(true);
      try {
        const result = await signInWithPassword(email, password);
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
  // (password manager, autofill, penerjemah) sebelum React hydrate,
  // yang memicu "Hydration failed". Tunda render interaktif sampai
  // client mounted: server dan render awal client sama-sama fallback,
  // lalu form penuh dirender sebagai update biasa pasca-hydrate.
  if (!mounted) {
    return (
      <div className="flex items-center justify-center bg-slate-950 p-4 py-12 text-slate-100">
        <div className="w-full max-w-4xl" aria-hidden="true">
          <div className="h-64 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-slate-950 p-4 py-12 text-slate-100">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left: Branding & Role Explanation */}
        <div className="md:col-span-5 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent text-white flex items-center justify-center font-bold text-2xl shadow-lg">
              AT
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">
                At Cell
              </h1>
              <div className="text-xs font-mono text-accent-deep">
                login.atcell.my.id
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">
              Portal Operasional Terpadu
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {isLiveBackend
                ? "Pintu masuk tunggal sistem operasional toko berbasis subdomain dan role-based access control."
                : "Pintu masuk tunggal sistem operasional toko berbasis subdomain dan role-based access control. Pilih profil demo di samping untuk simulasi instan."}
            </p>
          </div>

          {!isLiveBackend && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
              <div className="text-amber-400 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Akses Cepat Pengujian:</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Klik salah satu kartu akun demo untuk langsung masuk sesuai peran dengan data preloaded:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                <li><strong className="text-accent-deep">Admin:</strong> Kendali omzet & master produk</li>
                <li><strong className="text-emerald-300">Sales:</strong> Kasir POS & tukar tambah IMEI</li>
                <li><strong className="text-amber-300">Teknisi:</strong> Meja reparasi & biaya jasa</li>
                <li><strong className="text-sky-300">Pelanggan:</strong> Riwayat nota & garansi IMEI</li>
              </ul>
            </div>
          )}

          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2 text-xs text-accent-deep hover:opacity-80 font-medium"
          >
            <span>← Kembali ke Halaman Publik atcell.my.id</span>
          </Link>
        </div>

        {/* Right: Quick Demo Card Pickers */}
        <div className="md:col-span-7 space-y-4">
          <Card className="bg-slate-900 border-slate-800 text-white shadow-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
                <KeyRound className="w-4 h-4 text-accent-deep" />
                <span>{isLiveBackend ? "Masuk Portal At Cell" : "Pilih Akun Demo untuk Masuk"}</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {isLiveBackend
                  ? "Gunakan kredensial Supabase yang terdaftar untuk masuk."
                  : "1-Klik langsung diarahkan ke modul spesifik masing-masing aktor"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isLiveBackend && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => handleDemoSelect(acc)}
                      className={`p-3.5 rounded-xl border bg-slate-800/60 text-left transition-all hover:scale-[1.02] cursor-pointer flex flex-col justify-between gap-2 ${acc.color}`}
                    >
                      <div className="flex items-center justify-between">
                        {acc.icon}
                        <span className="text-[10px] font-mono uppercase bg-slate-950 px-2 py-0.5 rounded text-slate-300">
                          {acc.role}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white truncate">
                          {acc.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate font-mono">
                          {acc.email}
                        </div>
                      </div>
                      <div className="flex items-center text-[11px] text-accent-deep font-semibold gap-1 pt-1 border-t border-slate-700/50">
                        <span>Masuk Sekarang</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Manual Form Toggle */}
              <form onSubmit={handleManualLogin} className="pt-4 border-t border-slate-800 space-y-3">
                {loginError && (
                  <p role="alert" className="rounded-lg border border-bad/30 bg-bad-bg px-3 py-2 text-xs text-bad">
                    {loginError}
                  </p>
                )}
                <div className="text-xs font-bold text-slate-300">
                  Atau Masuk Manual dengan Kredensial:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="login-email" className="sr-only">
                      Email
                    </label>
                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      suppressHydrationWarning
                      className="bg-slate-950 border-slate-700 text-white text-xs h-9"
                    />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="sr-only">
                      Kata sandi
                    </label>
                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      suppressHydrationWarning
                      className="bg-slate-950 border-slate-700 text-white text-xs h-9"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={submitting} className="w-full text-xs font-bold h-9 gap-2">
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{submitting ? "Memproses..." : "Otorisasi Masuk Portal"}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
