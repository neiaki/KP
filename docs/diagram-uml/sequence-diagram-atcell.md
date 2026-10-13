# Sequence Diagram - At Cell Web

Dokumen ini berisi lima sequence diagram, satu untuk setiap aktor.
Isinya sudah diverifikasi ke source code pada 13 Oktober 2026.

Sumber acuan: `src/proxy.ts`, `src/lib/access.ts`,
`src/lib/login-redirect.ts`, `src/app/(public)/[locale]/*/page.tsx`,
`src/app/(portal)/portal/*/page.tsx`,
`src/components/portal/login-panel.tsx`, `src/lib/store.ts`,
`src/lib/actions/`, `src/types/index.ts`, `supabase/migrations/`.
Mode demo memakai mock dan `localStorage`. Mode live memakai
Supabase Auth, RLS, dan Server Actions.

## Cakupan per aktor

### Pengunjung

Pengunjung adalah publik anonim tanpa login. Pengunjung dapat membuka web,
melihat profil toko, membuka etalase dan filter, ganti bahasa,
lacak resi servis, minta estimasi trade-in lewat WhatsApp,
serta membaca halaman info garansi, pembayaran, pengiriman,
syarat, kontak, dan layanan pelanggan.

### Pelanggan

Pelanggan adalah akun dengan peran customer. Pelanggan dapat masuk lewat
pintu login, membuka faktur dan garansi miliknya, mengunduh faktur ulang,
serta lacak resi servis tanpa perlu login ulang.

### Sales

Sales adalah kasir dan inventaris. Sales dapat masuk dan langsung dibuka
ke kasir POS, memilih unit siap jual per IMEI, mencatat pembeli walk-in,
memproses trade-in sebagai diskon, checkout atomik dan cetak nota,
mendaftarkan unit batch IMEI, memantau status unit, membuat tiket servis,
serta mencatat serah terima unit.

### Teknisi

Teknisi adalah meja servis. Teknisi dapat masuk dan langsung dibuka
ke meja servis, membuat tiket servis baru, mengupdate workflow dan biaya
plus foto bukti, serta mencatat serah terima unit.

### Admin

Admin adalah owner dengan kendali penuh. Admin dapat masuk dan langsung
dibuka ke dashboard, melihat ringkasan bisnis dan stok menipis,
mengelola master produk, mengundang dan mengelola staf,
mengelola pengaturan toko publik, melihat laporan performa teknisi,
memantau status unit, serta membuka semua menu POS, inventaris,
servis, dan akun.

## Keterangan Participant

| Participant | Arti |
| ----------- | ---- |
| Browser | Antarmuka web (Next.js App Router, React) di sisi pengguna |
| Middleware | Proxy Next.js di `src/proxy.ts`: redirect `/` ke `/id`, redirect `/portal/login` ke `/id/login`, rewrite subdomain login ke `/id/login` |
| Server | Sisi server Next.js: Server Actions dan Route Handlers (validasi Zod, cek peran lewat `requireRole`) |
| Supabase Auth | Autentikasi Supabase untuk mode live |
| PostgreSQL | Database Supabase dengan Row Level Security (RLS) |
| Storage | Supabase Storage (bucket `trade-in-photos` dan `service-photos`) |

Catatan mode: alur login di bawah menulis dua cabang.
Cabang demo memakai `switchRole` tanpa password lewat klik akun demo.
Cabang live memakai `signInWithUsername` lalu cek `profiles.role`.

---

## Diagram Aktor: Pengunjung

