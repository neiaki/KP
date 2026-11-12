# Panduan Staf: Publikasi Tanpa Stok dan Uji Alur Portal

Bagian 1 untuk staf yang menerbitkan model tanpa unit; bagian 2 untuk operator
yang menguji alur portal ber-kredensial.

## 1. Menerbitkan model ke katalog tanpa stok

Model boleh tampil di etalase publik sebelum ada unitnya, asalkan jujur: badge
**Belum ada unit**, harga acuan bukan harga jual, dan tombol **Minta dikabari**.

Yang tidak boleh terjadi: **mengarang nomor IMEI** supaya modelnya kelihatan
lengkap. IMEI adalah identitas hardware yang menempel di unit asli. Kalau
dikarang, etalase mengiklankan barang yang tidak ada, pelanggan datang ke
konter lalu tidak bisa membeli, dan nota garansi mencantumkan nomor palsu.

### Kapan memakai jalur ini

- Model baru di katalog, unitnya belum masuk toko.
- Model lama yang stoknya habis dan mau diumumkan lagi.
- Model yang unitnya masih dijemput dari distributor.

Kalau belum ada rencana unit masuk sama sekali, tidak perlu menulis modelnya.

### Cara menulis modelnya

Buka menu **Master Produk**, tekan **Tambah Model Produk Baru**, lalu isi:

- **Merek Handphone**: pilih dari daftar.
- **Nama Seri / Model**: nama yang biasa dicari orang, lengkap dengan storage
  bila perlu, misalnya `iPhone 16 Pro 256GB`.
- **Harga Acuan Dasar (Rp)**: harga patokan, tampil sebagai perkiraan. Isi `0`
  kalau belum diketahui; baris harga tidak tampil selama angkanya 0.
- **Spesifikasi Utama**: chipset, RAM dan storage, kamera, ukuran layar.
- **URL Foto Produk**: foto resmi model dari `public/products/` atau folder
  produk yang sudah diunggah. Jangan pakai foto acak dari internet.

Tekan **Tambahkan Model**. Halaman ini tidak punya kolom IMEI; IMEI selalu
didaftarkan terpisah di menu **Inventaris Unit IMEI**.

### Yang dilihat pelanggan

Model langsung muncul di **Baru masuk katalog** di beranda dan halaman katalog
dengan badge **Belum ada unit**, nama dan spesifikasi, perkiraan harga acuan,
serta tombol **Minta dikabari** yang membuka WhatsApp.

Model ini tidak masuk hitungan "unit ada di toko" dan tidak bisa dipilih di
**Kasir POS & Trade-In**.

### Saat unit pertama datang

Buka **Inventaris Unit IMEI**, tekan **Registrasi Batch IMEI**, lalu isi:

- **Pilih Katalog Produk Master**: model yang tadi dibuat.
- **Kondisi Fisik**: `Baru (New)` atau `Seken (Second Hand)`.
- **Harga Modal / Beli (Rp)** dan **Harga Jual Toko (Rp)**: angka unit ini.
- **Daftar Nomor IMEI 15 Digit (Pisahkan per baris)**: IMEI asli dari unit
  fisik, satu per baris. Form menolak nomor yang bukan 15 digit angka dan
  menolak nomor yang sudah terdaftar.

Setelah didaftarkan, model pindah dari **Baru masuk katalog** ke ready stock,
bisa dipilih di **Kasir POS & Trade-In**, dan badge **Belum ada unit** hilang.
Katalognya tetap disimpan sebagai acuan spesifikasi dan harga.

### Kalau salah input

- Salah ketik atau salah harga: tekan **Edit** di kartu **Master Produk**, lalu
  **Simpan Perubahan**.
- Produk tanpa unit tidak bisa dihapus dari portal. Minta owner, atau tambahkan
  satu unit lalu ubah statusnya lewat **Inventaris Unit IMEI**.

### Ringkasan

- Simpan model di **Master Produk** tanpa IMEI; unit boleh nol.
- Pelanggan melihat badge **Belum ada unit** dan tombol **Minta dikabari**.
- Model belum bisa dijual di kasir.
- Begitu unit pertama didaftarkan dengan IMEI asli, model jadi ready stock.

## 2. Skenario uji alur ber-kredensial staf

Runbook end-to-end untuk login per role, undang staf, registrasi IMEI, POS,
tiket servis sampai serah terima, dan lintasan akses lintas peran. Kriteria
lolos menyebut pesan error dan aturan yang ada di `src/lib/access.ts`,
`src/lib/validations.ts`, dan `src/lib/actions/*`.

