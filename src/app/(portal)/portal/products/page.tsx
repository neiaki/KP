"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { useStore } from "@/context/store-context";
import { formatIDR } from "@/lib/utils";
import { isRealPhoto } from "@/lib/shop";
import { Product } from "@/types";
import { Boxes, Plus, Search, Edit2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { hargaAcuanLayak } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/components/portal/role-badge";
import { Card, CardContent } from "@/components/ui/card";

// Dipakai kalau produk belum punya foto. Foto stok pihak ketiga tidak pernah
// dipakai karena modelnya bisa tidak cocok dengan produk yang sedang disimpan.
//
// Placeholder ini file lokal yang ikut ter-commit, bukan URL yang dirakit dari
// NEXT_PUBLIC_SUPABASE_URL. Template literal tidak pernah gagal diam-diam:
// kalau env-nya kosong, Polaris tidak throws, dia menulis teks "undefined" di
// depan path. Hasilnya kolom image_url tersimpan sebagai
// "undefined/storage/v1/object/public/product-images/products/placeholder.svg"
// dan string itu ikut terkirim ke setiap pengunjung. Host Storage juga tidak
// boleh dikarang di bundle browser: hanya server yang boleh menyusunnya, dan
// file lokal selalu bisa dilayani apa pun isi env.
const PLACEHOLDER_IMAGE = "/products/placeholder.svg";

export default function MasterProductsPage() {
  const { products, inventoryUnits, addProduct, updateProduct, currentRole } =
    useStore();

  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [brand, setBrand] = useState("Apple");
  const [modelName, setModelName] = useState("");
  const [specs, setSpecs] = useState("");
  // Mulai dari 0, bukan angka tebakan. Harga acuan tiap model berbeda jauh dan
  // hanya staf yang tahu, jadi 0 berarti "belum diisi", bukan tebakan.
  const [defaultPrice, setDefaultPrice] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState("");

  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    // Nol, sama seperti useState di atas. Versi lama mengisi 10.000.000, dan
    // angka itu bukan harga, itu karangan. Staf yang membuka form, mengetik nama
    // model, lalu menyimpan tanpa menyentuh field harga akan menyimpan
    // Rp10.000.000 sebagai harga acuan unit yang tidak pernah ia harga.
    // Tidak ada yang menyadari, karena angkanya terlihat seperti harga asli di
    // etalase, dan halaman publik hanya menyembunyikan baris harga saat nilainya nol.
    setDefaultPrice(0);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim()) {
      setNotice({ type: "error", text: "Nama model handphone wajib diisi!" });
      return;
    }
    // Nol itu sah, negatif dan kosong tidak. default_price 0 berarti "belum
    // ada harga acuan yang bisa dipertanggungjawabkan", bukan harga Rp0, dan
    // etalase publik menyembunyikan baris harga saat angkanya nol. Menolak nol
    // di sini membuat produk yang sengaja dibiarkan tanpa harga mustahil
    // disimpan dari portal, jadi satu-satunya jalan untuk memperbaikinya
    // adalah SQL.
    //
    // Aturannya datang dari hargaAcuanLayak supaya bisa diuji. Versi
    // pertamanya inline di sini, dan tidak ada test yang mengunci `< 0`, jadi
    // satu karakter yang berubah menjadi `<= 0` akan lolos tanpa ada yang
    // memberitahu, dan produk tanpa harga kembali mustahil disimpan.
    if (!hargaAcuanLayak(defaultPrice)) {
      setNotice({ type: "error", text: "Harga acuan tidak boleh negatif." });
      return;
    }

    setIsSaving(true);
    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, {
          brand,
          model_name: modelName.trim(),
          specs: specs.trim(),
          default_price: defaultPrice,
          image_url: imageUrl.trim() || PLACEHOLDER_IMAGE,
        });
        setNotice({ type: "success", text: "Master produk berhasil diperbarui." });
      } else {
        await addProduct({
          brand,
          model_name: modelName.trim(),
          specs: specs.trim(),
          default_price: defaultPrice,
          image_url: imageUrl.trim() || PLACEHOLDER_IMAGE,
        });
        setNotice({ type: "success", text: "Master produk baru berhasil ditambahkan." });
      }
      setShowAddModal(false);
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal menyimpan produk.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.brand.toLowerCase().includes(search.toLowerCase()) ||
      p.model_name.toLowerCase().includes(search.toLowerCase()) ||
      p.specs.toLowerCase().includes(search.toLowerCase())
  );

  // Satu lintasan atas inventoryUnits untuk semua kartu, bukan satu filter
  // per kartu per render. Unit trade-in punya product_id null dan tidak boleh
  // dihitung ke model mana pun.
  const unitCountByProductId = new Map<number, { total: number; available: number }>();
  for (const u of inventoryUnits) {
    if (u.product_id === null) continue;
    const entry = unitCountByProductId.get(u.product_id) ?? { total: 0, available: 0 };
    entry.total += 1;
    if (u.status === "available") entry.available += 1;
    unitCountByProductId.set(u.product_id, entry);
  }
  const productsWithoutUnit = products.filter((p) => !unitCountByProductId.has(p.id)).length;

  return (
    <div className="space-y-6 pb-12 sm:space-y-8">
      {/* Header katalog */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Katalog Master Produk
            </h1>
            <RoleBadge role={currentRole} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Definisi master seri smartphone, spesifikasi acuan, dan harga dasar. Sales meregistrasi IMEI di bawah master ini.
          </p>
          <p className="mt-1 text-sm text-muted">
            Model boleh disimpan tanpa unit. Selama belum ada unit, dia tetap tampil di etalase publik dengan badge &quot;Belum ada unit&quot; dan tombol Minta dikabari, tapi tidak bisa dijual di Kasir POS.
          </p>
        </div>

        <Button onClick={handleOpenAdd} className="w-full gap-2 text-sm font-bold shadow-md sm:w-auto sm:text-xs">
          <Plus className="w-4 h-4" />
          <span>Tambah Model Produk Baru</span>
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

      {/* Pencarian katalog */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 shadow-sm">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-muted absolute left-3 top-3.5" />
          <label htmlFor="product-search" className="sr-only">
            Cari produk
          </label>
          <Input
            id="product-search"
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari model atau spesifikasi produk..."
            className="pl-9 sm:text-xs"
          />
        </div>
        <span className="hidden text-xs font-semibold text-muted sm:inline">
          Total: {products.length} model terdaftar, {productsWithoutUnit} belum ada unit
        </span>
      </div>

      {/* Grid katalog */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {filteredProducts.map((p) => {
          const counts = unitCountByProductId.get(p.id);
          const availableUnitsCount = counts?.available ?? 0;

          return (
            <Card
              key={p.id}
              className="flex flex-col justify-between border-line transition-shadow hover:shadow-md"
            >
              {/* h-32 di HP: h-44 memakai hampir separuh layar pertama di
                  812px hanya untuk satu foto produk. */}
              <div className="relative h-32 overflow-hidden rounded-t-xl bg-paper sm:h-44">
                <Image
                  fill
                  sizes={"(max-width: 640px) 50vw, 20vw"}
                  src={isRealPhoto(p.image_url) ? p.image_url.trim() : PLACEHOLDER_IMAGE}
                  alt={p.model_name}
                  className="h-full w-full object-cover"
                />
              </div>

              <CardContent className="flex flex-1 flex-col justify-between space-y-3 p-4 text-sm">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {p.brand}
                    </Badge>
                    <Badge
                      variant={availableUnitsCount > 0 ? "success" : "destructive"}
                      className="font-mono text-[10px]"
                    >
                      {availableUnitsCount} unit siap jual
                    </Badge>
                    {counts === undefined && (
                      <Badge variant="warning" className="text-[10px]">
                        Belum ada unit, tampil di etalase
                      </Badge>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-ink">{p.model_name}</h3>
                  <p className="mt-1 leading-relaxed text-muted line-clamp-2">{p.specs}</p>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-muted">Harga acuan</span>
                    <div className="font-mono text-sm font-black text-accent-deep">
                      {formatIDR(p.default_price)}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenEdit(p)}
                    className="h-11 shrink-0 gap-1.5 text-xs font-semibold sm:h-8"
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

      {/* Dialog tambah/edit produk */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-3 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingProduct ? "Dialog edit master produk" : "Dialog tambah master produk"}
            className="rise my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col space-y-4 rounded-xl border border-line bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <h3 className="flex items-center gap-2 text-base font-bold text-ink sm:text-lg">
                <Boxes className="h-5 w-5 shrink-0 text-accent-deep" />
                <span>{editingProduct ? "Edit Master Produk" : "Tambah Model Produk Baru"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label="Tutup dialog produk"
                className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink sm:h-10 sm:w-10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 text-sm"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="product-brand"
                    className="mb-1 block text-xs font-semibold text-muted"
                  >
                    Merek Handphone
                  </label>
                  <select
                    id="product-brand"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="h-11 w-full rounded-lg border border-line bg-paper px-3 text-base font-semibold text-ink sm:h-10 sm:text-xs"
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
                  <label
                    htmlFor="product-model"
                    className="mb-1 block text-xs font-semibold text-muted"
                  >
                    Nama Seri / Model
                  </label>
                  <Input
                    id="product-model"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="Contoh: iPhone 16 Pro 256GB"
                    className="sm:text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="product-price"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Harga Acuan Dasar (Rp)
                </label>
                <Input
                  id="product-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(Number(e.target.value))}
                  className="font-bold text-accent-deep sm:text-xs"
                  required
                />
                <span className="mt-1 block text-[11px] font-semibold text-muted">
                  Isi 0 kalau harga acuannya belum tahu. Baris harganya tidak
                  tampil di etalase selama angkanya 0.
                </span>
              </div>

              <div>
                <label
                  htmlFor="product-specs"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Spesifikasi Utama
                </label>
                <textarea
                  id="product-specs"
                  rows={3}
                  value={specs}
                  onChange={(e) => setSpecs(e.target.value)}
                  placeholder="Chipset, RAM/Storage, Kamera, Ukuran Layar..."
                  className="w-full rounded-lg border border-line bg-paper p-3 text-base text-ink sm:text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="product-image"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  URL Foto Produk
                </label>
                <Input
                  id="product-image"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="sm:text-xs"
                />
                <span className="mt-1 block text-[11px] font-semibold text-muted">
                  Pakai foto resmi model ini. Biarkan kosong dulu kalau fotonya belum ada.
                </span>
              </div>

              <div className="rounded-lg border border-warn/30 bg-warn-bg px-3 py-2.5 text-xs leading-relaxed text-warn">
                <p className="font-bold">Kalau unitnya belum ada, model ini tetap tampil di etalase</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  <li>Muncul di katalog publik dengan badge &quot;Belum ada unit&quot; dan tombol Minta dikabari.</li>
                  <li>Tidak ikut di hitungan &quot;unit ada di toko&quot; di beranda, dan tidak bisa dijual di Kasir POS.</li>
                  <li>Baru bisa dijual setelah unit pertama didaftarkan di Inventaris Unit IMEI pakai IMEI asli unit itu.</li>
                </ul>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  className="w-full sm:w-auto"
                >
                  Batal
                </Button>
                <Button type="submit" disabled={isSaving} className="w-full font-bold sm:w-auto">
                  {isSaving
                    ? "Menyimpan..."
                    : editingProduct
                    ? "Simpan Perubahan"
                    : "Tambahkan Model"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