```mermaid
sequenceDiagram
    autonumber
    actor P as Pengunjung
    participant UI as Browser
    participant MW as Middleware
    participant SV as Server
    participant DB as PostgreSQL

    rect rgba(66, 133, 244, 0.10)
    Note over P,DB: Lihat Profil Toko Multilingual
    P->>UI: Buka /id atau /en (jalur / diteruskan ke /id)
    UI->>MW: GET /[locale]
    MW-->>UI: Routing locale lewat next-intl
    UI->>SV: Minta data profil toko
    SV->>DB: SELECT store_settings
    DB-->>SV: Nama, deskripsi id dan en, jam buka, koordinat, alamat, telepon
    SV-->>UI: Data profil
    UI-->>P: Render hero, keunggulan, jam buka, peta, alamat, telepon
    end

    rect rgba(52, 168, 83, 0.10)
    Note over P,DB: Buka Etalase dan Filter Stok
    P->>UI: Buka /id/catalog, pilih filter merek dan kondisi baru atau second
    UI->>SV: Minta daftar unit sesuai filter
    SV->>DB: SELECT v_public_inventory (bukan tabel langsung)
    Note right of DB: Peran anon hanya boleh SELECT ke view. Kolom purchase_cost tidak ikut terkirim
    DB-->>SV: Merek, model, kondisi, harga jual
    SV-->>UI: Daftar unit siap jual
    UI-->>P: Tampilkan etalase dan kartu Minta dikabari untuk model tanpa unit
    end

    rect rgba(251, 188, 4, 0.12)
    Note over P,DB: Ganti Bahasa
    P->>UI: Klik toggle bahasa
    UI->>MW: Pindah /id ke /en atau sebaliknya, state filter dipertahankan
    MW-->>UI: Routing ke locale baru
    UI->>SV: Minta konten locale baru
    SV->>DB: SELECT description_id atau description_en dari store_settings
    DB-->>SV: Teks sesuai bahasa
    SV-->>UI: Konten
    UI-->>P: Halaman tampil dalam bahasa baru
    end

    rect rgba(234, 67, 53, 0.10)
    Note over P,DB: Lacak Resi Servis Publik
    P->>UI: Input kode nota di widget beranda atau /id/tracking?ticket=
    UI->>SV: Cari tiket berdasarkan ticket_code (demo: lookup mock, live: trackTicketPublic)
    SV->>DB: SELECT service_tickets WHERE ticket_code
    alt Kode ditemukan
        DB-->>SV: Status, sparepart_fee, labor_fee, total_fee
        SV-->>UI: Data timeline dan biaya
        UI-->>P: Timeline received sampai picked_up plus total biaya
    else Kode tidak ditemukan
        DB-->>SV: Tidak ada baris
        SV-->>UI: Galat
        UI-->>P: Pesan error tanpa membocorkan tiket lain
    end
    end

    rect rgba(0, 172, 193, 0.10)
    Note over P,DB: Minta Estimasi Trade-In
    P->>UI: Buka /id/trade-in, isi model, storage, grading, dan foto
    UI->>UI: Hitung taksiran lokal dan validasi IMEI opsional 15 digit
    UI-->>P: Buka WhatsApp dengan pesan taksiran plus target unit
    end
```

---

## Diagram Aktor: Pelanggan

```mermaid
sequenceDiagram
    autonumber
    actor C as Pelanggan
    participant UI as Browser
    participant MW as Middleware
    participant AU as Supabase Auth
    participant SV as Server
    participant DB as PostgreSQL

    rect rgba(66, 133, 244, 0.10)
    Note over C,DB: Masuk dan Redirect Peran
    C->>UI: Buka /id/login, pilih akun demo customer atau isi username dan password
    alt Mode demo
        UI->>UI: switchRole ke customer tanpa password
        UI->>MW: Request /portal/account
        MW-->>UI: Izin karena account boleh semua peran, redirect ke /portal/account
    else Mode live
        UI->>AU: Kirim kredensial lewat signInWithUsername
        AU-->>UI: Sesi dan cookie
        UI->>MW: Request halaman portal
        MW->>DB: Baca profiles.role
        DB-->>MW: role customer
        MW-->>UI: Redirect ke /portal/account
    end
    end

    rect rgba(52, 168, 83, 0.10)
    Note over C,DB: Lihat Faktur dan Garansi Miliknya
    C->>UI: Buka /portal/account
    UI->>SV: Minta riwayat transaksi akun ini
    SV->>DB: SELECT transactions dan transaction_items milik akun (dibatasi RLS)
    DB-->>SV: Unit, IMEI, warranty_duration_months
    SV-->>UI: Daftar nota dan garansi plus sisa hari
    UI-->>C: Tampilkan unit yang dibeli dan riwayat tiket
    opt Pelanggan unduh faktur ulang
        C->>UI: Klik unduh atau cetak kartu garansi
        UI-->>C: Faktur bergaransi hasil buildWarrantyCardHtml
    end
    end

    rect rgba(234, 67, 53, 0.10)
    Note over C,DB: Lacak Resi Tanpa Login Ulang
    C->>UI: Input kode tiket SRV-YYYYMMDD-XXXXXXXX di /id/tracking
    UI->>SV: Cari tiket berdasarkan ticket_code
    SV->>DB: SELECT service_tickets WHERE ticket_code
    DB-->>SV: Status dan total biaya
    SV-->>UI: Data timeline
    UI-->>C: Tampilkan timeline status dan total biaya
    end
```

