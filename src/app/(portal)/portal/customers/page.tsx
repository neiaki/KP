"use client";

import React, { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { UserPlus, X, Copy, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RoleBadge } from "@/components/portal/role-badge";
import { generatePassword } from "@/lib/password";
import type { Profile } from "@/types";

type CustomerCredentials = {
  username: string;
  phone: string;
  password: string;
  title: string;
};

export default function CustomersPage() {
  const { profiles, transactions, addCustomer, updateCustomerPassword, currentRole } = useStore();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasil, setHasil] = useState<CustomerCredentials | null>(null);
  const [copied, setCopied] = useState(false);

  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!showForm && !resetTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowForm(false);
        setResetTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, resetTarget]);

  const customerList = profiles.filter((p) => p.role === "customer");

  const handleGenerate = () => {
    setPassword(generatePassword());
    setShowPassword(true);
  };

  const handleResetGenerate = () => {
    setResetPassword(generatePassword());
    setShowResetPassword(true);
  };

  const openReset = (cust: Profile) => {
    setResetTarget(cust);
    setResetPassword("");
    setShowResetPassword(false);
    setNotice(null);
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    if (!resetTarget) return;
    e.preventDefault();
    if (!resetPassword.trim()) {
      setNotice({ type: "error", text: "Kata sandi baru wajib diisi." });
      return;
    }
    setIsResetting(true);
    setNotice(null);
    try {
      await updateCustomerPassword(resetTarget.id, resetPassword);
      setHasil({
        username: resetTarget.username ?? "-",
        phone: resetTarget.phone_number ?? "",
        password: resetPassword,
        title: `Kata sandi @${resetTarget.username || resetTarget.full_name} sudah diganti. Tampilkan sekali ini saja, simpan atau salin sekarang.`,
      });
      setResetTarget(null);
      setResetPassword("");
      setNotice({ type: "success", text: "Kata sandi pelanggan berhasil diganti." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal mengubah kata sandi.",
      });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !phone.trim() || !password.trim()) {
      setNotice({ type: "error", text: "Nama, username, nomor HP, dan kata sandi wajib diisi." });
      return;
    }
    setIsSaving(true);
    setNotice(null);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const normalizedPhone = phone.trim();
      await addCustomer(name.trim(), normalizedPhone, password, normalizedUsername);
      setHasil({
        username: normalizedUsername,
        phone: normalizedPhone,
        password,
        title: "Akun baru dibuat. Simpan kata sandi ini, tidak bisa dilihat lagi.",
      });
      setShowForm(false);
      setName("");
      setUsername("");
      setPhone("");
      setPassword("");
      setNotice({ type: "success", text: "Akun pelanggan berhasil dibuat." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal membuat akun pelanggan.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!hasil) return;
    try {
      await navigator.clipboard.writeText(
        `Username: ${hasil.username}\nNomor HP: ${hasil.phone}\nKata sandi: ${hasil.password}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 sm:space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Akun Pelanggan
            </h1>
            <RoleBadge role={currentRole} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Buat akun pelanggan baru. Pelanggan login memakai username, nomor HP, dan kata sandi yang diberikan.
          </p>
        </div>

        <Button onClick={() => setShowForm(true)} className="w-full gap-2 text-sm font-bold shadow-md sm:w-auto sm:text-xs">
          <UserPlus className="w-4 h-4" />
          <span>Buat Akun Pelanggan</span>
        </Button>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-semibold ${
            notice.type === "error" ? "border-bad/20 bg-bad-bg text-bad" : "border-good/20 bg-good-bg text-good"
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Tutup pemberitahuan" className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:opacity-70">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {hasil && (
        <Card className="border-good/30 bg-good-bg/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-ink">{hasil.title}</p>
              <button type="button" onClick={() => setHasil(null)} aria-label="Tutup kredensial" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-lg border border-line bg-card p-3 font-mono text-xs">
              <div>Username: {hasil.username}</div>
              <div>Nomor HP: {hasil.phone}</div>
              <div>Kata sandi: {hasil.password}</div>
            </div>
            <Button type="button" variant="outline" onClick={handleCopy} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? "Tersalin" : "Salin"}</span>
            </Button>
          </CardContent>
        </Card>
      )}

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {customerList.map((cust) => {
          const trxCount = transactions.filter((t) => t.customer_id === cust.id).length;
          return (
            <li key={cust.id}>
              <Card className="h-full border-line shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-line p-4 pb-3 sm:p-6 sm:pb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink">{cust.full_name}</h3>
                    <div className="truncate font-mono text-[11px] text-muted">@{cust.username || "tanpa username"}</div>
                  </div>
                  <Badge variant="info" className="font-mono text-[10px]">Pelanggan</Badge>
                </CardHeader>
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                    <span>Nomor HP:</span>
                    <span className="break-all font-mono text-ink">{cust.phone_number || "belum diisi"}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                    <span>Transaksi:</span>
                    <span className="font-semibold text-ink">{trxCount}</span>
                  </div>
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => openReset(cust)}
                      className="w-full gap-2 text-xs font-bold"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>Ubah Kata Sandi</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label="Buat akun pelanggan" className="rise my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
                <UserPlus className="h-5 w-5 shrink-0 text-accent-deep" />
                <span>Buat Akun Pelanggan</span>
              </h3>
              <button type="button" onClick={() => setShowForm(false)} aria-label="Tutup modal" className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink sm:h-10 sm:w-10">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm">
              <div>
                <label htmlFor="cust-name" className="mb-1 block text-xs font-semibold text-muted">Nama Lengkap</label>
                <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Ega" className="sm:text-xs" required />
              </div>
              <div>
                <label htmlFor="cust-username" className="mb-1 block text-xs font-semibold text-muted">Username Login</label>
                <Input id="cust-username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="contoh: ega" className="font-mono sm:text-xs" required minLength={3} maxLength={32} />
              </div>
              <div>
                <label htmlFor="cust-phone" className="mb-1 block text-xs font-semibold text-muted">Nomor HP</label>
                <Input id="cust-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="081200000001" className="font-mono sm:text-xs" required />
              </div>
              <div>
                <label htmlFor="cust-password" className="mb-1 block text-xs font-semibold text-muted">Kata Sandi</label>
                <div className="flex gap-2">
                  <Input id="cust-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 8 karakter" className="sm:text-xs" required minLength={8} />
                  <Button type="button" variant="outline" onClick={() => setShowPassword((v) => !v)} className="shrink-0">
                    {showPassword ? "Sembunyi" : "Lihat"}
                  </Button>
                </div>
                <button type="button" onClick={handleGenerate} className="mt-1 text-[11px] font-semibold text-accent-deep hover:underline">
                  Generate kata sandi acak
                </button>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="w-full sm:w-auto">Batal</Button>
                <Button type="submit" disabled={isSaving} className="w-full font-bold sm:w-auto">
                  {isSaving ? "Menyimpan..." : "Buat Akun"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" aria-label="Ubah kata sandi pelanggan" className="rise my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
                <KeyRound className="h-5 w-5 shrink-0 text-accent-deep" />
                <span>Ubah Kata Sandi</span>
              </h3>
              <button type="button" onClick={() => setResetTarget(null)} aria-label="Tutup modal" className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink sm:h-10 sm:w-10">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Kata sandi lama tidak bisa dilihat karena hanya tersimpan sebagai hash. Tetapkan kata sandi baru untuk @{resetTarget.username || resetTarget.full_name}, lalu serahkan ke pelanggan.
            </p>

            <form onSubmit={handleResetSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm">
              <div className="rounded-lg border border-line bg-paper p-3 text-xs">
                <div className="text-ink">Nama: {resetTarget.full_name}</div>
                <div className="font-mono text-ink">Username: {resetTarget.username || "tanpa username"}</div>
                <div className="font-mono text-ink">Nomor HP: {resetTarget.phone_number || "belum diisi"}</div>
              </div>
              <div>
                <label htmlFor="cust-new-password" className="mb-1 block text-xs font-semibold text-muted">Kata Sandi Baru</label>
                <div className="flex gap-2">
                  <Input id="cust-new-password" type={showResetPassword ? "text" : "password"} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Minimal 8 karakter" className="sm:text-xs" required minLength={8} />
                  <Button type="button" variant="outline" onClick={() => setShowResetPassword((v) => !v)} className="shrink-0">
                    {showResetPassword ? "Sembunyi" : "Lihat"}
                  </Button>
                </div>
                <button type="button" onClick={handleResetGenerate} className="mt-1 text-[11px] font-semibold text-accent-deep hover:underline">
                  Generate kata sandi acak
                </button>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setResetTarget(null)} className="w-full sm:w-auto">Batal</Button>
                <Button type="submit" disabled={isResetting} className="w-full font-bold sm:w-auto">
                  {isResetting ? "Menyimpan..." : "Simpan Kata Sandi Baru"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
