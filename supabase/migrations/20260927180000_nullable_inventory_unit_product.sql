-- inventory_units.product_id jadi nullable, etalase publik tetap jujur.
--
-- Latar: executeSale() di src/lib/actions/pos.ts membuat unit trade-in dengan
-- productId milik unit BARU yang dijual, bukan model handset lama milik
-- pelanggan. Jadi tukar Samsung S9 dengan Galaxy S24 menghasilkan baris
-- inventory_units yang product_id-nya menunjuk ke katalog S24. Baris salah
-- itu langsung muncul di etalase publik (v_public_inventory) dan di setiap
-- filter merek/model, lalu tertinggal tanpa ada yang memperbaikinya.
--
-- Kenapa product_id di-null-kan, bukan dibuatkan baris products baru:
-- katalog produk eksklusif Admin (FR-D-04). Kasir tidak boleh membuat
-- produk di tempat, jadi pilihan lain hanya menebak atau memakai produk
-- closest-match, yang mengembalikan jenis bug yang sama dalam bentuk lain.
-- NULL berarti "unit ini tidak punya baris katalog", dan deskripsi
-- otoritatif handset yang masuk ada di trade_in_records.original_brand_model
-- (grading, IMEI, dan foto ikut di sana).

-- =============================================================================
-- 1. Lepaskan NOT NULL pada inventory_units.product_id
-- =============================================================================
-- Kolom tetap punya FK ke products(id) ON DELETE RESTRICT, jadi produk yang
-- masih dirujuk unit tidak bisa dihapus. NULL berarti "tanpa katalog", bukan
-- "tanpa identitas": IMEI, kondisi, harga beli/jual, dan status tetap ada.
--
-- Idempoten: drop not null pada kolom yang sudah nullable tidak error.
alter table public.inventory_units alter column product_id drop not null;

comment on column public.inventory_units.product_id is
  'NULL untuk unit trade-in: handset milik pelanggan tidak punya baris katalog products. Deskripsi aslinya ada di trade_in_records.original_brand_model. Unit dengan product_id NULL sengaja disembunyikan dari v_public_inventory.';

-- =============================================================================
-- CATATAN PERBAIKAN DATA (JANGAN DIJALANKAN OTOMATIS)
-- =============================================================================
-- Migrasi ini sengaja TIDAK memperbaiki baris yang sudah terlanjur salah.
-- Menaruh UPDATE di sini berarti ikut dibungkus transaksi SQL Editor dan
-- ikut ter-copy ke project lain lewat RUN-ALL-PENDING.sql, jadi perbaikannya
-- diserahkan ke operator yang memutuskan sendiri untuk toko masing-masing.
--
-- Cara mengenali unit trade-in yang salah:
--
--   select
--     u.id                              as unit_id,
--     u.imei,
--     u.product_id                      as salah_product_id,
--     p.brand || ' ' || p.model_name    as katalog_terpasang,
--     t.original_brand_model            as model_asli,
--     t.transaction_id
--     from public.inventory_units u
--     join public.trade_in_records t on t.resulting_unit_id = u.id
--     left join public.products p on p.id = u.product_id
--    where u.product_id is not null;
--
-- resulting_unit_id adalah join yang tepat: setiap unit hasil trade-in punya
-- tepat satu baris trade_in_records yang menunjuk balik ke unit itu, jadi
-- unit inventaris biasa tidak ikut tertangkap. Bandingkan model_asli dengan
-- katalog_terpasang; kalau keduanya memang sama, unit itu kebetulan benar
-- dan tidak perlu disentuh.
--
-- Perbaikannya (JALANKAN SENDIRI setelah hasil di atas dicek):
--
--   update public.inventory_units u
--      set product_id = null
--     from public.trade_in_records t
--    where t.resulting_unit_id = u.id
--      and u.product_id is not null;
--
-- Setelah itu unit-unit tersebut hilang dari etalase publik, memang itu
-- tujuannya, dan tetap bisa dicari lewat /portal/inventory berdasarkan IMEI.

-- =============================================================================
-- 2. v_public_inventory hanya menampilkan unit berkatalog
-- =============================================================================
-- Keputusan: unit trade-in disembunyikan dari etalase, bukan ditampilkan
-- dengan merek/model fallback.
--
-- Alasannya: etalase publik adalah etalase jualan, dan kartu produknya butuh
-- merek, model, spesifikasi, serta foto. Semua kolom itu milik products,
-- yang tidak ada untuk unit trade-in. Kalau ditampilkan dengan teks
-- fallback, pengunjung akan melihat kartu "Samsung / Galaxy S9" tanpa foto
-- dan tanpa spesifikasi, dengan harga yang justru berasal dari taksiran
-- trade-in yang diberikan ke pelanggan, bukan harga jual yang disetujui
-- toko. Itu berisiko menjual barang dengan informasi yang salah dan tidak
-- bisa diperbaiki tanpa membuat katalog palsu. Unit trade-in tetap bisa
-- dijual, tapi lewat alur kasir, bukan lewat etalase publik.
--
-- Syarat u.product_id is not null sengaja ditulis eksplisit walau JOIN di
-- atas sudah memblokir NULL, supaya niatnya terbaca dan tetap berlaku
-- kalau JOIN someday diganti menjadi LEFT JOIN.
create or replace view public.v_public_inventory
with (security_invoker = true)
as
select p.brand,
       p.model_name,
       p.specs,
       p.image_url,
       p.official_images,
       p.second_images,
       u.condition,
       u.selling_price,
       u.created_at as unit_created_at,
       p.id as product_id,
       u.id as unit_id,
       right(u.imei, 4) as imei_tail
  from public.inventory_units u
  join public.products p on p.id = u.product_id
 where u.product_id is not null
   and u.status = 'available'
   and p.is_active;

-- GRANT tidak perlu diulang: create or replace view mempertahankan hak akses
-- yang sudah diberikan di 0002 (revoke all dari public/anon/authenticated,
-- lalu grant select ke service_role), dan daftar kolom view ini tidak berubah.