---

## Diagram Aktor: Sales

```mermaid
sequenceDiagram
    autonumber
    actor S as Sales
    participant UI as Browser
    participant MW as Middleware
    participant AU as Supabase Auth
    participant SV as Server
    participant DB as PostgreSQL
    participant ST as Storage

    rect rgba(66, 133, 244, 0.10)
    Note over S,ST: Masuk dan Dibuka ke Kasir POS
    S->>UI: Buka /id/login
    alt Mode demo
        UI->>UI: switchRole ke sales
        UI->>MW: Request /portal/pos
        MW-->>UI: Izin karena pos boleh admin dan sales
    else Mode live
        UI->>AU: signInWithUsername
        AU-->>UI: Sesi
        UI->>MW: Request halaman portal
        MW->>DB: Baca profiles.role
        DB-->>MW: role sales
        MW-->>UI: Redirect ke /portal/pos
    end
    end

    rect rgba(52, 168, 83, 0.10)
    Note over S,ST: Daftarkan Unit Batch IMEI
    S->>UI: Buka /portal/inventory, pilih produk master dan isi daftar IMEI
    UI->>SV: Submit batch registrasi
    SV->>SV: Validasi Zod dan cek peran admin atau sales
    loop Setiap IMEI dalam batch (maks 200)
        alt IMEI tepat 15 digit angka dan unik
            SV->>DB: INSERT inventory_units status available plus modal dan harga jual
            DB-->>SV: OK
        else IMEI duplikat atau panjang salah
            SV->>SV: Tandai baris gagal
        end
    end
    SV-->>UI: Ringkasan baris berhasil dan baris gagal
    UI-->>S: Tampilkan hasil registrasi
    end

    rect rgba(251, 188, 4, 0.12)
    Note over S,ST: Pantau Status Unit
    S->>UI: Filter /portal/inventory per produk, status, atau IMEI
    UI->>SV: Minta daftar unit
    SV->>DB: SELECT inventory_units sesuai filter
    DB-->>SV: Unit dan status available, reserved, sold, in_service, returned
    SV-->>UI: Daftar unit dan mutasi
    UI-->>S: Tampilkan status unit
    end

    rect rgba(171, 71, 188, 0.10)
    Note over S,ST: Jual Lewat POS plus Trade-In Opsional
    S->>UI: Buka /portal/pos, pilih satu unit available per IMEI
    UI->>SV: Minta unit available
    SV->>DB: SELECT inventory_units WHERE status available
    DB-->>SV: Daftar unit
    SV-->>UI: Daftar unit
    opt Pembeli belum punya akun
        S->>UI: Catat nama dan telepon, customer_id boleh kosong tapi garansi tetap tertaut
    end
    opt Ada tukar tambah
        S->>UI: Isi grading layar, bodi, baterai, biometrik, kamera, sinyal, box
        UI->>SV: Kirim foto unit lama
        SV->>ST: Simpan ke bucket trade-in-photos
        ST-->>SV: photo_urls
        S->>UI: Input offered_price sebagai diskon langsung
    end
    S->>UI: Pilih metode cash, transfer, qris, debit, atau credit plus durasi garansi
    UI->>UI: Hitung subtotal kurang trade_in_deduction sama dengan final_payment
    S->>UI: Submit transaksi
    UI->>SV: Checkout lewat processSale dan executePosSale
    SV->>DB: Panggil RPC atomik
    alt Semua IMEI masih available
        DB->>DB: INSERT transactions dan transaction_items plus warranty_duration_months
        DB->>DB: UPDATE status IMEI dari available ke sold
        opt Ada tukar tambah
            DB->>DB: Isi trade_in_deduction dan INSERT trade_in_records
            DB->>DB: INSERT unit lama condition second status available
        end
        DB-->>SV: Commit sukses
        SV-->>UI: Transaksi berhasil
        UI-->>S: Cetak nota hasil buildPosNotaHtml
    else IMEI sudah sold atau reserved
        DB-->>SV: Rollback semua perubahan
        SV-->>UI: Galat
        UI-->>S: Transaksi dibatalkan dan stok di-refresh
    end
    end

    rect rgba(234, 67, 53, 0.10)
    Note over S,ST: Buat Tiket Servis
    S->>UI: Buka /portal/service/new, isi nama, telepon, model, IMEI atau SN, dan keluhan
    UI->>SV: Kirim foto awal
    SV->>ST: Simpan ke bucket service-photos
    ST-->>SV: URL foto
    UI->>SV: Submit tiket lewat createServiceTicket
    SV->>DB: INSERT service_tickets
    Note right of DB: Trigger BEFORE INSERT membuat ticket_code SRV-YYYYMMDD-XXXXXXXX atomik. Sufiks 8 karakter base32 tanpa I, L, O, U
    DB-->>SV: Tiket status awal received
    SV-->>UI: Tiket tersimpan
    UI-->>S: Tampilkan resi untuk pelanggan plus tautan tracking publik
    end

    rect rgba(0, 172, 193, 0.10)
    Note over S,ST: Catat Serah Terima Unit
    S->>UI: Pelanggan datang, catat pelunasan di /portal/service
    UI->>SV: Ubah status tiket
    SV->>DB: UPDATE service_tickets dari completed ke picked_up
    DB-->>SV: OK
    SV-->>UI: Tiket tertutup
    UI-->>S: Unit keluar dari antrean aktif
    end
```

