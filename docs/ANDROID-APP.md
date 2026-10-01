# Aplikasi Android At Cell (my.id.atcell)

Dokumen ini menjelaskan cara membangun, menandatangani, dan memperbarui
aplikasi Android At Cell, sekaligus apa yang harus diisi di sisi web supaya
Android menganggap aplikasi itu sah.

## Apa isi aplikasinya

`my.id.atcell` adalah **Trusted Web Activity**: APK-nya tidak punya UI apa pun,
hanya WebView Chrome yang menampilkan `https://atcell.my.id`. Semua isi,
termasuk etalase, lacak servis, dan portal staf, datang dari web.

Konsekuensi yang harus dipahami lebih dulu:

- **Isi app mengikuti web, bukan APK.** Deploy web baru langsung terlihat di app
  tanpa perlu build ulang. Build ulang hanya perlu kalau yang berubah adalah
  ikon, nama, versi, atau konfigurasi TWA.
- **APK hanya menampilkan situs yang sudah aktif.** Kalau `atcell.my.id` mati,
  app ikut mati. Tidak ada halaman cadangan yang tersimpan di dalam app.
- **Sesi portal berlaku sama.** Cookie Supabase ada di origin yang sama, jadi
  sudah masuk di browser berarti sudah masuk juga di app.

## Prasyarat

| Kebutuhan | Catatan |
|---|---|
| JDK 17 sampai 21 | Gradle Android Plugin menolak JDK yang lebih baru. Di mesin ini `mise install java@21` sudah cukup |
| Android SDK, minimal platform 36 | build-tools 34 sudah dipakai |
| `local.properties` | satu baris `sdk.dir=/path/ke/Android/Sdk` |
| Keystore release | tidak boleh masuk git, lihat bagian signing |

## Build

```bash
cd android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk
```

Build release menghasilkan APK yang sudah diminifikasi R8 dan sudah ditandatangani
dengan keystore. Build tanpa `gradle/signing.properties` **gagal**, bukan
menghasilkan APK bertanda tangan debug. APK bertanda tangan debug adalah salah satu
pemicu peringatan Play Protect, jadi kegagalan itu disengaja.

## Signing

`gradle/signing.properties` dibaca `app/build.gradle` dan **tidak boleh masuk
git**; sudah masuk `.gitignore`.

```properties
storePassword=...
keyPassword=...
keyAlias=atcell
storeFile=/path/ke/atcell-release.jks
```

Membuat keystore baru:

```bash
keytool -genkeypair -v \
  -keystore atcell-release.jks -storetype PKCS12 \
  -alias atcell -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=At Cell, O=At Cell, C=ID"
```

**Backup `atcell-release.jks` dan passwordnya.** Kehilangan keduanya berarti tidak
bisa menerbitkan pembaruan apa pun ke app yang sudah terpasang, karena Android
menolak APK yang ditandatangani sertifikat berbeda.

## Verifikasi Android: Digital Asset Links

Android membandingkan sidik jari sertifikat penandatangan APK dengan sidik jari
yang ada di `https://atcell.my.id/.well-known/assetlinks.json`. Kalau cocok:

- address bar tidak muncul, jadi app terlihat seperti app
- aktivitas TWA ditandai terverifikasi
- Play Protect melihat app yang terikat ke domain nyata

Kalau tidak cocok, Android tetap membuka app tetapi menandainya tidak
terverifikasi, dan itu justru memicu peringatan.

Mengambil sidik jari dari keystore:

```bash
keytool -list -v -keystore atcell-release.jks -storepass '<password>'
```

Salin baris `SHA-256:`, buang titik duanya, lalu taruh di environment web:

```
ANDROID_APP_SHA256=5a62b44ad0408aedd1df23174f219cfe25cbcac6d8e28ed3e5023fe5c659a9e3
```

Namanya sengaja tidak memakai prefix `NEXT_PUBLIC_`. Prefix itu membuat Next.js
meng-inline nilai ke dalam bundle begitu variabelnya ada saat `next build`, dan
sidik jari yang diperbarui di environment tidak akan terbaca tanpa build ulang.
Route-nya dilayani oleh `src/app/.well-known/assetlinks.json/route.ts` dan
selalu `no-store`, supaya sidik jari baru langsung terbaca. Bentuk sidik jarinya
dikunci `tests/assetlinks.test.ts`.

**Kalau nanti masuk Play Store dengan Play App Signing**, nilai di atas harus
diisi dengan sidik jari *app signing* milik Google, bukan upload key. Play
Console menampilkannya di Setup > App integrity. Sidik jari upload key boleh
dipasangkan juga, karena keduanya sah.

## Yang dikeraskan untuk Play Protect

Semua ini dikunci `tests/android-app-hardening.test.ts`, jadi perubahan yang
melanggarnya akan menggagalkan CI.

