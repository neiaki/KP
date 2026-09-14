"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/context/store-context";
import { Wrench, ArrowLeft, CheckCircle2, User, Smartphone, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function NewServiceTicketPage() {
  const router = useRouter();
  const { createServiceTicket } = useStore();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [imeiOrSn, setImeiOrSn] = useState("");
  const [issueNotes, setIssueNotes] = useState("");
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !deviceModel || !issueNotes) {
      setNotice({ type: "error", text: "Mohon lengkapi Nama Pelanggan, Model Handphone, dan Keluhan!" });
      return;
    }

    createServiceTicket({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      deviceModel: deviceModel.trim(),
      imeiOrSn: imeiOrSn.trim() || "N/A",
      issueNotes: issueNotes.trim(),
      photoUrls: [
        "https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=600&auto=format&fit=crop&q=80",
      ],
    });

    router.push("/portal/service");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/portal/service">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-black text-ink tracking-tight">
            Pendaftaran Tiket Servis Masuk
          </h1>
          <p className="text-xs text-muted">
            Sistem akan menerbitkan kode resi otomatis dengan format SRV-YYYYMMDD-XXXX.
          </p>
        </div>
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

      <Card className="border-line shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="w-4 h-4 text-accent-deep" />
            <span>Formulir Penerimaan Unit Pelanggan</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Isi data identitas pemilik dan kondisi fisik/kendala teknis unit handphone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-muted mb-1">
                  Nama Pelanggan (Walk-In / Terdaftar) <span className="text-bad">*</span>
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Farhan Hakim"
                  className="text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">
                  Nomor WhatsApp / Kontak Pemilik
                </label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 081299887711"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-muted mb-1">
                  Merek & Model Handphone <span className="text-bad">*</span>
                </label>
                <Input
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  placeholder="Contoh: Xiaomi Redmi Note 13"
                  className="text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">
                  Nomor IMEI atau Serial Number (Jika terbaca)
                </label>
                <Input
                  value={imeiOrSn}
                  onChange={(e) => setImeiOrSn(e.target.value)}
                  placeholder="15 digit angka IMEI atau SN"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-muted mb-1">
                Deskripsi Kerusakan / Keluhan Masuk <span className="text-bad">*</span>
              </label>
              <textarea
                rows={4}
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="Jelaskan kronologi kendala (misal: terjatuh layar retak, mati total terkena air, speaker tidak bunyi)..."
                className="w-full p-2.5 bg-paper border border-line rounded-lg text-xs"
                required
              />
            </div>

            <div className="p-3 bg-accent-soft rounded-xl border border-accent/20 flex items-start gap-2.5 text-[11px] text-accent-deep">
              <CheckCircle2 className="w-4 h-4 text-accent-deep shrink-0 mt-0.5" />
              <span>
                Setelah pendaftaran disimpan, pelanggan dapat memantau status secara langsung di halaman publik{" "}
                <strong>/id/tracking</strong> cukup dengan nomor tiket yang dibuat.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Link href="/portal/service">
                <Button type="button" variant="outline">
                  Batal
                </Button>
              </Link>
              <Button type="submit" className="font-bold">
                Terbitkan Tiket Servis
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
