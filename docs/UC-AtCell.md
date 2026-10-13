# Use Case - Sistem Operasional dan Web Profil At Cell

> Sumber: `PRD-AtCell.md` - Next.js + Tailwind + shadcn/ui + Supabase (PostgreSQL)
> Domain: publik `atcell.my.id/[locale]` (`/id` default, `/en`) + portal di `/portal/*` yang dibuka lewat `/id/login` dan subdomain login

Dokumen ini ditulis ulang pada 13 Oktober 2026 langsung dari source code.
Tidak ada lagi kode bernomor gaya lama. Setiap kemampuan memakai kalimat
langsung seperti Pengunjung dapat membuka web.

Acuan kode: `src/proxy.ts`, `src/lib/access.ts`,
`src/lib/login-redirect.ts`, `src/app/(public)/[locale]`,
`src/app/(portal)/portal`, `src/components/portal/login-panel.tsx`,
`src/components/portal/portal-sidebar.tsx`, `src/lib/store.ts`,
`src/lib/actions`, `src/types/index.ts`.

## Aktor dan cara masuk

| Aktor | Cara masuk | Mendarat di | Bisa buka |
|---|---|---|---|
| Pengunjung | Tanpa login, langsung buka `/id` | Beranda publik | Semua halaman publik |
| Pelanggan | Buka `/id/login`, demo klik akun customer, live isi username dan password | `/portal/account` | Halaman akun plus semua halaman publik dan lacak servis |
| Sales | Buka `/id/login`, demo klik akun sales, live isi username dan password | `/portal/pos` | Kasir POS, inventaris, servis, akun, plus semua halaman publik |
| Teknisi | Buka `/id/login`, demo klik akun technician, live isi username dan password | `/portal/service` | Meja servis, akun, plus semua halaman publik |
| Admin | Buka `/id/login`, demo klik akun admin, live isi username dan password | `/portal/dashboard` | Semua menu portal plus semua halaman publik |

Cara kerja masuk:

- Jalur `/` diteruskan ke `/id` oleh `src/proxy.ts`.
- Jalur lama `/portal/login` diteruskan ke `/id/login` dengan query dipertahankan.
- Subdomain login menulis ulang `/` ke `/id/login` dan path non portal ke `/portal/*`. Browser tetap melihat URL bersih.
- Mode demo memakai `switchRole` tanpa password lewat klik akun demo di `login-panel.tsx`.
- Mode live memakai `signInWithUsername` di `src/lib/actions/auth.ts` lalu baca `profiles.role`.
- Anonim yang buka portal diarahkan ke `/id/login?next=` berisi path awal. Nilai `next` hanya dipakai kalau diawali `/portal/` dan lolos `canAccessPortalPath`, kalau tidak sistem memakai beranda peran. Lihat `src/lib/login-redirect.ts`.
- Profil hilang dibalas `403`. Peran tidak cocok diarahkan ke beranda perannya lewat `defaultPortalPath`. Guard live hanya aktif kalau env Supabase terpasang, mode demo lolos memakai mock dan `localStorage`.

## Peta menu publik

Semua menu ini tanpa login. Layout memakai `PublicNavbar` dan `PublicFooter`.

