# Menerbitkan Model ke Katalog Tanpa Stok

Dokumen ini untuk staf yang mau menulis model HP ke katalog sementara toko
belum punya unit-nya. Modelnya tetap kelihatan di etalase publik, tapi jujur
bilang belum ada unit dan belum bisa dibeli.

Yang tidak boleh terjadi di jalur ini: mengarang nomor IMEI supaya modelnya
kelihatan lengkap. IMEI adalah nomor identitas hardware yang menempel di unit
asli, jadi kalau dikarang berarti etalase mengiklankan barang yang tidak ada
di toko, pelanggan datang ke kounter lalu staf tidak bisa menjualnya, dan
nota garansi akan mencantumkan nomor palsu.

## Kapan Memakai Jalur Ini

- Model baru di katalog, unitnya belum masuk toko.
- Model lama yang totalnya habis, mau diumumkan lagi ke calon pembeli.
- Model yang unitnya cuma dijemput dari distributor, belum ada barang di rak.

Kalau memang belum ada satu pun unit dan belum ada rencana masuk, tidak perlu
menulis modelnya sama sekali.

## Cara Menulis Modelnya

Buka menu **Master Produk** di portal, lalu tekan **Tambah Model Produk Baru**.
Isi formnya seperti ini:

- **Merek Handphone**: pilih dari daftar yang tersedia.
- **Nama Seri / Model**: nama yang biasa dipakai orang, lengkap dengan
  storage-nya kalau itu yang biasa dicari, misalnya `iPhone 16 Pro 256GB`.
- **Harga Acuan Dasar (Rp)**: harga patokan model itu. Angka ini muncul di
  etalase sebagai perkiraan, bukan sebagai harga jual.
- **Spesifikasi Utama**: chipset, RAM dan storage, kamera, ukuran layar. Ini
  yang dibaca pelanggan di kartu katalog.
- **URL Foto Produk**: foto resmi model tersebut. Pakai foto di `public/products/`
  atau foto resmi yang sudah diunggah ke folder produk, jangan pakai foto acak
  dari internet karena modelnya bisa tidak cocok.

Tekan **Tambahkan Model**. Halaman ini memang tidak punya kolom IMEI, jadi
jangan cari kolom itu di sini. IMEI selalu didaftarkan terpisah di menu
**Inventaris Unit IMEI**.

## Yang Dilihat Pelanggan

Begitu model tersimpan, dia langsung muncul di bagian **Baru masuk katalog**
di beranda dan di halaman katalog. Yang ditulis di kartunya:

- Badge **Belum ada unit**.
- Nama model dan spesifikasi.
- Perkiraan harga saat unitnya masuk, dengan catatan bahwa itu harga acuan,
  bukan harga jual hari ini.
- Tombol **Minta dikabari** yang membuka chat WhatsApp.

Model ini tidak masuk hitungan "unit ada di toko" di beranda, dan tidak masuk
daftar ready stock yang bisa dipilih di kasir.

## Kapan Baru Bisa Dijual

Begitu ada unit fisik pertama untuk model itu, statusnya berubah jadi tersedia
di kasir. Yang berubah adalah modelnya pindah dari daftar **Baru masuk
katalog** ke daftar ready stock biasa, dengan harga jual dari unit itu sendiri.
Badge **Belum ada unit** ikut hilang karena produknya sudah punya unit.

## Saat Unit Pertama Datang

Buka menu **Inventaris Unit IMEI**, tekan **Registrasi Batch IMEI**, lalu:

- **Pilih Katalog Produk Master**: pilih model yang tadi dibuat.
- **Kondisi Fisik**: `Baru (New)` atau `Seken (Second Hand)`.
- **Harga Modal / Beli (Rp)** dan **Harga Jual Toko (Rp)**: angka unit ini.
- **Daftar Nomor IMEI 15 Digit (Pisahkan per baris)**: IMEI asli dari unit
  fisik, satu per baris. Form menolak nomor yang bukan 15 digit angka dan
  menolak nomor yang sudah terdaftar.

Tekan tombol daftarkan. Setelah itu:

- Modelnya otomatis hilang dari bagian **Baru masuk katalog** dan masuk daftar
  ready stock, lengkap dengan harganya.
- Modelnya bisa dipilih di **Kasir POS & Trade-In** dan bisa sold lewat
  verifikasi IMEI.
- Badge **Belum ada unit** di halaman **Master Produk** ikut hilang.

Tidak ada langkah penghapusan katalog. Katalog produknya tetap disimpan karena
masih dipakai sebagai acuan spesifikasi dan harga.

## Kalau Salah Input

- Modelnya salah ketik atau salah harga: tekan **Edit** di kartunya di
  **Master Produk**, lalu tekan **Simpan Perubahan**.
- Modelnya tidak pernah ada di toko: produk yang tidak punya unit apa pun tidak
  bisa dihapus dari portal. Minta ke owner, atau tambahkan satu unit lalu ubah
  statusnya lewat **Inventaris Unit IMEI** supaya tidak pernah muncul sebagai
  ready stock.

## Ringkasan Singkat

- Simpan modelnya di **Master Produk** tanpa IMEI, unit boleh nol.
- Pelanggan melihatnya dengan badge **Belum ada unit** dan tombol
  **Minta dikabari**, bukan dengan harga jual.
- Unitnya belum bisa dijual di kasir.
- Begitu unit pertama didaftarkan di **Inventaris Unit IMEI** dengan IMEI
  asli, modelnya langsung jadi ready stock.