Prinsip eksekusi:

- **[MUTASI]** mengubah data production; **[BACA]** tanpa perubahan;
  **[NEGATIF]** memastikan sesuatu ditolak tanpa side effect.
- Data uji diberi penanda yang mudah dikenali: IMEI berawalan `99`, nama
  pelanggan `Uji …`, profil `uji-tech`. Catat nomor IMEI uji saat eksekusi;
  jangan memakai nomor asli pelanggan.
- Hormati rate limit login: jangan mengulang percobaan sandi salah.
- Pantau Sentry setelah sesi uji (`search_errors` 24 jam) untuk error 500 baru.
- Yang tidak bisa disentuh agent: pembuatan password akun asli (milik owner)
  dan `SUPABASE_SERVICE_ROLE_KEY` yang hanya ada di runtime production.

### Akun yang dibutuhkan

| Kebutuhan | Keterangan |
|---|---|
| 1 akun admin | Minimal. T-0 membuat akun uji lain lewat `/portal/staff` sekaligus menguji undang staf. |
| Opsional: akun asli sales / technician / customer | Kalau mau menguji tanpa akun hasil undangan. |

### Status eksekusi

| Tanggal | Yang diuji | Hasil |
|---|---|---|
| 16 Okt 2026 | Guard portal tanpa sesi: semua `/portal/*` → 307 ke `/id/login?next=…` (smoke production 6/6) | PASS |
| 17 Okt 2026 | Form login production (`isLiveBackend`): hanya username + kata sandi; sandi salah sekali → "Username atau kata sandi salah." | PASS |
| 24 Okt 2026 | T-7 mode demo: login admin → `/portal/customers` → Ubah Kata Sandi → generate → simpan → notice sukses dan kartu sekali-tampil | PASS |
| Menunggu | T-0 sampai T-6 dan T-7 mode live, butuh akun admin dari owner | — |

### T-0 — Login per role dan undang staf [MUTASI]

1. Buka `/id/login`, isi username `admin` + kata sandi. Lolos jika land di
   `/portal/dashboard`, cookie sesi terpasang, dan nama profil tampil.
2. Uji arah default per role: `admin → /portal/dashboard`,
   `sales → /portal/pos`, `teknisi → /portal/service`,
   `anisa → /portal/account`.
3. [NEGATIF] Kata sandi salah satu kali: alert "Username atau kata sandi
   salah." tampil. Jangan diulang; ada rate limit per IP.
4. Admin buka `/portal/staff` → tambah staf → role `technician`, nama
   `Uji Teknisi`, username `uji-tech`, email `uji-tech+<tanggal>@contoh.id`,
   kata sandi kuat, nomor HP valid.
   Kalau muncul "SUPABASE_SERVICE_ROLE_KEY belum diisi, tidak bisa mengundang
   user", catat sebagai temuan env production; jangan dipaksa ulang.
5. Logout, lalu login dengan `uji-tech` dan pastikan land di `/portal/service`.

### T-1 — Inventaris: registrasi batch IMEI [MUTASI]

1. `/portal/inventory` → pilih produk yang benar-benar jualan → kondisi
   `second` → harga beli/jual uji.
2. Daftarkan batch **2 IMEI** berawalan `99`. Validasi memaksa tepat 15 digit
   angka dan minimal 1 IMEI per batch; tidak ada jalur tambah stok tanpa IMEI.
3. Lolos jika kedua unit tampil `available` tanpa baris ganda.
4. [NEGATIF] Daftarkan ulang IMEI yang sama → "Ada IMEI yang sudah terdaftar
   di inventaris. Periksa lagi batch-nya." (kode 23505 dipetakan).
5. [NEGATIF] IMEI 14 atau 16 digit → "Nomor IMEI wajib tepat 15 digit angka."

### T-2 — POS end-to-end dan laporan [MUTASI]

1. `/portal/pos` → pilih unit uji → nama pelanggan `Uji Pelanggan` → telepon
   `081000000001` → metode `cash` → garansi default 3 bulan → selesaikan.
2. Lolos jika transaksi tersimpan, nota tampil, dan unit berubah `sold`.
3. Cek database (read-only): transaksi terakhir punya `unit_id` unit tadi dan
   `payment_method='cash'`; `inventory_units` terkait `sold`.
4. Admin buka `/portal/dashboard`: Total Omzet bertambah sebesar
   `final_payment`. Dashboard menampilkan total all-time; grafik omzet belum
   diimplementasikan (keputusan D1).
5. [NEGATIF] Checkout tanpa unit → "Pilih unit fisik (IMEI) dulu."; unit yang
   sudah `sold` → ditolak gate status unit.