- Beranda `/id` dan `/en`: hero jujur soal kondisi, carousel kurasi, etalase stok, panel lacak servis, section kenapa belanja, ulasan, alamat dan jam dan peta, tombol WhatsApp.
- Etalase `/id/catalog`: judul semua HP yang ada di toko plus hitungan unit. Filter search, merek, kondisi, dan sort lewat query URL. Produk tanpa unit tampil di kartu Minta dikabari, bukan tombol beli.
- Lacak servis `/id/tracking?ticket=`: form kode nota plus tombol contoh yang bisa diklik. Hasil berisi badge status, akhir IMEI, tanggal, garansi, keluhan, rincian biaya, foto, timeline tujuh langkah, tombol cetak, dan tombol WhatsApp teknisi.
- Estimasi trade-in `/id/trade-in`: form model iPhone minimal seri 11, storage, kondisi layar dan bodi, slider battery health, checkbox biometrik dan kamera dan dus, upload maks empat foto 5MB, IMEI opsional. Panel taksiran plus tombol kirim lewat WhatsApp. Hitungan lokal, bukan insert database.
- Tentang `/id/about`: cerita toko, hitungan unit live, nilai layanan, daftar merek, alamat dan peta.
- Garansi `/id/warranty`: durasi segel baru 12 bulan, second 30 hari plus tukar 7 hari, servis 30 sampai 90 hari, tabel ditanggung dan tidak, langkah klaim, FAQ.
- Pembayaran `/id/payment`: tunai, transfer, QRIS, debit, banner cicilan, aturan bayar, peringatan anti link pembayaran.
- Pengiriman `/id/shipping`: hanya ambil di toko, tanpa ekspedisi dan COD. Langkah booking WhatsApp, tahan gratis 1x24 jam, cek IMEI, bayar.
- Syarat `/id/terms`: delapan seksi statis soal harga, stok, IMEI, garansi, trade-in, servis, data pribadi, dan penipuan.
- Kontak `/id/contact`: kartu WhatsApp dan telepon, alamat dan jam dan peta, link CS, peringatan penipuan.
- Layanan pelanggan `/id/customer-service`: kartu WhatsApp dan telepon dan kunjungi toko, form nama plus topik plus pesan yang dibuka lewat WhatsApp, FAQ.
- Pintu masuk `/id/login`: pintu staf, bukan auth publik. Daftar akun demo plus form username dan password. Berhasil masuk lalu diteruskan ke beranda peran.

## Peta menu portal

Label persis seperti `portal-sidebar.tsx`. Tampilan disaring per peran, penegakan lewat `canAccessPortalPath`.

- Admin melihat: Ringkasan Bisnis, Master Produk, Kelola Staf, Profil Publik Toko, Laporan, Kasir POS dan Trade-In, Inventaris Unit IMEI, Meja Kerja Servis, Faktur dan Garansi Saya.
- Sales melihat: Kasir POS dan Trade-In, Inventaris Unit IMEI, Meja Kerja Servis.
- Teknisi melihat: Meja Kerja Servis saja.
- Customer melihat: Faktur dan Garansi Saya saja.

Catatan jujur: sidebar hanya menampilkan akun untuk admin dan customer, tetapi guard `canAccessPortalPath` mengizinkan `/portal/account` untuk semua peran. Jadi sales dan teknisi tetap bisa membuka akun lewat URL walau tidak ada di sidebar.

Aturan guard persis seperti `src/lib/access.ts`: account semua peran. Dashboard, produk, settings, staf, dan reports khusus admin. POS dan inventaris untuk admin dan sales. Servis untuk admin dan sales dan technician. Sisanya khusus admin.

## Kemampuan Pengunjung

### Pengunjung dapat membuka web

- Jalur: buka `/` lalu diteruskan ke `/id`, atau langsung `/en`.
- Isi: navbar, hero, etalase, panel servis, alasan belanja, ulasan, alamat.
- Cara kerja: layout publik seed data lewat `getPublicSnapshot`, lalu `RootProviders` menyediakan `useStore`.
- Aturan: tanpa login, tanpa cookie sesi.

### Pengunjung dapat melihat profil toko

- Jalur: beranda dan `/id/about`.
- Isi: nama, deskripsi dua bahasa, jam buka jsonb, koordinat dan alamat, telepon dan WhatsApp dari `store_settings`.
- Cara kerja: server baca `store_settings`, UI render hero dan `StoreMap`.
- Aturan: data dari DB, bukan hardcode.

### Pengunjung dapat membuka etalase dan filter

