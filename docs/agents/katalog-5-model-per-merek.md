# Katalog 5 Model per Merek

Status per 24 Oktober 2026: **selesai di production**. Katalog berisi 25 produk
aktif, tepat 5 model berbeda untuk setiap merek: Apple, Samsung, Xiaomi, Oppo,
dan Vivo. Dokumen ini mencatat hasilnya, bukan lagi daftar slot kosong.

Verifikasi dilakukan langsung ke database production lewat query read-only.
Model yang belum punya unit tampil di bagian "Belum ada unit", bukan sebagai
stok siap beli. Tidak ada IMEI karangan.

## Hasil Verifikasi

| Merek | Model aktif | Target | Status |
|---|---:|---:|---|
| Apple | 5 | 5 | Terpenuhi |
| Samsung | 5 | 5 | Terpenuhi |
| Xiaomi | 5 | 5 | Terpenuhi |
| Oppo | 5 | 5 | Terpenuhi |
| Vivo | 5 | 5 | Terpenuhi |
| **Total** | **25** | **25** | **Terpenuhi** |

Produk nonaktif `Xiaomi iphone 16` tetap disembunyikan. Brand dan modelnya
bertentangan, dan migrasi `20261001120000_hide_unidentified_product_6` sengaja
menonaktifkannya. Jangan aktifkan kembali.

## Daftar Model

Harga di bawah adalah harga acuan `default_price`, bukan harga jual unit yang
terakhir. Harga jual unit second ditentukan saat unit masuk.

### Apple

| Model | Spesifikasi | Harga acuan | Unit tersedia | Foto |
|---|---|---:|---:|---|
| iPhone 13 128GB | 6.1 inci Super Retina XDR, A15 Bionic, kamera ganda 12MP | Rp 8.999.000 | 0 | Resmi |
| iPhone 14 Plus | Unit second dari tukar tambah, IMEI asli, garansi toko | Rp 0 | 1 second | Placeholder |
| iPhone 15 128GB | 6.1 inci Super Retina XDR, A16 Bionic, kamera 48MP, USB-C | Rp 12.999.000 | 0 | Foto menyusul |
| iPhone 15 Pro 128GB | Titanium Blue, OLED 6.1 inci, A17 Pro, kamera 48MP, USB-C 3.0 | Rp 18.499.000 | 0 | Resmi |
| iPhone 16 128GB | 6.1 inci Super Retina XDR, A18, Camera Control, kamera 48MP | Rp 14.999.000 | 0 | Foto menyusul |

### Samsung

| Model | Spesifikasi | Harga acuan | Unit tersedia | Foto |
|---|---|---:|---:|---|
| Galaxy A35 5G 8/256GB | 6.6 inci Super AMOLED 120Hz, Exynos 1380, kamera 50MP OIS | Rp 4.499.000 | 0 | Foto menyusul |
| Galaxy A55 5G 8/256GB | 6.6 inci Super AMOLED 120Hz, Exynos 1480, kamera 50MP OIS, 5000mAh | Rp 5.999.000 | 2 | Resmi |
| Galaxy S24 8/256GB | 6.2 inci Dynamic AMOLED 2X 120Hz, Exynos 2400, kamera 50MP | Rp 12.999.000 | 0 | Foto menyusul |
| Galaxy S24 Ultra 256GB | Titanium Gray, 6.8 inci 120Hz, Snapdragon 8 Gen 3, S-Pen | Rp 21.999.000 | 0 | Resmi |
| Galaxy Z Flip5 8/256GB | Layar lipat 6.7 inci 120Hz, Snapdragon 8 Gen 2, Flex Window | Rp 13.999.000 | 0 | Foto menyusul |

### Xiaomi

| Model | Spesifikasi | Harga acuan | Unit tersedia | Foto |
|---|---|---:|---:|---|
| Xiaomi 14 12/512GB | Jade Green, LTPO OLED 6.36 inci 120Hz, Leica, Snapdragon 8 Gen 3 | Rp 11.999.000 | 0 | Resmi |
| POCO X6 Pro 5G 12/512GB | 6.67 inci AMOLED 120Hz, Dimensity 8300 Ultra, kamera 64MP OIS | Rp 4.999.000 | 0 | Foto menyusul |
| Redmi Note 13 8/256GB | 6.67 inci AMOLED 120Hz, Snapdragon 685, kamera 108MP | Rp 2.799.000 | 2 | Resmi |
| Redmi Note 13 Pro 5G 8/256GB | 6.67 inci AMOLED 120Hz, Snapdragon 7s Gen 2, kamera 200MP OIS | Rp 4.299.000 | 0 | Foto menyusul |
| Xiaomi 14T 12/256GB | 6.67 inci AMOLED 144Hz, Dimensity 8300 Ultra, kamera Leica 50MP | Rp 7.499.000 | 0 | Foto menyusul |

### Oppo

