# Sequence Diagram - At Cell Web

Dokumen ini merangkum lima sequence diagram, satu untuk setiap aktor.
Sumber diagram adalah berkas PlantUML di folder ini, satu diagram satu
berkas. Render PNG dan SVG di-commit bersama sumbernya karena GitHub
tidak me-render `.puml`.

Sumber acuan perilaku: `src/proxy.ts`, `src/lib/access.ts`,
`src/lib/login-redirect.ts`, `src/app/(public)/[locale]/*/page.tsx`,
`src/app/(portal)/portal/*/page.tsx`,
`src/components/portal/login-panel.tsx`, `src/lib/store.ts`,
`src/lib/actions/`, `src/types/index.ts`, `supabase/migrations/`.
Mode demo memakai mock dan `localStorage`. Mode live memakai
Supabase Auth, RLS, dan Server Actions.

Aturan label mengikuti skill diagram: pesan memakai bahasa domain,
bukan nama fungsi. Judul menamai prosesnya, bukan fasenya.

## Cakupan per aktor

### Pengunjung

Pengunjung adalah publik anonim tanpa login. Pengunjung dapat membuka web,
melihat profil toko, membuka etalase dan filter, ganti bahasa,
lacak resi servis, minta estimasi trade-in lewat WhatsApp,
serta membaca halaman info garansi, pembayaran, pengiriman,
syarat, kontak, dan layanan pelanggan.

- Sumber: `sequence-pengunjung.puml`
- Render: `sequence-pengunjung.png`, `sequence-pengunjung.svg`
- Yang perlu diperhatikan: peran anon hanya boleh baca view etalase
  publik sehingga harga modal tidak ikut terkirim. Lacak mode live
  hanya tampil status plus garansi, foto dan biaya dikosongkan.
  Estimasi trade-in publik hanya hitung lokal, insert database hanya
  terjadi di kasir portal.

### Pelanggan

Pelanggan adalah akun dengan peran customer. Pelanggan dapat masuk lewat
pintu login, membuka faktur dan garansi miliknya, mengunduh faktur ulang,
serta lacak resi servis tanpa perlu login ulang.

- Sumber: `sequence-pelanggan.puml`
- Render: `sequence-pelanggan.png`, `sequence-pelanggan.svg`
- Yang perlu diperhatikan: akun hanya boleh semua peran sehingga cabang
  demo langsung terus, cabang live membaca peran profil dulu.
  Riwayat dibatasi RLS ke milik akun.

### Sales

Sales adalah kasir dan inventaris. Sales dapat masuk dan langsung dibuka
ke kasir POS, memilih unit siap jual per IMEI, mencatat pembeli walk-in,
memproses trade-in sebagai diskon, checkout atomik dan cetak nota,
mendaftarkan unit batch IMEI, memantau status unit, membuat tiket servis,
serta mencatat serah terima unit.

- Sumber: `sequence-sales.puml`
- Render: `sequence-sales.png`, `sequence-sales.svg`
- Yang perlu diperhatikan: registrasi batch maks 200 baris, baris gagal
  tidak menggagalkan baris valid. Checkout menolak IMEI selain available
  lalu rollback total. Kode tiket diterbitkan pemicu database secara
  atomik dengan sufiks base32 tanpa I, L, O, U.

### Teknisi

Teknisi adalah meja servis. Teknisi dapat masuk dan langsung dibuka
ke meja servis, membuat tiket servis baru, mengupdate workflow dan biaya
plus foto bukti, serta mencatat serah terima unit.

- Sumber: `sequence-teknisi.puml`
- Render: `sequence-teknisi.png`, `sequence-teknisi.svg`
- Yang perlu diperhatikan: testing boleh kembali ke in_progress bila
  gagal uji. Update hanya lolos bila peran technician lolos RLS.
  Rincian biaya maks 50 baris dan total selalu sparepart plus jasa.

### Admin

Admin adalah owner dengan kendali penuh. Admin dapat masuk dan langsung
dibuka ke dashboard, melihat ringkasan bisnis dan stok menipis,
mengelola master produk, mengundang dan mengelola staf,
mengelola pengaturan toko publik, melihat laporan performa teknisi,
memantau status unit, serta membuka semua menu POS, inventaris,
servis, dan akun.