- Jalur: section stok di beranda dan `/id/catalog` dengan query `q`, `brand`, `cond`, `sort`.
- Isi: kartu unit siap jual plus kartu Minta dikabari untuk model tanpa unit.
- Cara kerja: helper `src/lib/shop.ts` (`sellableUnits`, `toCardItem`, `filterItems`, `sortItems`, `listProductsWithoutUnits`) di atas `useStore`.
- Aturan: peran anon hanya `SELECT` ke view `v_public_inventory`, tidak ke tabel langsung. Kolom `purchase_cost` tidak ikut terkirim.

### Pengunjung dapat ganti bahasa

- Jalur: toggle di navbar antara `/id` dan `/en`.
- Isi: seluruh konten publik ikut bahasa aktif.
- Cara kerja: routing segmen `[locale]`, state filter dipertahankan saat pindah.
- Aturan: teks memakai `description_id` dan `description_en` dari `store_settings`.

### Pengunjung dapat lacak resi servis

- Jalur: widget di beranda atau `/id/tracking?ticket=`.
- Isi: timeline linier `received`, `diagnosing`, `waiting_approval`, `in_progress`, `testing`, `completed`, `picked_up`. Mode demo tampil plus rincian biaya dan foto. Mode live tampil status plus garansi saja.
- Cara kerja: demo cari `ticket_code` di mock `serviceTickets`. Live pakai Server Action `trackTicketPublic` by `ticket_code` saja.
- Aturan: kode tidak ketemu hanya balas pesan error, jangan bocorkan tiket lain. Mode live mengosongkan foto, rincian biaya, dan catatan keluhan.

### Pengunjung dapat minta estimasi trade-in

- Jalur: `/id/trade-in` dengan query opsional `unit` untuk target.
- Isi: form grading plus panel taksiran dan grade.
- Cara kerja: hitung lokal di browser, submit membuka `wa.me` lewat `buildTradeInMessage`.
- Aturan: IMEI opsional harus tepat 15 digit angka kalau diisi. Foto maks empat berkas 5MB.

### Pengunjung dapat membaca halaman info

- Jalur: `/id/warranty`, `/id/payment`, `/id/shipping`, `/id/terms`, `/id/contact`, `/id/customer-service`.
- Isi: copy statis plus nomor WhatsApp dari settings.
- Cara kerja: statis di file, hanya settings yang dari store.
- Aturan: peringatan anti link pembayaran dipertahankan.

### Pengunjung dapat membuka pintu masuk staf

- Jalur: `/id/login` dan subdomain login.
- Isi: daftar akun demo dan form username password.
- Cara kerja: pengunjung boleh membuka, tetapi butuh akun agar bisa masuk portal.
- Aturan: ini bukan pendaftaran publik. Undang staf hanya lewat admin di `/portal/staff`.

## Kemampuan Pelanggan

### Pelanggan dapat masuk dan mendarat di akun

- Jalur: `/id/login` lalu `/portal/account`.
- Isi: sapaan akun, form telepon sendiri, kartu unit yang dibeli, riwayat tiket.
- Cara kerja: demo `switchRole` ke customer. Live `signInWithUsername` lalu guard baca peran.
- Aturan: peran customer hanya diizinkan ke akun dan halaman publik. Path lain dikembalikan ke akun.

### Pelanggan dapat melihat faktur dan garansi miliknya

- Jalur: `/portal/account`.
- Isi: IMEI, durasi garansi bulan, tanggal kedaluwarsa plus sisa hari, harga, tombol cetak kartu garansi.
- Cara kerja: live filter `customer_id` dengan RLS. Demo fallback ke data contoh.
- Aturan: hanya data milik akun yang tampil.

### Pelanggan dapat mengunduh faktur ulang

- Jalur: tombol di tiap kartu unit dan tiap tiket di akun.
- Isi: faktur bergaransi hasil `buildWarrantyCardHtml`.
- Cara kerja: render di browser lalu cetak.
- Aturan: tanpa ubah data.

### Pelanggan dapat lacak resi seperti pengunjung

