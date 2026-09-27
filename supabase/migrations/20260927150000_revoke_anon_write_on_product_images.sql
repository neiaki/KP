-- Hak tulis anon di registry gambar produk.
--
-- Latar: tabel public.product_images dibuat oleh migrasi
-- 20260927130000, jauh setelah 0001 memberi grant eksplisit ke anon untuk
-- products dan store_settings. Karena tabel ini tidak pernah mendapat grant
-- eksplisit, dia hanya memegang default privilege Supabase, yaitu
-- anon=arwdDxtm, sehingga anon memegang INSERT, UPDATE, DELETE, dan TRUNCATE.
--
-- product_images adalah satu-satunya tabel di schema public dengan hak tulis
-- untuk anon. products dan store_settings hanya punya SELECT.
--
-- RLS menutup jalan itu sekarang juga, karena tidak ada policy tulis untuk
-- anon di tabel ini, jadi ini bukan celah yang bisa langsung dieksploitasi
-- lewat PostgREST. Yang diperbaiki adalah lapis cadangan: kalau RLS suatu saat
-- tidak sengaja dimatikan, atau ada policy permisif yang keliru ditambahkan,
-- anon tidak lagi bisa menghapus seluruh daftar gambar produk.
--
-- revoke dan grant sama-sama idempoten, jadi migrasi ini aman dijalankan
-- berulang.

-- Pola revoke all lalu grant select ini sama dengan yang dipakai 0001 untuk
-- products dan store_settings, supaya product_images tidak menyisakan privilege
-- MAINTAIN yang tidak dibutuhkan.
revoke all on public.product_images from anon;

-- SELECT tetap diberikan karena daftar gambar memang dibaca halaman publik.
grant select on public.product_images to anon;
