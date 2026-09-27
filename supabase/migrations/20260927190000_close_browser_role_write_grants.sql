-- Menutup hak tulis yang masih bocor, lalu menutup akar masalahnya.
--
-- Latar: audit read-only terhadap production menemukan empat sisipan di
-- lapisan grant. Semuanya sekarang tertahan oleh RLS saja, yaitu satu
-- lapis di bawah grant, jadi begitu RLS dimatikan atau ada policy permisif
-- yang keliru ditambahkan, grant itu langsung jadi jalur tulis yang
-- sebenarnya.
--
-- 1. public.product_images adalah satu-satunya tabel di schema public yang
--    masih memberi hak tulis ke authenticated, yaitu DELETE, INSERT,
--    REFERENCES, TRIGGER, TRUNCATE, dan UPDATE. 20260927150000 hanya
--    mencabut untuk anon, jadi authenticated terlewat. Tabel itu sendiri
--    sudah dikunci RLS dengan policy product_images_staff_write,
--    product_images_staff_update, dan product_images_admin_delete, jadi
--    jalur lewat PostgREST memang sudah tertutup. Yang diperbaiki di sini
--    adalah lapis cadangannya.
--
-- 2. Akar masalahnya ada di pg_default_acl. Untuk schema public, Supabase
--    memasang default privilege anon=arwdDxtm dan authenticated=arwdDxtm
--    untuk setiap tabel yang dibuat role postgres, jadi setiap tabel yang
--    dibuat sesudah 0001 mewarisi grant selebar itu. Grant eksplisit yang
--    diberikan 0001 dan 0002 hanya berlaku untuk tabel yang disebut di
--    sana, jadi default privilege tidak berubah dan tabel berikutnya tetap
--    memegang hak tulis penuh. Event trigger ensure_rls dari
--    20260927120000 mengaktifkan RLS, tapi tidak pernah mencabut grant.
--    Akibatnya jaring pengaman itu menutup satu lapis saja, dan lapis itu
--    justru yang paling mudah hilang tanpa disadari.
--
-- 3. storage.buckets memberi DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
--    TRUNCATE, dan UPDATE ke anon dan authenticated. Pengawalnya cuma
--    RLS aktif dengan nol policy, jadi secara praktis tabel itu sudah
--    tidak terbaca dan tidak bisa diubah oleh kedua role itu. Yang belum
--    bersih adalah bentuk grant-nya: mencantumkan UPDATE dan DELETE di
--    katalog bucket terlihat seperti hak yang memang diberikan, padahal
--    aplikasi tidak pernah memakainya.
--
-- 4. public.rls_auto_enable() masih memegang EXECUTE untuk PUBLIC, jadi
--    proacl-nya dimulai dengan =X/postgres. Fungsi event trigger itu
--    tidak mengembalikan apa pun dan tidak bisa dipanggil lewat PostgREST,
--    jadi dampaknya kecil. Hak yang tidak dibutuhkan tetap tidak perlu
--    diberikan, dan kalau PUBLIC ditambahkan lagi di kemudian hari,
--    privilege ini tidak akan ikut hilang.
--
-- Semua pernyataan di sini idempoten. Revoke dan grant boleh diulang
-- tanpa error dan tanpa mengubah keadaan, alter default privileges
-- menimpa entri yang sama, dan revoke execute pada fungsi yang haknya
-- sudah dicabut tetap berhasil.

-- 1) Registry gambar produk turun ke SELECT saja untuk kedua role aplikasi.
-- Pola revoke all lalu grant select ini sama dengan yang dipakai 0002 untuk
-- products, store_settings, dan tabel lainnya, supaya tabel ini tidak
-- menyisakan privilege MAINTAIN yang tidak dibutuhkan.
revoke all on public.product_images from anon, authenticated;

-- SELECT tetap diberikan karena daftar gambar dibaca halaman publik, lewat
-- policy product_images_public_read yang memang memakai using (true).
grant select on public.product_images to anon, authenticated;

-- 2) Katalog bucket Storage.
-- Aplikasi tidak pernah menyentuh storage.buckets lewat PostgREST.
-- src/lib/actions/storage.ts memakai klien Supabase JS, jadi unggah,
-- ambil signed URL, dan hapus semua lewat Storage API, bukan lewat tabel
-- ini. ALLOWED_BUCKETS di berkas itu satu-satunya daftar putih bucket di
-- sisi aplikasi, dan isinya tiga bucket yang semuanya sudah diatur di
-- migrasi lain, jadi tidak ada jalur aplikasi yang butuh INSERT, UPDATE,
-- atau DELETE di sini. Minimum yang jujur karena itu SELECT, dan
-- privileges di bawahnya sudah ditolak RLS yang aktif dengan nol policy,
-- jadi keadaan yang dilihat aplikasi tidak berubah sama sekali.
--
-- Batas yang harus diketahui sebelum membaca hasil migrasi ini: grant
-- tulis di storage.buckets diberikan oleh supabase_storage_admin, yang
-- juga pemilik tabel itu, dan REVOKE hanya bisa mencabut hak yang diberikan
-- oleh role yang sedang berjalan. Role postgres tidak anggota
-- supabase_storage_admin, jadi revoke di sini hanya menghapus grant milik
-- postgres sendiri. Diam-diam diuji pada production yang sekarang: lewat
-- role authenticated, select dari storage.buckets tetap mengembalikan 0
-- baris dan update tetap menyentuh 0 baris, bukan error permission
-- denied. Yang benar-benar menutup jalannya tetap RLS dengan nol policy.
-- Baris revoke tetap ditulis supaya grant milik postgres ikut bersih, dan
-- supaya project yang owners storage.buckets-nya postgres benar-benar
-- menutup hak tulisnya.
revoke all on storage.buckets from anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- 3) Fungsi event trigger tidak perlu bisa dipanggil role mana pun. Dia
-- dijalankan oleh event trigger ensure_rls, bukan oleh pemanggil, jadi
-- mencabut EXECUTE untuk public, anon, dan authenticated tidak mengganggu
-- jaring pengaman RLS yang sekarang sudah terpasang.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 4) Akar masalahnya ditutup supaya tabel berikutnya tidak diam-diam
-- mewarisi grant selebar itu lagi. Tanpa dua baris di bawah, setiap tabel
-- baru di schema public akan kembali memegang authenticated=arwdDxtm, lalu
-- hanya tertahan oleh policy yang harus orang ingat menulis sendiri.
-- Tabel yang sudah ada tidak ikut terpengaruh: alter default privileges
-- hanya berlaku untuk objek yang dibuat setelah perintah ini dijalankan,
-- jadi grant eksplisit dari 0001 dan 0002 tetap utuh.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Tabel baru tetap harus terbaca lewat Data API, jadi SELECT diberikan
-- lagi setelah dicabut. Migrasi berikutnya yang butuh hak tulis pada
-- tabel baru wajib menyebut role-nya eksplisit, dan itu jadi terlihat
-- di diff.
alter default privileges in schema public grant select on tables to anon, authenticated;
