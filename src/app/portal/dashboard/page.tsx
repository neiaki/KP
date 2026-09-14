"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import {
  TrendingUp,
  CreditCard,
  Wrench,
  AlertTriangle,
  Boxes,
  Users,
  ArrowUpRight,
  Package,
  Clock,
  CheckCircle,
  PlusCircle,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboardPage() {
  const { products, inventoryUnits, transactions, serviceTickets } = useStore();
  const [stockThreshold, setStockThreshold] = useState<number>(2);

  // Financial metrics
  const totalRevenue = transactions.reduce((acc, curr) => acc + (curr.final_payment ?? curr.final_paid_amount ?? 0), 0);
  const totalTradeInDeductions = transactions.reduce((acc, curr) => acc + (curr.trade_in_deduction ?? 0), 0);
  const totalTransactionsCount = transactions.length;

  // Active tickets (not completed or picked up)
  const activeTickets = serviceTickets.filter(
    (t) => t.repair_status !== "completed" && t.repair_status !== "picked_up" && t.repair_status !== "cancelled"
  );
  const completedTickets = serviceTickets.filter(
    (t) => t.repair_status === "completed" || t.repair_status === "picked_up"
  );

  // Low Stock Warnings Calculation per Product Model
  const productStockMap = products.map((prod) => {
    const availableCount = inventoryUnits.filter(
      (u) => u.product_id === prod.id && u.status === "available"
    ).length;
    return {
      product: prod,
      availableCount,
      isLowStock: availableCount <= stockThreshold,
    };
  });

  const lowStockItems = productStockMap.filter((item) => item.isLowStock);

  return (
    <div className="space-y-8 pb-12">
      {/* Top Welcome & Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Dashboard Admin & Owner
            </h1>
            <Badge variant="purple" className="font-mono text-xs">
              ADMIN ROLE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Ringkasan performa penjualan, mutasi stok IMEI, dan pemantauan Meja Servis toko At Cell.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/portal/products">
            <Button size="sm" className="gap-1.5 text-xs font-semibold">
              <PlusCircle className="w-4 h-4" />
              <span>Tambah Master Produk</span>
            </Button>
          </Link>
          <Link href="/portal/pos">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold">
              <CreditCard className="w-4 h-4" />
              <span>Buka POS Kasir</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 4 Stat Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omzet */}
        <Card className="border-line shadow-sm hover:border-accent transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Omzet Penjualan
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent-deep flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-ink">
              {formatIDR(totalRevenue)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-good font-medium mt-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Termasuk potongan trade-in Rp {totalTradeInDeductions.toLocaleString("id-ID")}</span>
            </div>
          </CardContent>
        </Card>

        {/* Total Transaksi */}
        <Card className="border-line shadow-sm hover:border-good transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Jumlah Transaksi POS
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-good-bg text-good flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-ink">
              {totalTransactionsCount} Transaksi
            </div>
            <p className="text-[11px] text-muted mt-1">
              Faktur terbit dengan garansi IMEI resmi toko
            </p>
          </CardContent>
        </Card>

        {/* Tiket Servis Aktif */}
        <Card className="border-line shadow-sm hover:border-warn transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Tiket Servis Aktif
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-warn-bg text-warn flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-warn">
              {activeTickets.length} Unit
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted mt-1">
              <span className="text-good font-semibold">{completedTickets.length} selesai</span>
              <span>•</span>
              <Link href="/portal/service" className="text-accent-deep hover:underline inline-flex items-center gap-1">
                Buka meja servis <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Peringatan Stok Menipis */}
        <Card className="border-line shadow-sm hover:border-bad transition-colors">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Peringatan Stok Rendah
            </CardTitle>
            <div className="w-8 h-8 rounded-lg bg-bad-bg text-bad flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-bad">
              {lowStockItems.length} Model
            </div>
            <p className="text-[11px] text-muted mt-1">
              Stok ≤ {stockThreshold} unit fisik yang berstatus available
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Low Stock Alert & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Low Stock Watchlist */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="border-line shadow-sm">
            <CardHeader className="pb-3 border-b border-line flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-bad" />
                  <span>Daftar Model Stok Menipis</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Model dengan unit siap jual berada di bawah batas ambang
                </CardDescription>
              </div>

              {/* Threshold control */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted">Batas:</span>
                <select
                  value={stockThreshold}
                  onChange={(e) => setStockThreshold(Number(e.target.value))}
                  className="bg-paper rounded border border-line px-2 py-1 text-xs font-semibold text-ink"
                >
                  <option value={1}>≤ 1 unit</option>
                  <option value={2}>≤ 2 unit</option>
                  <option value={3}>≤ 3 unit</option>
                  <option value={5}>≤ 5 unit</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {lowStockItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  <CheckCircle className="w-8 h-8 text-good mx-auto mb-2" />
                  <span>Semua model handphone memiliki stok aman di atas ambang batas.</span>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {lowStockItems.map((item) => (
                    <div
                      key={item.product.id}
                      className="p-4 flex items-center justify-between hover:bg-paper transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-paper flex items-center justify-center font-bold text-muted text-xs">
                          {item.product.brand[0]}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-ink">
                            {item.product.brand} {item.product.model_name}
                          </div>
                          <div className="text-[11px] text-muted">
                            Harga Ref: {formatIDR(item.product.default_price)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge
                          variant={item.availableCount === 0 ? "destructive" : "warning"}
                          className="font-mono text-xs font-bold"
                        >
                          Sisa {item.availableCount} Unit
                        </Badge>
                        <Link href="/portal/inventory">
                          <Button size="sm" variant="outline" className="text-xs h-8">
                            + Tambah IMEI
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Service Tickets Queue */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="border-line shadow-sm">
            <CardHeader className="pb-3 border-b border-line flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-warn" />
                  <span>Antrian Tiket Servis Aktif</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Unit dalam tahapan diagnosa, persetujuan, atau pengerjaan
                </CardDescription>
              </div>
              <Link href="/portal/service">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-accent-deep">
                  Lihat Semua <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {activeTickets.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted">
                  <CheckCircle className="w-8 h-8 text-good mx-auto mb-2" />
                  <span>Tidak ada unit servis yang sedang tertunda atau dikerjakan saat ini.</span>
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {activeTickets.slice(0, 5).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="p-4 flex items-center justify-between hover:bg-paper transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-accent-deep">
                            {ticket.ticket_code}
                          </span>
                          <span className="text-xs font-semibold text-ink">
                            {ticket.device_model}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">
                          Pelanggan: {ticket.customer_name} • Keluhan: {ticket.issue_notes.slice(0, 35)}...
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="warning" className="text-[10px] uppercase font-bold">
                          {ticket.repair_status.replace("_", " ")}
                        </Badge>
                        <Link href="/portal/service">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Buka meja servis">
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent POS Sales Invoices Table */}
      <Card className="border-line shadow-sm">
        <CardHeader className="pb-3 border-b border-line flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Boxes className="w-4 h-4 text-accent-deep" />
              <span>Daftar Transaksi Kasir Terbaru (POS)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Histori invoice penjualan smartphone fisik dan pemotongan tukar tambah
            </CardDescription>
          </div>
          <Link href="/portal/pos">
            <Button size="sm" className="text-xs">
              + Transaksi Baru
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-paper text-muted font-semibold border-b border-line uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3">ID Faktur</th>
                  <th className="p-3">Pelanggan</th>
                  <th className="p-3">Unit Handphone</th>
                  <th className="p-3">Tukar Tambah</th>
                  <th className="p-3">Metode Bayar</th>
                  <th className="p-3">Total Bayar</th>
                  <th className="p-3">Waktu Transaksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {transactions.slice(0, 8).map((tx) => (
                  <tr key={tx.id} className="hover:bg-paper/80">
                    <td className="p-3 font-mono font-bold text-accent-deep">
                      #{tx.id}
                    </td>
                    <td className="p-3 font-medium text-ink">
                      {tx.customer_name || "Guest Walk-in"}
                      {tx.customer_phone && (
                        <div className="text-[10px] text-muted font-mono">
                          {tx.customer_phone}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {tx.items?.map((item) => (
                        <div key={item.id}>
                          <span className="font-semibold text-ink">
                            Unit #{item.unit_id}
                          </span>
                          {item.unit?.imei && (
                            <span className="text-[10px] font-mono text-muted block">
                              IMEI: {item.unit.imei}
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="p-3">
                      {tx.trade_in ? (
                        <div>
                          <Badge variant="info" className="text-[10px]">
                            -{formatIDR(tx.trade_in_deduction ?? 0)}
                          </Badge>
                          <div className="text-[10px] text-muted mt-0.5">
                            {tx.trade_in.original_brand_model}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold text-muted">
                      {tx.payment_method}
                    </td>
                    <td className="p-3 font-black text-good text-sm">
                      {formatIDR(tx.final_payment ?? tx.final_paid_amount ?? 0)}
                    </td>
                    <td className="p-3 text-muted whitespace-nowrap">
                      {formatDate(tx.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
