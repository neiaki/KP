"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import { RepairStatus, ServiceTicket } from "@/types";
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Printer,
  FileText,
  Camera,
  AlertTriangle,
  User,
  Smartphone,
  Phone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function TechnicianServicePage() {
  const { serviceTickets, updateServiceTicket } = useStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Modal editing form state
  const [editStatus, setEditStatus] = useState<RepairStatus>("received");
  const [sparepartFee, setSparepartFee] = useState<number>(0);
  const [laborFee, setLaborFee] = useState<number>(100000);
  const [notes, setNotes] = useState("");

  const handleOpenTicketModal = (ticket: ServiceTicket) => {
    setSelectedTicket(ticket);
    setEditStatus(ticket.repair_status);
    setSparepartFee(ticket.sparepart_fee);
    setLaborFee(ticket.labor_fee);
    setNotes(ticket.issue_notes);
  };

  useEffect(() => {
    if (!selectedTicket) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedTicket(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTicket]);

  const handleSaveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    updateServiceTicket(selectedTicket.id, {
      repair_status: editStatus,
      sparepart_fee: sparepartFee,
      labor_fee: laborFee,
      issue_notes: notes,
    });

    // Update active modal copy
    setSelectedTicket((prev) =>
      prev
        ? {
            ...prev,
            repair_status: editStatus,
            sparepart_fee: sparepartFee,
            labor_fee: laborFee,
            total_fee: sparepartFee + laborFee,
            issue_notes: notes,
          }
        : null
    );

    setNotice({ type: "success", text: "Tiket servis berhasil diperbarui!" });
  };

  const filteredTickets = serviceTickets.filter((t) => {
    const matchesSearch =
      t.ticket_code.toLowerCase().includes(search.toLowerCase()) ||
      t.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      t.device_model.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.repair_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses: { key: RepairStatus | "all"; label: string }[] = [
    { key: "all", label: "Semua" },
    { key: "received", label: "Received" },
    { key: "diagnosing", label: "Diagnosing" },
    { key: "waiting_approval", label: "Approval" },
    { key: "in_progress", label: "In Progress" },
    { key: "testing", label: "Testing" },
    { key: "completed", label: "Completed" },
    { key: "picked_up", label: "Picked Up" },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Meja Kerja Teknisi & Layanan Servis
            </h1>
            <Badge variant="warning" className="font-mono text-xs">
              TECHNICIAN ROLE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Kelola antrian reparasi, perbarui tahap workflow, catat suku cadang & rincian biaya jasa.
          </p>
        </div>

        <Link href="/portal/service/new">
          <Button className="gap-2 font-bold text-xs shadow-md">
            <Plus className="w-4 h-4" />
            <span>+ Daftarkan Tiket Servis Baru</span>
          </Button>
        </Link>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-xs font-semibold ${
            notice.type === "error"
              ? "border-bad/30 bg-bad-bg text-bad"
              : "border-good/30 bg-good-bg text-good"
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pesan"
            className="cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="bg-card p-4 rounded-xl border border-line shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-muted absolute left-3 top-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor tiket, nama, atau model..."
            className="pl-9 h-10 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {statuses.map((st) => (
            <button
              key={st.key}
              onClick={() => setStatusFilter(st.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                statusFilter === st.key
                  ? "bg-accent text-white shadow-xs"
                  : "bg-paper text-muted hover:bg-line"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTickets.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-card rounded-xl border border-dashed border-line">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted">Tidak ada tiket servis aktif</p>
            <p className="text-xs text-muted mt-1">Coba ubah filter atau daftarkan tiket masuk baru.</p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="border-line hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <CardHeader className="pb-3 border-b border-line">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-accent-deep bg-accent-soft px-2 py-0.5 rounded">
                    {ticket.ticket_code}
                  </span>
                  <Badge
                    variant={
                      ticket.repair_status === "completed" || ticket.repair_status === "picked_up"
                        ? "success"
                        : ticket.repair_status === "cancelled"
                        ? "destructive"
                        : "warning"
                    }
                    className="text-[10px] uppercase font-bold"
                  >
                    {ticket.repair_status.replace("_", " ")}
                  </Badge>
                </div>
                <CardTitle className="text-base font-bold text-ink mt-2">
                  {ticket.device_model}
                </CardTitle>
                <div className="text-[11px] font-mono text-muted">
                  IMEI/SN: {ticket.imei_or_sn}
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3 text-xs flex-1">
                <div className="flex items-center gap-2 text-muted">
                  <User className="w-3.5 h-3.5 text-muted" />
                  <span className="font-semibold">{ticket.customer_name}</span>
                  <span className="text-muted">({ticket.customer_phone})</span>
                </div>

                <div className="p-2.5 bg-paper rounded-lg text-muted leading-relaxed line-clamp-3">
                  <span className="font-bold text-ink block text-[10px] uppercase">
                    Keluhan:
                  </span>
                  {ticket.issue_notes}
                </div>

                <div className="pt-2 border-t border-line flex items-center justify-between text-[11px]">
                  <span className="text-muted">Total Biaya:</span>
                  <span className="font-black text-ink text-sm">
                    {formatIDR(ticket.total_fee)}
                  </span>
                </div>
              </CardContent>

              <div className="p-4 pt-0">
                <Button
                  onClick={() => handleOpenTicketModal(ticket)}
                  className="w-full text-xs font-semibold gap-1.5"
                  size="sm"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Kelola Meja Kerja</span>
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Ticket Details & Workflow Action Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Kelola tiket servis ${selectedTicket.ticket_code}`}
            className="bg-card rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-line max-h-[90vh] overflow-y-auto rise"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-accent-deep bg-accent-soft px-2 py-0.5 rounded">
                  {selectedTicket.ticket_code}
                </span>
                <h3 className="text-xl font-black text-ink mt-1">
                  {selectedTicket.device_model}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                aria-label="Tutup dialog tiket servis"
                className="text-muted hover:text-ink cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Customer & Device Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-paper rounded-xl text-xs">
              <div>
                <span className="text-muted block">Pelanggan:</span>
                <strong className="text-ink">{selectedTicket.customer_name}</strong>
              </div>
              <div>
                <span className="text-muted block">Nomor Telepon:</span>
                <strong className="text-ink">{selectedTicket.customer_phone}</strong>
              </div>
              <div>
                <span className="text-muted block">IMEI / SN:</span>
                <strong className="text-ink font-mono">{selectedTicket.imei_or_sn}</strong>
              </div>
            </div>

            {/* Editing Form */}
            <form onSubmit={handleSaveTicket} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-ink mb-1">
                  Tahapan Alur Kerja (Workflow Status):
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as RepairStatus)}
                  className="w-full bg-paper border border-line rounded-lg p-2.5 text-xs font-bold text-accent-deep uppercase font-mono"
                >
                  <option value="received">1. RECEIVED (Diterima)</option>
                  <option value="diagnosing">2. DIAGNOSING (Pengecekan Komponen)</option>
                  <option value="waiting_approval">3. WAITING_APPROVAL (Menunggu Persetujuan Biaya)</option>
                  <option value="in_progress">4. IN_PROGRESS (Sedang Dikerjakan)</option>
                  <option value="testing">5. TESTING (Uji Fungsi QC)</option>
                  <option value="completed">6. COMPLETED (Selesai Reparasi)</option>
                  <option value="picked_up">7. PICKED_UP (Sudah Diambil Pelanggan)</option>
                  <option value="cancelled">CANCELLED (Dibatalkan)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-muted mb-1">
                    Biaya Penggantian Suku Cadang (Sparepart):
                  </label>
                  <Input
                    type="number"
                    value={sparepartFee}
                    onChange={(e) => setSparepartFee(Number(e.target.value))}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-muted mb-1">
                    Biaya Jasa Pengerjaan Teknisi (Labor):
                  </label>
                  <Input
                    type="number"
                    value={laborFee}
                    onChange={(e) => setLaborFee(Number(e.target.value))}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="p-3 bg-accent-soft/70 rounded-xl border border-accent/20 flex items-center justify-between">
                <span className="font-bold text-ink">Total Biaya Reparasi:</span>
                <span className="text-lg font-black text-accent-deep">
                  {formatIDR(sparepartFee + laborFee)}
                </span>
              </div>

              <div>
                <label className="block font-bold text-muted mb-1">
                  Catatan Teknisi / Tindakan Perbaikan:
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-paper border border-line rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-line">
                <Link
                  href={`/id/tracking?ticket=${selectedTicket.ticket_code}`}
                  target="_blank"
                  className="text-accent-deep hover:underline inline-flex items-center gap-1 text-xs font-semibold"
                >
                  <span>Pratinjau Pelacakan Publik ↗</span>
                </Link>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedTicket(null)}
                  >
                    Tutup
                  </Button>
                  <Button type="submit" className="font-bold">
                    Simpan Perubahan Meja Kerja
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