- Jalur: `/id/tracking?ticket=` plus tautan dari akun.
- Isi dan cara kerja sama seperti kemampuan pengunjung lacak resi.
- Aturan: tanpa perlu login ulang.

## Kemampuan Sales

### Sales dapat masuk dan langsung dibuka ke kasir

- Jalur: `/id/login` lalu `/portal/pos`.
- Cara kerja: demo `switchRole` ke sales. Live cek peran lalu `defaultPortalPath` ke POS.
- Aturan: sales boleh buka POS, inventaris, servis, dan akun. Dashboard, produk, staf, settings, dan reports ditolak dan dikembalikan ke POS.

### Sales dapat jual lewat POS

- Jalur: `/portal/pos`.
- Isi: pilih satu unit available per IMEI dalam radiogroup, data walk-in nama wajib plus HP, durasi garansi 1 atau 3 atau 6 atau 12 bulan, metode qris atau cash atau transfer atau debit atau credit, modal nota plus cetak.
- Cara kerja: submit lewat `processSale` dan `executePosSale`. RPC atomik insert `transactions` dan `transaction_items` plus update IMEI `available` ke `sold`. Nota dari `buildPosNotaHtml`.
- Aturan: unit wajib dipilih. `executePosSale` menolak unit berstatus selain `available` sebagai anti double-sell. IMEI sudah `sold` atau `reserved` saat checkout membatalkan transaksi dan refresh stok. Guest checkout boleh tanpa `customer_id` tetapi garansi tetap tertaut.

### Sales dapat proses tukar tambah di POS

- Jalur: panel trade-in di `/portal/pos`.
- Isi: dropdown model, grading layar dan bodi dan baterai dan biometrik dan kamera dan sinyal dan box, taksiran, foto maks sepuluh berkas ke `trade-in-photos`.
- Cara kerja: submit bersama penjualan dalam satu RPC. Sistem isi `trade_in_deduction`, insert `trade_in_records`, insert unit lama `condition second` dan `status available`.
- Aturan: harus atomik, gagal satu gagal semua. IMEI tukar tambah tepat 15 digit dan unik. Taksiran harus di atas nol. Hitung `subtotal` kurang `trade_in_deduction` sama dengan `final_payment`.

### Sales dapat daftarkan unit batch IMEI

- Jalur: modal registrasi di `/portal/inventory`.
- Isi: pilih produk master, kondisi new atau second, modal, harga jual, textarea IMEI dipisah newline dan koma.
- Cara kerja: insert ke `inventory_units` dengan `status available`.
- Aturan: tiap IMEI tepat 15 digit angka, unik lawan isi batch dan lawan inventaris. Batch maks 200 baris. Harga jual tidak boleh di bawah modal kecuali tidak berubah. Baris gagal ditampilkan, baris valid tetap tersimpan atau rollback sesuai opsi.

### Sales dapat pantau status unit

- Jalur: `/portal/inventory` dengan search IMEI dan model plus filter status dan kondisi.
- Isi: ringkasan tersedia dan terjual dan second dan total, tabel dan kartu berisi model, IMEI, kondisi, status, modal, jual, tombol ubah status dan koreksi.
- Cara kerja: baca `inventory_units` sesuai filter.
- Aturan: status hanya `available`, `reserved`, `sold`, `in_service`, `returned`. Dilarang set langsung ke `sold` dari UI dan dilarang keluarkan unit `sold`. Koreksi hanya boleh ubah kondisi dan harga lewat `updateUnitDetails`.

### Sales dapat buat tiket servis

- Jalur: `/portal/service/new`.
- Isi: nama dan HP, model, IMEI atau SN bebas, keluhan wajib, foto awal.
- Cara kerja: submit lewat `createServiceTicket`, trigger `BEFORE INSERT` terbitkan `ticket_code SRV-YYYYMMDD-XXXXXXXX` atomik. Sufiks delapan karakter base32 tanpa I, L, O, U. Coba ulang anti tabrakan.
- Aturan: status awal `received`. Resi diserahkan ke pelanggan plus tautan tracking publik.

