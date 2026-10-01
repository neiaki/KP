-- Bersihkan image_url produk yang isinya bukan alamat foto.
--
-- Asal-usulnya sudah ketemu dan sudah ditutup di sisi kode. Nilai yang
-- salahnya masih tersimpan di production, jadi berkas ini membersihkan
-- datanya.
--
-- Jalur penulisannya ada di src/app/(portal)/portal/products/page.tsx. Form
-- master produk memakai konstanta PLACEHOLDER_IMAGE yang dulu dirakit begini:
--
--   const PLACEHOLDER_IMAGE =
--     `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/products/placeholder.svg`;
--
-- Template literal tidak pernah gagal diam-diam. Kalau
-- NEXT_PUBLIC_SUPABASE_URL kosong saat build, Polaris tidak throws. Dia menulis
-- teks "undefined" di depan path, jadi hasilnya:
--
--   undefined/storage/v1/object/public/product-images/products/placeholder.svg
--
-- Kolom image_url memakai nilai itu setiap kali kolom foto pada form
-- dikosongkan, lewat `image_url: imageUrl.trim() || PLACEHOLDER_IMAGE`.
--
-- Dua sisi sudah ditutup di kode. Portal sekarang memakai file lokal
-- /products/placeholder.svg yang ikut ter-commit. isRealPhoto di
-- src/lib/shop.ts menolak nilai yang tidak bisa di-parse sebagai URL http/https
-- atau path same-origin.
--
-- Yang TIDAK disentuh berkas ini, dan itu disengaja: brand, model_name,
-- specs, dan default_price. Baris yang tertangkap dilaporkan punya brand
-- 'Xiaomi' dengan model_name 'iphone 16'. Merek dan model adalah keputusan
-- merchandising yang hanya bisa dijawab staff yang melihat unit fisiknya,
-- bukan konsekuensi dari gambar yang salah. Mengubahnya di sini berarti
-- menebak. Berkas ini hanya emptying kolom foto, lalu menyerahkan sisanya.
--
-- Pernyataan di bawah hanya membersihkan nilai yang jelas bukan alamat foto.
-- image_url kosong berarti tidak ada foto, dan itu memang keadaan default
-- kolom itu, jadi kartunya dirender tanpa foto, bukan dengan foto rusak.
-- Bucket product-images tetap bisa menyediakan foto lewat product_images, dan
-- admin bisa mengisinya kapan saja lewat portal.
--
-- Idempoten: baris yang sudah kosong tidak tersentuh lagi, dan URL yang
-- sah tidak pernah ikut tertimpa.

-- =============================================================================
-- 1) image_url yang bukan alamat foto dikosongkan
-- =============================================================================
update public.products p
   set image_url = ''
 where btrim(p.image_url) <> ''
   and (
         btrim(p.image_url) like '//%'
         or (
              btrim(p.image_url) not like '/%'
              and btrim(p.image_url) not like 'http://%'
              and btrim(p.image_url) not like 'https://%'
            )
       );

-- =============================================================================
-- YANG TIDAK BOLEH DIJALANKAN OTOMATIS
-- =============================================================================
-- Migrasi ini berhenti di kolom foto. Dua hal lain pada baris yang sama
-- adalah keputusan manusia, dan keduanya perlu dilihat orang yang tahu
-- barangnya.
--
-- 1. Merek dan modelnya tidak cocok. Baris products id 6 punya brand
--    'Xiaomi' dengan model_name 'iphone 16'. Pilihannya: perbaiki brand jadi
--    Apple, perbaiki model jadi tipe Xiaomi yang benar, atau mungkin unit itu
--    memang tercatat dengan dua nama berbeda. Tidak bisa dijawab tanpa
--    melihat unit fisiknya.
--
-- 2. Baris itu tidak boleh dibuang. Satu-satunya unit-nya berstatus
--    in_service, punya IMEI asli dan harga jual, jadi itu handset milik
--    pelanggan yang sedang diservis di konter, bukan sampah. Unit in_service
--    otomatis tersembunyi dari etalase publik karena v_public_inventory hanya
--    memfilter status available, jadi membiarkannya tidak berpengaruh ke
--    pembeli. Yang diputuskan staf adalah merek, model, dan specs-nya
--    setelah perbaikan selesai, bukan menghapus barisnya.
--
-- Cara melihat unitnya sebelum memutuskan:
--
--   select u.id, u.imei, u.condition, u.status, u.selling_price,
--          p.id as product_id, p.brand, p.model_name, p.specs, p.image_url
--     from public.inventory_units u
--     left join public.products p on p.id = u.product_id
--    where p.id = 6;
--
-- Setelah memutuskan, perbaikannya lewat updateProduct(id, {...}) di
-- src/lib/actions/products.ts, yang requireRole(["admin"]) dan divalidasi
-- productUpdateSchema.