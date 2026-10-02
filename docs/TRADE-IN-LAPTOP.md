# Taksir Tukar Tambah Laptop

**Status: perlu keputusan pemilik. Tidak ada perubahan kode untuk catatan ini.**

Catatan penguji yang jadi pemicu: "kondisi laptop harga berubah (planing)".

Dokumen ini menjelaskan apa yang sudah ada, apa yang membuat laptop tidak bisa
dihitung hari ini, dan keputusan apa saja yang harus diambil pemilik sebelum
kode ditulis. Angka taksir sengaja TIDAK dikarang di sini.

## 1. Yang sudah ada: satu mesin harga, berbasis kondisi

Ada tepat satu tempat di seluruh aplikasi di mana kondisi memengaruhi harga:
kalkulator tukar tambah di `/[locale]/trade-in` dan form tukar tambah di POS
yang memakai daftar model yang sama.

### 1.1 Sumber model dan angka

`src/lib/trade-in-models.ts` adalah satu-satunya sumber:

- `IPHONE_LINEUP` (`:8`): tujuh seri iPhone, seri 11 sampai 17. Tiap seri punya
  `storage` (GB) dan `models`, tiap model punya `base` rupiah. Total 27 model,
  basis 3.500.000 sampai 20.000.000.
- `TRADE_IN_MODELS` (`:85`): hasil rata dari lineup, dipakai dropdown POS.
- `storageFactor(gb)` (`:89`): 1,3 untuk 1024 ke atas, 1,2 untuk 512, 1,1 untuk
  256, 0,9 untuk 64 ke bawah, selain itu 1.
- `storageLabel(gb)` (`:97`): 1024 ke atas ditulis `${gb/1024}TB`.
- `seriesOf(model)` (`:101`): seri dari model, jatuh ke `IPHONE_LINEUP[1]`.
- `basePriceOf(model)` (`:106`): pencarian linear, jatuh ke `3500000` kalau
  modelnya tidak ada di daftar.

### 1.2 Perhitungan

`trade-in-content.tsx:128` `calculateValuation()`:

    const base = Math.round(baseOf(deviceModel) * storageFactor(storageGb));
    let multiplier = 1.0;
    layar lecet halus -0.1 / retak -0.35
    bodi lecet sedikit -0.08 / lecet berat -0.2
    baterai di bawah 80% -0.1
    biometrik mati -0.25
    kamera mati -0.2
    dus ikut +0.05
    return Math.max(1000000, Math.round((base * multiplier) / 50000) * 50000);

Hasilnya diputar ke kelipatan 50.000 dengan lantai 1.000.000.

### 1.3 Grade

`trade-in-content.tsx:148` menurunkan label dari input yang sama:

- layar mulus DAN bodi mulus -> **Grade A, mulus**
- layar retak -> **Grade C, perlu servis**
- selain itu -> **Grade B, wajar**

Label ini hanya dipakai di teks pesan WhatsApp (`trade-in-content.tsx:205`).
Grade A/B/C **tidak pernah disimpan ke database**. Yang tersimpan di
`trade_in_records.grading_details` (jsonb) adalah hasil inspeksi datar:
`screen`, `body`, `battery_health`, `biometric`, `camera`, `signal`,
`box_and_accessories`, `notes` (`portal/pos/page.tsx:182-191`).

## 2. Kenapa laptop tidak bisa dihitung hari ini

Empat penghalang, semuanya nyata di kode.

### 2.1 Daftar model hanya iPhone

`trade-in-content.tsx:247-262` membangun `<select>` dari `IPHONE_LINEUP`, dan
`trade-in-content.tsx:238` menuliskannya terang-terangan: "Tukar tambah saat ini
hanya menerima iPhone 11 ke atas." POS memakai `TRADE_IN_MODELS` yang sama
(`portal/pos/page.tsx:416`) dengan placeholder "Pilih seri iPhone".

### 2.2 `basePriceOf` punya fallback senyap