### Sales dapat catat serah terima unit

- Jalur: dialog meja kerja di `/portal/service`.
- Isi: catat pelunasan lalu ubah `completed` ke `picked_up`.
- Cara kerja: update `service_tickets` lewat Server Action.
- Aturan: tiket tertutup keluar dari antrean aktif.

## Kemampuan Teknisi

### Teknisi dapat masuk dan langsung dibuka ke meja servis

- Jalur: `/id/login` lalu `/portal/service`.
- Cara kerja: demo `switchRole` ke technician. Live cek peran lalu arahkan ke servis.
- Aturan: teknisi boleh buka servis dan akun. Menu lain dikembalikan ke servis.

### Teknisi dapat buat tiket servis

- Jalur, isi, cara kerja, dan aturan sama seperti sales buat tiket. Teknisi menerima unit langsung di meja.

### Teknisi dapat update workflow dan biaya servis

- Jalur: `/portal/service` lalu dialog meja kerja per tiket.
- Isi: dropdown status, `sparepart_fee` dan `labor_fee`, rincian biaya maks lima puluh baris, foto progres maks sepuluh berkas ke `service-photos`, catatan teknisi, kontrol unit inventaris by IMEI exact-match.
- Cara kerja: tiap pindah status update biaya dan foto dan catatan. Agregat otomatis dari rincian. Unit masuk inventaris sebagai `in_service`, keluar sebagai `returned`. Unit `sold` bersifat terminal.
- Aturan: urutan `received`, `diagnosing`, `waiting_approval`, `in_progress`, `testing`, `completed`, plus `cancelled`. Hanya peran technician boleh update, ditegakkan RLS. Total sama dengan sparepart tambah jasa.

### Teknisi dapat catat serah terima unit

- Jalur dan aturan sama seperti sales serah terima. Status akhir `picked_up`.

## Kemampuan Admin

### Admin dapat masuk dan langsung dibuka ke dashboard

- Jalur: `/id/login` lalu `/portal/dashboard`.
- Cara kerja: demo `switchRole` ke admin. Live cek peran admin.
- Aturan: admin boleh buka semua path portal.

### Admin dapat lihat dashboard bisnis

- Jalur: `/portal/dashboard`.
- Isi: empat kartu omzet dan transaksi dan tiket aktif dan stok rendah dengan threshold 1 atau 2 atau 3 atau 5, panel stok menipis, antrean lima tiket, delapan transaksi terbaru. Tombol Tambah Master Produk, Buka POS, Tambah IMEI.
- Cara kerja: agregasi `transactions`, `service_tickets`, `inventory_units`. Pantau lalu loncat ke inventaris dan servis dan POS.
- Aturan: read-only, tanpa mutasi di halaman ini.

### Admin dapat kelola master produk

- Jalur: `/portal/products`.
- Isi: search plus grid kartu berisi foto atau placeholder, badge merek, hitungan unit siap jual, harga acuan `formatIDR`. Dialog tambah dan edit berisi merek Apple atau Samsung atau Xiaomi atau Oppo atau Vivo atau Google, model wajib, harga acuan, specs, image_url.
- Cara kerja: tambah dan edit dan nonaktifkan katalog di `products`.
- Aturan: RLS menolak `INSERT` dan `UPDATE` dan `DELETE` dari sales dan teknisi. Harga nol atau kosong berarti tanpa harga dan baris harga disembunyikan di etalase. Produk tanpa unit tetap tampil dengan badge Belum ada unit tetapi tidak bisa dijual di POS.

### Admin dapat kelola akun staf

