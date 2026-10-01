-- Masukkan Samsung Galaxy S24 Ultra ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya satu produk Samsung ("Galaxy A55 5G
-- 8/256GB"). Foto Galaxy S24 Ultra sudah lengkap di public/products/
-- dan sudah ikut terunggah ke bucket product-images, tapi tidak ada baris
-- products yang memakainya, jadi flagship Samsung tidak pernah tampil di
-- etalase.
--
-- Yang TIDAK boleh terjadi di berkas ini: membuat baris inventory_units.
-- Unit adalah satu handset fisik dengan satu IMEI asli yang tertempel di
-- cip di dalamnya. IMEI tidak bisa dibuat, dan baris unit yang dikarang
-- berarti situs mengiklankan perangkat keras yang tidak ada di rak toko.
-- Karena itu berkas ini hanya menambah baris products tanpa unit sama
-- sekali. Baris tanpa unit dirender sebagai kartu "Stok Habis" plus tombol
-- kabari lewat WhatsApp, bukan sebagai stok yang bisa dibeli. Alasan
-- pemisahan etalase unit dan katalog ada di
-- 20260927180000_nullable_inventory_unit_product.sql.
--
-- Idempoten: products tidak punya constraint UNIQUE pada (brand,
-- model_name), jadi pola `insert ... select ... where not exists` dipakai
-- di sini, dikunci pada brand dan model_name. Pencocokan model_name
-- memakai lower(btrim(...)) supaya perbedaan huruf besar-kecil dan spasi
-- di tepi tidak menghasilkan baris kembar. Dijalankan kedua kali tidak
-- ada baris yang cocok, jadi tidak ada duplikat.
--
-- Foto dirujuk lewat path lokal /products/..., bukan URL absolut Supabase
-- Storage. next.config.ts sengaja tidak mengeraskan host Storage supaya
-- host project tidak bocor ke dalam database, dan berkas gambarnya sudah
-- ada di public/ sehingga bisa dilayani same-origin tanpa environment
-- apa pun.
--
-- Harga dan spesifikasi disalin apa adanya dari src/lib/mock-data.ts,
-- initialProducts id 3, baris 121 sampai 123. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga atau warna,
-- ubah satu nilai di bawah dan jalankan ulang berkasnya, karena migrasi
-- ini idempoten.

-- =============================================================================
-- 1) Samsung Galaxy S24 Ultra 256GB, tanpa unit
-- =============================================================================
insert into public.products (
  brand,
  model_name,
  specs,
  default_price,
  image_url,
  official_images,
  is_active
)
select
  'Samsung',
  'Galaxy S24 Ultra 256GB',
  'Titanium Gray, Dynamic AMOLED 2X 6.8" 120Hz, Snapdragon 8 Gen 3, S-Pen',
  21999000,
  '/products/s24-ultra-1.jpg',
  array['/products/s24-ultra-1.jpg']::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Samsung'
     and lower(btrim(p.model_name)) = lower(btrim('Galaxy S24 Ultra 256GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 21999000 disalin dari src/lib/mock-data.ts:123. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Hanya s24-ultra-1.jpg yang dipakai, dan berkas itu sudah dibuka dan
--    dilihat langsung: bodi titanium dengan S Pen di sisi kanan, satu
--    bodi ungu dan satu bodi kuning di belakang. Empat file lain di
--    kelompok ini sengaja tidak dipakai:
--      - s24-ultra-2.jpg  lifestyle shot Galaxy Note dengan S Pen.
--      - s24-ultra-3.jpg  bingkai yang sama dengan s24-ultra-1.jpg, hanya
--                         sedikit lebih rapat. Memakainya berdua membuat
--                         tombol foto berikutnya mengulang foto yang sama.
--      - s24-ultra-4.jpg  Galaxy Note di tangan yang sedang memakai
--                         aplikasi kamera. Fine print di sudut gambarnya
--                         menulis "S24 Ultra's rear camera rendering",
--                         jadi teksnya menyesatkan; peralatannya Note.
--      - s24-ultra-5.jpg  lifestyle shot Galaxy Note dengan S Pen.
--    Catatan s24-ultra-4.jpg sudah tercatat sebagai belum dinilai di
--    20260927202000_trim_crop_duplicate_a55_photos.sql. Berkas ini yang
--    memutuskan, dan keputusannya tidak memakainya.
--
-- 3. Karena hanya ada satu foto yang jujur, official_images-nya satu
--    elemen dan kartu produknya tidak punya tombol foto berikutnya.
--    Itu lebih baik daripada galeri yang berpindah antara potongan yang
--    nyaris sama dan lifestyle shot perangkat lain. Pola galeri rusak itu
--    sudah dibetulkan di 20260927202000_trim_crop_duplicate_a55_photos.sql.
--
-- 4. Sebelum dijalankan, lihat baris Samsung yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'samsung'
--       order by id;
--
-- 5. Spesifikasi menyebut S-Pen dan "Titanium Gray". Foto s24-ultra-1.jpg
--    memang menampilkan S Pen, dan bodi abu-abu metalik ada di bingkai
--    depan. Kalau stok yang akan datang bukan warna itu, koreksi kolom
--    specs-nya, jangan hanya warnanya di foto.
--
-- 6. Produk ini belum punya baris di registry product_images, jadi foto
--    resminya belum terdaftar di portal admin. Penambahannya lewat
--    portal, bukan lewat migrasi, karena tabel itu menyimpan daftar aset
--    dan path Storage-nya harus diisi lengkap.