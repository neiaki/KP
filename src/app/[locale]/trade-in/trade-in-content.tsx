"use client";

import React, { useState } from "react";
import { Locale } from "@/lib/translations";
import { formatIDR } from "@/lib/utils";
import { useStore } from "@/context/store-context";
import { Smartphone, ShieldCheck, Send, BadgeCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/* Tabel basis taksiran (rupiah). Bukan harga final, hanya titik awal
   sebelum cek fisik di konter. Urutan regex penting: yang spesifik dulu. */
const BASE_TABLE: Array<[RegExp, number]> = [
  [/iphone\s*17/i, 15000000],
  [/iphone\s*16/i, 13500000],
  [/iphone\s*15/i, 12000000],
  [/iphone\s*14/i, 9500000],
  [/iphone\s*13/i, 7500000],
  [/iphone\s*12/i, 5500000],
  [/iphone\s*11/i, 3500000],
  [/iphone\s*xs|iphone\s*x\b/i, 2500000],
  [/s\s*25|galaxy\s*s25/i, 13000000],
  [/s\s*24|galaxy\s*s24/i, 12500000],
  [/s\s*23|galaxy\s*s23/i, 8500000],
  [/s\s*22|galaxy\s*s22/i, 6000000],
  [/z\s*fold/i, 12000000],
  [/z\s*flip/i, 8000000],
  [/galaxy\s*a\s*5|galaxy\s*a\s*7/i, 3000000],
  [/galaxy\s*a[0-3]/i, 2000000],
  [/xiaomi\s*14/i, 9000000],
  [/xiaomi\s*13/i, 7000000],
  [/redmi\s*note\s*1[3-9]/i, 2200000],
  [/redmi\s*note/i, 1800000],
  [/redmi\s*1[2-9]|poco/i, 2000000],
  [/reno\s*1[1-9]/i, 4000000],
  [/reno/i, 3000000],
  [/oppo\s*a/i, 1500000],
  [/vivo\s*v\s*[3-9]|vivo\s*v[3-9]/i, 3500000],
  [/vivo\s*v/i, 2500000],
  [/vivo\s*y/i, 1500000],
  [/realme/i, 2000000],
  [/infinix|itel|tecno/i, 1200000],
];

function basePrice(model: string): number {
  for (const [re, price] of BASE_TABLE) {
    if (re.test(model)) return price;
  }
  return 3000000;
}

function storageFactor(model: string): number {
  const m = model.match(/(\d{2,4})\s?gb/i);
  if (!m) return 1;
  const gb = Number(m[1]);
  if (gb >= 512) return 1.2;
  if (gb >= 256) return 1.1;
  if (gb <= 64) return 0.9;
  return 1;
}

export function TradeInContent({ locale }: { locale: Locale }) {
  const { storeSettings } = useStore();
  const en = locale === "en";

  const [deviceModel, setDeviceModel] = useState("iPhone 12 128GB");
  const [screenCondition, setScreenCondition] = useState<"good" | "minor_scratches" | "cracked">("good");
  const [bodyCondition, setBodyCondition] = useState<"flawless" | "minor_dents" | "heavy_wear">("minor_dents");
  const [batteryHealth, setBatteryHealth] = useState(85);
  const [biometricWorks, setBiometricWorks] = useState(true);
  const [cameraWorks, setCameraWorks] = useState(true);
  const [boxIncluded, setBoxIncluded] = useState(true);
  const [imei, setImei] = useState("");
  const [error, setError] = useState("");

  const calculateValuation = () => {
    const base = Math.round(basePrice(deviceModel) * storageFactor(deviceModel));

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

  const submitViaWa = () => {
    if (!deviceModel.trim()) {
      setError(en ? "Type your phone brand and model first." : "Isi merek dan tipe HP dulu.");
      return;
    }
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
      ? `Hello At Cell, I want to trade in my ${deviceModel.trim()} (estimate ${formatIDR(estimatedValue)}, ${grade}). Which replacement stock is available?`
      : `Halo At Cell, saya mau tukar tambah ${deviceModel.trim()} (taksiran ${formatIDR(estimatedValue)}, ${grade}). Stok penggantinya apa saja?`;
    const withImei = cleanImei !== "" ? `${text}\nIMEI: ${cleanImei}` : text;
    window.open(`https://wa.me/${cleanWa}?text=${encodeURIComponent(withImei)}`, "_blank");
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
                <div>
                  <label htmlFor="tt-model" className="mb-1 block text-xs font-bold text-ink">
                    {en ? "Brand and model" : "Merek dan tipe HP"}
                  </label>
                  <Input
                    id="tt-model"
                    value={deviceModel}
                    onChange={(e) => setDeviceModel(e.target.value)}
                    placeholder={en ? "e.g. iPhone 12 128GB" : "Contoh: iPhone 12 128GB"}
                    className="bg-card text-sm font-medium"
                  />
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
                    {deviceModel.trim() !== "" ? deviceModel.trim() : en ? "Type your phone first" : "Isi tipe HP dulu"} · {grade}
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