### T-3 — Meja servis sesuai REPAIR_FLOW [MUTASI]

Urutan resmi: `received → diagnosing → waiting_approval → in_progress →
testing → completed → picked_up`; `cancelled` boleh dari tahap mana pun
sebelum `completed`. `picked_up` dan `cancelled` adalah status akhir.

1. Sales/Admin buat tiket di `/portal/service/new`: pelanggan `Uji Pelanggan
   2`, telepon valid, perangkat `Uji Samsung A34`, IMEI uji, keluhan `uji alur
   status` → status awal `received`. Catat kode resi dari trigger DB.
2. [BACA] Tracking publik `/id/tracking` dengan tiket demo
   `SRV-20260927-C0FAZ8Y9` → detail dan riwayat tampil; kode tak dikenal →
   "Tiket tidak ditemukan. Periksa lagi kode resinya."
3. [NEGATIF] Sales mencoba transisi status → "Peran sales hanya boleh mencatat
   tiket masuk, bukan biaya/status pengerjaan."
4. [NEGATIF] Transisi ilegal `received → completed` dan `completed → testing`
   → ditolak.
5. Teknisi jalankan `diagnosing → waiting_approval → in_progress` (isi biaya
   sparepart + jasa; `total_fee` otomatis sama dengan jumlahnya) → `testing`.
6. Teknisi unggah 1 foto kondisi ke bucket `service-photos`: pratinjau memakai
   signed URL, database hanya menyimpan path.
7. Teknisi `testing → completed`, lalu `completed → picked_up`.
8. Lolos jika `picked_up_at` terisi tepat sekali, `picked_up → diagnosing`
   ditolak, dan tabel audit berisi aktor tiap transisi.

### T-4 — Lintasan akses lintas role [BACA + NEGATIF]

1. Login `uji-tech` → buka `/portal/dashboard`, `/portal/pos`,
   `/portal/inventory`, `/portal/products`, `/portal/settings`,
   `/portal/staff`, `/portal/reports`. Semua harus redirect ke
   `/portal/service`, bukan 404/500.
2. Login customer → semua URL di atas → `/portal/account`; hanya
   `/portal/account` yang boleh dibuka.
3. [NEGATIF] Curl tanpa sesi ke server action admin → ditolak `requireRole`;
   cookie role rendah tidak membuka akses admin.

### T-5 — Pengaturan admin tampil di publik [MUTASI, opsional]

1. `/portal/settings` (admin): ubah jam operasional atau nomor WA → simpan.
2. `/id/kontak`: nilai baru tampil; tautan Instagram/WhatsApp/TikTok sesuai.
3. Kembalikan nilai lama setelah uji, atau biarkan sebagai penyetelan nyata.

### T-6 — Kebersihan pasca-uji (opsional, owner lewat psql)

1. Identifikasi data uji: IMEI berawalan `99`, transaksi hari uji, tiket
   perangkat `Uji …`, profil `uji-tech`.
2. Siapkan SQL pembersihan untuk direview manusia: tiket servis hanya bisa
   `cancelled`, unit uji bisa dihapus bila belum terjual, urutan FK diperhatikan.

### T-7 — Ganti kata sandi pelanggan [MUTASI]

1. Login admin/sales → `/portal/customers` → Ubah Kata Sandi di kartu pelanggan.
2. Modal berisi identitas pelanggan dan kolom kata sandi baru dengan tombol
   Lihat dan generate acak. Modal menyebut kata sandi lama hanya tersimpan
   sebagai hash; generate mengisi minimal 8 karakter.
3. Simpan. Notice "Kata sandi pelanggan berhasil diganti." tampil dan kartu
   hasil menampilkan kata sandi baru sekali dengan tombol Salin; setelah kartu
   ditutup, kata sandi tidak muncul lagi.
4. [NEGATIF] `updateCustomerPassword` untuk id profil staf → "Hanya kata sandi
   pelanggan yang bisa diubah dari halaman ini."; teknisi dan pelanggan ditolak
   karena peran.
5. Di mode live, pelanggan login dengan kata sandi baru lewat username, nomor
   HP, dan kata sandi. Di mode demo alur berhenti di langkah 3.

### Catatan eksekusi

- Estimasi T-0 sampai T-4: 30–45 menit; T-5/T-6 opsional.
- Catat lulus/tidak beserta bukti: status HTTP, isi database read-only, dan
  screenshot bila perlu.
- Temuan yang butuh keputusan owner dicatat terpisah, bukan dipecahkan diam-diam.
