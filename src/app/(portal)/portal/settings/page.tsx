"use client";

import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@/context/store-context";
import { Settings, Save, CheckCircle2, Globe, Clock, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RoleBadge } from "@/components/portal/role-badge";

export default function StoreSettingsPage() {
  const { storeSettings, updateStoreSettings, isHydrating, currentRole } = useStore();

  const [storeName, setStoreName] = useState(storeSettings.store_name);
  const [descriptionId, setDescriptionId] = useState(storeSettings.description_id);
  const [descriptionEn, setDescriptionEn] = useState(storeSettings.description_en);
  const [address, setAddress] = useState(storeSettings.address);
  const [latitude, setLatitude] = useState(storeSettings.latitude);
  const [longitude, setLongitude] = useState(storeSettings.longitude);
  const [phoneNumber, setPhoneNumber] = useState(storeSettings.phone_number);
  const [whatsappNumber, setWhatsappNumber] = useState(storeSettings.whatsapp_number || "");
  const [ownerName, setOwnerName] = useState(storeSettings.owner_name || "");
  const [socialFacebook, setSocialFacebook] = useState(storeSettings.social_facebook || "");
  const [socialInstagram, setSocialInstagram] = useState(storeSettings.social_instagram || "");
  const [socialX, setSocialX] = useState(storeSettings.social_x || "");
  const [socialTiktok, setSocialTiktok] = useState(storeSettings.social_tiktok || "");
  const [monFri, setMonFri] = useState(storeSettings.opening_hours.monday_friday);
  const [satSun, setSatSun] = useState(storeSettings.opening_hours.saturday_sunday);
  const [holidays, setHolidays] = useState(storeSettings.opening_hours.holidays || "");

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const settingsHydrated = useRef(false);

  useEffect(() => {
    if (isHydrating || settingsHydrated.current) return;
    const frame = window.requestAnimationFrame(() => {
      setStoreName(storeSettings.store_name);
      setDescriptionId(storeSettings.description_id);
      setDescriptionEn(storeSettings.description_en);
      setAddress(storeSettings.address);
      setLatitude(storeSettings.latitude);
      setLongitude(storeSettings.longitude);
      setPhoneNumber(storeSettings.phone_number);
      setWhatsappNumber(storeSettings.whatsapp_number || "");
      setOwnerName(storeSettings.owner_name || "");
      setSocialFacebook(storeSettings.social_facebook || "");
      setSocialInstagram(storeSettings.social_instagram || "");
      setSocialX(storeSettings.social_x || "");
      setSocialTiktok(storeSettings.social_tiktok || "");
      setMonFri(storeSettings.opening_hours.monday_friday);
      setSatSun(storeSettings.opening_hours.saturday_sunday);
      setHolidays(storeSettings.opening_hours.holidays || "");
      settingsHydrated.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isHydrating, storeSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await updateStoreSettings({
        store_name: storeName,
        description_id: descriptionId,
        description_en: descriptionEn,
        address,
        latitude: Number(latitude),
        longitude: Number(longitude),
        phone_number: phoneNumber,
        whatsapp_number: whatsappNumber,
        owner_name: ownerName,
        social_facebook: socialFacebook,
        social_instagram: socialInstagram,
        social_x: socialX,
        social_tiktok: socialTiktok,
        opening_hours: {
          monday_friday: monFri,
          saturday_sunday: satSun,
          holidays: holidays || undefined,
        },
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Gagal menyimpan pengaturan toko.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12 sm:space-y-6">
      {/* Judul halaman ini sama persis dengan label menunya di sidebar
          ("Profil Publik Toko"), bukan "Konten Profil Toko" seperti
          sebelumnya. Satu layar, satu nama. */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Profil Publik Toko
          </h1>
          <RoleBadge role={currentRole} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Kelola konten profil toko: deskripsi dwibahasa, jam buka, dan titik koordinat peta yang tampil di halaman depan publik.
        </p>
      </div>

      {savedSuccess && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-good/20 bg-good-bg px-3 py-2.5 text-sm font-bold text-good"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Profil toko berhasil disimpan.</span>
        </div>
      )}
      {saveError && (
        <div role="alert" className="rounded-lg border border-bad/30 bg-bad-bg px-3 py-2.5 text-sm text-bad">
          {saveError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identitas dan deskripsi toko */}
        <Card className="border-line shadow-sm">
          <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-accent-deep" />
              <span>Identitas &amp; Deskripsi Toko (Bilingual ID/EN)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Konten ini langsung sinkron ke halaman beranda publik /id dan /en.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
            <div>
              <label
                htmlFor="store-name"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Nama Toko Resmi
              </label>
              <Input
                id="store-name"
                name="store-name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="font-bold text-ink sm:text-xs"
                required
              />
            </div>

            {/* rows=5 (bukan 3): di 375px baris ketiga hanya menampilkan
                sekitar 25 kata, jadi kalimat panjang selalu terlihat terpotong
                tanpa petunjuk ada teks lanjutan di bawahnya. */}
            <div>
              <label
                htmlFor="store-description-id"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Deskripsi Toko (Bahasa Indonesia)
              </label>
              <textarea
                id="store-description-id"
                name="store-description-id"
                rows={5}
                value={descriptionId}
                onChange={(e) => setDescriptionId(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper p-3 text-base text-ink sm:text-xs"
                required
              />
            </div>

            <div>
              <label
                htmlFor="store-description-en"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Deskripsi Toko (English)
              </label>
              <textarea
                id="store-description-en"
                name="store-description-en"
                rows={5}
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
                className="w-full rounded-lg border border-line bg-paper p-3 text-base text-ink sm:text-xs"
                required
              />
            </div>
          </CardContent>
        </Card>

        {/* Alamat dan titik koordinat peta */}
        <Card className="border-line shadow-sm">
          <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-accent-deep" />
              <span>Alamat Fisik &amp; Peta Lokasi</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Koordinat Google Maps digunakan untuk menampilkan widget peta interaktif di web publik.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0 text-sm sm:p-6 sm:pt-0">
            <div>
              <label
                htmlFor="store-address"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Alamat Lengkap Toko
              </label>
              <Input
                id="store-address"
                name="store-address"
                autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="sm:text-xs"
                required
              />
            </div>

            {/* Satu kolom di HP: grid-cols-2 lama menyisakan sekitar 140px per
                kolom, sehingga nilai koordinat seperti -6.31298899 terpotong
                di tengah dan harus di-scroll horizontal di dalam input. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="store-latitude"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Latitude
                </label>
                <Input
                  id="store-latitude"
                  name="store-latitude"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(Number(e.target.value))}
                  className="font-mono sm:text-xs"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="store-longitude"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Longitude
                </label>
                <Input
                  id="store-longitude"
                  name="store-longitude"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(Number(e.target.value))}
                  className="font-mono sm:text-xs"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="store-phone"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nomor Telepon Toko
                </label>
                <Input
                  id="store-phone"
                  name="store-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="font-mono sm:text-xs"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="store-whatsapp"
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  Nomor WhatsApp CS
                </label>
                <Input
                  id="store-whatsapp"
                  name="store-whatsapp"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="font-mono sm:text-xs"
                  required
                />
                <p className="mt-1 text-[11px] text-muted">
                  Boleh ditulis format lokal (0812...). Otomatis diubah jadi 62812... saat link WhatsApp dibuat.
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="store-owner-name"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Nama yang jawab di WhatsApp
              </label>
              <Input
                id="store-owner-name"
                name="store-owner-name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="sm:text-xs"
                placeholder="Steven Eka"
              />
              <p className="mt-1 text-[11px] text-muted">
                Tampil di widget live chat supaya pelanggan tahu siapa yang membalas.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Jam operasional */}
        <Card className="border-line shadow-sm">
          <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-accent-deep" />
              <span>Jam Operasional Toko</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Jadwal buka dan tutup toko untuk hari kerja, akhir pekan, dan hari libur.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 p-4 pt-0 text-sm sm:grid-cols-3 sm:p-6 sm:pt-0">
            <div>
              <label
                htmlFor="hours-mon-fri"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Senin - Jumat
              </label>
              <Input
                id="hours-mon-fri"
                name="hours-mon-fri"
                value={monFri}
                onChange={(e) => setMonFri(e.target.value)}
                className="sm:text-xs"
                required
              />
            </div>

            <div>
              <label
                htmlFor="hours-sat-sun"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Sabtu - Minggu
              </label>
              <Input
                id="hours-sat-sun"
                name="hours-sat-sun"
                value={satSun}
                onChange={(e) => setSatSun(e.target.value)}
                className="sm:text-xs"
                required
              />
            </div>

            <div>
              <label
                htmlFor="hours-holidays"
                className="mb-1 block text-xs font-semibold text-muted"
              >
                Hari Libur / Tanggal Merah
              </label>
              <Input
                id="hours-holidays"
                name="hours-holidays"
                value={holidays}
                onChange={(e) => setHolidays(e.target.value)}
                placeholder="10:00 - 18:00 WIB"
                className="sm:text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Media sosial toko */}
        <Card className="border-line shadow-sm">
          <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-accent-deep" />
              <span>Media Sosial Toko</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Isi URL resmi toko. Kolom yang dikosongkan membuat ikon platform
              itu tidak muncul di footer, jadi tidak ada lagi tautan ke halaman
              generik. Wajib diawali http:// atau https://.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 p-4 pt-0 text-sm sm:grid-cols-2 sm:p-6 sm:pt-0">
            {([
              ["Facebook", socialFacebook, setSocialFacebook, "https://facebook.com/nama-toko"],
              ["Instagram", socialInstagram, setSocialInstagram, "https://instagram.com/nama-toko"],
              ["X", socialX, setSocialX, "https://x.com/nama-toko"],
              ["TikTok", socialTiktok, setSocialTiktok, "https://tiktok.com/@namatoko"],
            ] as const).map(([label, value, setter, placeholder]) => (
              <div key={label}>
                <label
                  htmlFor={`social-${label.toLowerCase()}`}
                  className="mb-1 block text-xs font-semibold text-muted"
                >
                  {label}
                </label>
                <Input
                  id={`social-${label.toLowerCase()}`}
                  name={`social-${label.toLowerCase()}`}
                  type="url"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="font-mono sm:text-xs"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Sticky di HP: form ini panjang sekali, dan tanpa ini tombol simpan
            hanya muncul setelah menggulir melewati semua kartu. */}
        <div className="sticky bottom-0 z-10 -mx-3 border-t border-line bg-card/95 px-3 py-3 backdrop-blur sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:py-2 sm:backdrop-blur-none">
          <Button
            type="submit"
            size="lg"
            disabled={isHydrating}
            className="w-full gap-2 px-5 font-bold shadow-md sm:w-auto sm:px-8"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Perubahan Toko</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
