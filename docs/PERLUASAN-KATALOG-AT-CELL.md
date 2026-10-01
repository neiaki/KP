# Perluasan Katalog At Cell: Usulan Lima Model

Laporan untuk pemilik toko dan staf. Berkas ini menjelaskan lima berkas migrasi
yang sudah disiapkan di `supabase/migrations/`. **Belum ada satu pun yang
dijalankan.** Terapkan hanya setelah bagian harga di bawah dipahami dan
disetujui.

Ringkas satu kalimat: yang bertambah adalah **empat model katalog tanpa stok
dan satu unit trade-in**. Dari lima model itu, hanya satu yang benar-benar bisa
dibeli pelanggan.

---

## 1. Aturan keras yang mengatur pekerjaan ini

Pemilik toko menolak permintaan membuat unit inventaris dan IMEI. Alasannya
sederhana: satu IMEI 15 digit adalah identitas satu perangkat keras nyata yang
tertempel di cip di dalam handset. Kalau angka IMEI dikarang, situs publik
mengiklankan perangkat keras yang tidak ada di rak toko. Pembeli yang datang
karena iklannya akan menemukan rak kosong, dan itu kerugian nyata.

Jadi dalam lima berkas migrasi ini:

- **Tidak ada satu pun `INSERT` ke `inventory_units`.**
- **Tidak ada satu pun IMEI yang diketik.**
- Satu-satunya tulisan ke `inventory_units` adalah `product_id` pada unit id 9,
  dan unit 9 itu milik toko dengan IMEI asli.
- Kalau nanti butuh unit baru, unit itu didaftarkan lewat portal inventaris
  pada saat handset fisiknya benar-benar ada di konter, dengan IMEI yang dibaca
  dari perangkatnya.

## 2. Kenapa hanya lima model, bukan lima per merek

Rencana awal menambah lima model per merek, jadi 25 model. Rencana itu tidak
bisa dipenuhi dengan jujur. Syaratnya: **jangan usulkan model yang tidak punya
foto**, karena foto itulah yang dilihat pembeli, dan foto tidak boleh dipinjam
dari model lain.

Setelah semua foto di `public/products/` diperiksa satu per satu, model yang
punya foto jujur dan belum ada di katalog tinggal lima. Toko butuh sekitar 20
foto produk lagi untuk mencapai rencana 5 per merek. Mempercepat itu berarti
memotret unitnya, bukan menambah baris database.

| Merek | Direncanakan | Yang bisa jujur ditambahkan | Alasan kekurangan |
|---|---|---|---|
| Apple | 5 | **2** | Foto iPhone 13 sudah dipakai produk yang ada. Dari lima file iPhone 15 Pro, hanya satu yang benar-benar foto perangkat. iPhone 14 Plus tidak punya foto sama sekali |
| Samsung | 5 | **1** | Galaxy A55 sudah ada. Dari lima file S24 Ultra, hanya satu yang benar-benar S24 Ultra |
| Xiaomi | 5 | **1** | Redmi Note 13 sudah ada. Tiga foto Xiaomi 14, semuanya satu model |
| Oppo | 5 | **0** | Oppo Reno 11 sudah ada dan itu satu-satunya model Oppo yang punya foto |
| Vivo | 5 | **1** | Vivo Y36 sudah ada. Foto V30 ada satu, dan banner promosi tidak dipakai |

**Oppo tidak bertambah apa pun.** Tidak ada foto Oppo selain foto Reno 11, dan
foto-foto itu sudah menempel pada produk yang ada. Menambah model Oppo tanpa
foto berarti memakai foto perangkat lain, dan itu tidak dilakukan.

## 3. Daftar model yang diusulkan

Beda dua jenis kartu di etalase, dan ini penting untuk dibaca staf:

- **Kartu siap beli.** Produk punya unit berstatus available. Kartu menunjukkan
  harga jual unit, IMEI empat digit terakhir, dan tombol WhatsApp.
- **Kartu model tanpa unit.** Produk ada di katalog tapi belum punya satu pun
  unit. Kartu ini muncul di bagian "Baru masuk katalog" dengan lencana
  **"Belum ada unit"**, lalu teks "Model ini sudah masuk katalog, tapi belum
  ada satu pun unitnya di toko, jadi belum bisa dibeli", lalu
  **"Perkiraan harga saat unitnya masuk"** followed by the price, lalu tombol
  **"Minta dikabari"**. Kata "habis" sengaja tidak dipakai, karena model ini
  belum pernah punya unit, bukan turun dari rak.

