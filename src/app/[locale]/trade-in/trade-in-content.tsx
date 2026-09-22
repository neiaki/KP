"use client";

import React, { useEffect, useState } from "react";
import { Locale } from "@/lib/translations";
import { formatIDR } from "@/lib/utils";
import { useStore } from "@/context/store-context";
import { Smartphone, ShieldCheck, Send, BadgeCheck, AlertCircle, Upload, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* Tukar tambah saat ini hanya menerima iPhone 11 ke atas. Lineup per seri
   lengkap dengan basis taksiran (rupiah) tiap varian. Bukan harga final,
   hanya titik awal sebelum cek fisik di konter. */
const IPHONE_LINEUP: Array<{
  series: string;
  storage: number[];
  models: Array<{ value: string; base: number }>;
}> = [
  {
    series: "17",
    storage: [256, 512, 1024],
    models: [
      { value: "iPhone 17", base: 15000000 },
      { value: "iPhone 17 Pro", base: 18000000 },
      { value: "iPhone 17 Pro Max", base: 20000000 },
    ],
  },
  {
    series: "16",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 16e", base: 9000000 },
      { value: "iPhone 16", base: 13500000 },
      { value: "iPhone 16 Plus", base: 14000000 },
      { value: "iPhone 16 Pro", base: 16000000 },
      { value: "iPhone 16 Pro Max", base: 17500000 },
    ],
  },
  {
    series: "15",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 15", base: 12000000 },
      { value: "iPhone 15 Plus", base: 12500000 },
      { value: "iPhone 15 Pro", base: 14000000 },
      { value: "iPhone 15 Pro Max", base: 15500000 },
    ],
  },
  {
    series: "14",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 14", base: 9500000 },
      { value: "iPhone 14 Plus", base: 10000000 },
      { value: "iPhone 14 Pro", base: 11000000 },
      { value: "iPhone 14 Pro Max", base: 12000000 },
    ],
  },
  {
    series: "13",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 13 mini", base: 6000000 },
      { value: "iPhone 13", base: 7500000 },
      { value: "iPhone 13 Pro", base: 8500000 },
      { value: "iPhone 13 Pro Max", base: 9500000 },
    ],
  },
  {
    series: "12",
    storage: [64, 128, 256, 512],
    models: [
      { value: "iPhone 12 mini", base: 4500000 },
      { value: "iPhone 12", base: 5500000 },
      { value: "iPhone 12 Pro", base: 6500000 },
      { value: "iPhone 12 Pro Max", base: 7500000 },
    ],
  },
  {
    series: "11",
    storage: [64, 128, 256, 512],
    models: [
      { value: "iPhone 11", base: 3500000 },
      { value: "iPhone 11 Pro", base: 4000000 },
      { value: "iPhone 11 Pro Max", base: 4500000 },
    ],
  },
];

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function storageFactor(gb: number): number {
  if (gb >= 1024) return 1.3;
  if (gb >= 512) return 1.2;
  if (gb >= 256) return 1.1;
  if (gb <= 64) return 0.9;
  return 1;
}

function storageLabel(gb: number): string {
  return gb >= 1024 ? `${Math.round(gb / 1024)}TB` : `${gb}GB`;
}

type Photo = { url: string; name: string };

