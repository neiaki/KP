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

export default function TechnicianReportsPage() {
  const { serviceTickets, profiles } = useStore();

  const technicians = profiles.filter((p) => p.role === "technician");

  const completedTickets = serviceTickets.filter(
    (t) => t.repair_status === "completed" || t.repair_status === "picked_up"
  );
  const activeTickets = serviceTickets.filter(
    (t) => t.repair_status !== "completed" && t.repair_status !== "picked_up" && t.repair_status !== "cancelled"
  );

  const totalSparepartRevenue = serviceTickets.reduce((acc, t) => acc + t.sparepart_fee, 0);
  const totalLaborRevenue = serviceTickets.reduce((acc, t) => acc + t.labor_fee, 0);
  const totalServiceOmzet = totalSparepartRevenue + totalLaborRevenue;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Laporan Produktivitas & Meja Servis
            </h1>
            <Badge variant="purple" className="font-mono text-xs">
              ADMIN EXCLUSIVE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Analisis kecepatan penyelesaian reparasi (*turnaround*), pendapatan jasa, dan performa teknisi.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-line">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Unit Selesai Diperbaiki
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-good">
              {completedTickets.length} Unit
            </div>
            <p className="text-[11px] text-muted mt-1">Tingkat keberhasilan 100%</p>
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Unit Sedang Pengerjaan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-warn">
              {activeTickets.length} Unit
            </div>
            <p className="text-[11px] text-muted mt-1">Antrian di meja reparasi</p>
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Omzet Jasa Teknisi (Labor)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-accent-deep">
              {formatIDR(totalLaborRevenue)}
            </div>
            <p className="text-[11px] text-muted mt-1">Kontribusi laba bersih jasa</p>
          </CardContent>
        </Card>

        <Card className="border-line">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted">
              Total Omzet Meja Servis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-ink">
              {formatIDR(totalServiceOmzet)}
            </div>
            <p className="text-[11px] text-muted mt-1">Sparepart + Biaya pengerjaan</p>
          </CardContent>
        </Card>
      </div>

      {/* Technician Productivity Breakdown */}
      <Card className="border-line shadow-sm">
        <CardHeader className="pb-3 border-b border-line">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-accent-deep" />
            <span>Rincian Tiket Pengerjaan Tim Teknisi</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Daftar penanganan reparasi tiket masuk oleh teknisi aktif
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-paper text-muted font-semibold border-b border-line">
                <tr>
                  <th className="p-3">Kode Tiket</th>
                  <th className="p-3">Model Unit & Pemilik</th>
                  <th className="p-3">Keluhan Kerusakan</th>
                  <th className="p-3">Status Saat Ini</th>
                  <th className="p-3">Biaya Sparepart</th>
                  <th className="p-3">Biaya Jasa</th>
                  <th className="p-3">Total Biaya</th>
                  <th className="p-3">Terakhir Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {serviceTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-paper/80">
                    <td className="p-3 font-mono font-bold text-accent-deep">
                      {t.ticket_code}
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-ink">{t.device_model}</div>
                      <div className="text-[11px] text-muted">{t.customer_name}</div>
                    </td>
                    <td className="p-3 text-muted max-w-xs truncate">
                      {t.issue_notes}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          t.repair_status === "completed" || t.repair_status === "picked_up"
                            ? "success"
                            : "warning"
                        }
                        className="text-[10px] uppercase font-bold"
                      >
                        {t.repair_status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted">{formatIDR(t.sparepart_fee)}</td>
                    <td className="p-3 font-semibold text-ink">{formatIDR(t.labor_fee)}</td>
                    <td className="p-3 font-black text-accent-deep">{formatIDR(t.total_fee)}</td>
                    <td className="p-3 text-muted">{formatDate(t.updated_at)}</td>
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
