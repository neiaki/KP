-- Masukkan Apple iPhone 15 Pro ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya satu produk Apple ("iPhone 13 128GB")
-- dan tidak punya jalur iPhone 15 Pro sama sekali. Toko sudah punya foto
-- produknya di public/products/, tapi tidak ada baris products yang
-- merujuk foto itu, jadi foto tersebut tidak pernah tampil di etalase.
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
-- initialProducts id 1, baris 77 sampai 79. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga atau warna,
-- ubah satu nilai di bawah dan jalankan ulang berkasnya, karena migrasi
-- ini idempoten.

-- =============================================================================
-- 1) Apple iPhone 15 Pro 128GB, tanpa unit
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
  'Apple',
  'iPhone 15 Pro 128GB',
  'Titanium Blue, Super Retina XDR OLED 6.1", A17 Pro Chip, 48MP Camera, USB-C 3.0',
  18499000,
  '/products/iphone-15-pro-1.jpg',
  array['/products/iphone-15-pro-1.jpg']::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Apple'
     and lower(btrim(p.model_name)) = lower(btrim('iPhone 15 Pro 128GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 18499000 disalin dari src/lib/mock-data.ts:79. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Satu-satunya foto iPhone 15 Pro yang dipakai di sini adalah
--    iphone-15-pro-1.jpg, dan berkas itu sudah dibuka dan dilihat
--    langsung: foto keluarga iPhone 15 Pro di atas latar putih, empat
--    bodi dan satu unit menghadap depan. Empat file lain di kelompok ini
--    sengaja tidak dipakai, dan alasannya isi gambarnya, bukan sekadar
--    preferensi:
--      - iphone-15-pro-2.jpg  Galaxy Note dengan S Pen, bukan iPhone.
--      - iphone-15-pro-3.jpg  MacBook dan iPhone di atas meja, bukan foto produk.
--      - iphone-15-pro-4.jpg  orang berenang di kolam, tidak ada telepon.
--      - iphone-15-pro-5.jpg  orang di malam hari, tidak ada telepon.
--    src/lib/mock-data.ts baris 81 dan 82 sudah menandai 3, 4, dan 5
--    sebagai sampel kamera, MacBook, dan perenang. Kalau salah satunya
--    kelak ditambahkan ke galeri, isi gambarnya dicek ulang lebih dulu.
--
-- 3. Karena hanya ada satu foto yang jujur, official_images-nya satu
--    elemen dan kartu produknya tidak punya tombol foto berikutnya.
--    Jangan menambah iphone-15-pro-3 atau -4 hanya supaya galerinya
--    terlihat lengkap: galeri yang berpindah antara potongan dan lifestyle
--    shot terbaca sebagai galeri rusak, dan itu yang sudah dibetulkan di
--    20260927202000_trim_crop_duplicate_a55_photos.sql.
--
-- 4. Sebelum dijalankan, lihat baris Apple yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'apple'
--       order by id;
--
-- 5. Produk ini belum punya baris di registry product_images, jadi foto
--    resminya belum terdaftar di portal admin. Penambahannya lewat
--    portal, bukan lewat migrasi, karena tabel itu menyimpan daftar aset
--    dan path Storage-nya harus diisi lengkap.