| Tindakan | Kenapa |
|---|---|
| Nol `uses-permission` | Izin yang tidak terpakai adalah sinyal mencurigakan terkuat. TWA tidak butuh izin apa pun, dan `Permissions-Policy` di `next.config.ts` sudah menutup kamera, mikrofon, dan lokasi |
| Nol library native (`.so`) | Scanner malware jauh lebih curiga pada kode native. APK ini murni Java, seperti yang terlihat dari `aapt2 dump badging` |
| `usesCleartextTraffic="false"` | Tidak ada jalur HTTP yang bisa dialihkan ke host lain |
| `network_security_config.xml` | Menutup cleartext untuk semua domain termasuk localhost, dan hanya mempercayai sertifikat sistem |
| `allowBackup="false"` plus `data_extraction_rules.xml` | Cookie sesi portal tidak ikut tersalin lewat Android Backup atau transfer perangkat |
| Hanya launcher yang `exported="true"` | `FocusActivity`, `WebViewFallbackActivity`, `FileProvider`, dan `DelegationService` semuanya private |
| `minifyEnabled` dan `shrinkResources` | APK lebih kecil dan lebih sulit ditelusuri |
| `targetSdk 36` | Play Store mewajibkan target terbaru; nilai ini juga yang dipakai penilaian Play Protect terbaru |
| `jcenter()` tidak dipakai | Repository sudah mati sejak 2022 |

## Batas yang tidak bisa closes dengan kode

Beberapa hal tidak bisa dihilangkan lewat konfigurasi, dan sebaiknya diketahui
sebelum moan:

- **APK yang dipasang lewat sideload selalu mendapat peringatan** "dari sumber
  tidak dikenal" di HP apa pun, termasuk At Cell. Itu perilaku Android, bukan
  tanda file berbahaya. Peringatan hilang kalau app dibagikan lewat Play Store.
- **Play Protect menilai reputasi, bukan hanya isi file.** Developer baru tanpa
  riwayat akan tetap mendapat lebih banyak pemeriksaan.
- **Peringatan "app ini mungkin berbahaya" juga muncul untuk aplikasi sah**
  yang belum punyacukup pengguna. Ini yang paling sering terjadi pada deployment
  pertama.
- **Satu-satunya cara menutup semuanya adalah Play Store**, dengan Google Play
  App Signing dan Akun Developer seharga 25 dolar sekali bayar.

## Verifikasi setelah build

```bash
# tanda tangan dan skema
$ANDROID_HOME/build-tools/34.0.0/apksigner verify --verbose --print-certs \
  app/build/outputs/apk/release/app-release.apk

# harusnya tidak ada baris uses-permission yang berbahaya
$ANDROID_HOME/build-tools/34.0.0/aapt2 dump permissions \
  app/build/outputs/apk/release/app-release.apk

# harusnya nol library native
unzip -l app/build/outputs/apk/release/app-release.apk | grep -c '\.so$'
```

Hasil yang diharapkan untuk build saat ini: skema v2 dan v3 terverifikasi, satu
satu-satunya izin adalah `my.id.atcell.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
yang dibuat androidx sendiri untuk keamanan broadcast receiver, dan nol `.so`.

## Yang belum ada

- **Push notification.** `DelegationService` sengaja dimatikan karena Notification
  Triggers API belum dipakai. Mengaktifkannya tanpa fungsi hanya menambah service
  sia-sia.
- **Offline untuk halaman.** Halaman etalase sengaja tidak pernah masuk cache:
  stok dan harga berubah tiap menit, jadi halaman basi berarti pelanggan ditawari
  unit yang sudah habis. Yang di-cache hanya aset statis.
- **Play Store.** Belum ada listing, belum ada Program Play Integrity.

## Peta berkas

| Berkas | Isi |
|---|---|
| `app/build.gradle` | compileSdk, signing, R8, dan semua nilai resValue |
| `app/src/main/AndroidManifest.xml` | activity, intent-filter autoVerify, dan seluruh pengeras keamanan |
| `app/src/main/assets/twa-manifest.json` | konfigurasi TWA yang dibaca Bubblewrap-compatible tooling |
| `app/src/main/res/xml/network_security_config.xml` | penutupan cleartext |
| `app/src/main/res/xml/data_extraction_rules.xml` | larangan backup dan transfer data |
| `app/src/main/res/xml/shortcuts.xml` | empat shortcut, sama seperti manifest web |
| `app/proguard-rules.pro` | kelas yang harus bertahan dari R8 |
| `../src/app/.well-known/assetlinks.json/route.ts` | route sidik jari di sisi web |
| `../src/lib/assetlinks.ts` | logika murni assetlinks, bisa diuji tanpa server |
| `../tests/android-app-hardening.test.ts` | pengaman seluruh keputusan keamanan di atas |