### Apple

**iPhone 15 Pro 128GB** — perkiraan Rp18.499.000
- Sumber harga: `src/lib/mock-data.ts:79` (`default_price: 18499000`)
- Sumber spesifikasi: `src/lib/mock-data.ts:78`
- Foto: `iphone-15-pro-1.jpg` (satu, lihat bagian 6)
- Unit: **tidak ada. Kartu siap beli: tidak. Tampil sebagai "Belum ada unit".**

**iPhone 14 Plus** — kartu siap beli, Rp5.000.000, kondisi second
- Sumber nama: `trade_in_records.original_brand_model` unit id 9
- Sumber harga jual: `selling_price` unit id 9, sudah ada sebelumnya, **tidak diubah**
- Foto: tidak ada. Pakai `placeholder.svg` yang bertuliskan "Belum ada foto"
- Unit: **satu, unit id 9. Kartu siap beli: ya. Satu-satunya di antara lima model ini.**
- `default_price` sengaja diisi **0**, bukan dikarang. Toko tidak menjual
  iPhone 14 Plus baru, jadi tidak ada harga baru yang jujur untuk ditulis.
  Angka 0 itu tidak tampil sebagai harga apa pun: kartu unit second memakai
  `default_price` sebagai label "Barunya" yang dicoret, dan label itu hanya
  dibuat kalau angkanya angka positif yang masuk akal. Jadi kartu iPhone 14
  Plus tampil tanpa coretan "Barunya" sama sekali, bukan
  "Barunya Rp0" di sebelah Rp5.000.000. Aturan yang sama berlaku untuk kartu
  model tanpa unit, dan dua jalur itu sekarang memakai satu fungsi yang sama.
- Perlu diketahui staf: form master produk di portal menolak menyimpan
  `default_price` nol atau negatif. Begitu produk ini dibuka untuk diedit,
  form akan minta harga acuan diisi lebih dulu. Jadi begitu owner memutuskan
  harga unit barunya, isikan lewat form itu dan aturannya langsung berlaku.

### Samsung

**Galaxy S24 Ultra 256GB** — perkiraan Rp21.999.000
- Sumber harga: `src/lib/mock-data.ts:123` (`default_price: 21999000`)
- Sumber spesifikasi: `src/lib/mock-data.ts:122`
- Foto: `s24-ultra-1.jpg` (satu)
- Unit: **tidak ada. Kartu siap beli: tidak. Tampil sebagai "Belum ada unit".**

### Xiaomi

**14 12/512GB** — perkiraan Rp11.999.000
- Sumber harga: `src/lib/mock-data.ts:169` (`default_price: 11999000`)
- Sumber spesifikasi: `src/lib/mock-data.ts:168`
- Kapasitas ikut diambil dari `src/lib/mock-data.ts:167`, jadi nama dan harga
  berasal dari satu keputusan yang sama
- Foto: `xiaomi-14-1.jpeg`, `xiaomi-14-3.jpg`, `xiaomi-14-5.jpg` (tiga bingkai berbeda)
- Unit: **tidak ada. Kartu siap beli: tidak. Tampil sebagai "Belum ada unit".**

### Vivo

**V30 5G 8/256GB** — perkiraan Rp5.999.000
- Sumber harga: `src/lib/mock-data.ts:208` (`default_price: 5999000`)
- Sumber spesifikasi: `src/lib/mock-data.ts:207`
- Foto: `vivo-v30-2.jpg` (satu)
- Unit: **tidak ada. Kartu siap beli: tidak. Tampil sebagai "Belum ada unit".**

### Oppo

Tidak ada berkas migrasi. Tidak ada foto Oppo yang belum dipakai.

## 4. Harga yang WAJIB dikonfirmasi owner sebelum migrasi dijalankan

Semua angka di atas disalin dari `src/lib/mock-data.ts`, yaitu mode seed
aplikasi, **bukan** hasil negosiasi dengan supplier. Angka itu tampil publik
sebagai "Perkiraan harga saat unitnya masuk", jadi kesalahan di sini langsung
terlihat pembeli.

| Model | Angka di migrasi | Sumber | Status |
|---|---|---|---|
| iPhone 15 Pro 128GB | 18499000 | `mock-data.ts:79` | **PERLU KONFIRMASI** |
| Galaxy S24 Ultra 256GB | 21999000 | `mock-data.ts:123` | **PERLU KONFIRMASI** |
| Xiaomi 14 12/512GB | 11999000 | `mock-data.ts:169` | **PERLU KONFIRMASI** |
| Vivo V30 5G 8/256GB | 5999000 | `mock-data.ts:208` | **PERLU KONFIRMASI** |
| iPhone 14 Plus | `default_price` 0 | bukan data, keputusan sadar | Tidak perlu konfirmasi harga; perlu konfirmasi **kapasitas** |

