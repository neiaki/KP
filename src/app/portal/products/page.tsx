"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/context/store-context";
import { formatIDR } from "@/lib/utils";
import { Product } from "@/types";
import { Boxes, Plus, Search, Edit2, CheckCircle2, AlertCircle, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function MasterProductsPage() {
  const { products, inventoryUnits, addProduct, updateProduct, currentRole } = useStore();

  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [brand, setBrand] = useState("Apple");
  const [modelName, setModelName] = useState("");
  const [specs, setSpecs] = useState("");
  const [defaultPrice, setDefaultPrice] = useState<number>(10000000);
  const [imageUrl, setImageUrl] = useState("");

  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (!showAddModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAddModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAddModal]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setBrand("Apple");
    setModelName("");
    setSpecs("");
    setDefaultPrice(10000000);
    setImageUrl("");
    setShowAddModal(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setBrand(p.brand);
    setModelName(p.model_name);
    setSpecs(p.specs);
    setDefaultPrice(p.default_price);
    setImageUrl(p.image_url || "");
    setShowAddModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim()) {
      setNotice({ type: "error", text: "Nama model handphone wajib diisi!" });
      return;
    }

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        brand,
        model_name: modelName.trim(),
        specs: specs.trim(),
        default_price: defaultPrice,
        image_url:
          imageUrl.trim() ||
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80",
      });
      setNotice({ type: "success", text: "Master produk berhasil diperbarui." });
    } else {
      addProduct({
        brand,
        model_name: modelName.trim(),
        specs: specs.trim(),
        default_price: defaultPrice,
        image_url:
          imageUrl.trim() ||
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80",
      });
      setNotice({ type: "success", text: "Master produk baru berhasil ditambahkan." });
    }

    setShowAddModal(false);
  };

  const filteredProducts = products.filter(
    (p) =>
      p.brand.toLowerCase().includes(search.toLowerCase()) ||
      p.model_name.toLowerCase().includes(search.toLowerCase()) ||
      p.specs.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Katalog Master Produk
            </h1>
            <Badge variant="purple" className="font-mono text-xs">
              ADMIN EXCLUSIVE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Definisi master seri smartphone, spesifikasi acuan, dan harga dasar. Sales meregistrasi IMEI di bawah master ini.
          </p>
        </div>

        <Button onClick={handleOpenAdd} className="gap-2 font-bold text-xs shadow-md">
          <Plus className="w-4 h-4" />
          <span>+ Tambah Model Produk Baru</span>
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

      {/* Search Bar */}
      <div className="bg-card p-4 rounded-xl border border-line shadow-sm flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-muted absolute left-3 top-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari model atau spesifikasi produk..."
            className="pl-9 h-10 text-xs"
          />
        </div>
        <span className="text-xs text-muted font-semibold hidden sm:inline">
          Total: {products.length} Model Terdaftar
        </span>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map((p) => {
          const availableUnitsCount = inventoryUnits.filter(
            (u) => u.product_id === p.id && u.status === "available"
          ).length;

          return (
            <Card
              key={p.id}
              className="border-line hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div className="h-44 bg-paper overflow-hidden rounded-t-xl">
                <img
                  src={
                    p.image_url ||
                    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80"
                  }
                  alt={p.model_name}
                  className="w-full h-full object-cover"
                />
              </div>

              <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between text-xs">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-slate-900/80 text-white backdrop-blur text-[10px]">
                      {p.brand}
                    </Badge>
                    <Badge
                      variant={availableUnitsCount > 0 ? "success" : "destructive"}
                      className="font-mono text-[10px]"
                    >
                      {availableUnitsCount} Unit Siap Jual
                    </Badge>
                  </div>
                  <h3 className="font-bold text-ink text-base mt-2">{p.model_name}</h3>
                  <p className="text-muted line-clamp-2 mt-1 leading-relaxed">{p.specs}</p>
                </div>

                <div className="pt-3 border-t border-line flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase text-muted font-semibold">Harga Acuan</span>
                    <div className="text-sm font-black text-accent-deep">
                      {formatIDR(p.default_price)}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit(p)}
                    className="h-8 gap-1.5 text-xs font-semibold"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingProduct ? "Dialog edit master produk" : "Dialog tambah master produk"}
            className="bg-card rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-line rise"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <Boxes className="w-5 h-5 text-accent-deep" />
                <span>{editingProduct ? "Edit Master Produk" : "Tambah Model Produk Baru"}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup dialog produk"
                className="text-muted hover:text-ink cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-muted mb-1">Merek Handphone:</label>
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-paper border border-slate-300 rounded-lg p-2 text-xs font-semibold"
                  >
                    <option value="Apple">Apple</option>
                    <option value="Samsung">Samsung</option>
                    <option value="Xiaomi">Xiaomi</option>
                    <option value="Oppo">Oppo</option>
                    <option value="Vivo">Vivo</option>
                    <option value="Google">Google</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-muted mb-1">Nama Seri / Model:</label>
                  <Input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Contoh: iPhone 16 Pro 256GB"
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Harga Acuan Dasar (Rp):</label>
                <Input
                  type="number"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(Number(e.target.value))}
                  className="text-xs font-bold text-accent-deep"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Spesifikasi Utama:</label>
                <textarea
                  rows={3}
                  value={specs}
                  onChange={(e) => setSpecs(e.target.value)}
                  placeholder="Chipset, RAM/Storage, Kamera, Ukuran Layar..."
                  className="w-full p-2.5 bg-paper border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">URL Foto Produk:</label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Batal
                </Button>
                <Button type="submit" className="font-bold">
                  {editingProduct ? "Simpan Perubahan" : "Tambahkan Model"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
