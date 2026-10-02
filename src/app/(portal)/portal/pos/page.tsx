"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import { openNotaPrintWindow, buildPosNotaHtml } from "@/lib/print-nota";
import { uploadPhoto } from "@/lib/actions/storage";
import { TRADE_IN_MODELS } from "@/lib/trade-in-models";
import { UNIT_LABEL_UNKNOWN, unitLabel } from "@/lib/shop";
import { PaymentMethod, Transaction, UnitCondition } from "@/types";
import {
  ShoppingCart,
  QrCode,
  CreditCard,
  Banknote,
  Landmark,
  ArrowLeftRight,
  Printer,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SalesPosPage() {
  const { products, inventoryUnits, processSale, storeSettings, isLiveBackend } = useStore();

  // Selected physical unit (must be available)
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);

  // Walk-in Guest Customer Info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("qris");
  const [warrantyMonths, setWarrantyMonths] = useState<number>(12);

  // Trade-in Toggle & State
  const [hasTradeIn, setHasTradeIn] = useState(false);
  // Default harus kosong. Nilai lama ("iPhone 11 64GB" dan IMEI contoh) berasal
  // dari era field bebas ketik: IMEI contoh itu lolos validasi 15 digit dan bisa
  // ikut tersimpan ke inventaris kalau staf tidak menghapusnya, dan modelnya
  // tidak ada di daftar dropdown sehingga yang tampil di layar berbeda dari yang
  // tersimpan.
  const [tradeInBrandModel, setTradeInBrandModel] = useState("");
  const [tradeInIMEI, setTradeInIMEI] = useState("");
  const [screenGrading, setScreenGrading] = useState<"good" | "minor_scratches" | "cracked" | "replaced">("good");
  const [bodyGrading, setBodyGrading] = useState<"flawless" | "minor_dents" | "heavy_wear">("minor_dents");
  const [batteryHealth, setBatteryHealth] = useState(82);
  const [biometricWorks, setBiometricWorks] = useState(true);
  const [cameraWorks, setCameraWorks] = useState(true);
  const [signalWorks, setSignalWorks] = useState(true);
  const [boxIncluded, setBoxIncluded] = useState(true);
  // Taksiran harga trade-in hanya staf yang bisa tahu, jadi form dimulai dari
  // 0 dan wajib diisi kalau trade-in dicentang. Angka 2,5 juta sebelumnya bisa
  // ikut tersimpan sebagai taksiran padahal bukan hasil pemeriksaan unit itu.
  const [customTradeInPrice, setCustomTradeInPrice] = useState(0);
  const [tradeInPhotoUrls, setTradeInPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  type CompletedInvoice = Transaction & {
    unitModel: string;
    /** False kalau nama modelnya tebakan fallback, bukan dari katalog. */
    unitModelKnown: boolean;
    unitIMEI: string;
    unitCondition: UnitCondition;
  };

  // Invoice Receipt Modal after checkout
  const [completedInvoice, setCompletedInvoice] = useState<CompletedInvoice | null>(null);

  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!completedInvoice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCompletedInvoice(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [completedInvoice]);

  // Filter available physical units
  const availableUnits = inventoryUnits.filter((u) => u.status === "available");

  const selectedUnit = inventoryUnits.find((u) => u.id === selectedUnitId);
  // Nama unit SELALU lewat unitLabel(). Unit trade-in punya product_id null,
  // jadi products.find di sini selalu undefined untuk unit itu dan nota
  // garansi pernah tercetak menamai handset "At Cell Smartphone". Label juga
  // dicek apakah berasal dari data, supaya nota bisa jujur soal model yang
  // tidak tercatat alih-alih menampilkan tebakan yang terlihat meyakinkan.
  const unitModel = selectedUnit ? unitLabel(selectedUnit, products) : UNIT_LABEL_UNKNOWN;
  const unitModelKnown = unitModel !== UNIT_LABEL_UNKNOWN;

  // Calculate totals
  const subtotal = selectedUnit ? selectedUnit.selling_price : 0;
  const tradeInDeduction = hasTradeIn ? customTradeInPrice : 0;
  const finalPayment = Math.max(0, subtotal - tradeInDeduction);

  const handleTradeInPhotoChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (tradeInPhotoUrls.length >= 10) {
      setNotice({ type: "error", text: "Maksimal 10 foto untuk satu transaksi trade-in." });
      return;
    }
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadPhoto(formData, { bucket: "trade-in-photos" });
      if (!result.ok) {
        setNotice({ type: "error", text: result.error });
        return;
      }
      // Path, bukan signed URL: yang kolom photo_urls terima harus bisa
      // dibuka ulang di sesi berikutnya.
      setTradeInPhotoUrls((prev) => [...prev, result.data.path]);
    } catch {
      setNotice({ type: "error", text: "Gagal mengunggah foto. Coba lagi." });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId) {
      setNotice({ type: "error", text: "Silakan pilih unit handphone (nomor IMEI) terlebih dahulu!" });
      return;
    }
    if (!customerName.trim()) {
      setNotice({ type: "error", text: "Nama pelanggan wajib diisi untuk registrasi kartu garansi IMEI!" });
      return;
    }

    if (hasTradeIn && !tradeInBrandModel) {
      setNotice({ type: "error", text: "Pilih model handphone lama pada dropdown!" });
      return;
    }
    if (hasTradeIn && !/^\d{15}$/.test(tradeInIMEI.trim())) {
      setNotice({ type: "error", text: "Nomor IMEI unit tukar tambah wajib tepat 15 digit angka!" });
      return;
    }
    if (
      hasTradeIn &&
      inventoryUnits.some((u) => u.imei === tradeInIMEI.trim())
    ) {
      setNotice({ type: "error", text: "IMEI unit tukar tambah sudah terdaftar di inventaris!" });
      return;
    }
    if (hasTradeIn && (!Number.isFinite(customTradeInPrice) || customTradeInPrice <= 0)) {
      setNotice({ type: "error", text: "Taksiran harga tukar tambah wajib diisi lebih dari nol." });
      return;
    }

    setIsSubmitting(true);
    try {
      const tx = await processSale({
        // salesId sengaja tidak dikirim: processSale memakai guard.profile.id
        // dari sesi, bukan nilai dari browser.
        unitId: selectedUnitId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        paymentMethod,
        warrantyDurationMonths: warrantyMonths,
        tradeIn: hasTradeIn
          ? {
              originalBrandModel: tradeInBrandModel,
              imei: tradeInIMEI.trim(),
              gradingDetails: {
                screen: screenGrading,
                body: bodyGrading,
                battery_health: batteryHealth,
                biometric: biometricWorks,
                camera: cameraWorks,
                signal: signalWorks,
                box_and_accessories: boxIncluded,
                notes: "Inspeksi fisik langsung di meja kasir At Cell.",
              },
              offeredPrice: customTradeInPrice,
              photoUrls: tradeInPhotoUrls,
            }
          : undefined,
      });

      // Show completed invoice modal
      setCompletedInvoice({
        ...tx,
        unitModel,
        unitModelKnown,
        unitIMEI: selectedUnit?.imei ?? "",
        unitCondition: selectedUnit?.condition ?? "new",
      });

      // Reset selection
      setSelectedUnitId(null);
      setHasTradeIn(false);
       setTradeInPhotoUrls([]);
      setCustomerName("");
      setCustomerPhone("");
    } catch (err: unknown) {
      setNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal memproses transaksi!",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      {/* flex-col di HP: judul, badge, dan tombol CTA tidak berebut lebar
          dalam satu baris sempit, dan badge tidak lagi berupa label kapital
          yang berfungsi sebagai eyebrow. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Terminal Kasir POS & Tukar Tambah
            </h1>
            <Badge variant="info" className="font-mono text-xs">
              Portal kasir
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            Pilih unit fisik per nomor IMEI 15-digit, integrasi trade-in otomatis, dan terbitkan nota bergaransi.
          </p>
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            notice.type === "error"
              ? "border-bad/30 bg-bad-bg text-bad"
              : "border-good/30 bg-good-bg text-good"
          }`}
        >
          {notice.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Tutup pesan"
            className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Unit Selector & Trade-in Grading */}
        <div className="lg:col-span-7 space-y-6">
          {/* Step 1: Physical Unit & IMEI Selector */}
          <Card className="border-line shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base font-bold">
                <span className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-accent-deep" />
                  <span>Pilih Unit Handphone &amp; Nomor IMEI Fisik</span>
                </span>
                <span className="font-mono text-xs text-muted">
                  {availableUnits.length} unit siap jual
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Sesuai PRD, setiap penjualan wajib terikat pada satu nomor IMEI unik 15-digit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {availableUnits.length === 0 ? (
                <div className="rounded-xl bg-bad-bg p-6 text-center text-sm text-bad">
                  Stok unit siap jual kosong. Tambah nomor IMEI di menu Inventaris terlebih dahulu.
                </div>
              ) : (
                /* Di HP daftar unit mengalir penuh mengikuti halaman. Versi lama
                   memakai max-h-72 overflow-y-auto, jadi kotak internal hanya
                   288px tinggi dan baris terakhir selalu terpotong tepat di
                   tengah tanpa ada petunjuk apa pun kalau masih bisa digulir.
                   Batas tinggi baru dikembalikan di layar lebar, tempat
                   daftar unit pendek dan tidak eats the viewport. */
                <div
                  role="radiogroup"
                  aria-label="Daftar unit siap jual per nomor IMEI"
                  className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-72"
                >
                  {availableUnits.map((unit) => {
                    const label = unitLabel(unit, products);
                    const isSelected = selectedUnitId === unit.id;
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedUnitId(unit.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-accent bg-accent-soft/70 ring-2 ring-accent/30"
                            : "border-line bg-card hover:border-muted hover:bg-paper"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? "border-accent bg-accent text-white"
                                : "border-line bg-card"
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-ink sm:text-xs">
                              {label}
                            </span>
                            <span className="mt-0.5 block break-all font-mono text-xs text-accent-deep">
                              IMEI <span className="font-bold">{unit.imei}</span>
                            </span>
                          </span>
                        </span>

                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-black text-ink sm:text-xs">
                            {formatIDR(unit.selling_price)}
                          </span>
                          <Badge
                            variant={unit.condition === "new" ? "success" : "info"}
                            className="mt-0.5 font-mono text-[10px]"
                          >
                            {unit.condition === "new" ? "Baru" : "Seken"}
                          </Badge>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Kartu transaksi tukar tambah */}
          <Card className="border-line shadow-sm">
            <CardHeader className="flex flex-col items-start gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <ArrowLeftRight className="h-5 w-5 text-accent-deep" />
                  <span>Transaksi Tukar Tambah (Trade-In)</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Otomatis potong harga &amp; daftarkan unit lama ke inventaris stok seken
                </CardDescription>
              </div>
              {/* Label inilah target sentuhnya, bukan checkbox 16px di
                  dalamnya, jadi label yang dapat tinggi 44px di HP. */}
              <label className="flex min-h-11 w-full cursor-pointer items-center gap-2 sm:min-h-0 sm:w-auto">
                <input
                  type="checkbox"
                  checked={hasTradeIn}
                  onChange={(e) => {
                    setHasTradeIn(e.target.checked);
                    if (!e.target.checked) setTradeInPhotoUrls([]);
                  }}
                  className="h-4 w-4 shrink-0 rounded text-accent-deep focus:ring-accent"
                />
                <span className="text-sm font-bold text-ink">Aktifkan Trade-In</span>
              </label>
            </CardHeader>

            {hasTradeIn && (
              <CardContent className="space-y-4 pt-2 border-t border-line animate-in fade-in duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="trade-in-model"
                      className="block text-xs font-semibold text-muted mb-1"
                    >
                      Model Handphone Lama Pelanggan
                    </label>
                    {/* Daftar model sama dengan halaman trade-in publik, jadi
                        staff tidak bisa mengetik model yang tidak ada di
                        lineup dan Calculate Estimate tidak bisa meleset. */}
                    <select
                      id="trade-in-model"
                      value={tradeInBrandModel}
                      onChange={(e) => setTradeInBrandModel(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-line bg-card px-3 py-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <option value="" disabled>
                        Pilih seri iPhone
                      </option>
                      {TRADE_IN_MODELS.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="trade-in-imei"
                      className="mb-1 block text-xs font-semibold text-muted"
                    >
                      Nomor IMEI Unit Lama (Wajib 15 Digit)
                    </label>
                    {/* inputMode="numeric" plus autoComplete="off" supaya HP
                        membuka keypad angka dan tidak ikut mengisi dari kontak
                        tersimpan, jadi 15 digit tidak pernah dikoreksi kelamaan
                        karena ketemu autocomplete. */}
                    <Input
                      id="trade-in-imei"
                      name="trade-in-imei"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      maxLength={15}
                      value={tradeInIMEI}
                      onChange={(e) => setTradeInIMEI(e.target.value.replace(/\D/g, ""))}
                      placeholder="15 digit angka IMEI"
                      className="font-mono sm:text-xs"
                    />
                  </div>
                </div>

                {isLiveBackend && (
                  <div className="rounded-xl border border-dashed border-line bg-paper p-3">
                    <label className="block text-xs font-semibold text-muted mb-1" htmlFor="trade-in-photo">
                      Foto kondisi unit lama (opsional, maksimal 10 file)
                    </label>
                    <input
                      id="trade-in-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => void handleTradeInPhotoChange(event)}
                      disabled={uploadingPhoto}
                      className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      {uploadingPhoto
                        ? "Mengunggah foto..."
                        : `${tradeInPhotoUrls.length} foto siap disimpan`}
                    </p>
                  </div>
                )}

                {/* Checklist grading */}
                <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                    <Sparkles className="h-4 w-4 text-accent-deep" />
                    <span>Checklist Hasil Grading Meja Kasir</span>
                  </div>

                  {/* Satu kolom di HP: dua kolom select p-1 lama hanya menyisakan
                      sekitar 130px per select, jadi label opsi terpotong dan
                      target sentuhnya di bawah 44px. */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label
                        htmlFor="trade-in-screen"
                        className="mb-1 block text-xs font-semibold text-muted"
                      >
                        Layar LCD
                      </label>
                      <select
                        id="trade-in-screen"
                        value={screenGrading}
                        onChange={(e) => setScreenGrading(e.target.value as typeof screenGrading)}
                        className="h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink sm:h-10 sm:text-xs"
                      >
                        <option value="good">Mulus Original</option>
                        <option value="minor_scratches">Lecet Pemakaian</option>
                        <option value="cracked">Retak Kaca</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="trade-in-body"
                        className="mb-1 block text-xs font-semibold text-muted"
                      >
                        Bodi / Bezel
                      </label>
                      <select
                        id="trade-in-body"
                        value={bodyGrading}
                        onChange={(e) => setBodyGrading(e.target.value as typeof bodyGrading)}
                        className="h-11 w-full rounded-lg border border-line bg-card px-3 text-base text-ink sm:h-10 sm:text-xs"
                      >
                        <option value="flawless">Mulus Sempurna</option>
                        <option value="minor_dents">Sedikit Dent</option>
                        <option value="heavy_wear">Lecet Berat</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="trade-in-battery"
                        className="mb-1 block text-xs font-semibold text-muted"
                      >
                        Battery Health (persen)
                      </label>
                      <Input
                        id="trade-in-battery"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={batteryHealth}
                        onChange={(e) => setBatteryHealth(Number(e.target.value))}
                        className="sm:text-xs"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="trade-in-price"
                        className="mb-1 block text-xs font-semibold text-muted"
                      >
                        Harga Taksiran (Rp)
                      </label>
                      <Input
                        id="trade-in-price"
                        type="number"
                        inputMode="numeric"
                        step={50000}
                        min={0}
                        value={customTradeInPrice}
                        onChange={(e) => setCustomTradeInPrice(Number(e.target.value))}
                        className="font-bold text-accent-deep sm:text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1 pt-1 sm:grid-cols-2 sm:gap-2 lg:grid-cols-4">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm text-ink sm:min-h-0 sm:text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={biometricWorks}
                        onChange={(e) => setBiometricWorks(e.target.checked)}
                      />
                      <span>Face/Touch ID Ok</span>
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm text-ink sm:min-h-0 sm:text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={cameraWorks}
                        onChange={(e) => setCameraWorks(e.target.checked)}
                      />
                      <span>Kamera Ok</span>
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm text-ink sm:min-h-0 sm:text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={signalWorks}
                        onChange={(e) => setSignalWorks(e.target.checked)}
                      />
                      <span>Sinyal &amp; Wi-Fi Ok</span>
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm text-ink sm:min-h-0 sm:text-xs">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={boxIncluded}
                        onChange={(e) => setBoxIncluded(e.target.checked)}
                      />
                      <span>Lengkap Box</span>
                    </label>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Right Column: Customer Info, Payment & Summary */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-line shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <User className="h-5 w-5 text-accent-deep" />
                <span>Data Pelanggan Walk-In &amp; Garansi</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Daftarkan nama &amp; nomor telepon untuk aktivasi garansi toko tanpa perlu akun login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label
                  htmlFor="pos-customer-name"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nama Lengkap Pembeli <span className="text-bad">*</span>
                </label>
                <Input
                  id="pos-customer-name"
                  name="pos-customer-name"
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Anisa Rahmawati"
                  className="sm:text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="pos-customer-phone"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nomor WhatsApp / HP Pelanggan
                </label>
                <Input
                  id="pos-customer-phone"
                  name="pos-customer-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 082155667788"
                  className="font-mono sm:text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="pos-warranty"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Masa Garansi Toko
                </label>
                <select
                  id="pos-warranty"
                  name="pos-warranty"
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                  className="h-11 w-full rounded-lg border border-line bg-card px-3 text-base font-medium text-ink sm:h-10 sm:text-xs"
                >
                  <option value={1}>1 Bulan Garansi Toko (Seken Standar)</option>
                  <option value={3}>3 Bulan Garansi Toko (Seken Grade A)</option>
                  <option value={6}>6 Bulan Garansi Toko</option>
                  <option value={12}>12 Bulan Garansi Toko / Resmi</option>
                </select>
              </div>

              <div>
                <span className="mb-2 block text-xs font-semibold text-muted">
                  Metode Pembayaran
                </span>
                {/* radiogroup + tombol min-h-11: versi lama p-2 hanya 34px dan
                    grid-cols-3 memecah "transfer" jadi dua baris di 375px. */}
                <div
                  role="radiogroup"
                  aria-label="Metode pembayaran"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {(["qris", "cash", "transfer", "debit", "credit"] as PaymentMethod[]).map((m) => {
                    const Icon = m === "qris" ? QrCode : m === "cash" ? Banknote : m === "transfer" ? Landmark : CreditCard;
                    const label =
                      m === "qris"
                        ? "QRIS"
                        : m === "cash"
                        ? "Tunai"
                        : m === "transfer"
                        ? "Transfer"
                        : m === "debit"
                        ? "Debit"
                        : "Kredit";
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={paymentMethod === m}
                        onClick={() => setPaymentMethod(m)}
                        className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold transition-colors sm:text-xs ${
                          paymentMethod === m
                            ? "border-accent bg-accent text-white"
                            : "border-line bg-paper text-muted hover:border-muted hover:text-ink"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ringkasan checkout */}
          <Card className="border-line bg-gradient-to-b from-accent-soft/40 to-card shadow-md">
            <CardHeader className="border-b border-line pb-3">
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base font-bold text-ink">
                <span>Rincian Transaksi Checkout</span>
                <Badge variant="info" className="text-[10px]">
                  Faktur kasir
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-muted">
                  <span>Harga Unit Baru/Dipilih:</span>
                  <span className="font-semibold text-ink">{formatIDR(subtotal)}</span>
                </div>

                {hasTradeIn && (
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded bg-good-bg p-2 font-semibold text-good">
                    <span>Potongan Trade-In ({tradeInBrandModel}):</span>
                    <span>-{formatIDR(tradeInDeduction)}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2">
                  <span className="text-base font-bold text-ink">Total Wajib Bayar:</span>
                  <span className="text-2xl font-black text-accent-deep">
                    {formatIDR(finalPayment)}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={isSubmitting || !selectedUnitId || !customerName.trim()}
                className="w-full gap-2 bg-accent py-6 text-sm font-bold shadow-md shadow-accent/20 hover:bg-accent-deep"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>
                  {isSubmitting ? "Memproses transaksi..." : "Proses Pembayaran & Cetak Faktur"}
                </span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invoice Confirmation Modal */}
      {/* Dialog nota. Overlay-nya yang menggulir (overflow-y-auto) dan
          align-items-start, supaya di layar pendek area isi dialog bisa
          digulir tanpa tombol Cetak Nota keluar dari jangkauan. */}
      {completedInvoice && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nota hasil transaksi kasir"
            className="rise my-auto w-full max-w-lg space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:space-y-6 sm:p-6"
          >
            <div className="text-center space-y-2 border-b border-line pb-4">
              <div className="w-12 h-12 rounded-full bg-good-bg text-good flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-ink">Transaksi Berhasil Diproses!</h3>
              {/* Nomor faktur adalah kode nota. Ditebalkan supaya dibaca
                  lebih dulu daripada tanggal, sama seperti IMEI terikat di
                  bawahnya yang juga jadi penanda sah. */}
              <p className="text-xs text-muted font-mono">
                No. Faktur:{" "}
                <span className="font-bold text-ink">
                  {completedInvoice.invoice_number ?? `INV-${completedInvoice.id}`}
                </span>{" "}
                • {formatDate(completedInvoice.created_at)}
              </p>
            </div>

            {/* Rincian nota. flex-wrap per baris supaya label dan nilai
                pindah ke baris masing-masing di layar sempit, bukan saling
                mendorong keluar kotak. */}
            <div className="print-area space-y-3 rounded-xl border border-line bg-paper p-3 text-sm sm:p-4">
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <span className="text-muted">Pelanggan:</span>
                <span className="font-bold text-ink">{completedInvoice.customer_name}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <span className="text-muted">Unit Terjual:</span>
                <span className="font-bold text-ink">{completedInvoice.unitModel}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 rounded border border-line bg-card p-2 font-mono">
                <span className="text-muted">IMEI Terikat:</span>
                <span className="break-all font-bold text-accent-deep">{completedInvoice.unitIMEI}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                <span className="text-muted">Garansi Toko:</span>
                <span className="font-bold text-good">
                  {completedInvoice.items?.[0]?.warranty_duration_months || 12} Bulan
                </span>
              </div>
              {completedInvoice.trade_in && (
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 font-medium text-good">
                  <span>Trade-In ({completedInvoice.trade_in.original_brand_model}):</span>
                  <span>-{formatIDR(completedInvoice.trade_in_deduction ?? 0)}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-base font-bold">
                <span>Total Pelunasan ({completedInvoice.payment_method.toUpperCase()}):</span>
                <span className="text-accent-deep">
                  {formatIDR(completedInvoice.final_payment ?? 0)}
                </span>
              </div>
            </div>

            {/* Tumpuk di HP: dua tombol "Cetak Nota Garansi" dan "Selesai /
                Transaksi Baru" berbagi lebar 375px dan teksnya ikut
                membungkus dua baris. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  openNotaPrintWindow(
                    `Nota ${completedInvoice.invoice_number ?? `INV-${completedInvoice.id}`}`,
                    buildPosNotaHtml({
                      storeName: "At Cell",
                      address: storeSettings.address,
                      phone: `${storeSettings.whatsapp_number} / ${storeSettings.phone_number}`,
                      invoiceNo: completedInvoice.invoice_number ?? `INV-${completedInvoice.id}`,
                      date: formatDate(completedInvoice.created_at),
                      customerName: completedInvoice.customer_name,
                      unitModel: completedInvoice.unitModel,
                      unitModelKnown: completedInvoice.unitModelKnown,
                      imei: completedInvoice.unitIMEI,
                      warrantyMonths:
                        completedInvoice.items?.[0]?.warranty_duration_months || 12,
                      tradeInModel: completedInvoice.trade_in?.original_brand_model,
                      tradeInDeduction: completedInvoice.trade_in_deduction ?? 0,
                      paymentMethod: completedInvoice.payment_method,
                      total: completedInvoice.final_payment ?? 0,
                    })
                  )
                }
                className="flex-1 gap-2 text-xs font-semibold"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Nota Garansi</span>
              </Button>
              <Button
                onClick={() => setCompletedInvoice(null)}
                className="flex-1 text-xs font-semibold"
              >
                Selesai / Transaksi Baru
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
