"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/context/store-context";
import { unitLabel } from "@/lib/shop";
import { formatIDR, formatDate } from "@/lib/utils";
import { UnitCondition, UnitStatus } from "@/types";
import {
  PackagePlus,
  Search,
  Filter,
  Layers,
  AlertCircle,
  CheckCircle2,
  Barcode,
  Smartphone,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/* Daftar chip filter status unit.
   Tipenya Record<UnitStatus, string> supaya tsc gagal kalau enum UnitStatus
   di src/types/index.ts nambah nilai baru tanpa label. Versi lama menulis
   status-nya manual dan lupa "returned", jadi unit yang sudah dikembalikan
   tidak pernah bisa difilter sama sekali. */
const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  available: "available",
  reserved: "reserved",
  sold: "sold",
  in_service: "in_service",
  returned: "returned",
};

const UNIT_STATUS_FILTER: string[] = [
  "all",
  ...Object.keys(UNIT_STATUS_LABEL) as UnitStatus[],
];

export default function InventoryManagementPage() {
  const { products, inventoryUnits, addBatchIMEI, updateUnitStatus } = useStore();

  // Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");

  // Batch IMEI registration modal / drawer state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id || 1);
  const activeProductId = products.some((product) => product.id === selectedProductId)
    ? selectedProductId
    : products[0]?.id ?? selectedProductId;
  const [batchCondition, setBatchCondition] = useState<UnitCondition>("new");
  // Harga beli tidak ada di master produk, jadi starts dari 0 dan wajib diisi
  // staf. Angka bawaan seperti 10 juta akan tersimpan diam-diam kalau lupa
  // diganti, dan itu merusak laporan margin.
  const [purchaseCost, setPurchaseCost] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  // Produk terakhir yang harganya sudah diturunkan, supaya harga tidak
  // menimpa pilihan staf saat produknya tidak berubah.
  const [lastPricedProductId, setLastPricedProductId] = useState<number | null>(null);
  const [imeiInputText, setImeiInputText] = useState("");
  const [validationError, setValidationError] = useState("");

  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!showBatchModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowBatchModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBatchModal]);

  // Harga jual diturunkan dari master produk tiap kali produk berganti, bukan
  // dari angka tetap. Sebelumnya memakai 12 juta untuk semua model, jadi unit
  // Redmi 2,8 juta bisa terdaftar dengan harga jual 12 juta kalau staf lupa
  // menyesuaikan sendiri.
  //
  // Penyesuaian dilakukan saat render, bukan di useEffect: memanggil setState
  // di dalam effect memaksa render kedua dan memicu render berantai. Ini pola
  // resmi React untuk "menyesuaikan state saat sebuah nilai berubah".
  const selectedProduct = products.find((product) => product.id === activeProductId);
  if (lastPricedProductId !== activeProductId) {
    setLastPricedProductId(activeProductId);
    setSellingPrice(selectedProduct?.default_price ? Number(selectedProduct.default_price) : 0);
  }

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    const imeis = imeiInputText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (imeis.length === 0) {
      setValidationError("Masukkan minimal 1 nomor IMEI.");
      return;
    }

    // Harga tidak boleh 0 atau negatif. Karena form dimulai dari 0, angka
    // bawaan yang dulu bisa lolos kalau staf tidak menyentuh field ini.
    if (!Number.isFinite(purchaseCost) || purchaseCost <= 0) {
      setValidationError("Harga beli harus diisi lebih dari nol.");
      return;
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      setValidationError("Harga jual harus diisi lebih dari nol.");
      return;
    }
    if (sellingPrice < purchaseCost) {
      setValidationError(
        `Harga jual (${formatIDR(sellingPrice)}) lebih kecil dari harga beli (${formatIDR(purchaseCost)}).`
      );
      return;
    }

    // Check 15 digits constraint from PRD
    const invalidImeis = imeis.filter((imei) => !/^\d{15}$/.test(imei));
    if (invalidImeis.length > 0) {
      setValidationError(
        `Ditemukan IMEI tidak valid (${invalidImeis.length} unit). Sesuai PRD, IMEI wajib tepat 15 digit angka (misal: ${invalidImeis[0]}).`
      );
      return;
    }

    // Check duplication with existing
    const existingIMEIs = new Set(inventoryUnits.map((u) => u.imei));
    const duplicates = imeis.filter((imei) => existingIMEIs.has(imei));
    if (duplicates.length > 0) {
      setValidationError(
        `IMEI sudah terdaftar di sistem: ${duplicates.join(", ")}. Nomor IMEI harus unik.`
      );
      return;
    }

    setIsSaving(true);
    try {
      await addBatchIMEI(activeProductId, imeis, batchCondition, purchaseCost, sellingPrice);
      setShowBatchModal(false);
      setImeiInputText("");
      setNotice({ type: "success", text: `Berhasil mendaftarkan ${imeis.length} unit fisik IMEI ke inventaris.` });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal menyimpan unit inventaris.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnitStatusChange = async (unitId: number, status: UnitStatus) => {
    try {
      await updateUnitStatus(unitId, status);
      setNotice({ type: "success", text: "Status unit berhasil diperbarui." });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal memperbarui status unit.",
      });
    }
  };

  // Filter units
  const filteredUnits = inventoryUnits.filter((unit) => {
    const matchesSearch =
      unit.imei.includes(search) ||
      unitLabel(unit, products).toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || unit.status === statusFilter;
    const matchesCondition = conditionFilter === "all" || unit.condition === conditionFilter;
    return matchesSearch && matchesStatus && matchesCondition;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Manajemen Inventaris Unit &amp; IMEI
            </h1>
            <Badge variant="info" className="font-mono text-xs">
              Sales &amp; admin
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            Pelacakan presisi setiap nomor IMEI 15-digit fisik, status mutasi, dan registrasi batch stok.
          </p>
        </div>

        <Button
          onClick={() => setShowBatchModal(true)}
          className="w-full gap-2 text-sm font-bold shadow-md sm:w-auto sm:text-xs"
        >
          <PackagePlus className="w-4 h-4" />
          <span>Registrasi Batch IMEI</span>
        </Button>
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

      {/* Ringkasan stok */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-line bg-card p-3 shadow-xs sm:p-4">
          <div className="text-xs font-semibold text-muted">Unit tersedia</div>
          <div className="mt-1 text-2xl font-black text-good">
            {inventoryUnits.filter((u) => u.status === "available").length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Siap dijual di POS</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 shadow-xs sm:p-4">
          <div className="text-xs font-semibold text-muted">Unit terjual</div>
          <div className="mt-1 text-2xl font-black text-ink">
            {inventoryUnits.filter((u) => u.status === "sold").length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Aktif masa garansi</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 shadow-xs sm:p-4">
          <div className="text-xs font-semibold text-muted">Unit seken / trade-in</div>
          <div className="mt-1 text-2xl font-black text-accent-deep">
            {inventoryUnits.filter((u) => u.condition === "second").length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Hasil tukar tambah</div>
        </div>

        <div className="rounded-xl border border-line bg-card p-3 shadow-xs sm:p-4">
          <div className="text-xs font-semibold text-muted">Total terdata</div>
          <div className="mt-1 text-2xl font-black text-ink">
            {inventoryUnits.length}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">Seluruh unit fisik</div>
        </div>
      </div>

      {/* Pencarian & filter */}
      <div className="flex flex-col items-stretch gap-4 rounded-xl border border-line bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-muted absolute left-3 top-3.5" />
          <label htmlFor="inventory-search" className="sr-only">
            Cari unit inventaris
          </label>
          <Input
            id="inventory-search"
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari IMEI 15 digit atau model..."
            className="pl-9 font-mono sm:text-xs"
          />
        </div>

        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center md:gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-muted">Status</span>
            {UNIT_STATUS_FILTER.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                aria-pressed={statusFilter === st}
                /* min-h-11 di HP: chip ini target sentuh harian sales saat
                   memfilter stok. sm:min-h-0+sm:py-1 mengembalikan chip rapat
                   di desktop. */
                className={`inline-flex min-h-11 w-11 min-w-11 items-center justify-center rounded-full px-0 sm:w-auto sm:min-w-0 sm:px-3 text-xs font-medium transition-colors sm:min-h-0 sm:min-w-0 sm:py-1 ${
                  statusFilter === st
                    ? "bg-accent font-semibold text-white"
                    : "bg-paper text-muted hover:bg-line"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-line sm:border-l sm:pl-3">
            <span className="mr-1 text-xs font-semibold text-muted">Kondisi</span>
            {["all", "new", "second"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setConditionFilter(c)}
                aria-pressed={conditionFilter === c}
                className={`min-h-11 cursor-pointer rounded-full px-3 text-xs font-medium transition-colors sm:min-h-0 sm:py-1 ${
                  conditionFilter === c
                    ? "bg-accent font-semibold text-white"
                    : "bg-paper text-muted hover:bg-line"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daftar unit inventaris.
          Dua tampilan, satu sumber data (filteredUnits): di layar sempit
          setiap unit jadi kartu bertumpuk dengan label per field, di layar
          lebar jadi tabel sungguhan. Tabel 7 kolom ini lebarnya sekitar
          760px, jadi di 375px dia hanya bisa heroic lewat overflow-x-auto
          dan dua kolom terakhir (harga + ubah status) selalu tersembunyi
          di luar layar. Breakpoint di xl, bukan md atau lg, karena di 1024px
          sidebar memakan 256px sehingga wadahnya cuma 702px. */}
      <Card className="border-line shadow-sm">
        <CardContent className="p-0">
          {/* Kartu untuk layar sempit */}
          <div className="divide-y divide-line xl:hidden">
            {filteredUnits.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">
                Tidak ada data unit fisik yang sesuai dengan filter.
              </p>
            ) : (
              filteredUnits.map((unit) => {
                const label = unitLabel(unit, products);
                return (
                  <div key={unit.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink">{label}</p>
                        <p className="mt-0.5 flex items-center gap-1 break-all font-mono text-xs font-bold text-accent-deep">
                          <Barcode className="h-3.5 w-3.5 shrink-0 text-muted" />
                          {unit.imei}
                        </p>
                      </div>
                      <Badge
                        variant={
                          unit.status === "available"
                            ? "success"
                            : unit.status === "sold"
                            ? "secondary"
                            : unit.status === "in_service"
                            ? "warning"
                            : "outline"
                        }
                        className="shrink-0 font-mono text-[10px]"
                      >
                        {unit.status}
                      </Badge>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div>
                        <dt className="text-muted">Kondisi</dt>
                        <dd className="font-semibold text-ink">
                          {unit.condition === "new" ? "Baru" : "Seken"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Harga Beli (Modal)</dt>
                        <dd className="font-semibold text-ink">
                          {formatIDR(unit.purchase_cost)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Harga Jual</dt>
                        <dd className="font-bold text-accent-deep">
                          {formatIDR(unit.selling_price)}
                        </dd>
                      </div>
                    </dl>

                    <div>
                      <label
                        htmlFor={`unit-status-${unit.id}`}
                        className="mb-1 block text-xs font-semibold text-muted"
                      >
                        Ubah status stok
                      </label>
                      <select
                        id={`unit-status-${unit.id}`}
                        value={unit.status}
                        onChange={(e) =>
                          void handleUnitStatusChange(unit.id, e.target.value as UnitStatus)
                        }
                        className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base text-ink sm:text-sm"
                      >
                        <option value="available">available</option>
                        <option value="reserved">reserved</option>
                        <option value="sold">sold</option>
                        <option value="in_service">in_service</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Tabel untuk layar lebar */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-paper font-semibold text-muted">
                <tr>
                  <th className="p-3">Model Handphone</th>
                  <th className="p-3">Nomor Unik IMEI (15 Digit)</th>
                  <th className="p-3">Kondisi</th>
                  <th className="p-3">Status Stok</th>
                  <th className="p-3">Harga Beli (Modal)</th>
                  <th className="p-3">Harga Jual</th>
                  <th className="p-3">Aksi Ubah Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredUnits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      Tidak ada data unit fisik yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredUnits.map((unit) => {
                    const label = unitLabel(unit, products);
                    return (
                      <tr key={unit.id} className="hover:bg-paper/80">
                        <td className="p-3 font-semibold text-ink">{label}</td>
                        <td className="p-3 font-mono font-bold text-accent-deep">
                          <span className="flex items-center gap-1">
                            <Barcode className="w-3.5 h-3.5 text-muted" />
                            {unit.imei}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={unit.condition === "new" ? "success" : "info"}
                            className="font-mono text-[10px]"
                          >
                            {unit.condition === "new" ? "Baru" : "Seken"}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              unit.status === "available"
                                ? "success"
                                : unit.status === "sold"
                                ? "secondary"
                                : unit.status === "in_service"
                                ? "warning"
                                : "outline"
                            }
                            className="font-mono text-[10px]"
                          >
                            {unit.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted">
                          {formatIDR(unit.purchase_cost)}
                        </td>
                        <td className="p-3 font-bold text-ink">
                          {formatIDR(unit.selling_price)}
                        </td>
                        <td className="p-3">
                          <label htmlFor={`unit-status-wide-${unit.id}`} className="sr-only">
                            Ubah status stok {label}
                          </label>
                          <select
                            id={`unit-status-wide-${unit.id}`}
                            value={unit.status}
                            onChange={(e) =>
                              void handleUnitStatusChange(unit.id, e.target.value as UnitStatus)
                            }
                            className="rounded border border-line bg-paper px-2 py-1 text-xs font-medium text-muted"
                          >
                            <option value="available">available</option>
                            <option value="reserved">reserved</option>
                            <option value="sold">sold</option>
                            <option value="in_service">in_service</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog registrasi batch IMEI. Overlay yang menggulir supaya form
          panjang ini tetap bisa dijangkau di layar HP pendek, dan footer
          tombolnya menempel di bawah dialog. */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Form registrasi batch nomor IMEI"
            className="rise my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-accent-deep" />
                <span>Form Registrasi Batch Nomor IMEI</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                aria-label="Tutup dialog registrasi IMEI"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {validationError && (
              <div className="p-3 rounded-lg bg-bad-bg border border-bad/30 text-bad text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form
              onSubmit={handleBatchSubmit}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm"
            >
              <div>
                <label
                  htmlFor="batch-product"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Pilih Katalog Produk Master
                </label>
                <select
                  id="batch-product"
                  value={activeProductId}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base font-semibold text-ink sm:h-10 sm:text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brand} {p.model_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="batch-condition"
                    className="mb-1 block text-xs font-semibold text-muted"
                  >
                    Kondisi Fisik
                  </label>
                  <select
                    id="batch-condition"
                    value={batchCondition}
                    onChange={(e) => setBatchCondition(e.target.value as UnitCondition)}
                    className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base text-ink sm:h-10 sm:text-xs"
                  >
                    <option value="new">Baru (New)</option>
                    <option value="second">Seken (Second Hand)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="batch-purchase-cost"
                    className="mb-1 block text-xs font-semibold text-muted"
                  >
                    Harga Modal / Beli (Rp)
                  </label>
                  <Input
                    id="batch-purchase-cost"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(Number(e.target.value))}
                    className="sm:text-xs"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="batch-selling-price"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Harga Jual Toko (Rp)
                </label>
                <Input
                  id="batch-selling-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(Number(e.target.value))}
                  className="font-bold text-accent-deep sm:text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="batch-imei-list"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Daftar Nomor IMEI 15 Digit (Pisahkan per baris)
                </label>
                <textarea
                  id="batch-imei-list"
                  rows={5}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={imeiInputText}
                  onChange={(e) => setImeiInputText(e.target.value)}
                  placeholder={"358762109845991\n358762109845992"}
                  className="w-full rounded-lg border border-line bg-paper p-3 font-mono text-base text-ink sm:text-xs"
                />
                <span className="text-[11px] text-muted">
                  Wajib tepat 15 karakter angka per baris sesuai validasi PRD.
                </span>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBatchModal(false)}
                  className="w-full sm:w-auto"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full font-bold sm:w-auto"
                >
                  {isSaving ? "Menyimpan..." : "Simpan ke Inventaris"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
