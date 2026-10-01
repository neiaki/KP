-- Masukkan Xiaomi 14 ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya "Redmi Note 13 8/256GB" sebagai satu-
-- satunya produk Xiaomi yang tercatat, dan ada satu baris lain
-- brand Xiaomi yang rusak (products id 6, model_name "iphone 16", specs
-- kosong, image_url berisi string "undefined/storage/..."). Baris rusak itu
-- BUKAN disentuh di sini: merek dan modelnya harus diputuskan staf setelah
-- unit fisiknya dilihat, dan keputusannya tercatat di
-- 20260927201000_clear_unparseable_product_image_url.sql.
--
-- Toko sudah punya tiga foto Xiaomi 14 di public/products/ dan ketiganya
-- sudah pernah dipakai sebagai official_images di src/lib/mock-data.ts,
-- tapi tidak ada baris products di database yang merujuknya.
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
-- initialProducts id 5, baris 166 sampai 169. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga, kapasitas, atau
-- warna, ubah satu nilai di bawah dan jalankan ulang berkasnya, karena
-- migrasi ini idempoten.

-- =============================================================================
-- 1) Xiaomi 14 12/512GB, tanpa unit
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
  'Xiaomi',
  '14 12/512GB',
  'Jade Green, LTPO OLED 6.36" 120Hz, Leica Summilux Lens, Snapdragon 8 Gen 3',
  11999000,
  '/products/xiaomi-14-1.jpeg',
  array[
    '/products/xiaomi-14-1.jpeg',
    '/products/xiaomi-14-3.jpg',
    '/products/xiaomi-14-5.jpg'
  ]::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Xiaomi'
     and lower(btrim(p.model_name)) = lower(btrim('14 12/512GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 11999000 disalin dari src/lib/mock-data.ts:169. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Kapasitas 12/512GB ikut diambil dari nama model di
--    src/lib/mock-data.ts:167, jadi nama produk dan harganya berasal dari
--    satu keputusan yang sama. Kalau stok yang akan datang hanya 12/256GB
--    atau 8/256GB, ubah model_name DAN price-nya, karena keduanya
--    tertulis di kartu publik.
--
-- 3. Ketiga foto sudah dibuka dan dilihat satu per satu. Semuanya memang
--    Xiaomi 14 warna Jade Green, dan ketiganya bingkai yang berbeda, bukan
--    potongan satu sama lain:
--      - xiaomi-14-1.jpeg  badan depan dan belakang di atas latar putih.
--      - xiaomi-14-3.jpg  potongan rapat badan belakang dan layar.
--      - xiaomi-14-5.jpg  unit dipegang tangan, latar gelap.
--    Warna pada specs ("Jade Green") cocok dengan isi ketiga foto.
--
-- 4. Perhatikan juga file products id 6 yang sudah ada: brand Xiaomi tapi
--    model_name "iphone 16". Berkas ini tidak menyentuhnya. Kalau nanti
--    owner memutuskan baris itu sebenarnya Xiaomi, jalankan
--    updateProduct(id, {...}) dari portal sesuai catatan di
--    20260927201000_clear_unparseable_product_image_url.sql.
--
-- 5. Sebelum dijalankan, lihat baris Xiaomi yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'xiaomi'
--       order by id;
--
-- 6. Produk ini belum punya baris di registry product_images, jadi ketiga
--    fotonya belum terdaftar di portal admin. Penambahannya lewat portal,
--    bukan lewat migrasi, karena tabel itu menyimpan daftar aset dan path
--    Storage-nya harus diisi lengkap.