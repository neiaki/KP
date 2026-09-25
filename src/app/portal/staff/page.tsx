"use client";

import React, { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { UserRole } from "@/types";
import { Users, UserPlus, ShieldCheck, ShoppingBag, Wrench, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function StaffManagementPage() {
  const { profiles, addStaff, isLiveBackend } = useStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("sales");
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!showAddModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAddModal]);

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setNotice({ type: "error", text: "Nama dan email wajib diisi!" });
      return;
    }
    setIsSaving(true);
    try {
      await addStaff(name.trim(), role, phone.trim(), email.trim(), password);
      setShowAddModal(false);
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setNotice({ type: "success", text: "Akun staf baru berhasil didaftarkan." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal membuat akun staf.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const staffList = profiles.filter((p) => p.role !== "customer");

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Manajemen Akun Staf Toko
            </h1>
            <Badge variant="purple" className="font-mono text-xs">
              ADMIN EXCLUSIVE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Kelola akses otorisasi untuk Sales (kasir POS & inventaris) dan Teknisi (meja kerja servis).
          </p>
        </div>

        <Button onClick={() => setShowAddModal(true)} className="gap-2 font-bold text-xs shadow-md">
          <UserPlus className="w-4 h-4" />
          <span>+ Undang / Tambah Staf Baru</span>
        </Button>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-xs font-semibold ${
            notice.type === "error"
              ? "bg-bad-bg text-bad border-bad/20"
              : "bg-good-bg text-good border-good/20"
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pemberitahuan"
            className="hover:opacity-70 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staffList.map((staf) => (
          <Card key={staf.id} className="border-line shadow-sm">
            <CardHeader className="pb-3 border-b border-line flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-xs ${
                    staf.role === "admin"
                      ? "bg-purple-600 text-white"
                      : staf.role === "sales"
                      ? "bg-good-bg text-good"
                      : "bg-warn-bg text-warn"
                  }`}
                >
                  {staf.role === "admin" ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : staf.role === "sales" ? (
                    <ShoppingBag className="w-5 h-5" />
                  ) : (
                    <Wrench className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-ink text-sm">{staf.full_name}</h3>
                  <div className="text-[11px] text-muted font-mono">
                    {staf.email || "Email tidak ditampilkan"}
                  </div>
                </div>
              </div>

              <Badge
                variant={
                  staf.role === "admin"
                    ? "purple"
                    : staf.role === "sales"
                    ? "success"
                    : "warning"
                }
                className="text-[10px] uppercase font-mono"
              >
                {staf.role}
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between text-muted">
                <span>Kontak Telepon:</span>
                <span className="font-mono text-ink">{staf.phone_number || "-"}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Status Akun:</span>
                <span className="font-semibold text-good">Aktif (Verified)</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Undang akun staf baru"
            className="bg-card rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-line rise"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-accent-deep" />
                <span>Undang Akun Staf Baru</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup modal"
                className="text-muted hover:text-ink cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-muted mb-1">Nama Lengkap Staf:</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Gilang Ramadhan"
                  className="text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Alamat Email:</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staf@atcell.my.id"
                  className="text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Nomor WhatsApp / HP:</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789"
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Kata Sandi Awal:</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="text-xs"
                  required={isLiveBackend}
                  minLength={isLiveBackend ? 8 : undefined}
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Peran Akses (Role):</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full bg-paper border border-line rounded-lg p-2 text-xs font-semibold"
                >
                  <option value="sales">Sales (Kasir POS & Stok IMEI)</option>
                  <option value="technician">Teknisi (Meja Kerja Servis)</option>
                  <option value="admin">Admin / Co-Owner (Kendali Penuh)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving} className="font-bold">
                  {isSaving ? "Mengundang..." : "Undang Akun Staf Baru"}
                  Daftarkan Staf
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
