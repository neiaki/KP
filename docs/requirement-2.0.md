# Software Requirements Specification (SRS) — Sistem Operasional Toko Handphone "At Cell"

## 1. Ringkasan Sistem
Sistem informasi berbasis web untuk toko handphone **At Cell** yang mengintegrasikan pencatatan penjualan unit berbasis nomor IMEI, alur layanan servis unit, transaksi tukar tambah (*trade-in*), etalase & profil toko publik multi-bahasa, serta dashboard kendali bisnis bagi pemilik toko.

## 2. Ruang Lingkup & Tujuan
Dokumen ini mendefinisikan kebutuhan fungsional dan non-fungsional sistem sebagai acuan pengembangan. Ruang lingkup mencakup empat domain utama: **(A)** penjualan & inventaris IMEI, **(B)** layanan servis, **(C)** tukar tambah, dan **(D)** profil publik & dashboard admin.

**Di luar ruang lingkup (out of scope) versi ini:** integrasi payment gateway otomatis, aplikasi mobile native, dan manajemen multi-cabang/multi-toko.

## 3. Aktor Sistem & Hak Akses

* **Admin / Owner** *(baru ditambahkan — sebelumnya belum ada di draf ini)*
  * Mengelola data master katalog produk (merek, model, spesifikasi, harga acuan).
  * Mengelola akun staf (Sales & Teknisi): mengundang, menonaktifkan, atau mengubah peran.
  * Memantau dashboard ringkasan penjualan, peringatan stok menipis, dan performa teknisi.
  * Mengelola konten profil publik toko (deskripsi, alamat, jam operasional, dan konten dwibahasa).
  * Memiliki akses penuh ke seluruh data transaksi untuk keperluan audit/laporan.

* **Sales / Kasir**
  * Meregistrasi unit fisik baru/bekas (nomor IMEI) **di bawah katalog produk yang telah didefinisikan Admin** — Sales tidak berwenang membuat entri katalog produk baru.
  * Memproses transaksi penjualan reguler dan cetak struk/faktur.
  * Memproses transaksi *trade-in* (penilaian kondisi, potong harga, dan registrasi unit masuk).
  * Memantau ketersediaan stok fisik per IMEI.
  * Meregistrasi data pelanggan *walk-in* (nama & nomor telepon) tanpa mewajibkan akun penuh.

* **Teknisi**
  * Menerima dan mendaftarkan tiket servis masuk dari pelanggan.
  * Melakukan diagnosa awal kerusakan dan estimasi biaya perbaikan.
  * Memperbarui status pengerjaan tiket sesuai alur kerja yang berlaku (lihat Modul B).
  * Mencatat rincian sparepart yang digunakan serta biaya jasa teknisi.

* **Pelanggan** *(terdaftar maupun tamu/guest)*
  * Melihat katalog handphone dan ketersediaan stok melalui etalase publik multi-bahasa.
  * Melakukan pengecekan status tiket perbaikan servis secara *real-time* menggunakan kode tiket, tanpa perlu login.
  * Mengajukan atau mengecek estimasi awal nilai tukar tambah (*trade-in*).
  * Pelanggan terdaftar dapat mengakses riwayat pembelian dan masa garansi (berdasarkan IMEI) melalui akun pribadi.

## 4. Modul & Kebutuhan Fungsional

### A. Sistem Penjualan Berbasis IMEI
- **FR-A-01 — Validasi IMEI Unik:** Setiap unit handphone memiliki identitas IMEI tunggal (15 digit) untuk mencegah duplikasi stok.
- **FR-A-02 — Transaksi Point of Sale (POS):** Pemilihan produk wajib menyertakan pemilihan/pemindaian IMEI unit fisik yang berstatus tersedia.
- **FR-A-03 — Garansi & Nota:** Penerbitan tanda terima transaksi yang mencantumkan IMEI, tanggal pembelian, dan masa berlaku garansi toko/resmi.
- **FR-A-04 — Pelacakan Stok (Stock Tracking):** Laporan mutasi stok per IMEI (stok tersedia, terjual, atau retur).
- **FR-A-05 — Registrasi Pelanggan Walk-in:** Sistem mengizinkan pencatatan transaksi untuk pelanggan tanpa akun terdaftar, cukup dengan nama dan nomor telepon.

### B. Sistem Layanan Servis
- **FR-B-01 — Registrasi Tiket Servis:** Perekaman data unit pelanggan (IMEI/Serial, merek/tipe, kendala/keluhan fisik maupun sistem), dengan kode tiket unik yang dibuat otomatis oleh sistem.
- **FR-B-02 — Manajemen Alur Kerja (Workflow):** Status tiket mengikuti urutan berikut dan dapat dipantau langsung oleh pelanggan secara publik:
  `Received → Diagnosing → Waiting Approval → In Progress → Testing → Completed → Picked Up`
  Status `Cancelled` dapat dikenakan dari tahap manapun sebelum `Completed` (mis. pelanggan menolak estimasi biaya).
