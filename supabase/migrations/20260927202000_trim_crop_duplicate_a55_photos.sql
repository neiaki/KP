-- Pangkas foto galeri Galaxy A55 yang saling potongan.
--
-- Latar: audit visual mengukur kemiripan antara foto resmi Galaxy A55 5G.
-- a55-1.jpg dan a55-2.jpg adalah dua render penuh yang berbeda: a55-1.jpg
-- unit warna iceblue, a55-2.jpg unit warna merah muda. Tiga berkas sisanya
-- bukan angle baru, semuanya potongan dari salah satu dari dua render itu.
--
-- Pengukuran ulang 1 Oktober 2026 mengoreksi kesimpulan audit sebelumnya.
-- Header versi pertama menuliskan a55-4.jpg sebagai potongan dari a55-2.jpg
-- dan a55-5.jpg sebagai nyaris sama dengan a55-3.jpg. Keduanya salah:
--
--   a55-3.jpg  potongan dari a55-1.jpg  (korelasi silang 0,912 pada skala 1,35)
--   a55-4.jpg  potongan dari a55-1.jpg  juga, dan isinya nyaris sama dengan
--              a55-3.jpg: korelasi 0,9966, beda rata-rata 1,8 per kanal, dan
--              cuma 1,39% piksel yang beda lebih dari 32. Jadi a55-4.jpg bukan
--              potongan dari a55-2.jpg, tapi salinan a55-3.jpg.
--   a55-5.jpg  potongan dari a55-2.jpg  (korelasi 0,868 pada skala 1,35), bukan
--              salinan a55-3.jpg yang korelasinya cuma 0,775 dengan 27% piksel
--              beda lebih dari 20.
--
-- Yang dipangkas tetap tiga berkas yang sama, jadi hasil migrasi tidak
-- berubah sama sekali; hanya penjelasannya yang dikoreksi. Berkas ini sudah
-- tercatat di ledger production, jadi jangan dipakai sebagai bukti apa pun
-- selain catatan asal-usul pemangkasan.
--
-- Dampaknya ke pembeli nyata. Urutan warna yang sebenarnya di galeri lama
-- adalah iceblue, merah muda, iceblue, iceblue, merah muda: a55-1 dan a55-2
-- bergantian, lalu a55-3 dan a55-4 mengulang render iceblue dua kali berturut,
-- lalu a55-5 kembali ke merah muda. Pengulangan itu terbaca sebagai galeri
-- foto yang rusak, bukan sebagai lima angle produk. (Header versi pertama
-- menuliskan "iceblue, pink, iceblue, pink, iceblue"; dua elemen terakhirnya
-- terbalik dan posisi keempat salah.)
--
-- Dua render penuhnya tetap di tempat, jadi kartu produknya masih punya
-- sampul dan masih punya tombol foto berikutnya yang berguna. src/lib/mock-data.ts
-- memakai daftar galeri yang sama; hanya penjelasannya di file itu yang ikut
-- dikoreksi.
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