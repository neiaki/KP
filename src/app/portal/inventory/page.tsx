"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/context/store-context";
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

export default function InventoryManagementPage() {
  const { products, inventoryUnits, addBatchIMEI, updateUnitStatus } = useStore();

  // Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [conditionFilter, setConditionFilter] = useState<string>("all");

  // Batch IMEI registration modal / drawer state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number>(products[0]?.id || 1);
  const [batchCondition, setBatchCondition] = useState<UnitCondition>("new");
  const [purchaseCost, setPurchaseCost] = useState<number>(10000000);
  const [sellingPrice, setSellingPrice] = useState<number>(12000000);
  const [imeiInputText, setImeiInputText] = useState("");
  const [validationError, setValidationError] = useState("");

  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!showBatchModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowBatchModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBatchModal]);

  const handleBatchSubmit = (e: React.FormEvent) => {
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

    addBatchIMEI(selectedProductId, imeis, batchCondition, purchaseCost, sellingPrice);
    setShowBatchModal(false);
    setImeiInputText("");
    setNotice({ type: "success", text: `Berhasil mendaftarkan ${imeis.length} unit fisik IMEI ke inventaris.` });
  };

  // Filter units
  const filteredUnits = inventoryUnits.filter((unit) => {
    const prod = products.find((p) => p.id === unit.product_id);
    const matchesSearch =
      unit.imei.includes(search) ||
      prod?.brand.toLowerCase().includes(search.toLowerCase()) ||
      prod?.model_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || unit.status === statusFilter;
    const matchesCondition = conditionFilter === "all" || unit.condition === conditionFilter;
    return matchesSearch && matchesStatus && matchesCondition;
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Manajemen Inventaris Unit & IMEI
            </h1>
            <Badge variant="purple" className="font-mono text-xs">
              SALES & ADMIN
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Pelacakan presisi setiap nomor IMEI 15-digit fisik, status mutasi, dan registrasi batch stok.
          </p>
        </div>

        <Button
          onClick={() => setShowBatchModal(true)}
          className="gap-2 font-bold text-xs shadow-md"
        >
          <PackagePlus className="w-4 h-4" />
          <span>+ Registrasi Batch IMEI</span>
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-line shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase">Unit Available</div>
          <div className="text-2xl font-black text-good mt-1">
            {inventoryUnits.filter((u) => u.status === "available").length}
          </div>
          <div className="text-[11px] text-muted mt-0.5">Siap dijual di POS</div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-line shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase">Unit Terjual (Sold)</div>
          <div className="text-2xl font-black text-ink mt-1">
            {inventoryUnits.filter((u) => u.status === "sold").length}
          </div>
          <div className="text-[11px] text-muted mt-0.5">Aktif masa garansi</div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-line shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase">Unit Seken / Trade-In</div>
          <div className="text-2xl font-black text-accent-deep mt-1">
            {inventoryUnits.filter((u) => u.condition === "second").length}
          </div>
          <div className="text-[11px] text-muted mt-0.5">Hasil tukar tambah</div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-line shadow-xs">
          <div className="text-[11px] font-semibold text-muted uppercase">Total Terdata</div>
          <div className="text-2xl font-black text-ink mt-1">
            {inventoryUnits.length}
          </div>
          <div className="text-[11px] text-muted mt-0.5">Seluruh unit fisik</div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-card p-4 rounded-xl border border-line shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-muted absolute left-3 top-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari IMEI 15 digit atau model..."
            className="pl-9 h-10 text-xs font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-muted mr-1">Status:</span>
            {["all", "available", "sold", "reserved", "in_service"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                  statusFilter === st
                    ? "bg-accent text-white font-semibold"
                    : "bg-paper text-muted hover:bg-line"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Condition Filter */}
          <div className="flex items-center gap-1 border-l border-line pl-3">
            <span className="text-xs font-semibold text-muted mr-1">Kondisi:</span>
            {["all", "new", "second"].map((c) => (
              <button
                key={c}
                onClick={() => setConditionFilter(c)}
                className={`px-2 py-1 rounded text-xs font-medium cursor-pointer ${
                  conditionFilter === c
                    ? "bg-slate-900 text-white"
                    : "bg-paper text-muted hover:bg-line"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <Card className="border-line shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-paper text-muted font-semibold border-b border-line">
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
                    const prod = products.find((p) => p.id === unit.product_id);
                    return (
                      <tr key={unit.id} className="hover:bg-paper/80">
                        <td className="p-3 font-semibold text-ink">
                          {prod?.brand} {prod?.model_name}
                        </td>
                        <td className="p-3 font-mono font-bold text-accent-deep">
                          <span className="flex items-center gap-1">
                            <Barcode className="w-3.5 h-3.5 text-muted" />
                            {unit.imei}
                          </span>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={unit.condition === "new" ? "success" : "info"}
                            className="uppercase font-mono text-[10px]"
                          >
                            {unit.condition}
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
                            className="uppercase font-mono text-[10px]"
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
                          <select
                            value={unit.status}
                            onChange={(e) =>
                              updateUnitStatus(unit.id, e.target.value as UnitStatus)
                            }
                            className="bg-paper border border-line rounded px-2 py-1 text-xs font-medium text-muted"
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

      {/* Batch IMEI Registration Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Form registrasi batch nomor IMEI"
            className="bg-card rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-line rise"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <PackagePlus className="w-5 h-5 text-accent-deep" />
                <span>Form Registrasi Batch Nomor IMEI</span>
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                aria-label="Tutup dialog registrasi IMEI"
                className="text-muted hover:text-ink cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {validationError && (
              <div className="p-3 rounded-lg bg-bad-bg border border-bad/30 text-bad text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            <form onSubmit={handleBatchSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-muted mb-1">
                  Pilih Katalog Produk Master:
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full bg-paper border border-slate-300 rounded-lg p-2 text-xs font-semibold"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brand} {p.model_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-muted mb-1">
                    Kondisi Fisik:
                  </label>
                  <select
                    value={batchCondition}
                    onChange={(e) => setBatchCondition(e.target.value as UnitCondition)}
                    className="w-full bg-paper border border-slate-300 rounded-lg p-2 text-xs"
                  >
                    <option value="new">Baru (New)</option>
                    <option value="second">Seken (Second Hand)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-muted mb-1">
                    Harga Modal / Beli (Rp):
                  </label>
                  <Input
                    type="number"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(Number(e.target.value))}
                    className="text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">
                  Harga Jual Toko (Rp):
                </label>
                <Input
                  type="number"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(Number(e.target.value))}
                  className="text-xs font-bold text-accent-deep"
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">
                  Daftar Nomor IMEI 15 Digit (Pisahkan per baris):
                </label>
                <textarea
                  rows={4}
                  value={imeiInputText}
                  onChange={(e) => setImeiInputText(e.target.value)}
                  placeholder="358762109845991&#10;358762109845992"
                  className="w-full p-2.5 bg-paper border border-slate-300 rounded-lg text-xs font-mono"
                />
                <span className="text-[11px] text-muted">
                  *Wajib tepat 15 karakter angka per baris sesuai validasi PRD.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowBatchModal(false)}
                >
                  Batal
                </Button>
                <Button type="submit" className="font-bold">
                  Simpan ke Inventaris
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