| Model | Spesifikasi | Harga acuan | Unit tersedia | Foto |
|---|---|---:|---:|---|
| A79 5G 8/256GB | 6.72 inci LCD 90Hz, Dimensity 6020, kamera 50MP, 5000mAh | Rp 3.799.000 | 0 | Foto menyusul |
| Find X8 12/256GB | 6.59 inci AMOLED 120Hz, Dimensity 9400, Hasselblad 50MP | Rp 13.999.000 | 0 | Foto menyusul |
| Reno 11 5G 12/256GB | 6.7 inci AMOLED 120Hz, Dimensity 8200, kamera 50MP Sony LYT600 | Rp 6.999.000 | 1 second | Resmi |
| Reno 12 5G 12/256GB | 6.7 inci AMOLED 120Hz, Dimensity 7300, kamera 50MP, 80W | Rp 7.499.000 | 0 | Foto menyusul |
| Reno 12 Pro 5G 12/512GB | 6.7 inci AMOLED 120Hz, Dimensity 7300, kamera ganda 50MP | Rp 9.499.000 | 0 | Foto menyusul |

### Vivo

| Model | Spesifikasi | Harga acuan | Unit tersedia | Foto |
|---|---|---:|---:|---|
| V30 5G 8/256GB | Waving Aqua, AMOLED 6.78 inci 120Hz, Snapdragon 7 Gen 3 | Rp 5.999.000 | 0 | Resmi |
| V40 5G 12/256GB | 6.78 inci AMOLED 120Hz, Snapdragon 7 Gen 3, ZEISS 50MP | Rp 6.999.000 | 0 | Foto menyusul |
| X100 12/256GB | 6.78 inci AMOLED 120Hz, Dimensity 9300, ZEISS 50MP, 120W | Rp 11.999.000 | 0 | Foto menyusul |
| Y28 8/128GB | 6.68 inci LCD 90Hz, Dimensity 6020, kamera 50MP, 6000mAh | Rp 2.799.000 | 0 | Foto menyusul |
| Y36 8/256GB | 6.64 inci LCD 90Hz, Snapdragon 680, kamera 50MP, 44W | Rp 3.199.000 | 1 | Resmi |

## Aturan yang Dipegang

- Satu baris `products` adalah satu model, bukan satu unit fisik.
- Model tanpa unit tetap tampil di katalog sebagai "Belum ada unit". Tombolnya
  hanya membuka WhatsApp untuk menanyakan ketersediaan, bukan tombol beli.
- Harga `default_price` adalah harga acuan. Harga jual unit baru ditentukan saat
  unit didaftarkan, dan harga unit second ditentukan saat masuk trade-in.
- IMEI hanya untuk unit fisik asli. Empat unit demo berstatus `sold` memakai
  `imei = NULL` dan `is_demo = true`.
- Unit dan transaksi demo tidak muncul di etalase publik, dashboard, atau
  laporan penjualan. Transaksi demo tetap terlihat di riwayat pelanggan demo.
- Lima belas model baru memakai label "Foto menyusul" sampai foto resmi
  tersedia. Jangan memakai render atau foto perangkat lain hanya agar katalog
  terlihat lengkap.

Audit foto historis ada di `../PERLUASAN-KATALOG-AT-CELL.md` bagian 6. Dokumen
itu menjelaskan mengapa beberapa file di `public/products/` tidak boleh dipakai:
namanya tidak cocok dengan perangkat yang ditampilkan.

## Verifikasi SQL

Jumlah model aktif per merek:

```sql
select brand, count(*) as model_aktif
from public.products
where is_active
group by brand
order by brand;
```

Hasil production: Apple 5, Oppo 5, Samsung 5, Vivo 5, Xiaomi 5.

Kondisi unit:

```sql
select is_demo, (imei is null) as imei_null, status, count(*) as units
from public.inventory_units
group by is_demo, (imei is null), status
order by is_demo, imei_null, status;
```

Hasil production:

| is_demo | IMEI NULL | Status | Jumlah |
|---|---|---|---:|
| false | tidak | available | 7 |
| false | tidak | sold | 2 |
| false | tidak | in_service | 1 |
| true | ya | sold | 4 |

Riwayat pelanggan demo:

```sql
select p.username, count(t.id) as total_transaksi,
       count(t.id) filter (where t.is_demo) as transaksi_demo
from public.profiles p
left join public.transactions t on t.customer_id = p.id
where p.username in ('ega', 'febiyanto', 'hilmi')
group by p.username
order by p.username;
```

Hasil production: `ega` 2 transaksi, `febiyanto` 1 transaksi, `hilmi` 1
transaksi. Semuanya bertanda `is_demo = true`.

## Sisa Pekerjaan

1. Kode yang ada di working tree belum di-commit, di-push, atau di-deploy.
   Production masih menjalankan image lama, jadi perubahan akun pelanggan dan
   filter demo belum live.
2. Ganti label "Foto menyusul" dengan foto resmi saat owner memberikannya.
   Tidak perlu menunggu foto untuk mempertahankan 5 model per merek.
3. Tambah unit asli dan IMEI hanya jika owner menyerahkan perangkat fisiknya.
   Saat ini 7 unit asli tersedia dan belum menutup semua model.
4. Jangan menambah unit atau IMEI karangan untuk membuat model yang belum punya
   stok terlihat bisa dibeli.
