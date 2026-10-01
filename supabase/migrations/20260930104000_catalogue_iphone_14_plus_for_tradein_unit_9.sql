-- Katalogkan unit trade-in id 9 sebagai Apple iPhone 14 Plus.
--
-- Latar: inventory_units id 9 adalah handset milik toko, bukan hasil
-- karangan. IMEI-nya asli dan sudah tersimpan di cip unit itu, condition
-- second, status available, purchase_cost 4000000, selling_price 5000000,
-- dan product_id masih NULL. NULL itu disengaja sejak
-- 20260927180000_nullable_inventory_unit_product.sql: unit trade-in tidak
-- boleh tampil di etalase publik sebelum ada katalognya, karena kartu
-- produknya butuh merek, model, spesifikasi, dan foto, dan keempatnya
-- milik tabel products.
--
-- MODELNYA DISALIN DARI trade_in_records.original_brand_model yang nilainya
-- "iPhone 14 Plus". Tidak ada penulisan ke kolom IMEI, condition, status,
-- purchase_cost, atau selling_price. Satu-satunya perubahan pada unit ini
-- adalah product_id.
--
-- KAPASITAS PENYIMPANAN TIDAK DIASERSIKAN. Data tukar tambah toko tidak
-- mencatat kapasitas, dan mengarang "128GB" hanya supaya barisnya terlihat
-- rapi akan membuat etalase publik menyebut spesifikasi yang tidak pernah
-- dikonfirmasi siapa pun. Karena itu model_name ditulis polos, dan
-- specs-nya menyatakan terus terang bahwa kapasitasnya belum tercatat.
--
-- PERINGATAN KERAS DARI PEMILIK TOKO: berkas ini TIDAK BOLEH berisi
-- INSERT ke inventory_units, dan TIDAK BOLEH membuat IMEI. Satu IMEI 15
-- digit adalah identitas satu perangkat keras nyata yang tertempel di cip
-- di dalamnya. Membuat angka IMEI berarti mengiklankan di situs publik
-- perangkat keras yang tidak ada di rak toko, dan itu kerugian nyata buat
-- pembeli, bukan kesalahan kosmetik. Kalau katalog ini nanti perlu unit
-- baru, unit itu harus didaftarkan lewat portal inventaris saat handset
-- fisiknya benar-benar ada di konter, dengan IMEI yang dibaca dari
-- perangkatnya.
--
-- Idempoten dan atomik, dalam satu statement:
--   - "baru" hanya meng-insert baris products kalau belum ada baris dengan
--     brand 'Apple' dan model_name yang sama. Pencocokan memakai
--     lower(btrim(...)) supaya perbedaan huruf besar-kecil dan spasi di
--     tepi tidak menghasilkan baris kembar.
--   - "target" membaca baris produk itu baik yang sudah ada sebelumnya
--     maupun yang baru dibuat di statement yang sama, jadi jalur update
--     tetap berjalan saat berkas dijalankan kedua kali.
--   - Syarat "u.product_id is null" membuat update tidak pernah merebut
--     unit yang sudah ditautkan ke produk lain. Kalau staf sudah menautkan
--     unit 9 sendiri lewat portal, berkas ini tidak mengubah apa pun.
--   - Dua tabel disentuh dalam satu statement, jadi tidak mungkin ada
--     keadaan setengah jalan di mana baris produk ada tapi unitnya belum
--     tertaut, atau sebaliknya.
--
-- PRODUK INI SATU-SATUNYA hasil migrasi ini yang muncul sebagai stok
-- sungguhan di etalase, karena unit 9-nya status available. Empat model
-- lain dari perluasan katalog sengaja dibuat tanpa unit apa pun, jadi
-- mereka tampil sebagai kartu "Stok Habis" dengan tombol kabari WhatsApp.

