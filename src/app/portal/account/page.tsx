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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CustomerAccountPage() {
  const { transactions, serviceTickets, products, inventoryUnits, profiles, currentRole, storeSettings } =
    useStore();

  const currentProfile = profiles.find((p) => p.role === currentRole) || {
    full_name: "Anisa Rahmawati",
    email: "anisa@gmail.com",
    phone_number: "082199887766",
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
        imei: unit?.imei || "358762109845001",
        condition: unit?.condition || "new",
        price: item.unit_price,
        warrantyMonths: item.warranty_duration_months || 12,
        expiryDate,
        remainingDays,
        isWarrantyActive,
      };
    })
  );

  // Customer service tickets (matches customer name or demo filter)
  const myTickets = serviceTickets.filter(
    (t) =>
      t.customer_name.toLowerCase().includes("anisa") ||
      t.customer_phone?.includes("7766") ||
      serviceTickets.length <= 2 // fallback demo display
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
            Selamat Datang, {currentProfile.full_name}
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
                  buyerName: currentProfile.full_name,
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