Empat harga pertama **PERLU KONFIRMASI**. Tidak ada satu pun harga di sini yang
sudah dikonfirmasi ke supplier, dan tidak ada harga yang dikarang.

Untuk iPhone 14 Plus, yang perlu dikonfirmasi justru **kapasitas
penyimpanannya**. Data tukar tambah tidak mencatat kapasitas, dan nama produknya
sengaja ditulis polos tanpa "128GB" supaya etalase tidak menyebut spesifikasi
yang belum dikonfirmasi siapa pun. Kolom specs-nya juga menyatakan terus terang
bahwa kapasitasnya belum tercatat. Setelah unitnya dibaca, kapasitasnya bisa
ditambahkan lewat portal produk.

Untuk keempat model tanpa unit, harga di `mock-data.ts` adalah harga saat mode
seed dibuat. Kalau harga pasar sekarang berbeda, ubah angkanya di berkas
migrasi dan jalankan ulang berkasnya, karena migrasi ini idempoten. Kalau sudah
dijalankan, ubah lewat portal produk.

## 5. Apa yang berubah dan tidak berubah bagi pelanggan

**Yang berubah:**

1. Katalog bertambah empat kartu baru berlabel "Belum ada unit" dengan tombol
   "Minta dikabari" ke WhatsApp, di bagian "Baru masuk katalog" pada beranda dan
   katalog. Tombolnya cuma membuka chat, isinya permintaan diberi tahu, bukan
   pesan beli.
2. Katalog bertambah **satu kartu Apple yang benar-benar bisa dibeli**:
   iPhone 14 Plus, kondisi second, Rp5.000.000, IMEI berakhiran 3203.
3. Filter merek di katalog punya isi baru untuk Apple, Samsung, Xiaomi, dan Vivo.

**Yang tidak berubah:**

1. **Tidak ada stok baru yang terjual.** Empat dari lima model tidak punya satu
   pun unit. Pelanggan tidak bisa membeli iPhone 15 Pro, Galaxy S24 Ultra,
   Xiaomi 14, atau Vivo V30 setelah migrasi ini; dia hanya bisa menekan tombol
   "Minta dikabari".
2. **Tidak ada IMEI baru.** Jumlah unit di database tetap sama. Yang berubah
   hanya kolom `product_id` satu unit yang sudah ada.
3. Harga jual, harga beli, condition, dan status unit id 9 tidak berubah.
4. Produk Xiaomi `iphone 16` yang rusak tidak disentuh. Perbaikannya keputusan
   staf setelah unitnya dilihat, dan tercatat di
   `20260927201000_clear_unparseable_product_image_url.sql`.

## 6. Foto: mana yang dipakai dan mana yang dibuang

Semua foto di `public/products/` yang relevan untuk lima model ini sudah dibuka
dan dilihat langsung, bukan dibaca dari nama filenya.

**Dipakai**

- `iphone-15-pro-1.jpg` — foto keluarga iPhone 15 Pro di atas latar putih
- `s24-ultra-1.jpg` — bodi titanium dengan S Pen
- `xiaomi-14-1.jpeg`, `xiaomi-14-3.jpg`, `xiaomi-14-5.jpg` — tiga bingkai berbeda, semuanya jade green
- `vivo-v30-2.jpg` — dua unit aqua di atas kain dan buku

**Tidak dipakai, dan alasannya**

- `iphone-15-pro-2.jpg` — Galaxy Note dengan S Pen, bukan iPhone
- `iphone-15-pro-3.jpg` — MacBook dan iPhone di atas meja, bukan foto produk
- `iphone-15-pro-4.jpg` — orang berenang di kolam, tidak ada telepon
- `iphone-15-pro-5.jpg` — orang di malam hari, tidak ada telepon
- `s24-ultra-2.jpg` — lifestyle shot Galaxy Note
- `s24-ultra-4.jpg` — Galaxy Note di tangan memakai aplikasi kamera. Fine print
  di sudut gambarnya menulis "S24 Ultra's rear camera rendering", jadi teksnya
  menyesatkan; peralatannya bukan S24 Ultra
