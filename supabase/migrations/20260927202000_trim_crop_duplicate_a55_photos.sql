-- Pangkas foto galeri Galaxy A55 yang saling potongan.
--
-- Latar: audit visual mengukur kemiripan antara foto resmi Galaxy A55 5G.
-- Hasilnya: a55-3.jpg potongan rapat dari a55-1.jpg, a55-4.jpg potongan dari
-- a55-2.jpg, dan a55-5.jpg nyaris sama dengan a55-3.jpg. Jadi lima
-- official photos itu sebenarnya hanya dua render berbeda.
--
-- Dampaknya ke pembeli nyata. Tombol foto berikutnya pada kartu A55
-- menampilkan iceblue, pink, iceblue, pink, iceblue, dan pengulangan itu
-- terbaca sebagai galeri foto yang rusak, bukan sebagai lima angle produk.
--
-- Yang dipangkas hanya foto yang terbukti potongan. Dua render aslinya
-- a55-1.jpg dan a55-2.jpg tetap di tempat, jadi kartu produknya masih punya
-- sampul dan masih punya tombol foto berikutnya yang berguna. src/lib/mock-data.ts
-- sudah disinkronkan dengan hasil ini.
--
-- Berkas gambar tidak dihapus dari public/products/ maupun dari bucket
-- Storage. Pemotret atau staf mungkin masih memakainya untuk keperluan lain.
--
-- Idempoten: hanya baris yang masih memuat salah satu dari tiga nama file itu
-- yang tersentuh, dan sisa daftar tidak diubah urutannya.

-- =============================================================================
-- 1) official_images Galaxy A55: buang tiga potongan
-- =============================================================================
update public.products p
   set official_images = (
         select coalesce(array_agg(u.nama order by u.urutan), '{}'::text[])
           from unnest(p.official_images) with ordinality as u(nama, urutan)
          where u.nama not like '%products/a55-3.jpg'
            and u.nama not like '%products/a55-4.jpg'
            and u.nama not like '%products/a55-5.jpg'
       )
 where exists (
         select 1
           from unnest(p.official_images) as u(nama)
          where u.nama like '%products/a55-3.jpg'
             or u.nama like '%products/a55-4.jpg'
             or u.nama like '%products/a55-5.jpg'
       )
   and exists (
         select 1
           from unnest(p.official_images) as u(nama)
          where u.nama like '%products/a55-1.jpg'
             or u.nama like '%products/a55-2.jpg'
       );

-- =============================================================================
-- YANG TIDAK BOLEH DIJALANKAN OTOMATIS
-- =============================================================================
-- Tiga hal lain ditemukan audit yang sama dan sengaja tidak ditangani di sini.
--
-- 1. Galaxy S24 Ultra punya pola yang sama. s24-ultra-2.jpg dan
--    s24-ultra-5.jpg nyaris identik satu sama lain, dan keduanya juga nyaris
--    identik dengan iphone-15-pro-2.jpg, yaitu foto Galaxy Note yang dipakai
--    di halaman tentang. s24-ultra-1.jpg dan s24-ultra-3.jpg juga nyaris
--    identik, dan s24-ultra-4.jpg ternyata juga perangkat Galaxy Note,
--    bukan S24 Ultra seperti nama filenya. Jadi lima foto S24 Ultra cuma satu
--    asli. Pemangkasannya keputusan staf, karena audit tidak mengukur
--    seluruh pasangan file itu.
--
-- 2. oppo-reno11-1.png hanya 427x601 piksel, sedangkan lebar foto produk lain
--    di repo ini sekitar 1000 piksel atau lebih. File itu adalah sampul utama
--    produk yang aktif, jadi next/image menaikkan ukurannya ke kartu 4:3 dan
--    hasilnya terlihat lembek.
--
--    Perbaikannya BUKAN meng-upscale berkas itu dan BUKAN mengunduh ulang
--    render promosi. Meningkatkan resolusi butuh sumber yang lebih besar dari
--    orang yang memotret, dan gambar yang diunduh ulang bukan foto unit yang
--    toko jual. Berkas ini sengaja tidak disentuh: lebih baik sampul yang
--    lembut dan jujur daripada sampul tajam yang bukan produk ini.
--
-- 3. iphone-duo.jpg sudah tidak dipakai sebagai slide hero. Foto itu
--    menunjukkan dua iPhone slab tanpa engsel dan tanpa layar dalam, jadi
--    caption iPhone lipat pertama tidak cocok dengan gambarnya. Berkasnya
--    tetap ada karena src/app/global-not-found.tsx masih memakainya.
--
-- Untuk memeriksa daftar foto setiap produk sebelum memutuskan:
--
--   select id, brand, model_name, image_url, official_images
--     from public.products
--    where brand in ('Samsung', 'Apple', 'Xiaomi', 'Oppo')
--    order by id;