---

## Diagram Aktor: Teknisi

```mermaid
sequenceDiagram
    autonumber
    actor T as Teknisi
    participant UI as Browser
    participant MW as Middleware
    participant AU as Supabase Auth
    participant SV as Server
    participant DB as PostgreSQL
    participant ST as Storage

    rect rgba(66, 133, 244, 0.10)
    Note over T,ST: Masuk dan Dibuka ke Meja Servis
    T->>UI: Buka /id/login
    alt Mode demo
        UI->>UI: switchRole ke technician
        UI->>MW: Request /portal/service
        MW-->>UI: Izin karena service boleh admin, sales, dan technician
    else Mode live
        UI->>AU: signInWithUsername
        AU-->>UI: Sesi
        UI->>MW: Request halaman portal
        MW->>DB: Baca profiles.role
        DB-->>MW: role technician
        MW-->>UI: Redirect ke /portal/service
    end
    end

    rect rgba(234, 67, 53, 0.10)
    Note over T,ST: Buat Tiket Servis
    T->>UI: Isi nama, telepon, model, IMEI atau SN, dan keluhan
    UI->>SV: Kirim foto awal
    SV->>ST: Simpan ke bucket service-photos
    ST-->>SV: URL foto
    UI->>SV: Submit tiket lewat createServiceTicket
    SV->>DB: INSERT service_tickets
    Note right of DB: Trigger BEFORE INSERT membuat ticket_code SRV-YYYYMMDD-XXXXXXXX atomik
    DB-->>SV: Tiket status awal received
    SV-->>UI: Tiket tersimpan
    UI-->>T: Tampilkan resi
    end

    rect rgba(251, 188, 4, 0.12)
    Note over T,ST: Update Workflow dan Biaya Servis
    T->>UI: Buka /portal/service, pilih tiket
    UI->>SV: Minta detail tiket
    SV->>DB: SELECT service_tickets
    DB-->>SV: Detail tiket
    SV-->>UI: Detail tiket
    loop Setiap perpindahan status
        Note over T,DB: Urutan received, diagnosing, waiting_approval, in_progress, testing, completed
        T->>UI: Pilih status berikut, isi sparepart_fee, labor_fee, dan catatan
        UI->>SV: Kirim foto bukti
        SV->>ST: Simpan ke bucket service-photos
        ST-->>SV: URL foto
        UI->>SV: Submit update tiket
        SV->>DB: UPDATE service_tickets status dan biaya plus rincian maks 50 baris
        alt Peran technician lolos RLS
            DB-->>SV: OK, total_fee sama dengan sparepart_fee plus labor_fee
            SV-->>UI: Tiket diperbarui
            UI-->>T: Tampilkan status dan total terbaru
        else Peran tidak diizinkan
            DB-->>SV: Ditolak RLS
            SV-->>UI: Galat
            UI-->>T: Update tidak diizinkan
        end
    end
    end

    rect rgba(0, 172, 193, 0.10)
    Note over T,ST: Catat Serah Terima Unit
    T->>UI: Pelanggan datang, catat pelunasan
    UI->>SV: Ubah status tiket
    SV->>DB: UPDATE service_tickets dari completed ke picked_up
    DB-->>SV: OK
    SV-->>UI: Tiket tertutup
    UI-->>T: Unit keluar dari antrean aktif
    end
```

