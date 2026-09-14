"use client";

import React, { useState } from "react";
import { useStore } from "@/context/store-context";
import { Settings, Save, CheckCircle2, Globe, Clock, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function StoreSettingsPage() {
  const { storeSettings, updateStoreSettings } = useStore();

  const [storeName, setStoreName] = useState(storeSettings.store_name);
  const [descriptionId, setDescriptionId] = useState(storeSettings.description_id);
  const [descriptionEn, setDescriptionEn] = useState(storeSettings.description_en);
  const [address, setAddress] = useState(storeSettings.address);
  const [latitude, setLatitude] = useState(storeSettings.latitude);
  const [longitude, setLongitude] = useState(storeSettings.longitude);
  const [phoneNumber, setPhoneNumber] = useState(storeSettings.phone_number);
  const [whatsappNumber, setWhatsappNumber] = useState(storeSettings.whatsapp_number || "");
  const [monFri, setMonFri] = useState(storeSettings.opening_hours.monday_friday);
  const [satSun, setSatSun] = useState(storeSettings.opening_hours.saturday_sunday);
  const [holidays, setHolidays] = useState(storeSettings.opening_hours.holidays || "");

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateStoreSettings({
      store_name: storeName,
      description_id: descriptionId,
      description_en: descriptionEn,
      address,
      latitude: Number(latitude),
      longitude: Number(longitude),
      phone_number: phoneNumber,
      whatsapp_number: whatsappNumber,
      opening_hours: {
        monday_friday: monFri,
        saturday_sunday: satSun,
        holidays: holidays || undefined,
      },
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight">
              Pengaturan Profil Publik Toko
            </h1>
            <Badge variant="purple" className="font-mono text-xs">
              ADMIN EXCLUSIVE
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Kelola konten store_settings dwibahasa, jam buka, dan titik koordinat peta yang tampil di landing page.
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 text-xs font-bold text-good bg-good-bg px-3 py-1.5 rounded-lg border border-good/20 rise">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pengaturan Berhasil Disimpan!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identitas Toko & Dwibahasa */}
        <Card className="border-line shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent-deep" />
              <span>Identitas & Deskripsi Toko (Bilingual ID/EN)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Konten ini langsung sinkron ke halaman beranda publik /id dan /en.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-muted mb-1">Nama Toko Resmi:</label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="text-xs font-bold text-ink"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-muted mb-1">
                Deskripsi Toko (Bahasa Indonesia):
              </label>
              <textarea
                rows={3}
                value={descriptionId}
                onChange={(e) => setDescriptionId(e.target.value)}
                className="w-full p-2.5 bg-paper border border-line rounded-lg text-xs text-ink"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-muted mb-1">
                Deskripsi Toko (English):
              </label>
              <textarea
                rows={3}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                className="w-full p-2.5 bg-paper border border-line rounded-lg text-xs text-ink"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Alamat & Titik Koordinat Peta */}
        <Card className="border-line shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent-deep" />
              <span>Alamat Fisik & Peta Lokasi</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Koordinat Google Maps digunakan untuk menampilkan widget peta interaktif di web publik.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-muted mb-1">Alamat Lengkap Toko:</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-muted mb-1">Latitude:</label>
                <Input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  className="text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Longitude:</label>
                <Input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  className="text-xs font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-muted mb-1">Nomor Telepon Toko:</label>
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-muted mb-1">Nomor WhatsApp CS:</label>
                <Input
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="text-xs font-mono"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Jam Operasional */}
        <Card className="border-line shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-deep" />
              <span>Jam Operasional Toko</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Jadwal buka dan tutup toko untuk hari kerja, akhir pekan, dan hari libur.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-muted mb-1">Senin - Jumat:</label>
              <Input
                value={monFri}
                onChange={(e) => setMonFri(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-muted mb-1">Sabtu - Minggu:</label>
              <Input
                value={satSun}
                onChange={(e) => setSatSun(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-muted mb-1">Hari Libur / Tanggal Merah:</label>
              <Input
                value={holidays}
                onChange={(e) => setHolidays(e.target.value)}
                placeholder="10:00 - 18:00 WIB"
                className="text-xs"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-2">
          <Button type="submit" size="lg" className="gap-2 font-bold px-8 shadow-md">
            <Save className="w-4 h-4" />
            <span>Simpan Perubahan Toko</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
