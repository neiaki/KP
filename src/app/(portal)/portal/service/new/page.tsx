"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/context/store-context";
import { Wrench, ArrowLeft, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { uploadPhoto } from "@/lib/actions/storage";
import { ButtonLink } from "@/components/button-link";

export default function NewServiceTicketPage() {
  const router = useRouter();
  const { createServiceTicket, isLiveBackend } = useStore();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [imeiOrSn, setImeiOrSn] = useState("");
  const [issueNotes, setIssueNotes] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (photoUrls.length >= 10) {
      setNotice({ type: "error", text: "Maksimal 10 foto untuk satu tiket." });
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
      // Yang disimpan ke database adalah path, bukan signed URL. URL-nya
      // kedaluwarsa sepuluh menit lagi, sedangkan path tidak pernah basi.
      setPhotoUrls((prev) => [...prev, result.data.path]);
    } catch {
      setNotice({ type: "error", text: "Gagal mengunggah foto. Coba lagi." });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !deviceModel || !issueNotes) {
      setNotice({ type: "error", text: "Mohon lengkapi Nama Pelanggan, Model Handphone, dan Keluhan!" });
      return;
    }

    setIsSubmitting(true);
    try {
      await createServiceTicket({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deviceModel: deviceModel.trim(),
        imeiOrSn: imeiOrSn.trim() || "N/A",
        issueNotes: issueNotes.trim(),
        photoUrls,
      });
      router.push("/portal/service");
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal membuat tiket servis.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-12">
      <div className="flex items-start gap-3">
        {/* 44px di HP: tombol balik ini kecil dan sering dipakai sambil
            memegang unit, jari tidak boleh meleset. */}
        <ButtonLink
          href="/portal/service"
          variant="outline"
          size="sm"
          className="h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9"
          aria-label="Kembali ke meja servis"
        >
          <ArrowLeft className="w-4 h-4" />
        </ButtonLink>
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-ink sm:text-2xl">
            Pendaftaran Tiket Servis Masuk
          </h1>
          <p className="mt-1 text-xs text-muted">
            Sistem akan menerbitkan kode resi otomatis dengan format SRV-YYYYMMDD-XXXXXXXX (8 karakter).
          </p>
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-semibold ${
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
            className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-card/60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      <Card className="border-line shadow-sm">
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-accent-deep" />
            <span>Formulir Penerimaan Unit Pelanggan</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Isi data identitas pemilik dan kondisi fisik/kendala teknis unit handphone.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ticket-customer-name"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nama Pelanggan (Walk-In / Terdaftar) <span className="text-bad">*</span>
                </label>
                <Input
                  id="ticket-customer-name"
                  name="ticket-customer-name"
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Farhan Hakim"
                  className="sm:text-xs"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="ticket-customer-phone"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nomor WhatsApp / Kontak Pemilik
                </label>
                <Input
                  id="ticket-customer-phone"
                  name="ticket-customer-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 081299887711"
                  className="font-mono sm:text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ticket-device-model"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Merek &amp; Model Handphone <span className="text-bad">*</span>
                </label>
                <Input
                  id="ticket-device-model"
                  name="ticket-device-model"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  placeholder="Contoh: Xiaomi Redmi Note 13"
                  className="sm:text-xs"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="ticket-imei"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nomor IMEI atau Serial Number (Jika terbaca)
                </label>
                {/* 15 digit IMEI diketik sambil memegang unit di meja kerja.
                   inputMode="numeric" membuka keypad angka di HP; tanpa itu
                   keyboard QWERTY penuh terbuka dan digit sering dikoreksi
                   berkali-kali. autoComplete="off" supaya tidak ikut terisi
                   dari kontak tersimpan. */}
                <Input
                  id="ticket-imei"
                  name="ticket-imei"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9A-Za-z]*"
                  autoComplete="off"
                  spellCheck={false}
                  value={imeiOrSn}
                  onChange={(e) => setImeiOrSn(e.target.value)}
                  placeholder="15 digit angka IMEI atau SN"
                  className="font-mono sm:text-xs"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="ticket-issue-notes"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Deskripsi Kerusakan / Keluhan Masuk <span className="text-bad">*</span>
              </label>
              <textarea
                id="ticket-issue-notes"
                name="ticket-issue-notes"
                rows={4}
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="Jelaskan kronologi kendala (misal: terjatuh layar retak, mati total terkena air, speaker tidak bunyi)..."
                className="w-full rounded-lg border border-line bg-paper p-3 text-base text-ink sm:text-xs"
                required
              />
            </div>

            {isLiveBackend && (
              <div className="rounded-xl border border-dashed border-line bg-paper p-3">
                <label
                  className="mb-1 block text-xs font-semibold text-muted"
                  htmlFor="service-photo"
                >
                  Foto kondisi atau kerusakan (opsional, maksimal 10 file)
                </label>
                {/* capture="environment" supaya di HP pilihan file langsung
                   menawarkan kamera, bukan hanya galeri. */}
                <input
                  id="service-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(event) => void handlePhotoChange(event)}
                  disabled={uploadingPhoto || isSubmitting}
                  className="block w-full cursor-pointer rounded-lg border border-line bg-card p-2 text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-3 file:text-sm file:font-semibold file:text-white"
                />
                <p className="mt-1 text-[11px] text-muted">
                  {uploadingPhoto ? "Mengunggah foto..." : `${photoUrls.length} foto siap disimpan`}
                </p>
              </div>
            )}

            <div className="flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent-soft p-3 text-xs text-accent-deep">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-deep" />
              <span>
                Setelah pendaftaran disimpan, pelanggan dapat memantau status secara langsung di halaman publik{" "}
                <strong>/id/tracking</strong> cukup dengan nomor tiket yang dibuat.
              </span>
            </div>

            {/* Tombol full-width di HP supaya tidak perlu mengarahkan jari ke
                sudut kanan form yang panjang. */}
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:justify-end">
              <ButtonLink
                href="/portal/service"
                variant="outline"
                className="w-full sm:w-auto"
              >
                Batal
              </ButtonLink>
              <Button
                type="submit"
                disabled={isSubmitting || uploadingPhoto}
                className="w-full font-bold sm:w-auto"
              >
                {isSubmitting ? "Menerbitkan tiket..." : "Terbitkan Tiket Servis"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