-- =============================================================================
-- 1) Baris produk + penautan unit id 9, satu statement
-- =============================================================================
with target as (
  select p.id
    from public.products p
   where p.brand = 'Apple'
     and lower(btrim(p.model_name)) = lower(btrim('iPhone 14 Plus'))
   order by p.id
   limit 1
), baru as (
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
    'Apple',
    'iPhone 14 Plus',
    'Unit second dari tukar tambah, IMEI asli, garansi toko. Kapasitas penyimpanan belum tercatat di data toko, tanyakan dulu ke kasir.',
    0,
    '/products/placeholder.svg',
    '{}'::text[],
    true
  where not exists (
    select 1 from target
  )
  returning id
)
update public.inventory_units u
   set product_id = t.id
  from (
    select id from target
    union all
    select id from baru
  ) as t
 where u.id = 9
   and u.product_id is null
   and u.status = 'available'
   and u.condition = 'second';

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Pastikan unit 9 memang unit yang dimaksud. Lihat dulu, jangan
--    langsung menjalankan:
--
--      select u.id, u.imei, u.condition, u.status,
--             u.purchase_cost, u.selling_price, u.product_id,
--             t.original_brand_model
--        from public.inventory_units u
--        left join public.trade_in_records t on t.resulting_unit_id = u.id
--       where u.id = 9;
--
--    Kalau id, IMEI, atau model di baris itu tidak sama dengan catatan
--    di atas, JANGAN jalankan berkas ini. Angka 9 ditulis mati di dalam
--    statement supaya tidak ada baris lain yang ikut tertaut.
--
-- 2. default_price sengaja diisi 0, bukan dikarang. Toko tidak menjual
--    iPhone 14 Plus baru, jadi tidak ada harga baru yang jujur untuk ditulis
--    di sini. Kalau owner nanti menetapkan harga unit baru, ubah angka 0 itu
--    lewat portal produk.
--
--    Angka 0 itu tidak akan tampil sebagai harga apa pun. Kartu produk untuk
--    unit second memakai default_price sebagai label "Barunya" yang dicoret,
--    dan label itu hanya dibuat kalau default_price-nya angka finite yang
--    positif: referencePriceOf di src/lib/catalogue-notify.ts dipakai bersama
--    oleh kartu unit second dan kartu model tanpa unit, jadi 0 berarti "belum
--    ada harga" dan kartu ini tampil tanpa coretan "Barunya" sama sekali,
--    bukan "Barunya Rp0" di sebelah Rp5.000.000. Aturan itu dikunci
--    tests/catalogue-reference-price.test.ts.
--
--    Perlu diketahui: form master produk di portal menolak menyimpan
--    default_price nol atau negatif ("Harga acuan wajib diisi lebih dari
--    nol."). Jadi begitu staf membuka produk ini untuk diedit di portal, form
--    akan menolak disimpan selama harga acuannya masih kosong. Itu konsekuensi
--    yang harus disampaikan ke owner, bukan alasan untuk mengarang harga.
--
-- 3. Foto produk ini placeholder: public/products/placeholder.svg, yaitu
--    gambar vektor netral yang menulis "Belum ada foto". public/products/
--    tidak punya foto iPhone 14 Plus, dan memakai foto iPhone 13 atau
--    iPhone 15 Pro sebagai gantinya akan menampilkan perangkat yang
--    berbeda dari yang dijual. Placeholder.svg dilayani same-origin dan,
--    karena next/image memakai loader bawaan, berkas .svg itu dilayani
--    apa adanya tanpa melewati optimizer. Setelah unitnya difotret,
--    ganti image_url-nya lewat portal produk.
--
-- 4. Setelah dijalankan, verifikasi hasilnya. Baris produk harus ada,
--    unit 9 harus tertaut, dan view publik harus memuat satu kartu Apple:
--
--      select p.id, p.brand, p.model_name, p.default_price,
--             u.id as unit_id, u.condition, u.selling_price, u.product_id
--        from public.products p
--        join public.inventory_units u on u.product_id = p.id
--       where u.id = 9;
--
--      select brand, model_name, condition, selling_price, imei_tail
--        from public.v_public_inventory
--       where brand = 'Apple'
--       order by model_name;
--
--    Kalau baris kedua tidak memuat iPhone 14 Plus, jangan mengedit
--    produknya. Buka v_public_inventory di
--    20260927180000_nullable_inventory_unit_product.sql: view itu hanya
--    menampilkan unit dengan status available dan produk aktif.
--
-- 5. Kalau unit 9 ternyata bukan iPhone 14 Plus, jangan mengedit kolom
--    di unit itu untuk mencocokkan. Namai ulang produknya lewat portal
--    produk supaya jejak perubahan tercatat, dan kembalikan
--    product_id unit itu ke NULL lewat updateUnitProduct di portal.