- `s24-ultra-5.jpg` — lifestyle shot Galaxy Note
- `s24-ultra-3.jpg` — bingkai yang sama dengan `s24-ultra-1.jpg`, hanya sedikit
  lebih rapat. Memakainya berdua membuat tombol foto berikutnya mengulang foto
  yang sama, persis masalah yang sudah dibetulkan di
  `20260927202000_trim_crop_duplicate_a55_photos.sql`
- `vivo-v30-1.jpg` — banner promosi bergambar; fine print-nya menyebut V30 Pro,
  sedangkan produk ini V30
- `placeholder.svg` — dipakai hanya untuk iPhone 14 Plus yang memang tidak
  punya foto. Gambarnya netral dan bertuliskan "Belum ada foto", jadi tidak
  pernah mengklaim perangkat yang tidak ada

Galeri produk yang hanya punya satu foto sengaja tidak diisi asal. Tombol foto
berikutnya yang memutar-putar dua bingkai nyaris sama terbaca sebagai galeri
rusak, dan itu sudah pernah dicek pada kasus Galaxy A55.

## 7. Cara menjalankan

Berkas yang dibuat, semuanya di `supabase/migrations/`:

| Berkas | Isi |
|---|---|
| `20260930100000_catalogue_apple_iphone_15_pro.sql` | Apple iPhone 15 Pro 128GB, tanpa unit |
| `20260930101000_catalogue_samsung_galaxy_s24_ultra.sql` | Samsung Galaxy S24 Ultra 256GB, tanpa unit |
| `20260930102000_catalogue_xiaomi_14.sql` | Xiaomi 14 12/512GB, tanpa unit |
| `20260930103000_catalogue_vivo_v30.sql` | Vivo V30 5G 8/256GB, tanpa unit |
| `20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9.sql` | Apple iPhone 14 Plus, lalu tautkan unit id 9 |

Empat berkas pertama saling bebas, boleh dijalankan per merek. Berkas terakhir
boleh terpisah, tapi **jangan dijalankan sebelum unit 9 dicek fisik** di konter.

Semua lima berkas idempoten. Tabel `products` tidak punya batasan UNIQUE pada
`(brand, model_name)`, jadi tiap berkas memakai pola
`insert ... select ... where not exists` yang dikunci pada brand dan model_name,
dengan perbandingan `lower(btrim(...))` supaya perbedaan huruf besar-kecil dan
spasi di tepi tidak menghasilkan baris kembar. Dijalankan dua kali tidak
menghasilkan duplikat. Berkas terakhir memakai satu statement, jadi baris produk
dan penautan unit id 9 tidak bisa terpisah satu sama lain.

**Jangan pakai `supabase db push`.** Jalankan lewat SQL Editor Supabase atau
`psql`. Sesudah tiap berkas berhasil, catat di
`supabase_migrations.schema_migrations` memakai nama berkas tanpa ekstensi.

Status ledger: migrasi ini **belum** dicatat di mana pun dan ledger itu belum
disentuh. Mencatatnya tetap keputusan operator.

Setelah dijalankan, cek hasilnya:

```sql
select brand, model_name, condition, selling_price, imei_tail
  from public.v_public_inventory
 order by brand, model_name;

select p.brand, p.model_name, u.id as unit_id, u.condition, u.selling_price
  from public.inventory_units u
  join public.products p on p.id = u.product_id
 where u.id = 9;
```

Yang diharapkan: query pertama memuat satu baris baru
`Apple / iPhone 14 Plus / second / 5000000 / 3203`, dan **empat model lain tidak
muncul sama sekali** di `v_public_inventory` karena memang tidak punya unit.
Mereka hanya muncul di bagian "Baru masuk katalog".

## 8. Setelah migrasi diterapkan

1. Daftarkan foto produk baru di registry `product_images` lewat portal admin.
   Migrasi ini sengaja tidak menyentuh tabel itu.
2. Ganti `placeholder.svg` iPhone 14 Plus dengan foto unitnya begitu difotret.
3. Baca dan masukkan kapasitas penyimpanan iPhone 14 Plus ke nama produknya.
4. Setelah handsetnya difotret, daftarkan unitnya lewat portal inventaris dengan
   IMEI yang dibaca dari perangkat. Jangan membuat IMEI sendiri.
5. Foto produk yang ditolak di bagian 6 sebaiknya dihapus dari daftar aset kalau
   sudah tidak dipakai halaman mana pun, supaya tidak terpakai lagi tanpa
   diperiksa. Berkas gambarnya sendiri tidak dihapus migrasi ini.