Kalau laptop nanti masuk ke dropdown tanpa basis harga, `basePriceOf`
memberikannya 3.500.000 karena tidak ada di daftar (`trade-in-models.ts:111`).
Itu taksir yang sangat salah dan akan tampil tanpa warning. **Kalau pekerjaan ini
dikerjakan, fallback itu harus menggagalkan, bukan menebak angka.**

### 2.3 Storage dan rubrik kondisi tidak memetakan ke laptop

- `storageFactor` hanya tahu sampai 1 TB (1,3). Laptop 2 TB dan 4 TB akan
  mendapat faktor sama dengan iPhone 1 TB.
- Daftar storage per seri hanya GB ponsel (`[128,256,512,1024]` atau
  `[64,128,256,512]`). Laptop 256 GB dan 1 TB bentrok dengan konvensi ini.
- Checklist kondisi berbentuk HP: ada `biometricWorks` (Face ID atau sidik jari,
  `trade-in-content.tsx:173-177`) dan `cameraWorks` yang persis "front and back
  cameras" (`trade-in-content.tsx:175`). Laptop tidak punya pasangan kamera
  depan/belakang yang sama, dan pemeriksaan yang menentukan untuk laptop
  (keyboard, engsel, port, siklus baterai, kesehatan SSD) tidak ada di
  checklist sama sekali.
- Grade diturunkan dari layar dan bodi saja (`trade-in-content.tsx:148-159`),
  jadi grade untuk laptop tidak menggambarkan kondisi sebenarnya.

### 2.4 Laptop tidak punya IMEI, dan itu dikunci di level database

Ini penghalang paling keras, karena bukan sekadar UI:

- `inventory_units.imei`: `text notNull unique` **plus** check
  `imei ~ '^\d{15}$'` (`src/db/schema.ts:193` dan `:201`).
- `trade_in_records.imei`: `text notNull` **plus** check yang sama
  (`src/db/schema.ts:266` dan `:275`).
- Zod memaksa hal yang sama di sisi aplikasi (`src/lib/validations.ts:5-8`,
  `imeiSchema`).

Artinya **tidak ada tabel di skema saat ini yang bisa menyimpan satu unit laptop
tukar tambah.** Kalkulator publik mengizinkan IMEI kosong
(`trade-in-content.tsx:193` hanya memvalidasi kalau isinya tidak kosong) dan tidak
menulis apa pun ke database, hanya membuka `wa.me`. Jadi kalkulator publik bisa
ditambah model laptop tanpa menyentuh skema; yang tercatat di konter tidak bisa.

## 3. Tiga keputusan yang harus diambil pemilik

### Keputusan 1: Data apa yang harus disuplai toko

Tidak ada harga yang bisa ditulis sebelum ini dijawab. Kebutuhan minimal:

1. **Daftar model laptop** yang diterima, dikelompokkan per seri atau lini
   (per generasi lebih hemat daripada per model persis, tapi per model persis
   mengikuti pola `IPHONE_LINEUP` sekarang).
2. **Basis harga rupiah per model**, dalam posisi yang sama dengan `base`
   sekarang: titik awal sebelum cek fisik di konter, bukan harga final.
3. **Pilihan storage** per seri laptop, dan apakah `storageFactor` perlu
   diperluas untuk 2 TB ke atas.
4. **Rubrik kondisi laptop**: pemeriksaan apa yang menurunkan harga, dan
   seberapa besar. Contoh yang perlu diputuskan, bukan diasumsikan:
   keyboard, engsel, port, layar, siklus baterai, kesehatan SSD, chassis.
5. **Markup unit masuk.** Saat ini unit hasil tukar tambah otomatis diberi
   `Math.round(tradeVal * 1.25)` (`src/lib/actions/pos.ts:117`, diulang di
   `src/lib/store.ts:628`). Untuk iPhone itu masuk akal. Untuk laptop,
   penyusutan berbeda dan angka 1,25 kemungkinan perlu ditinjau ulang.

