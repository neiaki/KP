-- Masukkan Vivo V30 ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya satu produk Vivo ("Y36 8/256GB") dan
-- tidak punya jalur Vivo V30 sama sekali. Foto Vivo V30 sudah ada di
-- public/products/ dan sudah pernah dipakai sebagai official_images di
-- src/lib/mock-data.ts, tapi tidak ada baris products di database yang
-- merujuknya.
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
-- initialProducts id 7, baris 205 sampai 208. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga atau kapasitas,
-- ubah satu nilai di bawah dan jalankan ulang berkasnya, karena migrasi
-- ini idempoten.

-- =============================================================================
-- 1) Vivo V30 5G 8/256GB, tanpa unit
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
  'Vivo',
  'V30 5G 8/256GB',
  'Waving Aqua, AMOLED 6.78" 120Hz 3D Curved, Snapdragon 7 Gen 3, 50MP OIS Aura Light',
  5999000,
  '/products/vivo-v30-2.jpg',
  array['/products/vivo-v30-2.jpg']::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Vivo'
     and lower(btrim(p.model_name)) = lower(btrim('V30 5G 8/256GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 5999000 disalin dari src/lib/mock-data.ts:208. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Hanya vivo-v30-2.jpg yang dipakai, dan berkas itu sudah dibuka dan
--    dilihat langsung: dua unit Vivo warna aqua di atas kain dan buku,
--    satu menghadap depan dengan notch, satu menunjukkan belakang. Warna
--    pada specs ("Waving Aqua") cocok dengan isi foto.
--
-- 3. vivo-v30-1.jpg sengaja tidak dipakai. Berkasnya banner promosi
--    bergambar dengan teks cetak, dan fine print-nya menyebut V30 Pro,
--    sedangkan produk ini V30. src/lib/mock-data.ts:210 sudah mencatat
--    hal yang sama dan hanya memakai foto perangkat bersih.
--
-- 4. Foto yang paling rawan salah di brand ini adalah foto Vivo
--    Y36 (vivo-y36-1.jpg) yang sudah menempel di produk id 5. Audit
--    sebelumnya tidak berhasil memastikan modelnya dari foto depan saja, dan
--    berkas ini tidak mengubah apa pun pada baris itu. Kalau owner ingin
--    memastikan Y36, foto unit fisiknya harus diambil ulang, bukan dibaca
--    ulang dari gambar yang sekarang.
--
-- 5. Sebelum dijalankan, lihat baris Vivo yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'vivo'
--       order by id;
--
-- 6. Produk ini belum punya baris di registry product_images, jadi foto
--    resminya belum terdaftar di portal admin. Penambahannya lewat
--    portal, bukan lewat migrasi, karena tabel itu menyimpan daftar aset
--    dan path Storage-nya harus diisi lengkap.