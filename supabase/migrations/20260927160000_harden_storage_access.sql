-- Akses Storage untuk foto pelanggan.
--
-- Latar: policy storage_public_read dibuat di 0002, saat bucket yang ada
-- hanya trade-in-photos dan service-photos. Keduanya dianggap publik supaya
-- portal bisa menampilkan foto dengan <img> biasa tanpa signed URL.
-- Sekarang tidak ada kode yang merender foto itu: pos dan service/new hanya
-- mengunggah lalu menyimpan URL-nya. Akibatnya policy itu tidak lagi
-- diperlukan, dan cakupannya justru berlebihan.
--
-- Masalah yang diselesaikan di sini:
--
-- 1. Dua bucket foto pelanggan masih public = true, dan storage_public_read
--    memberi SELECT ke anon dan authenticated. Untuk bucket public, URL
--    /object/public/ dilayani tanpa token dan tanpa cek RLS, jadi siapa pun
--    yang punya path bisa mengambil foto. Path sendiri memakai randomUUID,
--    jadi tidak bisa ditebak, tetapi begitu URL-nya bocor (misalnya staf
--    mengirim tautan ke pelanggan) foto itu tidak bisa ditarik kembali.
--    Foto servis bisa memuat IMEI, nama, dan layar perangkat yang sedang
--    diservis, jadi ini bukan aset publik.
--
-- 2. storage_public_read tidak pernah mencakup product-images, bucket yang
--    memang harus publik. Bucket itu tetap bisa dibaca karena public = true
--    dan URL publiknya dilayani tanpa RLS. Policy-nya dipindahkan ke situ
--    supaya nama policy sesuai isinya.
--
-- 3. Kedua bucket tidak punya file_size_limit maupun allowed_mime_types,
--    padahal uploadPhotoSchema di aplikasi sudah membatasi 5MB dan
--    image/jpeg, image/png, image/webp. Pemeriksaan di aplikasi bisa dilewati
--    kalau Storage API dipanggil langsung dengan token staf, jadi batasnya
--    ditegakkan di bucket juga.
--
-- Catatan untuk pembacaan foto ke depan: begitu bucket privat, URL yang
-- disimpan di photo_urls tidak lagi bisa dibuka. Menampilkannya perlu
-- createSignedUrl. Sampai saat itu, tidak ada data yang rusak karena kedua
-- bucket masih kosong dan kolom photo_urls belum pernah terisi.
--
-- Yang sengaja tidak dikerjakan: revoke hak tulis anon di storage.objects.
-- Hak itu diberikan oleh role supabase_storage_admin, dan REVOKE hanya bisa
-- mencabut hak yang diberikan oleh role yang sedang berjalan. Role postgres
-- tidak anggota supabase_storage_admin, jadi penghapusan hak itu tidak bisa
-- dilakukan dari koneksi aplikasi tanpa menaikkan keistimewaan. storage.objects
-- juga merupakan schema terkelola Supabase yang dipakai Storage API, jadi
-- default grant di sana memang disengaja. Pengawalnya adalah RLS, dan sudah
-- dipastikan tidak ada policy tulis untuk anon di tabel itu.
--
-- Semua pernyataan di sini idempoten.

-- 1) Bucket foto pelanggan jadi privat.
update storage.buckets
   set public = false
 where id in ('service-photos', 'trade-in-photos');

-- 2) Batas ukuran dan tipe file ditegakkan di bucket, sama seperti
--    product-images dan sama dengan yang sudah divalidasi aplikasi.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('service-photos', 'trade-in-photos');

-- 3) storage_public_read hanya untuk bucket katalog, bukan foto pelanggan.
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

-- 4) Foto servis dan trade-in hanya boleh dibaca staf. Policy ini belum
--    dipakai di UI, tapi ditulis sekarang supaya bucket privat tetap bisa
--    dibaca portal tanpa perlu policy baru saat fiturnya memang dipakai.
drop policy if exists storage_staff_read on storage.objects;
create policy storage_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('trade-in-photos', 'service-photos')
    and (select private.is_staff())
  );
