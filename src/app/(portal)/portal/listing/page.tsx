"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useStore } from "@/context/store-context";
import { formatIDR } from "@/lib/utils";
import { isRealPhoto } from "@/lib/shop";
import { Product } from "@/types";
import { Tag, Search, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RoleBadge } from "@/components/portal/role-badge";

/*
 * Etalase & Harga: satu tempat untuk memperbarui dua hal yang paling sering
 * berubah pada model katalog yang belum menerima unit (badge "Belum ada unit"
 * di halaman publik): harga acuan dan foto resmi. Kolom lain (merek, nama
 * model, status aktif, nonaktifkan) tetap milik Master Produk yang admin-only,
 * dan aksi di belakang halaman ini hanya menulis dua kolom itu.
 */

const PLACEHOLDER_IMAGE = "/products/placeholder.svg";

export default function EtalaseHargaPage() {
  const { products, updateProductListing, currentRole } = useStore();

  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [drafHarga, setDrafHarga] = useState("");
  const [drafFoto, setDrafFoto] = useState("");
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Tipe Product di sisi klien tidak membawa is_active: listProducts sudah
  // menyaring baris nonaktif di server, jadi tidak ada yang perlu disaring lagi.
  const daftar = products
    .filter((p) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        p.brand.toLowerCase().includes(q) ||
        p.model_name.toLowerCase().includes(q) ||
        p.specs.toLowerCase().includes(q)
      );
    });

  const bukaEdit = (p: Product) => {
    setEditId(p.id);
    setDrafHarga(p.default_price > 0 ? String(p.default_price) : "");
    setDrafFoto((p.official_images ?? []).join("\n"));
    setNotice(null);
  };

  const tutupEdit = () => {
    setEditId(null);
    setDrafHarga("");
    setDrafFoto("");
  };

  const simpan = async (p: Product) => {
    const harga = drafHarga.trim() === "" ? 0 : Number(drafHarga);
    if (!Number.isFinite(harga) || harga < 0) {
      setNotice({ type: "error", text: "Harga acuan harus angka dan tidak boleh negatif. Kosongkan untuk menyembunyikan harga." });
      return;
    }
    const foto = drafFoto
      .split("\n")
      .map((baris) => baris.trim())
      .filter((baris) => baris.length > 0);
    const tidakSah = foto.find((u) => !isRealPhoto(u));
    if (tidakSah) {
      setNotice({ type: "error", text: "Ada foto yang bukan URL http/https atau path yang diawali /." });
      return;
    }
    setIsSaving(true);
    setNotice(null);
    try {
      await updateProductListing(p.id, { default_price: harga, official_images: foto });
      setNotice({
        type: "success",
        text: `Etalase ${p.brand} ${p.model_name} diperbarui.`,
      });
      tutupEdit();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal memperbarui etalase.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fotoUtama = (p: Product): string => {
    const resmi = (p.official_images ?? []).filter(isRealPhoto)[0];
    if (resmi) return resmi;
    return isRealPhoto(p.image_url) ? p.image_url.trim() : PLACEHOLDER_IMAGE;
  };

  return (
    <div className="space-y-6 pb-12 sm:space-y-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Etalase &amp; Harga
          </h1>
          <RoleBadge role={currentRole} />
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Perbarui harga acuan dan foto resmi tiap model katalog, termasuk model
          yang belum menerima unit. Merek, nama model, dan status aktif diubah
          lewat Master Produk oleh admin.
        </p>
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

      <div className="relative">
        <label htmlFor="listing-search" className="sr-only">
          Cari model
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input
          id="listing-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari merek, model, atau spesifikasi"
          className="pl-9 sm:text-xs"
        />
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {daftar.map((p) => {
          const sedangEdit = editId === p.id;
          const foto = fotoUtama(p);
          return (
            <li key={p.id}>
              <Card className="h-full border-line shadow-sm">
                <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                  {foto === PLACEHOLDER_IMAGE ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Image
                        src={PLACEHOLDER_IMAGE}
                        alt={`${p.brand} ${p.model_name} belum ada foto`}
                        width={120}
                        height={120}
                        className="h-24 w-24 object-contain opacity-60"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <Image
                      src={foto}
                      alt={`${p.brand} ${p.model_name}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <CardContent className="space-y-2 p-4 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink">
                      {p.brand} {p.model_name}
                    </h3>
                    <Badge variant={p.default_price > 0 ? "info" : "secondary"} className="shrink-0 text-[10px]">
                      {p.default_price > 0 ? formatIDR(p.default_price) : "Tanpa harga"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {(p.official_images ?? []).filter(isRealPhoto).length} foto resmi terpasang
                  </p>
                  {!sedangEdit && (
                    <Button type="button" variant="outline" onClick={() => bukaEdit(p)} className="w-full text-xs font-bold">
                      <Tag className="h-4 w-4" />
                      Perbarui Etalase
                    </Button>
                  )}
                  {sedangEdit && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void simpan(p);
                      }}
                      className="space-y-3 pt-1"
                    >
                      <div>
                        <label htmlFor={`harga-${p.id}`} className="mb-1 block text-xs font-semibold text-muted">
                          Harga acuan (kosongkan bila belum ada)
                        </label>
                        <Input
                          id={`harga-${p.id}`}
                          type="number"
                          min={0}
                          value={drafHarga}
                          onChange={(e) => setDrafHarga(e.target.value)}
                          placeholder="0"
                          className="font-mono sm:text-xs"
                        />
                      </div>
                      <div>
                        <label htmlFor={`foto-${p.id}`} className="mb-1 block text-xs font-semibold text-muted">
                          URL foto resmi (satu per baris, maksimal 10)
                        </label>
                        <textarea
                          id={`foto-${p.id}`}
                          value={drafFoto}
                          onChange={(e) => setDrafFoto(e.target.value)}
                          rows={4}
                          placeholder="https://..."
                          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={tutupEdit} className="w-full text-xs">
                          Batal
                        </Button>
                        <Button type="submit" disabled={isSaving} className="w-full text-xs font-bold">
                          {isSaving ? "Menyimpan..." : "Simpan"}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
        {daftar.length === 0 && (
          <li className="md:col-span-2 lg:col-span-3">
            <Card>
              <CardContent className="flex items-center gap-2 p-6 text-sm text-muted">
                <Check className="h-4 w-4" />
                Tidak ada model yang cocok dengan pencarian.
              </CardContent>
            </Card>
          </li>
        )}
      </ul>
    </div>
  );
}
