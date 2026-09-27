"use client";

import React from "react";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import {
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Wrench,
  TrendingUp,
  UserCheck,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/portal/role-badge";

export default function TechnicianReportsPage() {
  const { serviceTickets, profiles, currentRole } = useStore();

  const technicians = profiles.filter((p) => p.role === "technician");

  const completedTickets = serviceTickets.filter(
    (t) => t.repair_status === "completed" || t.repair_status === "picked_up"
  );
  const activeTickets = serviceTickets.filter(
    (t) => t.repair_status !== "completed" && t.repair_status !== "picked_up" && t.repair_status !== "cancelled"
  );


  /* Tiket batal dihitung sebagai tiket yang tidak selesai, jadi angka ini
     jujur soal hasil kerja meja servis, bukan cuma Technician happy path. */
  const totalTickets = serviceTickets.length;
  const successRate =
    totalTickets === 0
      ? 0
      : Math.round((completedTickets.length / totalTickets) * 100);
  const totalSparepartRevenue = serviceTickets.reduce((acc, t) => acc + t.sparepart_fee, 0);
  const totalLaborRevenue = serviceTickets.reduce((acc, t) => acc + t.labor_fee, 0);
  const totalServiceOmzet = totalSparepartRevenue + totalLaborRevenue;

  return (
    <div className="space-y-6 pb-12 sm:space-y-8">
      {/* Header laporan */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Laporan Produktivitas &amp; Meja Servis
          </h1>
          <RoleBadge role={currentRole} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Analisis kecepatan penyelesaian reparasi, pendapatan jasa, dan performa teknisi.
        </p>
      </div>

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Card className="border-line">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Total Unit Selesai Diperbaiki
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl font-black text-good sm:text-2xl">
              {completedTickets.length} Unit
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {/* Dihitung dari data, bukan ditulis tangan. Versi lama
                  menampilkan "Tingkat keberhasilan 100%" di bawah angka yang
                  bisa saja 0, jadi halaman ini pernah mengklaim 100% padahal
                  tidak ada tiket yang pernah selesai. */}
              {totalTickets === 0
                ? "Belum ada tiket servis yang tercatat"
                : `${successRate}% tiket selesai dari ${totalTickets} tiket masuk`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Unit Sedang Pengerjaan
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-xl font-black text-warn sm:text-2xl">
              {activeTickets.length} Unit
            </div>
            <p className="mt-1 text-[11px] text-muted">Antrian di meja reparasi</p>
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Omzet Jasa Teknisi (Labor)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-base font-black text-accent-deep sm:text-2xl">
              {formatIDR(totalLaborRevenue)}
            </div>
            <p className="mt-1 text-[11px] text-muted">Kontribusi laba bersih jasa</p>
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle className="text-xs font-bold text-muted">
              Total Omzet Meja Servis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            <div className="text-base font-black text-ink sm:text-2xl">
              {formatIDR(totalServiceOmzet)}
            </div>
            <p className="mt-1 text-[11px] text-muted">Suku cadang + biaya pengerjaan</p>
          </CardContent>
        </Card>
      </div>

      {/* Rincian tiket tim teknisi. Kartu bertumpuk di layar sempit, tabel
          di layar lebar, keduanya dari serviceTickets yang sama. Tabel 8
          kolom ini lebarnya sekitar 900px, jadi di 375px kolom biaya sama
          sekali tidak terlihat. Breakpoint di xl, bukan md atau lg, karena di
          1024px sidebar memakan 256px dan tabel masih 183px lebih lebar dari wadahnya. */}
      <Card className="border-line shadow-sm">
        <CardHeader className="border-b border-line p-4 pb-3 sm:p-6 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <UserCheck className="h-5 w-5 text-accent-deep" />
            <span>Rincian Tiket Pengerjaan Tim Teknisi</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Daftar penanganan reparasi tiket masuk oleh teknisi aktif
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-line xl:hidden">
            {serviceTickets.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">
                Belum ada tiket servis yang tercatat.
              </p>
            ) : (
              serviceTickets.map((t) => (
                <div key={t.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs font-bold text-accent-deep">
                        {t.ticket_code}
                      </p>
                      <p className="text-sm font-bold text-ink">{t.device_model}</p>
                      <p className="text-[11px] text-muted">{t.customer_name}</p>
                    </div>
                    <Badge
                      variant={
                        t.repair_status === "completed" || t.repair_status === "picked_up"
                          ? "success"
                          : "warning"
                      }
                      className="shrink-0 text-[10px] font-bold"
                    >
                      {t.repair_status.replace("_", " ")}
                    </Badge>
                  </div>

                  <p className="rounded-lg bg-paper p-2.5 text-xs text-muted">
                    {t.issue_notes}
                  </p>

                  <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
                    <div>
                      <dt className="text-muted">Sparepart</dt>
                      <dd className="text-ink">{formatIDR(t.sparepart_fee)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Jasa</dt>
                      <dd className="font-semibold text-ink">{formatIDR(t.labor_fee)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Total</dt>
                      <dd className="font-black text-accent-deep">{formatIDR(t.total_fee)}</dd>
                    </div>
                  </dl>

                  <p className="text-[11px] text-muted">
                    Terakhir update: {formatDate(t.updated_at)}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-paper font-semibold text-muted">
                <tr>
                  <th className="p-3">Kode Tiket</th>
                  <th className="p-3">Model Unit &amp; Pemilik</th>
                  <th className="p-3">Keluhan Kerusakan</th>
                  <th className="p-3">Status Saat Ini</th>
                  <th className="p-3">Biaya Sparepart</th>
                  <th className="p-3">Biaya Jasa</th>
                  <th className="p-3">Total Biaya</th>
                  <th className="p-3">Terakhir Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {serviceTickets.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted">
                      Belum ada tiket servis yang tercatat.
                    </td>
                  </tr>
                ) : (
                  serviceTickets.map((t) => (
                    <tr key={t.id} className="hover:bg-paper/80">
                      <td className="p-3 font-mono font-bold text-accent-deep">
                        {t.ticket_code}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-ink">{t.device_model}</div>
                        <div className="text-[11px] text-muted">{t.customer_name}</div>
                      </td>
                      <td className="max-w-xs truncate p-3 text-muted">{t.issue_notes}</td>
                      <td className="p-3">
                        <Badge
                          variant={
                            t.repair_status === "completed" || t.repair_status === "picked_up"
                              ? "success"
                              : "warning"
                          }
                          className="text-[10px] font-bold"
                        >
                          {t.repair_status.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted">{formatIDR(t.sparepart_fee)}</td>
                      <td className="p-3 font-semibold text-ink">{formatIDR(t.labor_fee)}</td>
                      <td className="p-3 font-black text-accent-deep">{formatIDR(t.total_fee)}</td>
                      <td className="p-3 text-muted">{formatDate(t.updated_at)}</td>
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
