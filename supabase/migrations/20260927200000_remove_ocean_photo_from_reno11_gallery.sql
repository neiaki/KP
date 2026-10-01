-- Lepaskan foto laut dari galeri resmi Oppo Reno 11.
--
-- Latar: audit visual menemukan oppo-reno11-2.jpg tercatat sebagai
-- official_images produk "Oppo Reno 11 5G 12/256GB" (products id 4), pada
-- posisi kedua dari empat. Isinya cuma horizon, air, dan langit. Tidak ada
-- telepon di dalam frame. Berkasnya 4320x4152, paling besar di antara foto
-- produk, dan ukuran itulah yang membuatnya lolos pemeriksaan kasar.
--
-- Produk ini aktif dan unitnya bisa dibeli, jadi pembeli yang menekan tombol
-- foto berikutnya pada kartunya melihat laut, bukan unit yang dijual.
--
-- Keputusan: hapus entry-nya, jangan ganti dengan oppo-reno11-4.jpg.
--
-- Alasannya tiga. Pertama, isi oppo-reno11-4.jpg belum dilihat oleh siapa pun
-- yang menulis migrasi ini, jadi menukarnya hanya memindahkan risiko ke nama
-- file lain. Kedua, setelah dihapus galerinya masih berisi tiga foto
-- perangkat, jadi kartu produk tidak kehilangan sampul. Ketiga, menambah
-- foto yang bagus adalah perubahan satu baris yang kecil dan reversibel,
-- sedangkan memuat foto yang salah mahal diperbaiki belakangan.
--
-- Berkas gambarnya sendiri tidak dihapus dari public/products/ maupun dari
-- bucket Storage product-images. Foto itu masih dirujuk src/app/global-not-found.tsx
-- sebagai foto halaman 404, jadi menghapusnya akan merusak halaman itu.
--
-- Idempoten: pernyataan di bawah hanya menyentuh baris yang masih memuat
-- nama file itu. Dijalankan kedua kali tidak ada baris yang cocok.
--
-- Pencocokan pakai sufiks nama file, bukan satu bentuk penulisan. Foto
-- produk bisa tersimpan sebagai path lokal "/products/oppo-reno11-2.jpg"
-- atau sebagai URL absolut dari Supabase Storage.

-- =============================================================================
-- 1) official_images: buang entri foto laut, sisa daftar tetap berurutan
-- =============================================================================
update public.products p
   set official_images = (
         select coalesce(array_agg(u.nama order by u.urutan), '{}'::text[])
           from unnest(p.official_images) with ordinality as u(nama, urutan)
          where u.nama not like '%products/oppo-reno11-2.jpg'
       )
 where exists (
         select 1
           from unnest(p.official_images) as u(nama)
          where u.nama like '%products/oppo-reno11-2.jpg'
       );

-- =============================================================================
-- 2) Registry: alt_text lama menyatakan foto itu unit Oppo Reno 11
-- =============================================================================
-- Alt teks ikut dirender jadi atribut alt, jadi klaim yang keluar ke pembaca
-- dan ke mesin pencari harus jujur walau gambarnya masih dipakai di tempat
-- lain. Barisnya tidak dihapus di sini: product_images adalah daftar aset,
-- penghapusannya keputusan staf admin, bukan efek samping migrasi.
update public.product_images
   set alt_text = 'Foto laut tanpa perangkat, tidak dipakai di etalase'
 where path like '%products/oppo-reno11-2.jpg'
   and alt_text is distinct from 'Foto laut tanpa perangkat, tidak dipakai di etalase';

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- Berkas ini memakai kesimpulan audit visual, bukan pembacaan metadata.
-- Tidak ada satu pun baris di sini yang bisa membuktikan isi gambarnya.
--
-- 1. Buka /products/oppo-reno11-2.jpg dan lihat sendiri pikselnya. Kalau
--    ternyata ada telepon di frame, migrasi ini salah dan jangan dijalankan.
--
-- 2. Lihat dulu baris yang akan tersentuh:
--
--      select id, brand, model_name, official_images
--        from public.products
--       where exists (
--               select 1 from unnest(official_images) as u(nama)
--                where u.nama like '%products/oppo-reno11-2.jpg'
--             );
--
--    Kalau yang muncul bukan Oppo Reno 11 yang dimaksud, jangan dijalankan.
--    Sufiks pencocokan sengaja longgar supaya tahan terhadap perbedaan path
--    lokal dan URL Storage, jadi hasilnya tetap perlu dilihat manusia.
--
-- 3. Setelah dijalankan, buka kartu produknya di beranda dan katalog, lalu
--    tekan tombol foto berikutnya sampai habis. Sisa fotonya harus perangkat.
--
-- Setara lewat aplikasi: updateProduct(id, { official_images: [...] }) di
-- src/lib/actions/products.ts. Jalur itu requireRole(["admin"]), divalidasi
-- productUpdateSchema, dan merevalidasi /portal/products serta /id layout.
-- Pakai jalur itu untuk pengeditan rutin, dan migrasi ini untuk perubahan
-- yang perlu jejjak yang bisa diaudit ulang.