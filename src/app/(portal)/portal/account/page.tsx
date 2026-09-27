"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import { openNotaPrintWindow, buildWarrantyCardHtml } from "@/lib/print-nota";
import {
  Receipt,
  ShieldCheck,
  Smartphone,
  Wrench,
  Clock,
  Printer,
  Calendar,
  AlertCircle,
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
    <div className="space-y-8 pb-12">
      {/* Customer Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-indigo-300 text-xs font-mono">
            <span>PORTAL PELANGGAN RESMI</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Selamat Datang, {displayName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Kelola faktur belanja smartphone Anda, pantau masa berlaku garansi IMEI resmi toko, dan lacak status servis.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
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
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs gap-2 font-semibold"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Kartu Garansi</span>
          </Button>
        </div>
      </div>

      {/* Kontak yang bisa dihubungi toko. Sekarang bisa diisi sendiri, dulu
          tidak ada jalur sama sekali sehingga kolomnya selalu kosong. */}
      <div className="print-area">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="w-4 h-4 text-accent" />
              Nomor Kontak Saya
            </CardTitle>
            <CardDescription>
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
                <label htmlFor="my-phone" className="block text-xs font-semibold text-muted mb-1">
                  Nomor telepon atau WhatsApp
                </label>
                <Input
                  id="my-phone"
                  type="tel"
                  inputMode="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneDraft(e.target.value)}
                  placeholder={currentProfile?.phone_number || "Contoh: 0812-3456-7890"}
                  className="font-mono"
                />
              </div>
              <Button type="submit" disabled={savingPhone || !isLiveBackend} className="text-xs">
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

      {/* 1. Purchased Handphones & Warranty Countdown */}
      <div className="print-area space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-good" />
              <span>Unit Smartphone & Status Garansi IMEI Terikat</span>
            </h2>
            <p className="text-xs text-muted">
              Setiap pembelian di At Cell terikat nomor IMEI 15-digit resmi dengan klaim garansi toko langsung.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {purchasedItems.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-card rounded-xl border border-dashed border-line text-muted text-xs">
              Belum ada riwayat pembelian terdaftar untuk akun ini.
            </div>
          ) : (
            purchasedItems.map((item, idx) => (
              <Card
                key={idx}
                className="border-line shadow-sm hover:border-accent transition-colors"
              >
                <CardHeader className="pb-3 border-b border-line flex flex-row items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-muted">
                      FAKTUR #{item.txId} • {formatDate(item.purchaseDate)}
                    </span>
                    <CardTitle className="text-base font-bold text-ink mt-1">
                      {item.brandModel}
                    </CardTitle>
                  </div>
                  <Badge
                    variant={item.isWarrantyActive ? "success" : "destructive"}
                    className="text-[10px] uppercase font-bold"
                  >
                    {item.isWarrantyActive ? "Garansi Aktif" : "Garansi Berakhir"}
                  </Badge>
                </CardHeader>

                <CardContent className="p-4 space-y-4 text-xs">
                  {/* IMEI Box */}
                  <div className="p-3 bg-paper rounded-xl border border-line flex items-center justify-between font-mono">
                    <div className="flex items-center gap-2">
                      <Barcode className="w-4 h-4 text-accent-deep" />
                      <span className="text-muted">Nomor IMEI Fisik:</span>
                    </div>
                    <span className="font-bold text-ink">{item.imei}</span>
                  </div>

                  {/* Warranty Countdown */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-muted">
                      <span>Masa Garansi Toko:</span>
                      <span className="font-bold text-ink">{item.warrantyMonths} Bulan</span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Berlaku Hingga:</span>
                      <span className="font-semibold text-ink">
                        {formatDate(item.expiryDate.toISOString())}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Sisa Masa Garansi:</span>
                      <span
                        className={`font-black ${
                          item.isWarrantyActive ? "text-good" : "text-bad"
                        }`}
                      >
                        {item.isWarrantyActive ? `${item.remainingDays} Hari Lagi` : "Kedaluwarsa"}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-line flex justify-between items-center text-muted">
                    <span>Harga Saat Beli:</span>
                    <span className="font-bold text-ink text-sm">
                      {formatIDR(item.price)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* 2. Customer Repair Tickets */}
      <div className="space-y-4 pt-4 border-t border-line">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center gap-2">
            <Wrench className="w-5 h-5 text-warn" />
            <span>Riwayat Tiket Servis Reparasi</span>
          </h2>
          <p className="text-xs text-muted">
            Daftar perbaikan unit Anda di Meja Kerja Teknisi At Cell.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {myTickets.map((ticket) => (
            <Card key={ticket.id} className="border-line shadow-sm">
              <CardHeader className="pb-3 border-b border-line flex flex-row items-center justify-between">
                <div>
                  <span className="font-mono text-xs font-bold text-accent-deep bg-accent-soft px-2 py-0.5 rounded">
                    {ticket.ticket_code}
                  </span>
                  <CardTitle className="text-base font-bold text-ink mt-1">
                    {ticket.device_model}
                  </CardTitle>
                </div>
                <Badge
                  variant={
                    ticket.repair_status === "completed" || ticket.repair_status === "picked_up"
                      ? "success"
                      : "warning"
                  }
                  className="text-[10px] uppercase font-bold"
                >
                  {ticket.repair_status.replace("_", " ")}
                </Badge>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="p-2.5 bg-paper rounded-lg text-muted">
                  <span className="font-bold text-ink block text-[10px] uppercase mb-0.5">
                    Keluhan:
                  </span>
                  {ticket.issue_notes}
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-muted">Total Biaya Reparasi:</span>
                  <span className="font-black text-accent-deep text-sm">
                    {formatIDR(ticket.total_fee)}
                  </span>
                </div>

                <div className="pt-2 border-t border-line">
                  <Link
                    href={`/id/tracking?ticket=${ticket.ticket_code}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 p-2 rounded-lg bg-accent-soft hover:bg-line text-accent-deep font-bold transition-colors"
                  >
                    <span>Buka Pelacakan Linimasa Publik</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