export function TradeInContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const en = locale === "en";

  const [deviceModel, setDeviceModel] = useState("iPhone 12");
  const [storageGb, setStorageGb] = useState(128);
  const [screenCondition, setScreenCondition] = useState<"good" | "minor_scratches" | "cracked">("good");
  const [bodyCondition, setBodyCondition] = useState<"flawless" | "minor_dents" | "heavy_wear">("minor_dents");
  const [batteryHealth, setBatteryHealth] = useState(85);
  const [biometricWorks, setBiometricWorks] = useState(true);
  const [cameraWorks, setCameraWorks] = useState(true);
  const [boxIncluded, setBoxIncluded] = useState(true);
  const [imei, setImei] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState("");

  const seriesOf = (model: string) =>
    IPHONE_LINEUP.find((s) => s.models.some((m) => m.value === model)) ?? IPHONE_LINEUP[1];
  const activeSeries = seriesOf(deviceModel);
  const baseOf = (model: string) =>
    activeSeries.models.find((m) => m.value === model)?.base ?? 3500000;

  // Storage yang tidak tersedia di seri baru dikembalikan ke default seri itu.
  const changeModel = (model: string) => {
    setDeviceModel(model);
    const next = seriesOf(model);
    if (!next.storage.includes(storageGb)) {
      setStorageGb(next.storage.includes(128) ? 128 : next.storage[0]);
    }
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files);
    if (photos.length + picked.length > MAX_PHOTOS) {
      setError(
        en
          ? `Maximum ${MAX_PHOTOS} photos. Remove one first to add another.`
          : `Maksimal ${MAX_PHOTOS} foto. Hapus satu dulu untuk tambah lagi.`
      );
      return;
    }
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        setError(en ? `${f.name} is not an image file.` : `${f.name} bukan file gambar.`);
        return;
      }
      if (f.size > MAX_PHOTO_BYTES) {
        setError(
          en
            ? `${f.name} is over 5MB. Pick a smaller photo.`
            : `${f.name} lebih dari 5MB. Pilih foto yang lebih kecil.`
        );
        return;
      }
    }
    setError("");
    setPhotos((prev) => [...prev, ...picked.map((f) => ({ url: URL.createObjectURL(f), name: f.name }))]);
  };

  const removePhoto = (url: string) => {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.url === url);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.url !== url);
    });
  };

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calculateValuation = () => {
    const base = Math.round(baseOf(deviceModel) * storageFactor(storageGb));

    let multiplier = 1.0;
    if (screenCondition === "minor_scratches") multiplier -= 0.1;
    if (screenCondition === "cracked") multiplier -= 0.35;

    if (bodyCondition === "minor_dents") multiplier -= 0.08;
    if (bodyCondition === "heavy_wear") multiplier -= 0.2;

    if (batteryHealth < 80) multiplier -= 0.1;
    if (!biometricWorks) multiplier -= 0.25;
    if (!cameraWorks) multiplier -= 0.2;
    if (boxIncluded) multiplier += 0.05;

    return Math.max(1000000, Math.round((base * multiplier) / 50000) * 50000);
  };

  const estimatedValue = calculateValuation();
  const deviceLabel = `${deviceModel} ${storageLabel(storageGb)}`;
  const grade =
    screenCondition === "good" && bodyCondition === "flawless"
      ? en
        ? "Grade A, mint"
        : "Grade A, mulus"
      : screenCondition === "cracked"
        ? en
          ? "Grade C, needs repair"
          : "Grade C, perlu servis"
        : en
          ? "Grade B, fair"
          : "Grade B, wajar";

  const screenOptions = [
    { key: "good", label: en ? "Flawless" : "Mulus" },
    { key: "minor_scratches", label: en ? "Light scratches" : "Lecet halus" },
    { key: "cracked", label: en ? "Cracked" : "Retak" },
  ] as const;

  const bodyOptions = [
    { key: "flawless", label: en ? "Flawless" : "Mulus" },
    { key: "minor_dents", label: en ? "Light dents" : "Lecet dikit" },
    { key: "heavy_wear", label: en ? "Heavy wear" : "Lecet berat" },
  ] as const;

  const checks = [
    { checked: biometricWorks, set: setBiometricWorks, label: en ? "Face ID or fingerprint works" : "Face ID atau fingerprint normal" },
    { checked: cameraWorks, set: setCameraWorks, label: en ? "Front and back cameras clear" : "Kamera depan belakang jernih" },
    { checked: boxIncluded, set: setBoxIncluded, label: en ? "Box and cable included" : "Dus dan kabel masih ada" },
  ];

  const optionClass = (active: boolean, danger = false) =>
    `rounded-lg border p-3 text-left text-xs font-semibold transition-colors ${
      active
        ? danger
          ? "border-bad bg-bad-bg font-bold text-bad ring-1 ring-bad"
          : "border-accent bg-accent-soft font-bold text-accent-deep ring-1 ring-accent"
        : "border-line bg-card text-muted hover:bg-paper hover:text-ink"
    }`;

  const selectClass =
    "h-10 w-full cursor-pointer rounded-lg border border-line bg-card px-2.5 text-sm font-medium text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent";

  const submitViaWa = () => {
    const cleanImei = imei.trim();
    if (cleanImei !== "" && !/^\d{15}$/.test(cleanImei)) {
      setError(
        en ? "IMEI must be exactly 15 digits, or leave it empty." : "IMEI wajib tepat 15 digit angka, atau kosongkan saja."
      );
      return;
    }
    setError("");
    const cleanWa = (storeSettings.whatsapp_number || "6285775398389").replace(/\D/g, "");
    const text = en
      ? `Hello At Cell, I want to trade in my ${deviceLabel} (estimate ${formatIDR(estimatedValue)}, ${grade}). Which replacement stock is available?`
      : `Halo At Cell, saya mau tukar tambah ${deviceLabel} (taksiran ${formatIDR(estimatedValue)}, ${grade}). Stok penggantinya apa saja?`;
    const withImei = cleanImei !== "" ? `${text}\nIMEI: ${cleanImei}` : text;
    // Link WA tidak bisa membawa file, jadi foto dikirim manual di chat.
    const withPhotos =
      photos.length > 0
        ? en
          ? `${withImei}\nCondition photos: I will send ${photos.length} photo(s) in this chat.`
          : `${withImei}\nFoto kondisi: ${photos.length} foto saya kirim di chat ini.`
        : withImei;
    window.open(`https://wa.me/${cleanWa}?text=${encodeURIComponent(withPhotos)}`, "_blank");
  };

  return (
    <div className="bg-paper">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {en ? "What is your old phone worth?" : "HP lama Anda laku berapa?"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {en
            ? "Answer honestly, get the estimate, then bring the phone in for a physical check."
            : "Isi kondisinya sejujurnya, dapat taksirannya, lalu bawa HP-nya ke konter untuk cek fisik."}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Smartphone className="h-4 w-4 text-accent" />
                  {en ? "Your old phone condition" : "Kondisi HP lama"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="flex items-start gap-1.5 rounded-lg bg-accent-soft p-2.5 text-left text-[11px] leading-relaxed text-accent-deep">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {en
                    ? "Trade-in currently accepts iPhone 11 and newer only."
                    : "Tukar tambah saat ini hanya menerima iPhone 11 ke atas."}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tt-model" className="mb-1 block text-xs font-bold text-ink">
                      {en ? "iPhone model" : "Tipe iPhone"}
                    </label>
                    <select
                      id="tt-model"
                      value={deviceModel}
                      onChange={(e) => changeModel(e.target.value)}
                      className={selectClass}
                    >
                      {IPHONE_LINEUP.map((s) => (
                        <optgroup key={s.series} label={`iPhone ${s.series} series`}>
                          {s.models.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.value}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="tt-storage" className="mb-1 block text-xs font-bold text-ink">
                      {en ? "Storage" : "Penyimpanan"}
                    </label>
                    <select
                      id="tt-storage"
                      value={storageGb}
                      onChange={(e) => setStorageGb(Number(e.target.value))}
                      className={selectClass}
                    >
                      {activeSeries.storage.map((gb) => (
                        <option key={gb} value={gb}>
                          {storageLabel(gb)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-ink" id="tt-screen">
                    {en ? "Screen and glass" : "Layar dan kaca"}
                  </p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="tt-screen">
                    {screenOptions.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setScreenCondition(o.key)}
                        aria-pressed={screenCondition === o.key}
                        className={optionClass(screenCondition === o.key, o.key === "cracked")}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-ink" id="tt-body">
                    {en ? "Body and bezel" : "Bodi dan bezel"}
                  </p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="tt-body">
                    {bodyOptions.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setBodyCondition(o.key)}
                        aria-pressed={bodyCondition === o.key}
                        className={optionClass(bodyCondition === o.key, o.key === "heavy_wear")}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="tt-bh" className="text-xs font-bold text-ink">
                      {en ? "Battery health" : "Kesehatan baterai"}
                    </label>
                    <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-extrabold text-accent-deep">
                      {batteryHealth}%
                    </span>
                  </div>
                  <input
                    id="tt-bh"
                    type="range"
                    min="50"
                    max="100"
                    value={batteryHealth}
                    onChange={(e) => setBatteryHealth(Number(e.target.value))}
                    className="h-2 w-full cursor-pointer accent-accent"
                  />
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-ink">
                    {en ? "Functions and box" : "Fungsi dan kelengkapan"}
                  </p>
                  <div className="space-y-2 text-xs">
                    {checks.map((row) => (
                      <label key={row.label} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-paper p-2.5">
                        <input
                          type="checkbox"
                          checked={row.checked}
                          onChange={(e) => row.set(e.target.checked)}
                          className="h-4 w-4 rounded accent-accent"
                        />
                        <span className="font-medium text-ink">{row.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold text-ink" id="tt-photos">
                    {en ? `Condition photos${photos.length > 0 ? ` (${photos.length}/${MAX_PHOTOS})` : ""}` : `Foto kondisi barang${photos.length > 0 ? ` (${photos.length}/${MAX_PHOTOS})` : ""}`}
                  </p>
                  {photos.length > 0 && (
                    <div className="mb-2 grid grid-cols-4 gap-2" role="group" aria-labelledby="tt-photos">
                      {photos.map((p) => (
                        <div key={p.url} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-card">
                          <img src={p.url} alt={en ? "Condition photo preview" : "Pratinjau foto kondisi"} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(p.url)}
                            aria-label={en ? `Remove ${p.name}` : `Hapus ${p.name}`}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label
                    htmlFor="tt-photo-input"
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-card px-4 py-3 text-xs font-bold text-muted transition-colors hover:border-accent hover:text-accent-deep"
                  >
                    <Upload className="h-4 w-4" />
                    {en ? "Upload photos (max 4, 5MB each)" : "Upload foto (maks 4, tiap 5MB)"}
                  </label>
                  <input
                    id="tt-photo-input"
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addPhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    {en
                      ? "Photos help the counter check go faster. You send them manually in the WhatsApp chat after tapping submit."
                      : "Foto bikin cek di konter lebih cepat. Foto dikirim manual di chat WhatsApp setelah tombol ajukan ditekan."}
                  </p>
                </div>

                <div>
                  <label htmlFor="tt-imei" className="mb-1 block text-xs font-bold text-ink">
                    {en ? "IMEI (optional)" : "IMEI (opsional)"}
                  </label>
                  <Input
                    id="tt-imei"
                    value={imei}
                    onChange={(e) => setImei(e.target.value.replace(/\D/g, "").slice(0, 15))}
                    placeholder="15 digit, mis. 352948110293841"
                    inputMode="numeric"
                    className="bg-card font-mono text-sm font-medium"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    {en
                      ? "Dial *#06# to see it. Speeds up the counter check."
                      : "Tekan *#06# untuk melihatnya. Mempercepat cek di konter."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="border-dashed lg:sticky lg:top-24">
              <CardHeader className="border-b border-dashed border-line pb-3">
                <CardTitle className="flex items-center justify-center gap-1.5 text-center text-sm text-muted">
                  <BadgeCheck className="h-4 w-4 text-accent" />
                  {en ? "Trade-in estimate" : "Taksiran tukar tambah"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-5 text-center">
                <div>
                  <p className="font-mono text-3xl font-bold tracking-tight text-accent-deep">
                    {formatIDR(estimatedValue)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {deviceLabel} · {grade}
                  </p>
                </div>
                {error !== "" && (
                  <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-bad-bg p-2.5 text-left text-[11px] font-bold leading-relaxed text-bad">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error}
                  </p>
                )}
                <p className="flex items-start gap-1.5 rounded-lg bg-good-bg p-2.5 text-left text-[11px] leading-relaxed text-good">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {en
                    ? "Final price is set at the counter after physical and IMEI check. This estimate is free."
                    : "Angka final diputuskan di konter setelah cek fisik dan IMEI. Taksiran ini gratis."}
                </p>
                <Button variant="wa" className="w-full py-5" onClick={submitViaWa}>
                  <Send className="h-4 w-4" />
                  {en ? "Submit via WhatsApp" : "Ajukan via WhatsApp"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