---

## Diagram Aktor: Admin

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin
    participant UI as Browser
    participant MW as Middleware
    participant AU as Supabase Auth
    participant SV as Server
    participant DB as PostgreSQL

    rect rgba(66, 133, 244, 0.10)
    Note over A,DB: Masuk dan Dibuka ke Dashboard
    A->>UI: Buka /id/login
    alt Mode demo
        UI->>UI: switchRole ke admin
        UI->>MW: Request /portal/dashboard
        MW-->>UI: Izin karena dashboard khusus admin
    else Mode live
        UI->>AU: signInWithUsername
        AU-->>UI: Sesi
        UI->>MW: Request halaman portal
        MW->>DB: Baca profiles.role
        DB-->>MW: role admin
        MW-->>UI: Redirect ke /portal/dashboard
    end
    end

    rect rgba(52, 168, 83, 0.10)
    Note over A,DB: Lihat Dashboard Bisnis
    A->>UI: Buka /portal/dashboard
    UI->>SV: Minta ringkasan bisnis
    SV->>DB: Agregasi transactions, service_tickets, inventory_units
    DB-->>SV: Omzet harian dan bulanan, jumlah transaksi, tiket aktif, model available di bawah threshold
    SV-->>UI: Data dashboard
    UI-->>A: Tampilkan grafik omzet dan daftar stok menipis plus antrean tiket
    end

    rect rgba(251, 188, 4, 0.12)
    Note over A,DB: Kelola Master Produk
    A->>UI: Tambah, edit, atau nonaktifkan produk di /portal/products
    UI->>SV: Submit perubahan produk
    SV->>SV: Validasi Zod dan cek peran admin
    SV->>DB: INSERT atau UPDATE products brand, model_name, specs, default_price
    Note right of DB: RLS menolak INSERT, UPDATE, DELETE dari sales dan teknisi
    DB-->>SV: OK
    SV-->>UI: Produk tersimpan
    UI-->>A: Katalog diperbarui. Produk tanpa unit tampil dengan badge Belum ada unit
    end

    rect rgba(171, 71, 188, 0.10)
    Note over A,DB: Kelola Akun Staf
    A->>UI: Undang, nonaktifkan, atau ubah peran staf di /portal/staff
    UI->>SV: Submit perubahan akun lewat addStaff
    alt Ubah peran diri sendiri padahal satu-satunya admin
        SV-->>UI: Ditolak
        UI-->>A: Pesan galat
    else Perubahan diizinkan
        SV->>AU: Undang atau nonaktifkan akun
        AU-->>SV: OK
        SV->>DB: UPDATE profiles.role
        DB-->>SV: OK
        SV-->>UI: Akun staf diperbarui
        UI-->>A: Tampilkan daftar staf terbaru
    end
    end

    rect rgba(0, 172, 193, 0.10)
    Note over A,DB: Kelola Pengaturan Toko Publik
    A->>UI: Edit form identitas bilingual, alamat, telepon, jam, dan sosmed di /portal/settings
    UI->>SV: Submit pengaturan lewat updateStoreSettings
    SV->>DB: UPDATE store_settings singleton
    DB-->>SV: OK
    SV-->>UI: Pengaturan tersimpan
    UI-->>A: Perubahan langsung tampil di profil toko publik
    end

    rect rgba(234, 67, 53, 0.10)
    Note over A,DB: Lihat Laporan Performa Teknisi
    A->>UI: Buka /portal/reports, pilih rentang tanggal
    UI->>SV: Minta laporan read-only
    SV->>DB: SELECT service_tickets completed dalam rentang per technician_id
    DB-->>SV: Jumlah tiket completed dan rata-rata durasi created_at sampai updated_at
    SV-->>UI: Data laporan
    UI-->>A: Tampilkan performa tiap teknisi
    end

    rect rgba(96, 125, 139, 0.12)
    Note over A,DB: Pantau Status Unit
    A->>UI: Filter /portal/inventory per produk, status, atau IMEI
    UI->>SV: Minta daftar unit
    SV->>DB: SELECT inventory_units sesuai filter
    DB-->>SV: Unit dan status
    SV-->>UI: Daftar unit dan mutasi
    UI-->>A: Tampilkan status unit
    end