- **FR-B-03 — Kalkulasi Biaya Servis:** Rincian otomatis yang menggabungkan harga sparepart yang diganti dan biaya pengerjaan jasa.
- **FR-B-04 — Serah Terima Unit:** Validasi nota servis saat pengambilan unit (transisi status ke `Picked Up`) serta pencatatan garansi perbaikan.

### C. Sistem Tukar Tambah (Trade-in)
- **FR-C-01 — Formulir Inspeksi & Grading:** Form checklist kelayakan unit lama (kondisi layar, baterai, fisik/body, fungsi kamera/sinyal, kelengkapan boks), dilengkapi unggahan foto kondisi.
- **FR-C-02 — Penetapan Nilai Taksiran:** Penentuan nominal harga beli unit lama berdasarkan hasil grading.
- **FR-C-03 — Skema Pembayaran Selisih:** Pengurangan otomatis nilai handphone baru dengan harga taksiran unit lama.
- **FR-C-04 — Integrasi Stok Masuk:** Unit lama yang diterima otomatis masuk ke database stok sebagai unit seken (*second hand*) dengan IMEI yang terdaftar, dieksekusi dalam satu transaksi atomik bersama proses penjualan agar tidak terjadi mutasi ganda yang gagal sebagian.

### D. Profil Publik Multibahasa & Dashboard Admin *(modul baru — sebelumnya tidak tercakup di draf ini)*
- **FR-D-01 — Etalase & Profil Toko:** Halaman publik menampilkan profil toko, jam operasional, lokasi, dan katalog stok *ready-stock*, tersedia dalam Bahasa Indonesia dan Inggris.
- **FR-D-02 — Manajemen Konten Toko:** Admin dapat memperbarui konten profil publik (deskripsi, alamat, jam operasional) tanpa perubahan kode aplikasi.
- **FR-D-03 — Dashboard Ringkasan Bisnis:** Admin memperoleh ringkasan omzet, jumlah transaksi, peringatan stok menipis per model, dan performa penyelesaian tiket servis per teknisi.
- **FR-D-04 — Manajemen Akun Staf:** Admin dapat mengundang, menonaktifkan, atau mengubah peran akun Sales dan Teknisi.

## 5. Kebutuhan Non-Fungsional
- **NFR-01 — Keamanan:** Autentikasi berbasis peran (*Role-Based Access Control*) untuk Admin, Sales, Teknisi, dan Pelanggan; setiap peran hanya dapat mengakses data sesuai kewenangannya.
- **NFR-02 — Integritas Data:** Validasi ketat pada nomor IMEI (panjang karakter dan keunikan nilai) serta nilai status (enumerasi tetap, bukan input bebas).
- **NFR-03 — Aksesibilitas & Kompatibilitas:** Antarmuka responsif yang dapat diakses melalui browser desktop maupun perangkat mobile, mendukung browser modern (Chrome, Firefox, Safari, Edge versi dua tahun terakhir).
- **NFR-04 — Internasionalisasi:** Seluruh halaman publik wajib tersedia dalam dua bahasa (Indonesia & Inggris) dengan mekanisme peralihan instan.
- **NFR-05 — Kinerja:** Waktu muat halaman etalase publik dan proses checkout POS ditargetkan di bawah 2 detik pada kondisi jaringan normal.
- **NFR-06 — Ketersediaan & Pemulihan Data:** Sistem menargetkan waktu aktif (*uptime*) tinggi pada jam operasional toko; data transaksi dicadangkan (*backup*) secara berkala untuk mencegah kehilangan data.
- **NFR-07 — Audit Trail:** Setiap mutasi status unit (IMEI) dan tiket servis tercatat dengan stempel waktu dan identitas pengguna yang melakukan perubahan, untuk keperluan penelusuran/audit.
- **NFR-08 — Privasi Data Pelanggan:** Data pribadi pelanggan (nama, nomor telepon, riwayat pembelian) hanya dapat diakses oleh peran yang berwenang sesuai kebutuhan tugasnya.
- **NFR-09 — Pemeliharaan (Maintainability):** Struktur data dan modul dirancang modular agar mudah dikembangkan (mis. penambahan cabang toko atau metode pembayaran baru) tanpa perubahan besar pada skema inti.

## 6. Asumsi & Batasan
- Sistem dirancang untuk operasional satu cabang toko (*single-store*); dukungan multi-cabang berada di luar cakupan versi ini.
- Pembayaran dicatat secara manual oleh Sales (tunai/transfer/QRIS/kartu); integrasi payment gateway otomatis belum termasuk dalam cakupan.
- Pengguna diasumsikan memiliki koneksi internet stabil saat mengakses portal operasional maupun etalase publik.
- Mata uang transaksi menggunakan Rupiah (IDR).