### Keputusan 2: Di mana unit laptop hasil tukar tambah dicatat

| Opsi | Yang dibutuhkan | Konsekuensi |
|---|---|---|
| A. Tidak dicatat, hanya ditaksir | Tidak ada perubahan skema. Kalkulator publik dan POS menerima laptop, hasil inspeksi tetap hanya di WhatsApp dan nota. | Tidak ada riwayat, tidak ada audit, tidak bisa dilacak. Tidak menutup celah apa pun. |
| B. Nomor seri laptop menggantikan IMEI | Melonggarkan check 15 digit pada `inventory_units.imei` dan `trade_in_records.imei`, menambah kolom identitas perangkat. | Butuh migrasi. `imei` jadi opsional atau polymorphic. Menabrak banyak asumsi: `inventory_units_imei_check`, `v_public_inventory` yang men-exposed `right(u.imei, 4)`, keunikan global, dan `imeiSchema`. |
| C. Tabel terpisah untuk barang tanpa IMEI | Tabel baru, mis. `laptop_trade_ins`, dengan relasi ke `transactions`. | Butuh migrasi, tapi tidak menyentuh jalur HP sama sekali. Paling aman untuk produksi yang sudah berjalan. |

Rekomendasi: **A untuk sekarang, C nanti.** Opsi B paling berbahaya karena
`imei` dipakai sebagai identitas unik global di banyak tempat, dan melonggarkan
check-nya bisa merusak etalase publik serta nota.

### Keputusan 3: Cakupan rilis pertama

Kalau Keputusan 1 dan 2 sudah terjawab, urutan pengerjaan yang paling murah:

1. Tambah lineup laptop ke `src/lib/trade-in-models.ts` di samping
   `IPHONE_LINEUP`, bukan menggantikannya.
2. Ganti dropdown di `trade-in-content.tsx` dan POS supaya ada pilihan
   "Handphone" dan "Laptop", dengan daftar storage per jenis perangkat.
3. Ganti rubrik kondisi saat perangkat laptop dipilih. Checklist HP tidak
   boleh dipakai apa adanya, karena `cameraWorks` tidak berlaku untuk laptop.
4. Ubah `basePriceOf` supaya model tanpa basis harga menggagalkan, bukan
   menebak.
5. Mulai dari taksir saja kalau opsi A sudah cukup: kalkulator publik dan
   POS menampilkan angka, tapi tidak ada yang disimpan ke database.

Kalau opsi A tidak diterima, tabel baru (opsi C) harus ada sebelum POS bisa
menyimpan apa pun, dan itu berarti migrasi. Migrasi tidak boleh ditulis
sebelum Keputusan 2 selesai.

## 4. Yang tidak boleh terjadi

- **Jangan mengarang angka.** Tidak ada harga laptop yang boleh masuk ke
  repositori sebelum toko menyetorkannya. Angka karangan yang salah lebih
  berbahaya daripada tidak ada angka, karena pembaca tidak tahu itu karangan.
- **Jangan memakai fallback 3.500.000 untuk laptop.** Angka itu milik
  iPhone 11 dan tidak akan ditandai sebagai salah.
- **Jangan melonggarkan check IMEI tanpa keputusan eksplisit.** Check itu yang
  menjaga etalase publik dan nota tetap konsisten.

## 5. Related

- Catatan yang menunda pekerjaan ini: `README.md` bagian "Keputusan produk".
- Kebutuhan asal: FR-C-01 dan FR-C-02 di `requirement-2.0.md`, yang mengatur
  penilaian kondisi untuk tukar tambah HP dan tidak menyebut laptop sama sekali.

## 6. Status

Belum ada perubahan kode untuk catatan ini. Dokumen ini hanya bahan
keputusan. Setelah pemilik mengisi Keputusan 1 sampai 3, baru ada pekerjaan
implementasi yang bisa dimulai.
