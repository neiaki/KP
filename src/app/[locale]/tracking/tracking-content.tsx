"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useStore } from "@/context/store-context";
import { Locale } from "@/lib/translations";
import { formatIDR, formatDate } from "@/lib/utils";
import { openNotaPrintWindow, buildServiceNotaHtml } from "@/lib/print-nota";
import { trackTicketPublic } from "@/lib/actions/service";
import { RepairStatus, ServiceTicket } from "@/types";
import {
  Search,
  Check,
  AlertCircle,
  Printer,
  ShieldCheck,
  Smartphone,
  Copy,
  FileText,
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const WORKFLOW_STEPS: { key: RepairStatus; verbId: string; verbEn: string; descId: string; descEn: string }[] = [
  { key: "received", verbId: "HP diterima di konter", verbEn: "Received at the counter", descId: "HP sudah kami terima dan dapat antrean teknisi.", descEn: "Your phone is checked in and queued." },
  { key: "diagnosing", verbId: "Dicek kerusakannya", verbEn: "Being diagnosed", descId: "Teknisi tes komponen untuk tahu rusaknya apa.", descEn: "Technician tests parts to find the fault." },
  { key: "waiting_approval", verbId: "Tunggu persetujuan biaya", verbEn: "Waiting for your approval", descId: "Rincian sparepart dan jasa diinfokan dulu.", descEn: "Sparepart and labor quoted before any work." },
  { key: "in_progress", verbId: "Dikerjakan", verbEn: "Being repaired", descId: "Ganti komponen dan perbaiki hardware atau software.", descEn: "Parts replaced, hardware or software fixed." },
  { key: "testing", verbId: "Dites semua fungsi", verbEn: "Testing every function", descId: "Layar, kamera, sinyal dan charging dicek.", descEn: "Screen, camera, signal and charging checked." },
  { key: "completed", verbId: "Beres, tinggal diambil", verbEn: "Done, ready for pickup", descId: "Datang ke toko dengan membawa nota.", descEn: "Come to the shop with your receipt." },
  { key: "picked_up", verbId: "Sudah diambil", verbEn: "Picked up", descId: "HP diserahkan kembali plus kartu garansi servis.", descEn: "Phone handed back with service warranty card." },
];

export function Lightbox({
  photos,
  index,
  locale,
  ticketCode,
  onClose,
  onMove,
}: {
  photos: string[];
  index: number;
  locale: Locale;
  ticketCode: string;
  onClose: () => void;
  onMove: (dir: 1 | -1) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onMove(1);
      if (e.key === "ArrowLeft") onMove(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onMove]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label={locale === "en" ? "Close photo viewer" : "Tutup penampil foto"}
        className="absolute inset-0 cursor-zoom-out bg-black/85"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${locale === "en" ? "Photo" : "Foto"} ${index + 1} ${locale === "en" ? "of" : "dari"} ${photos.length} (${ticketCode})`}
        className="relative w-full max-w-3xl"
      >
        <img
          key={photos[index]}
          src={photos[index]}
          alt={`${locale === "en" ? "Repair documentation" : "Dokumentasi servis"} ${index + 1}`}
          className="max-h-[80vh] w-full rounded-xl object-contain"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="font-mono text-xs font-bold text-white">
            {index + 1} / {photos.length}
          </p>
          <div className="flex items-center gap-2">
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => onMove(-1)}
                  aria-label={locale === "en" ? "Previous photo" : "Foto sebelumnya"}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(1)}
                  aria-label={locale === "en" ? "Next photo" : "Foto berikutnya"}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={locale === "en" ? "Close photo viewer" : "Tutup penampil foto"}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-sm font-extrabold text-ink transition-colors hover:bg-line"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrackingContent({ locale }: { locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTicket = searchParams.get("ticket") || "";

  const { serviceTickets, storeSettings, isLiveBackend } = useStore();
  const [ticketInput, setTicketInput] = useState(initialTicket);
  const [hasSearched, setHasSearched] = useState(initialTicket !== "");
  const [remoteTicket, setRemoteTicket] = useState<ServiceTicket | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchRequestId = useRef(0);
  const [copied, setCopied] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Hasil pencarian diturunkan saat render (bukan state + effect),
  // sehingga tidak ada setState sinkron di dalam effect.
  const normalized = hasSearched ? ticketInput.trim().toLowerCase() : "";
  const localTicket = normalized
    ? serviceTickets.find((t) => t.ticket_code.toLowerCase() === normalized) || null
    : null;
  const activeTicket = isLiveBackend ? remoteTicket : localTicket;

  const performSearch = useCallback(async (code: string) => {
    const normalizedCode = code.trim();
    if (!normalizedCode) return;
    const requestId = ++searchRequestId.current;
    setHasSearched(true);
    setSearchError(null);

    if (!isLiveBackend) return;

    try {
      const result = await trackTicketPublic(normalizedCode);
      if (requestId !== searchRequestId.current) return;
      if (!result.ok) {
        setRemoteTicket(null);
        setSearchError(result.error);
        return;
      }

      const data = result.data;
      setRemoteTicket({
      id: 0,
      ticket_code: data.ticket_code,
      customer_id: null,
      customer_name: "",
      customer_phone: "",
      technician_id: null,
      device_model: data.device_model,
      device_name: data.device_model,
      imei_or_sn: data.imei_or_sn,
      imei: data.imei_or_sn,
      issue_notes: "",
      repair_status: data.repair_status,
      photo_urls: [],
      sparepart_fee: 0,
      labor_fee: 0,
      total_fee: 0,
      warranty_days: data.warranty_days,
      cost_breakdown: [],
      created_at: data.created_at,
      updated_at: data.updated_at,
      });
    } catch {
      if (requestId !== searchRequestId.current) return;
      setRemoteTicket(null);
      setSearchError("Layanan pelacakan sedang tidak dapat dihubungi. Coba lagi sebentar.");
    }
  }, [isLiveBackend]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketInput.trim()) return;
    router.push(`/${locale}/tracking?ticket=${encodeURIComponent(ticketInput.trim())}`);
    await performSearch(ticketInput);
  };

  useEffect(() => {
    if (!isLiveBackend || !initialTicket.trim()) return;
    const frame = window.requestAnimationFrame(() => {
      void performSearch(initialTicket);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialTicket, isLiveBackend, performSearch]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentStepIndex = activeTicket
    ? WORKFLOW_STEPS.findIndex((s) => s.key === activeTicket.repair_status)
    : -1;

  const imeiDisplay = activeTicket
    ? activeTicket.imei_or_sn
      ? activeTicket.imei_or_sn.slice(-4)
      : activeTicket.imei
        ? activeTicket.imei.slice(-4)
        : ""
    : "";

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {locale === "en" ? "Where is my repaired phone?" : "HP saya sudah sampai mana?"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {locale === "en"
            ? "Type the code printed on your receipt. No login needed."
            : "Ketik kode yang tertulis di nota terima. Tanpa perlu login."}
        </p>

        <div className="mt-6 max-w-2xl rounded-xl border border-line bg-card p-4 sm:p-5">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2">
            <label htmlFor="ticket-code" className="text-xs font-bold text-ink">
              {locale === "en" ? "Receipt code" : "Kode nota servis"}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" />
                <Input
                  id="ticket-code"
                  type="text"
                  value={ticketInput}
                  onChange={(e) => setTicketInput(e.target.value)}
                  placeholder="SRV-20260912-0042"
                  className="h-11 bg-card pl-10 font-mono text-sm uppercase"
                />
              </div>
              <Button type="submit" className="h-11 shrink-0 px-6">
                {locale === "en" ? "Check" : "Cek nota"}
              </Button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{locale === "en" ? "Examples" : "Contoh"}</span>
            {serviceTickets.slice(0, 3).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setTicketInput(item.ticket_code);
                  router.push(`/${locale}/tracking?ticket=${item.ticket_code}`);
                  performSearch(item.ticket_code);
                }}
                className="rounded-md bg-paper px-2 py-1 font-mono text-accent-deep hover:bg-line"
              >
                {item.ticket_code}
              </button>
            ))}
          </div>
        </div>

        {hasSearched && !activeTicket && (
          <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-dashed border-bad/40 bg-card p-8 text-center">
            <AlertCircle className="mx-auto h-11 w-11 text-bad" />
            <h2 className="mt-2 text-base font-extrabold text-ink">Kode tidak ketemu</h2>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
              {searchError || "Cek lagi huruf dan angkanya. Kalau tetap tidak ketemu, chat toko via WhatsApp."}
            </p>
          </div>
        )}

        {activeTicket && (
          <div className="mt-5 space-y-4">
            <div className="print-area rounded-xl border border-line bg-card p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 md:flex-row md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-accent px-2.5 py-1 font-mono text-xs font-bold text-white">
                      {activeTicket.ticket_code}
                    </span>
                    <button
                      onClick={() => copyToClipboard(activeTicket.ticket_code)}
                      className="rounded p-1 text-muted hover:text-ink"
                      title="Salin kode"
                      aria-label="Salin kode nota"
                    >
                      {copied ? <Check className="h-4 w-4 text-good" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <h2 className="mt-2 flex items-center gap-2 text-xl font-extrabold text-ink">
                    <Smartphone className="h-5 w-5 text-accent" />
                    {activeTicket.device_model}
                  </h2>
                  {imeiDisplay ? (
                    <p className="mt-0.5 font-mono text-xs text-muted">IMEI {imeiDisplay}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      activeTicket.repair_status === "completed" || activeTicket.repair_status === "picked_up"
                        ? "success"
                        : activeTicket.repair_status === "cancelled"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {activeTicket.repair_status.replace("_", " ")}
                  </Badge>
                  {!isLiveBackend ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        activeTicket &&
                        openNotaPrintWindow(
                          `Nota ${activeTicket.ticket_code}`,
                          buildServiceNotaHtml({
                            ticket: activeTicket,
                            storeName: "At Cell",
                            address: storeSettings.address,
                            phone: `${storeSettings.whatsapp_number} / ${storeSettings.phone_number}`,
                          })
                        )
                      }
                      className="no-print"
                    >
                      <Printer className="h-4 w-4" />
                      Cetak nota
                    </Button>
                  ) : null}
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-4 pt-5 text-xs sm:grid-cols-4">
                {!isLiveBackend ? (
                  <div>
                    <dt className="text-muted">Pemilik</dt>
                    <dd className="mt-0.5 font-bold text-ink">{activeTicket.customer_name}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted">Masuk</dt>
                  <dd className="mt-0.5 font-bold text-ink">{formatDate(activeTicket.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Update terakhir</dt>
                  <dd className="mt-0.5 font-bold text-ink">{formatDate(activeTicket.updated_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Garansi servis</dt>
                  <dd className="mt-0.5 flex items-center gap-1 font-bold text-good">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {activeTicket.warranty_days || 30} hari
                  </dd>
                </div>
              </dl>

              {!isLiveBackend ? (
                <div className="mt-4 rounded-lg bg-paper p-3.5 text-xs">
                  <p className="font-bold text-ink">Keluhan awal</p>
                  <p className="mt-0.5 leading-relaxed text-muted">{activeTicket.issue_notes}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-line bg-card p-5 sm:p-6">
              <h2 className="text-base font-extrabold text-ink">Progres pengerjaan</h2>
              <ul className="mt-4">
                {WORKFLOW_STEPS.map((step, idx) => {
                  const isDone = currentStepIndex > idx || activeTicket.repair_status === "picked_up";
                  const isCurrent = currentStepIndex === idx;
                  return (
                    <li key={step.key} className="relative flex items-start gap-4 pb-6 last:pb-0">
                      {idx !== WORKFLOW_STEPS.length - 1 && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-4 top-9 h-[calc(100%-2rem)] w-px ${isDone ? "bg-good" : "bg-line"}`}
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          isDone
                            ? "bg-good text-white"
                            : isCurrent
                              ? "bg-accent text-white ring-4 ring-accent-soft"
                              : "border border-line bg-paper text-muted"
                        }`}
                      >
                        {isDone || isCurrent ? <Check className="h-4 w-4" /> : null}
                      </span>
                      <div>
                        <p className={`flex flex-wrap items-center gap-2 text-sm font-bold ${isCurrent ? "text-accent-deep" : isDone ? "text-ink" : "text-muted"}`}>
                          {locale === "en" ? step.verbEn : step.verbId}
                          {isCurrent && (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-extrabold text-accent-deep">
                              Posisi sekarang
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          {locale === "en" ? step.descEn : step.descId}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-accent" />
                    Rincian biaya
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {!isLiveBackend ? (
                    <>
                      <div className="flex justify-between border-b border-line py-2">
                        <span className="text-muted">Sparepart</span>
                        <span className="font-bold text-ink">{formatIDR(activeTicket.sparepart_fee)}</span>
                      </div>
                      <div className="flex justify-between border-b border-line py-2">
                        <span className="text-muted">Jasa teknisi</span>
                        <span className="font-bold text-ink">{formatIDR(activeTicket.labor_fee)}</span>
                      </div>
                      <div className="flex justify-between rounded-lg bg-paper p-3 text-sm font-extrabold text-ink">
                        <span>Total</span>
                        <span className="text-accent-deep">{formatIDR(activeTicket.total_fee)}</span>
                      </div>
                      <p className="pt-1 text-[11px] text-muted">
                        Bayar saat ambil HP di kasir At Cell.
                      </p>
                    </>
                  ) : (
                    <p className="rounded-lg bg-paper p-3 leading-relaxed text-muted">
                      Rincian biaya dapat dikonfirmasi langsung ke kasir At Cell.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Camera className="h-4 w-4 text-accent" />
                    Foto dokumentasi
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!isLiveBackend && activeTicket.photo_urls && activeTicket.photo_urls.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {activeTicket.photo_urls.map((photo, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setLightboxIndex(i)}
                          aria-label={
                            locale === "en"
                              ? `Enlarge photo ${i + 1} of ${activeTicket.photo_urls.length}`
                              : `Perbesar foto ${i + 1} dari ${activeTicket.photo_urls.length}`
                          }
                          className="group h-36 cursor-zoom-in overflow-hidden rounded-lg border border-line bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <img
                            src={photo}
                            alt={locale === "en" ? `Repair documentation ${i + 1}` : `Dokumentasi servis ${i + 1}`}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03] group-active:scale-100"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-line bg-paper py-8 text-center text-xs text-muted">
                      <Camera className="mx-auto mb-2 h-8 w-8 text-line" />
                      {isLiveBackend
                        ? "Foto servis tidak ditampilkan pada halaman publik."
                        : "Belum ada foto untuk nota ini."}
                    </div>
                  )}
                  <a
                    href={`https://wa.me/${storeSettings.whatsapp_number?.replace(/\D/g, "")}?text=${encodeURIComponent(
                      `Halo At Cell, saya mau tanya progres servis ${activeTicket.ticket_code} (${activeTicket.device_model}).`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    <Button variant="outline" size="sm" className="w-full">
                      Tanya teknisi via WhatsApp
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTicket && lightboxIndex !== null && activeTicket.photo_urls && (
          <Lightbox
            photos={activeTicket.photo_urls}
            index={Math.min(lightboxIndex, activeTicket.photo_urls.length - 1)}
            locale={locale}
            ticketCode={activeTicket.ticket_code}
            onClose={() => setLightboxIndex(null)}
            onMove={(dir) =>
              setLightboxIndex((prev) =>
                prev === null
                  ? prev
                  : (prev + dir + activeTicket.photo_urls.length) % activeTicket.photo_urls.length
              )
            }
          />
        )}
      </div>
    </div>
  );
}
