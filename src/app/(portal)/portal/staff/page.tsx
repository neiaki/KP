"use client";

import React, { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { UserRole } from "@/types";
import { Users, UserPlus, ShieldCheck, ShoppingBag, Wrench, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/portal/role-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/* Nilai enum peran dari database ditampilkan apa adanya, jadi "technician"
   bocor ke layar. Sama seperti peta di portal-sidebar. */
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  sales: "Sales",
  technician: "Teknisi",
  customer: "Pelanggan",
};

export default function StaffManagementPage() {
  const { profiles, addStaff, isLiveBackend, currentRole } = useStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
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
    if (isLiveBackend && !username.trim()) {
      setNotice({ type: "error", text: "Username wajib diisi untuk login portal." });
      return;
    }
    setIsSaving(true);
    try {
      await addStaff(
        name.trim(),
        role,
        phone.trim(),
        email.trim(),
        password,
        username.trim() || undefined
      );
      setShowAddModal(false);
      setName("");
      setEmail("");
      setUsername("");
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
    <div className="space-y-6 pb-12 sm:space-y-8">
      {/* Header kelola staf */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Manajemen Akun Staf Toko
            </h1>
            <RoleBadge role={currentRole} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Kelola akses otorisasi untuk Sales (kasir POS &amp; inventaris) dan Teknisi (meja kerja servis).
          </p>
        </div>

        <Button
          onClick={() => setShowAddModal(true)}
          className="w-full gap-2 text-sm font-bold shadow-md sm:w-auto sm:text-xs"
        >
          <UserPlus className="w-4 h-4" />
          <span>Undang / Tambah Staf Baru</span>
        </Button>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-semibold ${
            notice.type === "error"
              ? "border-bad/20 bg-bad-bg text-bad"
              : "border-good/20 bg-good-bg text-good"
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pemberitahuan"
            className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:opacity-70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Kartu staf. Avatar admin memakai bg-accent, bukan ungu: aturan proyek
          menetapkan satu aksen saja, dan ungu-600 tidak ada di token mana pun. */}
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {staffList.map((staf) => (
          <li key={staf.id}>
            <Card className="h-full border-line shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-line p-4 pb-3 sm:p-6 sm:pb-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs ${
                      staf.role === "sales" ? "bg-good-bg text-good" : "bg-accent-soft text-accent-deep"
                    }`}
                  >
                    {staf.role === "sales" ? (
                      <ShoppingBag className="w-5 h-5" />
                    ) : staf.role === "admin" ? (
                      <ShieldCheck className="w-5 h-5" />
                    ) : (
                      <Wrench className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-ink">{staf.full_name}</h3>
                    <div className="truncate font-mono text-[11px] text-muted">
                      @{staf.username || "tanpa username"}
                    </div>
                  </div>
                </div>

                <Badge
                  variant={
                    staf.role === "admin"
                      ? "info"
                      : staf.role === "sales"
                      ? "success"
                      : "warning"
                  }
                  className="font-mono text-[10px]"
                >
                  {ROLE_LABEL[staf.role] ?? staf.role}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-2 p-4 text-sm">
                <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                  <span>Kontak telepon:</span>
                  <span className="break-all font-mono text-ink">
                    {staf.phone_number ? (
                      staf.phone_number
                    ) : (
                      <span
                        className="font-sans font-normal text-muted"
                        title="Nomor bisa diisi sendiri oleh pemiliknya lewat portal/account."
                      >
                        belum diisi
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                  <span>Status akun:</span>
                  <span className="font-semibold text-good">Aktif (terverifikasi)</span>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* Dialog undang staf */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Undang akun staf baru"
            className="rise my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
                <UserPlus className="h-5 w-5 shrink-0 text-accent-deep" />
                <span>Undang Akun Staf Baru</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup modal"
                className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink sm:h-10 sm:w-10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleAddStaffSubmit}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm"
            >
              <div>
                <label
                  htmlFor="staff-name"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nama Lengkap Staf
                </label>
                <Input
                  id="staff-name"
                  name="staff-name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Gilang Ramadhan"
                  className="sm:text-xs"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="staff-email"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Alamat Email
                </label>
                <Input
                  id="staff-email"
                  name="staff-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staf@atcell.my.id"
                  className="sm:text-xs"
                  required
                />
              </div>

              {isLiveBackend && (
                <div>
                  <label
                    htmlFor="staff-username"
                    className="mb-1 block text-xs font-semibold text-muted"
                  >
                    Username Login
                  </label>
                  <Input
                    id="staff-username"
                    name="staff-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="contoh: gilang"
                    className="font-mono sm:text-xs"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    minLength={3}
                    maxLength={32}
                    pattern="[a-z0-9._\-]{3,32}"
                    required
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Dipakai staf untuk masuk portal. Email tetap disimpan sebagai identitas akun.
                  </p>
                </div>
              )}

              <div>
                <label
                  htmlFor="staff-phone"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nomor WhatsApp / HP
                </label>
                <Input
                  id="staff-phone"
                  name="staff-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789"
                  className="font-mono sm:text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Kata Sandi Awal
                </label>
                <Input
                  id="staff-password"
                  name="staff-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="sm:text-xs"
                  required={isLiveBackend}
                  minLength={isLiveBackend ? 8 : undefined}
                />
              </div>

              <div>
                <label
                  htmlFor="staff-role"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Peran Akses
                </label>
                <select
                  id="staff-role"
                  name="staff-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base font-semibold text-ink sm:h-10 sm:text-xs"
                >
                  <option value="sales">Sales (Kasir POS &amp; Stok IMEI)</option>
                  <option value="technician">Teknisi (Meja Kerja Servis)</option>
                  <option value="admin">Admin / Co-Owner (Kendali Penuh)</option>
                </select>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="w-full sm:w-auto"
                >
                  Batal
                </Button>
                {/* Tombol ini sebelumnya merender dua label sekaligus
                    ("Undang Akun Staf Baru Daftar Staf") karena ada dua
                    anak teks di dalam satu <button>. */}
                <Button type="submit" disabled={isSaving} className="w-full font-bold sm:w-auto">
                  {isSaving ? "Mengundang..." : "Undang Akun Staf Baru"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