- Jalur: `/portal/staff`.
- Isi: kartu staf non customer berisi nama, username, telepon, status aktif. Dialog undang berisi nama dan email wajib, username kecil 3 sampai 32 karakter, password min delapan, peran sales atau technician atau admin.
- Cara kerja: undang lewat Supabase Auth invite dan `addStaff`, lalu update `profiles.role`.
- Aturan: `addStaff` menolak peran customer. Dilarang ubah peran diri sendiri menjadi non admin kalau satu-satunya admin.

### Admin dapat kelola pengaturan toko publik

- Jalur: `/portal/settings` berjudul Profil Publik Toko.
- Isi: identitas bilingual ID dan EN, alamat dan lat long dan telepon dan WhatsApp yang dinormalisasi 08 ke 628 plus owner, jam Senin Jumat dan Sabtu Minggu dan libur, sosmed URL http dan https.
- Cara kerja: simpan lewat `updateStoreSettings`, server wajibkan peran admin.
- Aturan: kosong berarti sembunyi. Perubahan langsung tampil di profil publik.

### Admin dapat lihat laporan performa

- Jalur: `/portal/reports`.
- Isi: kartu tiket selesai dan aktif dan omzet jasa dan total servis plus success rate completed per total. Rincian berisi kode, model dan pemilik, keluhan, status, sparepart, jasa, total, update.
- Cara kerja: read-only per rentang tanggal, grup per `technician_id`, durasi `created_at` ke `updated_at`.
- Aturan: tiket batal dihitung gagal. Tanpa tombol mutasi.

### Admin dapat pantau status unit

- Jalur, isi, cara kerja, dan aturan sama seperti sales pantau unit, tanpa batas peran.

### Admin dapat pakai semua menu operasional

- Jalur: `/portal/pos`, `/portal/inventory`, `/portal/service`, `/portal/account`.
- Isi dan cara kerja ikut kemampuan sales dan teknisi dan pelanggan.
- Aturan: admin lolos semua guard karena `canAccessPortalPath` mengembalikan true untuk admin di semua cabang.

## Relasi antar kemampuan

- Penjualan mencakup validasi IMEI available. Tanpa unit available tidak ada checkout.
- Tukar tambah memperluas penjualan. Keduanya dieksekusi atomik dalam satu RPC, gagal satu gagal semua.
- Etalase membaca view `v_public_inventory`, bukan tabel langsung. Pantau unit membaca tabel `inventory_units` langsung.
- Pengaturan toko mengalir ke profil publik. Edit di settings langsung tampil di beranda dan about.
- Tiket servis mengalir ke lacak publik. Buat di portal service, dibaca anonim lewat tracking by `ticket_code`.
- Produk tanpa unit mengalir ke kartu Minta dikabari. Dibuat di products, dibaca di catalog dan beranda.

## Diagram dan gambar

Tidak ada lagi berkas gambar diagram di `docs/` root. Diagram PlantUML lama dan render PNG dan SVG dihapus pada 1 Oktober 2026. Berkas Mermaid terpisah `diagram.mmd` dihapus pada 2 Oktober 2026.

Blok Mermaid inline yang dulu ada di bagian ini dihapus pada 14 Oktober 2026 dan diganti sumber PlantUML di `diagram-uml/`: lima sequence per aktor, tiga activity, dua state machine, satu concept domain, lima use case per aktor tanpa kode bernomor, satu class domain, satu object potret penjualan, dan satu component arsitektur. Tiap sumber lolos cek sintaks dan render PNG plus SVG-nya di-commit di folder itu (render sequence, activity, dan use case tinggal di subfolder masing-masing). Rangkuman per aktor ada di `diagram-uml/sequence-diagram-atcell.md`, indeks dan perintah render ada di `diagram-uml/README.md`.

Kalau gambar UML dibutuhkan lagi, gambar dari kemampuan per aktor di atas dan simpan hasilnya di `diagram-uml/` bersama sumbernya, supaya tautan gambar tidak pernah menggantung. `tests/docs-index.test.ts` menolak sumber diagram yang belum dirender ke PNG dan SVG.
