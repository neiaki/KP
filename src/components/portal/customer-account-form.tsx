"use client";

import React, { useState } from "react";
import { useStore } from "@/context/store-context";
import { UserPlus, Eye, EyeOff, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generatePassword } from "@/lib/password";

export type CustomerAccountCreated = {
  username: string;
  phone: string;
  password: string;
};

export function CustomerAccountForm({
  onDone,
}: {
  // Dipanggil dari layar sukses. Modal pemanggil tidak boleh langsung ditutup
  // saat akun dibuat, karena kata sandi hanya ditampilkan sekali di sini.
  onDone?: () => void;
}) {
  const { addCustomer } = useStore();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<CustomerAccountCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setPassword(generatePassword());
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !username.trim() || !phone.trim() || !password.trim()) {
      setError("Nama, username, nomor HP, dan kata sandi wajib diisi.");
      return;
    }
    setIsSaving(true);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const normalizedPhone = phone.trim();
      await addCustomer(
        name.trim(),
        normalizedPhone,
        password,
        normalizedUsername
      );
      const result = { username: normalizedUsername, phone: normalizedPhone, password };
      setHasil(result);
      setName("");
      setUsername("");
      setPhone("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat akun pelanggan.");
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

  if (hasil) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-bold text-ink">
          Akun baru dibuat. Simpan kata sandi ini, tidak bisa dilihat lagi.
        </p>
        <div className="rounded-lg border border-line bg-card p-3 font-mono text-xs">
          <div>Username: {hasil.username}</div>
          <div>Nomor HP: {hasil.phone}</div>
          <div>Kata sandi: {hasil.password}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleCopy} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? "Tersalin" : "Salin"}</span>
          </Button>
          <Button type="button" variant="outline" onClick={() => setHasil(null)}>
            Buat lagi
          </Button>
          {onDone && (
            <Button type="button" onClick={onDone}>
              Tutup
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      {error && (
        <div role="alert" className="rounded-lg border border-bad/20 bg-bad-bg p-3 text-sm font-semibold text-bad">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="customer-name" className="mb-1 block text-xs font-semibold text-muted">
          Nama Lengkap
        </label>
        <Input
          id="customer-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Contoh: Ega"
          className="sm:text-xs"
          required
        />
      </div>
      <div>
        <label htmlFor="customer-username" className="mb-1 block text-xs font-semibold text-muted">
          Username Login
        </label>
        <Input
          id="customer-username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="contoh: ega"
          className="font-mono sm:text-xs"
          required
          minLength={3}
          maxLength={32}
        />
      </div>
      <div>
        <label htmlFor="customer-phone" className="mb-1 block text-xs font-semibold text-muted">
          Nomor HP
        </label>
        <Input
          id="customer-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="081200000001"
          className="font-mono sm:text-xs"
          required
        />
      </div>
      <div>
        <label htmlFor="customer-password" className="mb-1 block text-xs font-semibold text-muted">
          Kata Sandi
        </label>
        <div className="flex gap-2">
          <Input
            id="customer-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
            className="sm:text-xs"
            required
            minLength={8}
          />
          <Button type="button" variant="outline" onClick={() => setShowPassword((v) => !v)} className="shrink-0">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <button type="button" onClick={handleGenerate} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-deep hover:underline">
          <RefreshCw className="h-3 w-3" />
          Generate kata sandi acak
        </button>
      </div>
      <Button type="submit" disabled={isSaving} className="w-full gap-2 font-bold">
        <UserPlus className="h-4 w-4" />
        {isSaving ? "Menyimpan..." : "Buat Akun Pelanggan"}
      </Button>
    </form>
  );
}