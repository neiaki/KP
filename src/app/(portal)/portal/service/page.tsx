"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { formatIDR } from "@/lib/utils";
import { RepairStatus, ServiceCostItem, ServiceTicket } from "@/types";
import { signPhotoPaths, uploadPhoto } from "@/lib/actions/storage";
import {
  Wrench,
  Plus,
  Search,
  CheckCircle2,
  User,
  ExternalLink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/portal/role-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/button-link";

export default function TechnicianServicePage() {
  const { serviceTickets, updateServiceTicket, inventoryUnits, updateUnitStatus, currentRole } =
    useStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Modal editing form state
  const [editStatus, setEditStatus] = useState<RepairStatus>("received");
  const [sparepartFee, setSparepartFee] = useState<number>(0);
  const [laborFee, setLaborFee] = useState<number>(100000);
  const [notes, setNotes] = useState("");

  // service_tickets.cost_breakdown sudah divalidasi (src/lib/validations.ts)
  // dan sudah dicetak di nota servis (src/lib/print-nota.ts), tapi tidak
  // pernah ada UI yang mengisinya. Semua faktura servis yang tercetak selama
  // ini karena itu hanya menunjukkan satu baris total.
  const [costItems, setCostItems] = useState<ServiceCostItem[]>([]);
  // Foto masuk sudah ada sejak intake; PRD menjanjikan bukti sebelum/sesudah,
  // jadi foto progres ditambahkan dari meja kerja, bukan hanya diantar.
  // Dua daftar dengan sengaja dipisah. progressPhotos berisi path yang
  // disimpan ke kolom photo_urls, sedangkan progressPhotoPreviews berisi
  // signed URL untuk pratinjau pada sesi berjalan saja. Kalau keduanya
  // dicampur, foto yang tersimpan ikut kedaluwarsa sepuluh menit kemudian.
  const [progressPhotos, setProgressPhotos] = useState<string[]>([]);
  const [progressPhotoPreviews, setProgressPhotoPreviews] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const MAX_COST_ITEMS = 50;
  const MAX_PHOTOS = 10;

  /*
   * Unit inventaris yang terhubung dengan tiket ini.
   *
   * service_tickets tidak punya kolom unit_id, jadi satu-satunya penghubung
   * yang benar adalah IMEI: tiket yang bring-device punya imei_or_sn yang sama
   * dengan unit di inventaris, dan itulah angka yang menempel di perangkatnya.
   * Cocokkan dibuat persis setelah trim, bukan dengan endsWith atau contains,
   * supaya unit yang kebetulan punya digit serupa tidak ikut berubah statusnya.
   *
   * Control ini ada karena /portal/inventory hanya untuk admin dan sales
   * (src/lib/access.ts), jadi tanpa sini teknisi tidak punya jalan masuk maupun
   * jalan keluar dari in_service sama sekali, dan unit yang sudah selesai
   * diperbaiki menggantung sampai orang lain turun tangan.
   */
  const imeiTiket = selectedTicket?.imei_or_sn?.trim() ?? "";
  const unitTiket = imeiTiket
    ? inventoryUnits.find((unit) => unit.imei === imeiTiket)
    : undefined;

  /**
   * Hanya dua status di sini: in_service untuk masuk dan returned untuk keluar.
   * Itu persis UNIT_STATUS_OLEH_TEKNISI di src/lib/validations.ts, jadi
   * halaman ini tidak pernah bisa meminta status yang akan ditolak gerbang
   * di sisi server. available sengaja tidak ada di sini justru karena
   * status itu menerbitkan unit ke etalase publik.
   */
  const handleUnitService = async (status: "in_service" | "returned") => {
    if (!unitTiket) return;
    try {
      await updateUnitStatus(unitTiket.id, status);
      setNotice({
        type: "success",
        text: `Unit ${unitTiket.imei} ditandai ${status}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal mengubah status unit.",
      });
    }
  };

  /**
   * Rincian harus sama dengan yang ditagihkan, jadi begitu ada baris
   * biaya, aggregate sparepart dan labor dihitung ulang dari baris itu.
   * Daftar kosong tidak mengubah apa pun, supaya tiket lama yang biayanya
   * sudah diisi tapi rinciannya belum ada tidak jadi nol hanya karena
   * statusnya diperbarui.
   */
  const syncFeesFromItems = (items: ServiceCostItem[]) => {
    if (items.length === 0) return;
    setSparepartFee(
      items.filter((i) => i.type === "sparepart").reduce((t, i) => t + i.cost, 0)
    );
    setLaborFee(
      items.filter((i) => i.type === "labor").reduce((t, i) => t + i.cost, 0)
    );
  };

  const addCostItem = (type: ServiceCostItem["type"]) => {
    if (costItems.length >= MAX_COST_ITEMS) {
      setNotice({ type: "error", text: `Maksimal ${MAX_COST_ITEMS} baris biaya per tiket.` });
      return;
    }
    const next: ServiceCostItem[] = [
      ...costItems,
      { id: crypto.randomUUID(), name: "", cost: 0, type },
    ];
    setCostItems(next);
    syncFeesFromItems(next);
  };

  const updateCostItem = (id: string, patch: Partial<ServiceCostItem>) => {
    const next = costItems.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setCostItems(next);
    syncFeesFromItems(next);
  };

  const removeCostItem = (id: string) => {
    const next = costItems.filter((item) => item.id !== id);
    setCostItems(next);
    syncFeesFromItems(next);
  };

  const handleProgressPhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (progressPhotos.length >= MAX_PHOTOS) {
      setNotice({ type: "error", text: `Maksimal ${MAX_PHOTOS} foto untuk satu tiket.` });
      return;
    }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadPhoto(formData, { bucket: "service-photos" });
      if (!result.ok) {
        setNotice({ type: "error", text: result.error });
        return;
      }
      setProgressPhotos((prev) => [...prev, result.data.path]);
      setProgressPhotoPreviews((prev) => [...prev, result.data.url]);
    } catch {
      setNotice({ type: "error", text: "Gagal mengunggah foto. Coba lagi." });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleOpenTicketModal = async (ticket: ServiceTicket) => {
    setSelectedTicket(ticket);
    setEditStatus(ticket.repair_status);
    setSparepartFee(ticket.sparepart_fee);
    setLaborFee(ticket.labor_fee);
    setNotes(ticket.technician_notes ?? "");
    setCostItems(ticket.cost_breakdown ?? []);

    const refs = ticket.photo_urls ?? [];
    setProgressPhotos(refs);
    // Pratinjau perlu URL bertanda tangan yang baru, karena signed URL punya
    // masa berlaku. Kegagalan di sini tidak memblokir modal: path-nya tetap
    // tersimpan dan placeholder di bawah akan menjelaskan fotonya ada tapi
    // tidak bisa dimuat.
    setProgressPhotoPreviews(refs.map((r) => (/^https?:\/\//i.test(r) ? r : "")));
    if (!refs.some((r) => !/^https?:\/\//i.test(r))) return;
    const signed = await signPhotoPaths("service-photos", refs);
    const peta = signed.ok ? signed.data : {};
    setProgressPhotoPreviews(refs.map((r) => peta[r] ?? (/^https?:\/\//i.test(r) ? r : "")));
  };

  useEffect(() => {
    if (!selectedTicket) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedTicket(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTicket]);

  const handleSaveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    // Baris biaya yang belum diisi namanya akan ditolak costItemSchema, jadi
    // dicegah di sini dengan pesan yang menunjuk baris bermasalahnya.
    const badItem = costItems.find((item) => item.name.trim().length < 2);
    if (badItem) {
      setNotice({ type: "error", text: "Nama biaya minimal 2 huruf." });
      return;
    }

    try {
      const costBreakdown = costItems.map((item) => ({
        ...item,
        name: item.name.trim(),
      }));

      // Satu jalur tulis saja: store meneruskan rincian biaya dan foto
      // progres ke updateTicket, jadi halaman tidak perlu memanggil Server
      // Action-nya sendiri. Dua jalur tulis saling menimpa urutan dan membuat
      // salinan tiket di store setengah jadi.

      await updateServiceTicket(selectedTicket.id, {
        repair_status: editStatus,
        sparepart_fee: sparepartFee,
        labor_fee: laborFee,
        technician_notes: notes,
        cost_breakdown: costBreakdown,
        photo_urls: progressPhotos,
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
              technician_notes: notes,
              cost_breakdown: costBreakdown,
              photo_urls: progressPhotos,
            }
          : null
      );

      setNotice({ type: "success", text: "Tiket servis berhasil diperbarui!" });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal memperbarui tiket servis.",
      });
    }
  };

  const filteredTickets = serviceTickets.filter((t) => {
    const matchesSearch =
      t.ticket_code.toLowerCase().includes(search.toLowerCase()) ||
      t.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      t.device_model.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.repair_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  /* Peta status perbaikan ke Bahasa Indonesia.
     Tipenya Record<RepairStatus, string>, jadi kalau enum RepairStatus di
     src/types/index.ts nambah nilai baru, tsc gagal di sini sampai labelnya
     ikut ditambah. Daftar chip dan isi dropdown di bawah keduanya dibangun
     dari peta ini, jadi keduanya tidak bisa lagi berbeda dari enum. */
  const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
    received: "Diterima",
    diagnosing: "Pengecekan komponen",
    waiting_approval: "Menunggu persetujuan biaya",
    in_progress: "Sedang dikerjakan",
    testing: "Uji fungsi QC",
    completed: "Selesai reparasi",
    picked_up: "Sudah diambil pelanggan",
    cancelled: "Dibatalkan",
  };

  const statuses: { key: RepairStatus | "all"; label: string }[] = [
    { key: "all", label: "Semua" },
    ...(Object.entries(REPAIR_STATUS_LABEL) as [RepairStatus, string][]).map(
      ([key, label]) => ({ key, label })
    ),
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Meja Kerja Teknisi &amp; Layanan Servis
            </h1>
            <RoleBadge role={currentRole} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Kelola antrian reparasi, perbarui tahap workflow, catat suku cadang &amp; rincian biaya jasa.
          </p>
        </div>

        <ButtonLink
          href="/portal/service/new"
          className="w-full gap-2 text-sm font-bold shadow-md sm:w-auto sm:text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Daftarkan Tiket Servis Baru</span>
        </ButtonLink>
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

      {/* Pencarian & filter status */}
      <div className="flex flex-col items-stretch gap-4 rounded-xl border border-line bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-muted absolute left-3 top-3.5" />
          <label htmlFor="service-search" className="sr-only">
            Cari tiket servis
          </label>
          <Input
            id="service-search"
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nomor tiket, nama, atau model..."
            className="pl-9 sm:text-xs"
          />
        </div>

        {/* min-h-11 di HP: chip status ini yang dipakai teknisi untuk
            memisahkan antrian, dan versi lama 40px sering salah ketuk. */}
        <div className="-mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-1 md:w-auto md:flex-wrap md:overflow-visible">
          {statuses.map((st) => (
            <button
              key={st.key}
              type="button"
              onClick={() => setStatusFilter(st.key)}
              aria-pressed={statusFilter === st.key}
              className={`min-h-11 shrink-0 cursor-pointer rounded-full px-3 text-xs font-semibold transition-colors md:min-h-0 md:py-1.5 ${
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

      {/* Daftar tiket servis */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {filteredTickets.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-line bg-card py-16 text-center">
            <Wrench className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-muted">Tidak ada tiket servis aktif</p>
            <p className="mt-1 text-xs text-muted">Coba ubah filter atau daftarkan tiket masuk baru.</p>
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <Card
              key={ticket.id}
              className="flex flex-col justify-between border-line transition-shadow hover:shadow-md"
            >
              <CardHeader className="border-b border-line pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all rounded bg-accent-soft px-2 py-0.5 font-mono text-xs font-black text-accent-deep">
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
                    className="text-[10px] font-bold"
                  >
                    {ticket.repair_status.replace("_", " ")}
                  </Badge>
                </div>
                <CardTitle className="mt-2 text-base font-bold text-ink">
                  {ticket.device_model}
                </CardTitle>
                <div className="break-all font-mono text-[11px] text-muted">
                  IMEI/SN: {ticket.imei_or_sn}
                </div>
              </CardHeader>

              <CardContent className="flex-1 space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted">
                  <User className="h-4 w-4 shrink-0 text-muted" />
                  <span className="font-semibold">{ticket.customer_name}</span>
                  <span className="font-mono text-xs">({ticket.customer_phone})</span>
                </div>

                <div className="rounded-lg bg-paper p-2.5 leading-relaxed text-muted line-clamp-3">
                  <span className="block text-[11px] font-bold text-ink">
                    Keluhan
                  </span>
                  {ticket.issue_notes}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-line pt-2 text-xs">
                  <span className="text-muted">Total Biaya:</span>
                  <span className="text-sm font-black text-ink">
                    {formatIDR(ticket.total_fee)}
                  </span>
                </div>
              </CardContent>

              <div className="p-4 pt-0">
                <Button
                  onClick={() => handleOpenTicketModal(ticket)}
                  className="w-full gap-1.5 text-sm font-semibold sm:text-xs"
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

      {/* Dialog meja kerja. Isinya jauh lebih tinggi dari layar HP, jadi
          headernya dikunci di atas, formnya yang menggulir, dan footer
          tombolnya menempel di bawah supaya "Simpan Perubahan" selalu
          terjangkau tanpa harus menggulir sampai ujung. */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            onClick={() => setSelectedTicket(null)}
            aria-label="Tutup dialog tiket servis"
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-xs"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Kelola tiket servis ${selectedTicket.ticket_code}`}
            className="rise relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl border border-line bg-card shadow-2xl sm:max-h-[90dvh] sm:rounded-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line p-4 pb-3">
              <div className="min-w-0">
                <span className="inline-block break-all rounded bg-accent-soft px-2 py-0.5 font-mono text-xs font-bold text-accent-deep">
                  {selectedTicket.ticket_code}
                </span>
                <h3 className="mt-1 text-lg font-black text-ink sm:text-xl">
                  {selectedTicket.device_model}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                aria-label="Tutup dialog tiket servis"
                className="-mr-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink sm:h-10 sm:w-10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 p-3 text-sm sm:grid-cols-3">
              <div>
                <span className="block text-xs text-muted">Pelanggan:</span>
                <strong className="break-words text-ink">{selectedTicket.customer_name}</strong>
              </div>
              <div>
                <span className="block text-xs text-muted">Nomor Telepon:</span>
                <strong className="break-all text-ink">{selectedTicket.customer_phone}</strong>
              </div>
              <div>
                <span className="block text-xs text-muted">IMEI / SN:</span>
                <strong className="break-all font-mono text-ink">{selectedTicket.imei_or_sn}</strong>
              </div>
            </div>

            {/* Unit inventaris milik tiket ini. Hanya dirender kalau ada
                unit dengan IMEI yang sama, jadi tiket servis untuk perangkat
                milik pelanggan (bukan stok toko) tidak pernah menampilkan
                kontrol yang tak berguna. */}
            {unitTiket && (
              <div className="mx-3 mb-1 rounded-lg border border-line bg-paper p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="block text-xs text-muted">Unit inventaris:</span>
                    <strong className="font-mono text-ink">{unitTiket.imei}</strong>
                    <span className="ml-2 text-xs text-muted">
                      status sekarang: {unitTiket.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unitTiket.status === "sold" ? (
                      <span className="text-xs text-muted">
                        Unit sudah sold dan terminal, statusnya tidak bisa diubah.
                      </span>
                    ) : (
                      <>
                        {unitTiket.status !== "in_service" && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleUnitService("in_service")}
                          >
                            <Wrench className="mr-2 h-4 w-4" />
                            Masukkan servis
                          </Button>
                        )}
                        {unitTiket.status === "in_service" && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleUnitService("returned")}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Selesai, dikembalikan
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form
              id="ticket-workbench-form"
              onSubmit={handleSaveTicket}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t border-line p-4 text-sm"
            >
              <div>
                <label
                  htmlFor="ticket-status"
                  className="mb-1 block text-xs font-bold text-ink"
                >
                  Tahapan alur kerja
                </label>
                {/* Tanpa prefiks angka: aturan proyek melarang label bernomor
                    dan eyebrow kapital, dan urutan tahap sudah terlihat dari
                    urutan pilihannya. Opsi dibangun dari peta label yang sama
                    dengan chip filter di atas, jadi keduanya tidak mungkin
                    berbeda atau lupa satu status. */}
                <select
                  id="ticket-status"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as RepairStatus)}
                  className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base font-bold text-accent-deep sm:h-10 sm:text-sm"
                >
                  {(
                    Object.entries(REPAIR_STATUS_LABEL) as [RepairStatus, string][]
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="ticket-sparepart"
                    className="mb-1 block text-xs font-bold text-muted"
                  >
                    Biaya Penggantian Suku Cadang (Sparepart)
                  </label>
                  <Input
                    id="ticket-sparepart"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={sparepartFee}
                    onChange={(e) => setSparepartFee(Number(e.target.value))}
                    className="sm:text-xs"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ticket-labor"
                    className="mb-1 block text-xs font-bold text-muted"
                  >
                    Biaya Jasa Pengerjaan Teknisi (Labor)
                  </label>
                  <Input
                    id="ticket-labor"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={laborFee}
                    onChange={(e) => setLaborFee(Number(e.target.value))}
                    className="sm:text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-bold text-ink">Rincian Biaya (Nota)</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs sm:flex-none"
                      onClick={() => addCostItem("sparepart")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Suku cadang
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs sm:flex-none"
                      onClick={() => addCostItem("labor")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Jasa
                    </Button>
                  </div>
                </div>

                {costItems.length === 0 ? (
                  <p className="text-[11px] text-muted">
                    Belum ada rincian. Nota servis hanya akan menampilkan baris total.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {costItems.map((item) => (
                      /* Satu kolom di HP: baris lama memakai w-32 untuk nominal,
                         jadi kolom nama hanya tersisa sekitar 120px di 375px
                         dan setiap baris biaya mustahil dibaca sambil memegang
                         unit. */
                      <li
                        key={item.id}
                        className="grid grid-cols-1 items-end gap-2 sm:flex sm:items-end sm:gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <label
                            className="mb-1 block text-xs font-semibold text-muted"
                            htmlFor={`cost-name-${item.id}`}
                          >
                            {item.type === "sparepart" ? "Suku cadang" : "Jasa"}
                          </label>
                          <Input
                            id={`cost-name-${item.id}`}
                            value={item.name}
                            onChange={(e) => updateCostItem(item.id, { name: e.target.value })}
                            className="sm:text-xs"
                          />
                        </div>
                        <div className="w-full sm:w-32">
                          <label
                            className="mb-1 block text-xs font-semibold text-muted"
                            htmlFor={`cost-amount-${item.id}`}
                          >
                            Nominal
                          </label>
                          <Input
                            id={`cost-amount-${item.id}`}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            value={item.cost}
                            onChange={(e) =>
                              updateCostItem(item.id, { cost: Number(e.target.value) })
                            }
                            className="font-mono sm:text-xs"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full text-xs sm:w-auto"
                          aria-label={`Hapus baris biaya ${item.name || "tanpa nama"}`}
                          onClick={() => removeCostItem(item.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span className="sm:hidden">Hapus baris</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted">
                  Tambah baris biaya, aggregate sparepart dan labor di atas ikut dihitung ulang.
                </p>
              </div>

              <div className="rounded-xl border border-dashed border-line bg-paper p-3">
                <label
                  className="block font-semibold text-muted mb-1"
                  htmlFor="service-progress-photo"
                >
                  Foto progres perbaikan (maksimal {MAX_PHOTOS} file)
                </label>
                <input
                  id="service-progress-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void handleProgressPhotoChange(event)}
                  disabled={uploadingPhoto}
                  className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                />
                <p className="mt-1 text-[11px] text-muted">
                  {uploadingPhoto
                    ? "Mengunggah foto..."
                    : `${progressPhotos.length} foto siap disimpan`}
                </p>
                {progressPhotos.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {progressPhotos.map((ref, i) => {
                      const preview = progressPhotoPreviews[i];
                      return (
                        <li key={ref} className="h-14 w-14">
                          {preview ? (
                            <>
                              {/* Ukuran gambarnya tidak diketahui, jadi
                                  next/image tidak bisa menentukan dimensi dan
                                  hanya menambah satu optimizer round-trip per
                                  foto. Sama seperti foto tiket di halaman lacak. */}
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={preview}
                                alt="Foto progres perbaikan"
                                loading="lazy"
                                className="h-14 w-14 rounded-lg border border-line object-cover"
                              />
                            </>
                          ) : (
                            // Pratinjau kosong berarti signed URL gagal dibuat
                            // atau sudah kedaluwarsa. Path-nya tetap tersimpan,
                            // jadi jangan dihapus diam-diam.
                            <span
                              title="Foto tersimpan tapi tidak bisa dimuat. Muat ulang halaman."
                              className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line text-center text-[10px] leading-tight text-muted"
                            >
                              tidak bisa dimuat
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-accent/20 bg-accent-soft/70 p-3">
                <span className="text-sm font-bold text-ink">Total Biaya Reparasi:</span>
                <span className="text-xl font-black text-accent-deep">
                  {formatIDR(sparepartFee + laborFee)}
                </span>
              </div>

              <div>
                <label
                  htmlFor="ticket-notes"
                  className="mb-1 block text-xs font-bold text-muted"
                >
                  Catatan Teknisi / Tindakan Perbaikan
                </label>
                <textarea
                  id="ticket-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-line bg-paper p-3 text-base text-ink sm:text-sm"
                />
              </div>
            </form>

            {/* Footer dialog: tombol Simpan tidak ikut menggulir bersama form,
                jadi teknisi tidak perlu menggulir melewati seluruh rincian biaya
                hanya untuk menyimpan. */}
            <div className="border-t border-line bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Link
                href={`/id/tracking?ticket=${selectedTicket.ticket_code}`}
                target="_blank"
                className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-deep hover:underline sm:min-h-0 sm:mb-0 sm:text-xs"
              >
                <span>Pratinjau pelacakan publik</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedTicket(null)}
                  className="w-full sm:w-auto"
                >
                  Tutup
                </Button>
                <Button type="submit" form="ticket-workbench-form" className="w-full font-bold sm:w-auto">
                  Simpan Perubahan Meja Kerja
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
