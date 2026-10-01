-- Sembunyikan produk yang identitasnya belum yakin dari etalase publik.
--
-- Yang dimaksud: products id 6, brand 'Xiaomi' dengan model_name 'iphone 16'.
--
-- Latar. Baris itu berasal dari unit trade-in yang sedang servis.
-- Satu-satunya unitnya (inventory_units id 10) berstatus in_service, jadi tidak
-- muncul di v_public_inventory dan tidak pernah tampil sebagai stok yang bisa
-- dibeli. Masalahnya ada di katalog: brand dan model_name saling bertentangan,
-- dan keduanya tampil di etalase publik begitu produk itu masuk daftar "model
-- tanpa unit" maupun "stok habis".
--
-- Kenapa disembunyikan dan bukan diperbaiki di sini. Merek dan model adalah
-- keputusan merchandising yang hanya bisa dijawab orang yang melihat unit
-- fisiknya. Menebak "Xiaomi" jadi "Apple" atau sebaliknya berarti mengarang
-- identitas barang, dan itu kesalahan yang lebih sulit dibongkar daripada
-- ketidaktahuan yang jujur. Unit fisiknya sedang di konter, jadi staf sudah
-- bisa memeriksanya tanpa perlu perkiraan.
--
-- Yang TIDAK disentuh berkas ini:
--
--   - Unit id 10. Status in_service, IMEI, harga jual, dan product_id-nya
--     tetap apa adanya. Berkas ini hanya menyentuh kolom is_active.
--   - products id 7 sampai 11. Empat di antaranya sengaja tanpa unit dan
--     muncul sebagai kartu "Belum ada unit", dan satu lagi (iPhone 14 Plus
--     hasil tukar tambah) punya unit available yang tampil sebagai stok.
--   - Baris produk lain. Syaratnya id dan model_name, jadi baris lain tidak
--     ikut tersentuh walau ada produk tanpa unit.
--
-- Cara membatalkannya. products.is_active diaktifkan lagi dari portal: menu
-- Master Produk, tombol pada kartu produknya. Jalur itu requireRole admin dan
-- tercatat, jadi tidak perlu SQL. Setelah diaktifkan, kartu produknya kembali
-- muncul di etalase publik, dan di sinilah letak keputusannya: perbaiki brand
-- dan model_name lebih dulu kalau baris ini memang barang yang layak
-- dikatalogkan.
--
-- Catatan operasional. Begitu unit id 10 selesai diperbaiki dan statusnya
-- diubah ke available, produk ini harus diaktifkan lebih dulu. Kalau tidak,
-- unit itu tidak akan muncul di etalase karena v_public_inventory memfilter
-- p.is_active.
--
-- Idempoten: hanya baris yang is_active masih true yang diubah, jadi
-- dijalankan kedua kali tidak ada baris yang cocok.

-- =============================================================================
-- 1) Nonaktifkan produk yang identitasnya belum dipastikan
-- =============================================================================
update public.products p
   set is_active = false
 where p.id = 6
   and p.is_active
   and p.brand = 'Xiaomi'
   and lower(btrim(p.model_name)) = 'iphone 16';
