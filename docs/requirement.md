# Software Requirements Specification (SRS) - Sistem Toko Handphone

## 1. Ringkasan Sistem
Sistem informasi berbasis web/aplikasi untuk toko handphone yang mengintegrasikan pencatatan penjualan unit berbasis nomor IMEI, alur layanan servis unit, dan transaksi tukar tambah (trade-in).

---

## 2. Aktor Sistem & Hak Akses
* **Sales / Kasir**
  * Mengelola katalog unit baru/bekas dan input nomor unik IMEI.
  * Memproses transaksi penjualan reguler dan cetak struk/faktur.
  * Memproses transaksi *trade-in* (penilaian kondisi, potong harga, dan registrasi unit masuk).
  * Memantau ketersediaan stok fisik per IMEI.

* **Teknisi**
  * Menerima dan mendaftarkan tiket servis masuk dari pelanggan.
  * Melakukan diagnosa awal kerusakan dan estimasi biaya perbaikan.
  * Memperbarui status pengerjaan (*Waiting*, *In Progress*, *Testing*, *Completed*, *Cancelled*).
  * Mencatat rincian sparepart yang digunakan serta biaya jasa teknisi.

* **Pelanggan**
  * Melihat katalog handphone dan ketersediaan stok.
  * Melakukan pengecekan status tiket perbaikan servis secara *real-time*.
  * Mengajukan atau mengecek estimasi awal nilai tukar tambah (*trade-in*).
  * Mengakses riwayat pembelian dan masa garansi (berdasarkan IMEI).

---

## 3. Modul & Kebutuhan Fungsional

### A. Sistem Penjualan Berbasis IMEI
* **Validasi IMEI Unik:** Setiap unit handphone memiliki identitas IMEI tunggal untuk mencegah duplikasi stok.
* **Transaksi Point of Sale (POS):** Pemilihan produk wajib menyertakan pemilihan/pemindaian IMEI unit fisik.
* **Garansi & Nota:** Penerbitan tanda terima transaksi yang mencantumkan IMEI, tanggal pembelian, dan masa berlaku garansi toko/resmi.
* **Pelacakan Stok (Stock Tracking):** Laporan mutasi stok per IMEI (stok tersedia, terjual, atau retur).

### B. Sistem Layanan Servis
* **Registrasi Tiket Servis:** Perekaman data unit pelanggan (IMEI/Serial, merek/tipe, kendala/keluhan fisik maupun sistem).
* **Manajemen Alur Kerja (Workflow):** Pembaruan status reparasi oleh teknisi yang dapat dipantau langsung oleh pelanggan.
* **Kalkulasi Biaya Servis:** Rincian otomatis yang menggabungkan harga sparepart yang diganti dan biaya pengerjaan jasa.
* **Serah Terima Unit:** Validasi nota servis saat pengambilan unit serta pencatatan garansi perbaikan.

### C. Sistem Tukar Tambah (Trade-in)
* **Formulir Inspeksi & Grading:** Form checklist kelayakan unit lama (kondisi layar, baterai, fisik/body, fungsi kamera/sinyal, kelengkapan boks).
* **Penetapan Nilai Taksiran:** Penentuan nominal harga beli unit lama berdasarkan hasil grading.
* **Skema Pembayaran Selisih:** Pengurangan otomatis nilai handphone baru dengan harga taksiran unit lama.
* **Integrasi Stok Masuk:** Unit lama yang diterima otomatis masuk ke database stok sebagai unit seken (*second hand*) dengan IMEI baru yang terdaftar.

---

## 4. Kebutuhan Non-Fungsional
* **Keamanan:** Autentikasi berbasis peran (Role-Based Access Control) untuk Sales, Teknisi, dan Pelanggan.
* **Integritas Data:** Validasi ketat pada nomor IMEI (panjang karakter dan keunikan nilai).
* **Aksesibilitas:** Antarmuka responsif yang dapat diakses melalui browser desktop maupun perangkat mobile.