```

---

## Status Verifikasi

Verifikasi 13 Oktober 2026 memakai tiga agen eksplorasi yang membaca
`src/proxy.ts`, `src/lib/access.ts`, `src/lib/login-redirect.ts`,
`src/app/(public)/[locale]`, `src/app/(portal)/portal`,
`src/components/portal/login-panel.tsx`, `src/lib/store.ts`,
`src/lib/actions`, dan `src/types/index.ts`.

Yang diperbaiki dari naskah asal di folder Downloads:

- Jalur portal mengikuti kode: `/portal/dashboard`, `/portal/pos`,
  `/portal/inventory`, `/portal/service`, `/portal/products`,
  `/portal/staff`, `/portal/settings`, `/portal/reports`,
  `/portal/account`. Naskah asal memakai jalur tanpa awalan `/portal`.
- Mekanisme login mengikuti `src/proxy.ts` dan `login-panel.tsx`:
  `/portal/login` diteruskan ke `/id/login`, subdomain login ditulis ulang
  ke `/id/login`, demo memakai `switchRole` tanpa password,
  live memakai `signInWithUsername`, redirect memakai `defaultPortalPath`
  dan `?next=` yang divalidasi `canAccessPortalPath`.
- Hak akses menu mengikuti `canAccessPortalPath`: account semua peran,
  dashboard dan produk dan staf dan settings dan reports khusus admin,
  pos dan inventory untuk admin dan sales,
  service untuk admin dan sales dan technician.
- Aturan bisnis mengikuti kode: IMEI tepat 15 digit angka dan unik,
  batch maks 200 baris, `executePosSale` menolak unit selain available,
  kode tiket `SRV-YYYYMMDD-XXXXXXXX` dengan sufiks base32 tanpa I, L, O, U,
  alur `received, diagnosing, waiting_approval, in_progress, testing,
  completed, picked_up` plus `cancelled`,
  bucket `trade-in-photos` dan `service-photos`.
- Estimasi trade-in publik bersifat hitung lokal plus pesan WhatsApp,
  bukan insert database. Insert trade-in hanya terjadi di POS portal.
- Kode bernomor dihapus dari semua judul, tabel, dan diagram
  sesuai permintaan. Judul memakai kalimat langsung seperti
  Pengunjung dapat membuka web.
