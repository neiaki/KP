"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import { openNotaPrintWindow, buildWarrantyCardHtml } from "@/lib/print-nota";
import {
  ShieldCheck,
  Wrench,
  Printer,
  ExternalLink,
  Barcode,
  Phone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { updateMyPhoneNumber } from "@/lib/actions/auth";

export default function CustomerAccountPage() {
  const {
    transactions,
    serviceTickets,
    products,
    inventoryUnits,
    currentProfile,
    storeSettings,
    isLiveBackend,
  } = useStore();

  // /portal/account boleh dibuka semua role. Palaunya cuma perlu tahu apakah
  // yang sedang masuk itu pelanggan supaya Copy-nya tidak menyapa sales sebagai
  // "Anda".
  const isCustomer = currentProfile?.role === "customer";

  const displayName = currentProfile?.full_name ?? (isLiveBackend ? "Pelanggan" : "Anisa Rahmawati");

  const storedPhone = currentProfile?.phone_number || "";
  // Profil datang dari server setelah komponen ini mount, jadi nilainya bisa
  // berubah di tengah hidup komponen. Nilai server dipakai langsung, dan
  // phoneDraft hanya menyimpan ketikan yang belum disimpan.
  //
  // Dua cara lain sudah dicoba di file ini dan keduanya ditolak aturan
  // react-hooks di repo ini: setState saat render, dan setState di dalam
  // effect. Pola ini tidak butuh keduanya, dan karena draf dibuang setiap
  // kali nilai server berubah, ketikan yang sedang berjalan tidak pernah
  // ikut tertimpa.
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const phoneInput = phoneDraft ?? storedPhone;
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPhone(true);
    setPhoneError(null);
    setPhoneSaved(false);
    const result = await updateMyPhoneNumber(phoneInput);
    setSavingPhone(false);
    if (!result.ok) {
      setPhoneError(result.error);
      return;
    }
    setPhoneSaved(true);
    // Buang draf supaya input kembali ke nilai yang disimpan server, termasuk
    // kalau server menormalisasi nomornya.
    setPhoneDraft(null);
  };

  // Find purchased units from transactions
  const purchasedItems = transactions.flatMap((tx) =>
    (tx.items || []).map((item) => {
      const unit = inventoryUnits.find((u) => u.id === item.unit_id) || item.unit;
      const product = unit ? products.find((p) => p.id === unit.product_id) : null;

      // Calculate warranty expiration
      const purchaseDate = new Date(tx.created_at);
      const expiryDate = new Date(purchaseDate);
      expiryDate.setMonth(expiryDate.getMonth() + (item.warranty_duration_months || 12));

      const now = new Date();
      const diffTime = expiryDate.getTime() - now.getTime();
      const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const isWarrantyActive = remainingDays > 0;

      return {
        txId: tx.id,
        purchaseDate: tx.created_at,
        unitId: item.unit_id,
        brandModel: product ? `${product.brand} ${product.model_name}` : "Smartphone Unit",
        imei: unit?.imei ?? "IMEI tidak tersedia",
        condition: unit?.condition || "new",
        price: item.unit_price,
        warrantyMonths: item.warranty_duration_months || 12,
        expiryDate,
        remainingDays,
        isWarrantyActive,
      };
    })
  );

  // Customer service tickets. Data live sudah difilter oleh customer_id;
  // fallback nama/telepon hanya berlaku untuk mode demo lokal.
  const myTickets = isLiveBackend
    ? serviceTickets.filter((ticket) => ticket.customer_id === currentProfile?.id)
    : serviceTickets.filter(
        (ticket) =>
          ticket.customer_name.toLowerCase().includes("anisa") ||
          ticket.customer_phone?.includes("7766") ||
          serviceTickets.length <= 2
      );

  return (

    <div className="space-y-6 pb-12 sm:space-y-8">
      {/* Header akun.
          /portal/account terbuka untuk semua role, jadi judul "Portal
          pelanggan resmi" dan kata "Anda" tidak boleh ditulis mati. Sales dan
          admin yang membuka halaman ini akan disapa sebagai staf yang
          memang sedang masuk. */}
      <div className="flex flex-col gap-5 rounded-xl bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="min-w-0 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <span>{isCustomer ? "Portal Pelanggan Resmi" : "Portal Staf At Cell"}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            Selamat Datang, {displayName}
          </h1>
          <p className="text-sm text-slate-300">
            {isCustomer
              ? "Kelola faktur belanja smartphone Anda, pantau masa berlaku garansi IMEI resmi toko, dan lacak status servis."
              : "Ringkasan faktur dan garansi unit atas nama pelanggan yang terkait dengan akun Anda."}
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            openNotaPrintWindow(
              "Kartu Garansi At Cell",
              buildWarrantyCardHtml({
                storeName: "At Cell",
                address: storeSettings.address,
                phone: `${storeSettings.whatsapp_number} / ${storeSettings.phone_number}`,
                buyerName: displayName,
                items: purchasedItems.map((it) => ({
                  brandModel: it.brandModel,
                  imei: it.imei,
                  purchaseDate: it.purchaseDate,
                  warrantyMonths: it.warrantyMonths,
                  active: it.isWarrantyActive,
                })),
              })
            )
          }
          className="w-full gap-2 border-white/20 bg-white/10 text-sm font-semibold text-white hover:bg-white/20 sm:w-auto sm:text-xs"
        >
          <Printer className="w-4 h-4" />
          <span>Cetak Kartu Garansi</span>
        </Button>
      </div>

      {/* Kontak yang bisa dihubungi toko. Sekarang bisa diisi sendiri, dulu
          tidak ada jalur sama sekali sehingga kolomnya selalu kosong. */}
      <div className="print-area">
        <Card>
          <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-4 w-4 text-accent" />
            Nomor Kontak Saya
          </CardTitle>
          <CardDescription className="text-sm">
            Dipakai toko saat ada yang perlu dikonfirmasi soal pembelian, tukar
            tambah, atau servis HP Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSavePhone}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label
                htmlFor="my-phone"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Nomor telepon atau WhatsApp
              </label>
              <Input
                id="my-phone"
                name="my-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(e) => setPhoneDraft(e.target.value)}
                placeholder={currentProfile?.phone_number || "Contoh: 0812-3456-7890"}
                className="font-mono"
              />
            </div>
            <Button
              type="submit"
              disabled={savingPhone || !isLiveBackend}
              className="w-full text-sm sm:w-auto sm:text-xs"
            >
              {savingPhone ? "Menyimpan..." : "Simpan"}
            </Button>
          </form>
          {phoneError ? (
            <p className="mt-2 text-xs text-bad">{phoneError}</p>
          ) : phoneSaved ? (
            <p className="mt-2 text-xs text-good">Nomor kontak tersimpan.</p>
          ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Unit yang dibeli dan status garansinya */}
      <div className="print-area space-y-4">
        <div>
          {/* items-start: judul ini membungkus dua baris di 375px, dan
              items-center membuat ikon melayang di tengah tinggi baris. */}
          <h2 className="flex items-start gap-2 text-lg font-bold text-ink">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-good" />
            <span>Unit Smartphone &amp; Status Garansi IMEI Terikat</span>
          </h2>
          <p className="mt-1 text-xs text-muted">
            Setiap pembelian di At Cell terikat nomor IMEI 15-digit resmi dengan klaim garansi toko langsung.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {purchasedItems.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-line bg-card py-12 text-center text-sm text-muted">
              Belum ada riwayat pembelian terdaftar untuk akun ini.
            </div>
          ) : (
            purchasedItems.map((item, idx) => (
              <Card
                key={idx}
                className="border-line shadow-sm transition-colors hover:border-accent"
              >
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-line p-4 pb-3 sm:p-6 sm:pb-3">
                  <div className="min-w-0">
                    <span className="font-mono text-[11px] text-muted">
                      Faktur #{item.txId} &middot; {formatDate(item.purchaseDate)}
                    </span>
                    <CardTitle className="mt-1 text-base font-bold text-ink">
                      {item.brandModel}
                    </CardTitle>
                  </div>
                  <Badge
                    variant={item.isWarrantyActive ? "success" : "destructive"}
                    className="shrink-0 text-[10px] font-bold"
                  >
                    {item.isWarrantyActive ? "Garansi Aktif" : "Garansi Berakhir"}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-4 p-4 text-sm">
                  {/* flex-wrap: "Nomor IMEI Fisik" + 15 digit dalam satu baris
                      justify-between menyisakan sekitar 170px untuk IMEI di
                      375px, sehingga nomor terpotong di tengah. */}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line bg-paper p-3 font-mono">
                    <span className="flex items-center gap-2 text-muted">
                      <Barcode className="h-4 w-4 shrink-0 text-accent-deep" />
                      Nomor IMEI Fisik
                    </span>
                    <span className="break-all font-bold text-ink">{item.imei}</span>
                  </div>

                  <dl className="space-y-1.5">
                    <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                      <dt>Masa garansi toko</dt>
                      <dd className="font-bold text-ink">{item.warrantyMonths} bulan</dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                      <dt>Berlaku hingga</dt>
                      <dd className="font-semibold text-ink">
                        {formatDate(item.expiryDate.toISOString())}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3 text-muted">
                      <dt>Sisa masa garansi</dt>
                      <dd
                        className={`font-black ${
                          item.isWarrantyActive ? "text-good" : "text-bad"
                        }`}
                      >
                        {item.isWarrantyActive ? `${item.remainingDays} hari lagi` : "Kedaluwarsa"}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-line pt-2 text-muted">
                    <span>Harga saat beli</span>
                    <span className="font-mono text-sm font-bold text-ink">
                      {formatIDR(item.price)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Riwayat tiket servis pelanggan */}
      <div className="space-y-4 border-t border-line pt-4">
        <div>
          <h2 className="flex items-start gap-2 text-lg font-bold text-ink">
            <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <span>Riwayat Tiket Servis Reparasi</span>
          </h2>
          <p className="mt-1 text-xs text-muted">
            Daftar perbaikan unit Anda di Meja Kerja Teknisi At Cell.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          {myTickets.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-line bg-card py-12 text-center text-sm text-muted">
              Belum ada tiket servis yang tercatat untuk akun ini.
            </div>
          ) : (
            myTickets.map((ticket) => (
              <Card key={ticket.id} className="border-line shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 border-b border-line p-4 pb-3 sm:p-6 sm:pb-3">
                  <div className="min-w-0">
                    <span className="inline-block break-all rounded bg-accent-soft px-2 py-0.5 font-mono text-xs font-bold text-accent-deep">
                      {ticket.ticket_code}
                    </span>
                    <CardTitle className="mt-1 text-base font-bold text-ink">
                      {ticket.device_model}
                    </CardTitle>
                  </div>
                  <Badge
                    variant={
                      ticket.repair_status === "completed" || ticket.repair_status === "picked_up"
                        ? "success"
                        : "warning"
                    }
                    className="shrink-0 text-[10px] font-bold"
                  >
                    {ticket.repair_status.replace("_", " ")}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 p-4 text-sm">
                  <div className="rounded-lg bg-paper p-2.5 text-muted">
                    <span className="mb-0.5 block text-[11px] font-bold text-ink">
                      Keluhan
                    </span>
                    {ticket.issue_notes}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 py-1">
                    <span className="text-muted">Total biaya reparasi</span>
                    <span className="font-mono text-sm font-black text-accent-deep">
                      {formatIDR(ticket.total_fee)}
                    </span>
                  </div>

                  <div className="border-t border-line pt-2">
                    <Link
                      href={`/id/tracking?ticket=${ticket.ticket_code}`}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-2 font-bold text-accent-deep transition-colors hover:bg-line"
                    >
                      <span>Buka pelacakan linimasa publik</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