- Sumber: `sequence-admin.puml`
- Render: `sequence-admin.png`, `sequence-admin.svg`
- Yang perlu diperhatikan: tulis produk ditolak RLS untuk sales dan
  teknisi. Ubah peran diri sendiri padahal satu-satunya admin ditolak.
  Laporan bersifat read-only.

## Keterangan participant

| Participant | Arti |
| ----------- | ---- |
| Peramban | Antarmuka web (Next.js App Router, React) di sisi pengguna |
| Middleware | Proxy Next.js di `src/proxy.ts`: redirect `/` ke `/id`, redirect `/portal/login` ke `/id/login`, rewrite subdomain login ke `/id/login` |
| Server | Sisi server Next.js: Server Actions dan Route Handlers (validasi Zod, cek peran) |
| Otentikasi | Autentikasi Supabase untuk mode live |
| Basis Data | Database Supabase dengan Row Level Security (RLS) |
| Penyimpanan | Supabase Storage (bucket `trade-in-photos` dan `service-photos`) |

Catatan mode: alur login menulis dua cabang.
Cabang demo ganti peran tanpa password lewat klik akun demo.
Cabang live masuk username lalu cek `profiles.role`.

## Status verifikasi

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
  ke `/id/login`, demo ganti peran tanpa password,
  live masuk username, redirect memakai beranda peran
  dan `?next=` yang divalidasi hak akses.
- Hak akses menu mengikuti guard: account semua peran,
  dashboard dan produk dan staf dan settings dan reports khusus admin,
  pos dan inventory untuk admin dan sales,
  service untuk admin dan sales dan technician.
- Aturan bisnis mengikuti kode: IMEI tepat 15 digit angka dan unik,
  batch maks 200 baris, checkout menolak unit selain available,
  kode tiket `SRV-YYYYMMDD-XXXXXXXX` dengan sufiks base32 tanpa I, L, O, U,
  alur `received, diagnosing, waiting_approval, in_progress, testing,
  completed, picked_up` plus `cancelled`,
  bucket `trade-in-photos` dan `service-photos`.
- Estimasi trade-in publik bersifat hitung lokal plus pesan WhatsApp,
  bukan insert database. Insert trade-in hanya terjadi di POS portal.
- Routing bahasa memakai segmen `[locale]` plus kamus terjemahan dan
  redirect `/` ke `/id` di `src/proxy.ts`. Klaim pustaka lama dihapus
  karena paket itu tidak ada di `package.json`.
- Lacak publik mode live hanya tampil status plus garansi. Foto, rincian
  biaya, dan catatan dikosongkan di halaman tracking, jadi diagram
  menulis dua cabang demo dan live.
- Kode bernomor dihapus dari semua judul, tabel, dan diagram
  sesuai permintaan. Judul memakai kalimat langsung seperti
  Pengunjung dapat membuka web.

Konversi PlantUML 14 Oktober 2026 mengikuti skill diagramming-processes
dan dokumentasi PlantUML terkini via Context7:

- Lima blok Mermaid di dokumen ini diganti lima berkas `.puml`,
  satu diagram satu berkas: `sequence-pengunjung.puml`,
  `sequence-pelanggan.puml`, `sequence-sales.puml`,
  `sequence-teknisi.puml`, `sequence-admin.puml`.
- Ditambah `activity-penjualan-kasir.puml` untuk proses kasir,
  `state-tiket-servis.puml` untuk status tiket persis peta
  `REPAIR_FLOW` di `src/lib/validations.ts` (termasuk testing kembali
  ke in_progress dan cancelled sebelum completed),
  dan `state-status-unit.puml` untuk status unit (sold hanya lewat
  kasir dan terminal karena pemicu database menolak semua perubahan
  dari sold).
- Pesan diagram memakai bahasa domain, bukan nama fungsi.
  Setiap sumber lolos `plantuml -checkonly` dan render PNG plus SVG
  di-commit di folder ini. Perintah render ada di `README.md` folder ini.
