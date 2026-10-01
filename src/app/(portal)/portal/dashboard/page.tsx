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
  CheckCircle,
  PlusCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/portal/role-badge";
import { ButtonLink } from "@/components/button-link";

export default function AdminDashboardPage() {
  const { products, inventoryUnits, transactions, serviceTickets, currentRole } =
    useStore();
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
    <div className="space-y-6 pb-12 sm:space-y-8">
      {/* Header dashboard */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Dashboard Admin &amp; Owner
            </h1>
            <RoleBadge role={currentRole} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Ringkasan performa penjualan, mutasi stok IMEI, dan pemantauan Meja Servis toko At Cell.
          </p>
        </div>

        {/* Stack di HP: dua CTA yang sharing lebar 375px menyisakan teks
            "Tambah Master Produk" yang membungkus dua baris. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <ButtonLink
            href="/portal/products"
            size="sm"
            className="h-11 w-full gap-1.5 text-sm font-semibold sm:h-8 sm:w-auto sm:text-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Tambah Master Produk</span>
          </ButtonLink>
          <ButtonLink
            href="/portal/pos"
            variant="outline"
            size="sm"
            className="h-11 w-full gap-1.5 text-sm font-semibold sm:h-8 sm:w-auto sm:text-xs"
          >
            <CreditCard className="w-4 h-4" />
            <span>Buka POS Kasir</span>
          </ButtonLink>
        </div>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Card className="border-line shadow-sm transition-colors hover:border-accent">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Total Omzet Penjualan
            </CardTitle>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-deep">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl font-black text-ink sm:text-2xl">
              {formatIDR(totalRevenue)}
            </div>
            <div className="mt-1 text-[11px] font-medium text-good">
              {/* Format uang selalu lewat formatIDR. Versi lama memakai
                  toLocaleString("id-ID") yang mencetak "Rp1.500.000" tanpa
                  pemisah ribuan gaya Indonesia, jadi angkanya beda dari
                  setiap harga lain di portal ini. */}
              Termasuk potongan trade-in {formatIDR(totalTradeInDeductions)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-line shadow-sm transition-colors hover:border-good">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Jumlah Transaksi POS
            </CardTitle>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-good-bg text-good">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl font-black text-ink sm:text-2xl">
              {totalTransactionsCount} Transaksi
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Faktur terbit dengan garansi IMEI resmi toko
            </p>
          </CardContent>
        </Card>

        <Card className="border-line shadow-sm transition-colors hover:border-warn">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Tiket Servis Aktif
            </CardTitle>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn-bg text-warn">
              <Wrench className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl font-black text-warn sm:text-2xl">
              {activeTickets.length} Unit
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
              <span className="font-semibold text-good">{completedTickets.length} selesai</span>
              <Link
                href="/portal/service"
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-deep hover:underline sm:min-h-0"
              >
                Buka meja servis <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-line shadow-sm transition-colors hover:border-bad">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 p-3 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Peringatan Stok Rendah
            </CardTitle>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bad-bg text-bad">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl font-black text-bad sm:text-2xl">
              {lowStockItems.length} Model
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Stok di bawah {stockThreshold} unit fisik yang berstatus tersedia
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Dua panel: daftar model stok menipis dan antrian tiket servis aktif */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="space-y-4 lg:col-span-6">
          <Card className="border-line shadow-sm">
            <CardHeader className="flex flex-col items-start gap-2 border-b border-line p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <AlertTriangle className="h-4 w-4 text-bad" />
                  <span>Daftar Model Stok Menipis</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Model dengan unit siap jual berada di bawah batas ambang
                </CardDescription>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto">
                <label htmlFor="stock-threshold" className="text-xs text-muted">
                  Batas:
                </label>
                <select
                  id="stock-threshold"
                  value={stockThreshold}
                  onChange={(e) => setStockThreshold(Number(e.target.value))}
                  className="h-11 flex-1 rounded-lg border border-line bg-paper px-3 text-base font-semibold text-ink sm:h-9 sm:flex-none sm:text-xs"
                >
                  <option value={1}>1 unit</option>
                  <option value={2}>2 unit</option>
                  <option value={3}>3 unit</option>
                  <option value={5}>5 unit</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {lowStockItems.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">
                  <CheckCircle className="mx-auto mb-2 h-8 w-8 text-good" />
                  <span>Semua model handphone memiliki stok aman di atas ambang batas.</span>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {lowStockItems.map((item) => (
                    <li
                      key={item.product.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-paper"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper text-xs font-bold text-muted">
                          {item.product.brand[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-ink">
                            {item.product.brand} {item.product.model_name}
                          </div>
                          <div className="text-[11px] text-muted">
                            Harga acuan: {formatIDR(item.product.default_price)}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full items-center gap-2 pl-[3.25rem] sm:w-auto sm:pl-0">
                        <Badge
                          variant={item.availableCount === 0 ? "destructive" : "warning"}
                          className="font-mono text-xs font-bold"
                        >
                          Sisa {item.availableCount} unit
                        </Badge>
                        <ButtonLink
                          href="/portal/inventory"
                          size="sm"
                          variant="outline"
                          className="ml-auto h-11 text-xs sm:h-8"
                        >
                          Tambah IMEI
                        </ButtonLink>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-6">
          <Card className="border-line shadow-sm">
            <CardHeader className="flex flex-col items-start gap-2 border-b border-line p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Wrench className="h-4 w-4 text-warn" />
                  <span>Antrian Tiket Servis Aktif</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Unit dalam tahapan diagnosa, persetujuan, atau pengerjaan
                </CardDescription>
              </div>
              <ButtonLink
                href="/portal/service"
                variant="ghost"
                size="sm"
                className="-ml-2 min-h-11 gap-1 text-sm text-accent-deep sm:min-h-0 sm:text-xs"
              >
                Lihat semua <ArrowRight className="h-3.5 w-3.5" />
              </ButtonLink>
            </CardHeader>
            <CardContent className="p-0">
              {activeTickets.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">
                  <CheckCircle className="mx-auto mb-2 h-8 w-8 text-good" />
                  <span>Tidak ada unit servis yang sedang tertunda atau dikerjakan saat ini.</span>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {activeTickets.slice(0, 5).map((ticket) => (
                    <li
                      key={ticket.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-4 transition-colors hover:bg-paper"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="break-all font-mono text-xs font-bold text-accent-deep">
                            {ticket.ticket_code}
                          </span>
                          <span className="text-sm font-semibold text-ink">
                            {ticket.device_model}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {ticket.customer_name} &middot; {ticket.issue_notes.slice(0, 35)}...
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="warning" className="text-[10px] font-bold">
                          {ticket.repair_status.replace("_", " ")}
                        </Badge>
                        <ButtonLink
                          href="/portal/service"
                          size="sm"
                          variant="ghost"
                          className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                          aria-label={`Buka meja servis ${ticket.ticket_code}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </ButtonLink>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Transaksi kasir terbaru. Dua tampilan dari sumber data yang sama
          (transactions): kartu bertumpuk di layar sempit, tabel di layar
          lebar. Tabel 7 kolom ini sekitar 810px, jadi di 375px hampir
          seluruhnya tersembunyi di balik overflow-x-auto. Breakpoint di xl, bukan md
          atau lg, karena di 768px tablet tabelnya masih 87px lebih lebar
          dari wadahnya dan kolom waktu terpotong. */}
      <Card className="border-line shadow-sm">
        <CardHeader className="flex flex-col items-start gap-2 border-b border-line p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Boxes className="h-4 w-4 text-accent-deep" />
              <span>Daftar Transaksi Kasir Terbaru</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Histori invoice penjualan smartphone fisik dan pemotongan tukar tambah
            </CardDescription>
          </div>
          <ButtonLink
            href="/portal/pos"
            size="sm"
            className="-ml-2 min-h-11 text-sm sm:min-h-0 sm:text-xs"
          >
            Transaksi baru
          </ButtonLink>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-line xl:hidden">
            {transactions.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">
                Belum ada transaksi kasir tercatat.
              </p>
            ) : (
              transactions.slice(0, 8).map((tx) => (
                <div key={tx.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {/* Kolom ini berjudul ID Faktur, jadi isinya harus nomor
                        faktur yang dipakai pelanggan di kasir, bukan id baris.
                        Id baris cuma angka urut internal (1, 2, 3) yang tidak
                        bisa dipakai melacak pembelian. Nomor faktur dibuat
                        trigger trg_invoice_number; transaksi lama dari mode
                        lokal belum punya nomor sehingga jatuh ke id. */}
                    <span className="break-all font-mono text-sm font-bold text-accent-deep">
                      {tx.invoice_number ?? `#${tx.id}`}
                    </span>
                    <span className="text-base font-black text-good">
                      {formatIDR(tx.final_payment ?? tx.final_paid_amount ?? 0)}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <dt className="text-muted">Pelanggan</dt>
                      <dd className="break-words font-medium text-ink">
                        {tx.customer_name || "Tamu walk-in"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Metode bayar</dt>
                      <dd className="font-mono font-bold text-ink">{tx.payment_method}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Waktu transaksi</dt>
                      <dd className="text-ink">{formatDate(tx.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Tukar tambah</dt>
                      <dd className="text-ink">
                        {tx.trade_in
                          ? `${tx.trade_in.original_brand_model} (${formatIDR(
                              tx.trade_in_deduction ?? 0
                            )})`
                          : "-"}
                      </dd>
                    </div>
                  </dl>

                  {tx.items?.map((item) => (
                    <p key={item.id} className="text-xs text-muted">
                      Unit #{item.unit_id}
                      {item.unit?.imei && (
                        <span className="ml-1 font-mono text-accent-deep">
                          IMEI {item.unit.imei}
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-paper text-[11px] font-semibold text-muted">
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
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      Belum ada transaksi kasir tercatat.
                    </td>
                  </tr>
                ) : (
                  transactions.slice(0, 8).map((tx) => (
                    <tr key={tx.id} className="hover:bg-paper/80">
                      <td className="whitespace-nowrap p-3 font-mono font-bold text-accent-deep">
                        {tx.invoice_number ?? `#${tx.id}`}
                      </td>
                      <td className="p-3 font-medium text-ink">
                        {tx.customer_name || "Tamu walk-in"}
                        {tx.customer_phone && (
                          <div className="font-mono text-[10px] text-muted">
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
                              <span className="block font-mono text-[10px] text-muted">
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
                            <div className="mt-0.5 text-[10px] text-muted">
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
                      <td className="p-3 text-sm font-black text-good">
                        {formatIDR(tx.final_payment ?? tx.final_paid_amount ?? 0)}
                      </td>
                      <td className="whitespace-nowrap p-3 text-muted">
                        {formatDate(tx.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
