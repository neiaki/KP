"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/context/store-context";
import { formatIDR, formatDate } from "@/lib/utils";
import { openNotaPrintWindow, buildPosNotaHtml } from "@/lib/print-nota";
import { uploadPhoto } from "@/lib/actions/storage";
import { TRADE_IN_MODELS } from "@/lib/trade-in-models";
import { PaymentMethod, Transaction, UnitCondition } from "@/types";
import {
  ShoppingCart,
  QrCode,
  CreditCard,
  Banknote,
  Landmark,
  ArrowLeftRight,
  Printer,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Sparkles,
  User,
  Phone,
  Camera,
  Trash2,
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
  const [tradeInBrandModel, setTradeInBrandModel] = useState("iPhone 11 64GB");
  const [tradeInIMEI, setTradeInIMEI] = useState("352345098712399");
  const [screenGrading, setScreenGrading] = useState<"good" | "minor_scratches" | "cracked" | "replaced">("good");
  const [bodyGrading, setBodyGrading] = useState<"flawless" | "minor_dents" | "heavy_wear">("minor_dents");
  const [batteryHealth, setBatteryHealth] = useState(82);
  const [biometricWorks, setBiometricWorks] = useState(true);
  const [cameraWorks, setCameraWorks] = useState(true);
  const [signalWorks, setSignalWorks] = useState(true);
  const [boxIncluded, setBoxIncluded] = useState(true);
  const [customTradeInPrice, setCustomTradeInPrice] = useState(2500000);
  const [tradeInPhotoUrls, setTradeInPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  type CompletedInvoice = Transaction & {
    unitModel: string;
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
  const selectedProduct = selectedUnit
    ? products.find((p) => p.id === selectedUnit.product_id)
    : null;

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
      setTradeInPhotoUrls((prev) => [...prev, result.data.url]);
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

    setIsSubmitting(true);
    try {
      const tx = await processSale({
        salesId: "prof-sales-01",
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
        unitModel: `${selectedProduct?.brand ?? "At Cell"} ${selectedProduct?.model_name ?? "Smartphone"}`,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Terminal Kasir POS & Tukar Tambah
            </h1>
            <Badge variant="success" className="font-mono text-xs">
              SALES PORTAL
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
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
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-accent-deep" />
                  <span>1. Pilih Unit Handphone & Nomor IMEI Fisik</span>
                </span>
                <span className="text-xs font-mono text-muted">
                  {availableUnits.length} Unit Siap Jual
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Sesuai PRD, setiap penjualan wajib terikat pada satu nomor IMEI unik 15-digit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {availableUnits.length === 0 ? (
                <div className="p-6 text-center text-xs text-bad bg-bad-bg rounded-xl">
                  Stok unit siap jual kosong. Tambah nomor IMEI di menu Inventaris terlebih dahulu.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {availableUnits.map((unit) => {
                    const prod = products.find((p) => p.id === unit.product_id);
                    const isSelected = selectedUnitId === unit.id;
                    return (
                      <div
                        key={unit.id}
                        onClick={() => setSelectedUnitId(unit.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "border-accent bg-accent-soft/70 ring-2 ring-accent/30"
                            : "border-line bg-card hover:border-slate-300 hover:bg-paper"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "border-accent bg-accent text-white"
                                : "border-slate-300 bg-card"
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-ink">
                              {prod?.brand} {prod?.model_name}
                            </div>
                            <div className="text-[11px] font-mono text-accent-deep mt-0.5">
                              IMEI: <span className="font-bold">{unit.imei}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-black text-ink">
                            {formatIDR(unit.selling_price)}
                          </div>
                          <Badge
                            variant={unit.condition === "new" ? "success" : "info"}
                            className="text-[10px] uppercase font-mono mt-0.5"
                          >
                            {unit.condition}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Trade-In Accordion / Box */}
          <Card className="border-line shadow-sm">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-amber-500" />
                  <span>2. Transaksi Tukar Tambah (Trade-In)</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Otomatis potong harga & daftarkan unit lama ke inventaris stok seken
                </CardDescription>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasTradeIn}
                  onChange={(e) => {
                    setHasTradeIn(e.target.checked);
                    if (!e.target.checked) setTradeInPhotoUrls([]);
                  }}
                  className="rounded text-accent-deep focus:ring-accent h-4 w-4"
                />
                <span className="text-xs font-bold text-ink">Aktifkan Trade-In</span>
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
                    <label className="block text-xs font-semibold text-muted mb-1">
                      Nomor IMEI Unit Lama (Wajib 15 Digit)
                    </label>
                    <Input
                      maxLength={15}
                      value={tradeInIMEI}
                      onChange={(e) => setTradeInIMEI(e.target.value.replace(/\D/g, ""))}
                      placeholder="15 digit angka IMEI"
                      className="text-xs font-mono"
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

                {/* Grading Options */}
                <div className="p-3 bg-paper rounded-xl border border-line space-y-3">
                  <div className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Checklist Hasil Grading Meja Kasir:</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted block text-[11px] mb-1">Layar LCD:</span>
                      <select
                        value={screenGrading}
                        onChange={(e) => setScreenGrading(e.target.value as typeof screenGrading)}
                        className="w-full bg-card border border-slate-300 rounded p-1 text-xs"
                      >
                        <option value="good">Mulus Original</option>
                        <option value="minor_scratches">Lecet Pemakaian</option>
                        <option value="cracked">Retak Kaca</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-muted block text-[11px] mb-1">Bodi / Bezel:</span>
                      <select
                        value={bodyGrading}
                        onChange={(e) => setBodyGrading(e.target.value as typeof bodyGrading)}
                        className="w-full bg-card border border-slate-300 rounded p-1 text-xs"
                      >
                        <option value="flawless">Mulus Sempurna</option>
                        <option value="minor_dents">Sedikit Dent</option>
                        <option value="heavy_wear">Lecet Berat</option>
                      </select>
                    </div>

                    <div>
                      <span className="text-muted block text-[11px] mb-1">Battery Health:</span>
                      <Input
                        type="number"
                        value={batteryHealth}
                        onChange={(e) => setBatteryHealth(Number(e.target.value))}
                        className="h-7 text-xs"
                      />
                    </div>

                    <div>
                      <span className="text-muted block text-[11px] mb-1">Harga Taksiran (Rp):</span>
                      <Input
                        type="number"
                        step={50000}
                        value={customTradeInPrice}
                        onChange={(e) => setCustomTradeInPrice(Number(e.target.value))}
                        className="h-7 text-xs font-bold text-amber-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={biometricWorks}
                        onChange={(e) => setBiometricWorks(e.target.checked)}
                      />
                      <span>Face/Touch ID Ok</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cameraWorks}
                        onChange={(e) => setCameraWorks(e.target.checked)}
                      />
                      <span>Kamera Ok</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={signalWorks}
                        onChange={(e) => setSignalWorks(e.target.checked)}
                      />
                      <span>Sinyal & Wi-Fi Ok</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
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
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <User className="w-5 h-5 text-accent-deep" />
                <span>3. Data Pelanggan Walk-In & Garansi</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Daftarkan nama & nomor telepon untuk aktivasi garansi toko tanpa perlu akun login.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Nama Lengkap Pembeli <span className="text-bad">*</span>
                </label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Anisa Rahmawati"
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Nomor WhatsApp / HP Pelanggan
                </label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Contoh: 082155667788"
                  className="text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">
                  Masa Garansi Toko
                </label>
                <select
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                  className="w-full bg-card border border-slate-300 rounded p-2 text-xs font-medium"
                >
                  <option value={1}>1 Bulan Garansi Toko (Seken Standar)</option>
                  <option value={3}>3 Bulan Garansi Toko (Seken Grade A)</option>
                  <option value={6}>6 Bulan Garansi Toko</option>
                  <option value={12}>12 Bulan Garansi Toko / Resmi</option>
                </select>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-muted mb-2">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["qris", "cash", "transfer", "debit", "credit"] as PaymentMethod[]).map((m) => {
                    const Icon = m === "qris" ? QrCode : m === "cash" ? Banknote : m === "transfer" ? Landmark : CreditCard;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs font-semibold uppercase font-mono transition-colors ${
                          paymentMethod === m
                            ? "border-accent bg-accent text-white"
                            : "border-line bg-paper text-muted hover:bg-paper"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Checkout Breakdown & Action */}
          <Card className="border-line bg-gradient-to-b from-accent-soft/40 to-card shadow-md">
            <CardHeader className="pb-3 border-b border-line">
              <CardTitle className="text-base font-bold text-ink flex items-center justify-between">
                <span>Rincian Transaksi Checkout</span>
                <Badge variant="purple" className="text-[10px]">
                  Faktur Kasir
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-muted">
                  <span>Harga Unit Baru/Dipilih:</span>
                  <span className="font-semibold text-ink">{formatIDR(subtotal)}</span>
                </div>

                {hasTradeIn && (
                  <div className="flex justify-between text-good font-semibold bg-good-bg p-2 rounded">
                    <span>Potongan Trade-In ({tradeInBrandModel}):</span>
                    <span>-{formatIDR(tradeInDeduction)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-line flex justify-between items-center">
                  <span className="text-sm font-bold text-ink">Total Wajib Bayar:</span>
                  <span className="text-2xl font-black text-accent-deep">
                    {formatIDR(finalPayment)}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                disabled={isSubmitting || !selectedUnitId || !customerName.trim()}
                className="w-full py-6 font-bold text-sm bg-accent hover:bg-accent-deep gap-2 shadow-md shadow-accent/20"
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
      {completedInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nota hasil transaksi kasir"
            className="bg-card rounded-xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-line rise"
          >
            <div className="text-center space-y-2 border-b border-line pb-4">
              <div className="w-12 h-12 rounded-full bg-good-bg text-good flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-black text-ink">Transaksi Berhasil Diproses!</h3>
              <p className="text-xs text-muted font-mono">
                No. Faktur: {completedInvoice.invoice_number ?? `INV-${completedInvoice.id}`} • {formatDate(completedInvoice.created_at)}
              </p>
            </div>

            {/* Invoice Print Details */}
            <div className="print-area p-4 bg-paper rounded-xl border border-line space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Pelanggan:</span>
                <span className="font-bold text-ink">{completedInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Unit Terjual:</span>
                <span className="font-bold text-ink">{completedInvoice.unitModel}</span>
              </div>
              <div className="flex justify-between font-mono bg-card p-2 rounded border border-line">
                <span className="text-muted">IMEI Terikat:</span>
                <span className="font-bold text-accent-deep">{completedInvoice.unitIMEI}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Garansi Toko:</span>
                <span className="font-bold text-good">
                  {completedInvoice.items?.[0]?.warranty_duration_months || 12} Bulan
                </span>
              </div>
              {completedInvoice.trade_in && (
                <div className="flex justify-between text-good font-medium">
                  <span>Trade-In ({completedInvoice.trade_in.original_brand_model}):</span>
                  <span>-{formatIDR(completedInvoice.trade_in_deduction ?? 0)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-line flex justify-between font-bold text-sm">
                <span>Total Pelunasan ({completedInvoice.payment_method.toUpperCase()}):</span>
                <span className="text-accent-deep text-base">
                  {formatIDR(completedInvoice.final_payment ?? 0)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
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
