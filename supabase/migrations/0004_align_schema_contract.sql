-- ============================================================================
-- Migrasi 0004 — selaraskan kontrak schema dengan hasil dump Supabase.
--
-- Dasar: dump "context only" dari project menunjukkan tiga yang tidak
-- sama dengan kontrak canonical di 0001/0002:
--   1. profiles_id_fkey tanpa ON DELETE CASCADE
--   2. sembilan index pendukung tidak ada
--   3. baris singleton store_settings id = 1 belum tentu ada
--
-- Semua pernyataan di bawah idempoten dan tidak menghapus data.
-- Connection langsung lewat Drizzle (src/db/client.ts) memakai peran postgres
-- sehingga RLS tidak menghalangi, tapi index tetap wajib agar kueri katalog,
-- POS, dan tiket servis tidak scan penuh.
--
-- CARA JALANKAN: tempel seluruh file ini ke SQL Editor Supabase lalu Run,
-- atau lewat psql $DATABASE_URL -f 0004_align_schema_contract.sql
-- (set transaction: tidak, Postgres Tool di SQL Editor sudah memakai transaction).
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. profiles: auth.users jadi pemilik baris, jadi harus ikut terhapus
-- --------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  -- Constraint FK hanya bisa dipasang kalau tidak ada baris yatim. Tanpa
  -- pemeriksaan ini, add constraint gagal dengan error FK yang membingungkan.
  if exists (
    select 1
      from public.profiles p
     where not exists (select 1 from auth.users u where u.id = p.id)
  ) then
    raise exception
      'ORPHANED_PROFILES: ada baris profiles tanpa user di auth.users. '
      'Hapus baris yatim itu lebih dulu, lalu jalankan ulang migrasi ini.';
  end if;

  select pg_get_constraintdef(oid)
    into v_def
    from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and conname = 'profiles_id_fkey';

  if v_def is not null and v_def not like '%ON DELETE CASCADE%' then
    alter table public.profiles drop constraint profiles_id_fkey;
  end if;

  if v_def is null or v_def not like '%ON DELETE CASCADE%' then
    alter table public.profiles
      add constraint profiles_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- 2. Index pendukung (sama seperti 0001, diulang dengan IF NOT EXISTS)
-- --------------------------------------------------------------------------
-- Katalog publik menyaring unit available per merek.
create index if not exists products_brand_idx
  on public.products (brand) where is_active;

-- POS memilih unit tersedia per produk, listing inventaris cukup indeks ini.
create index if not exists inventory_units_product_status_idx
  on public.inventory_units (product_id, status);
create index if not exists inventory_units_status_idx
  on public.inventory_units (status);

-- Laporan omzet: rentang tanggal dan rekap per kasir.
create index if not exists transactions_created_idx
  on public.transactions (created_at desc);
create index if not exists transactions_sales_idx
  on public.transactions (sales_id);

-- Rincian nota satu-ke-satu dengan induknya.
create index if not exists transaction_items_tx_idx
  on public.transaction_items (transaction_id);

-- Papan kerja teknisi: filter status dan antrean per teknisi.
create index if not exists service_tickets_code_idx
  on public.service_tickets (ticket_code);
create index if not exists service_tickets_status_idx
  on public.service_tickets (repair_status);
create index if not exists service_tickets_tech_idx
  on public.service_tickets (technician_id);

-- --------------------------------------------------------------------------
-- 3. Baris singleton store_settings
-- --------------------------------------------------------------------------
-- updateStoreSettings() (src/lib/actions/settings.ts) menjalankan
-- UPDATE ... WHERE id = 1 tanpa insert. Tanpa baris ini, Admin melihat
-- "Pengaturan toko tidak ditemukan." dan situs publik menampilkan
-- alamat serta nomor WhatsApp kosong. on conflict do nothing berarti
-- seed ini hanya mengisi kekosongan, tidak menimpa isi yang sudah ada.
insert into public.store_settings
  (id, store_name, description_id, description_en, address, latitude, longitude,
   maps_url, phone_number, whatsapp_number, opening_hours)
values
  (1, 'At Cell - Gadget Store & Repair Center',
   'Pusat penjualan smartphone baru & seken berkualitas dengan garansi resmi toko, layanan tukar tambah transparan berstandar grading, serta pusat reparasi profesional teknisi bersertifikat.',
   'Premium smartphone sales (brand new & certified pre-owned) with store warranty, transparent trade-in grading system, and professional certified device repair services.',
   'QM7H+8WG, Unnamed Road, Paku Jaya, Kec. Serpong Utara, Kota Tangerang Selatan, Banten 15220',
   -6.2388951, 106.6710492, 'https://maps.app.goo.gl/8Qbpvqs6FwihDrk7A',
   '0812-3456-7890', '081234567890',
   '{"monday_friday":"09:00 - 21:00 WIB","saturday_sunday":"10:00 - 22:00 WIB","holidays":"10:00 - 18:00 WIB"}'::jsonb)
on conflict (id) do nothing;

-- --------------------------------------------------------------------------
-- 4. Verifikasi (aman, read-only). Jalankan terpisah bila perlu lihat hasil.
-- --------------------------------------------------------------------------
-- select indexname from pg_indexes
--  where schemaname = 'public'
--    and indexname in (
--      'products_brand_idx',
--      'inventory_units_product_status_idx', 'inventory_units_status_idx',
--      'transactions_created_idx', 'transactions_sales_idx',
--      'transaction_items_tx_idx',
--      'service_tickets_code_idx', 'service_tickets_status_idx',
--      'service_tickets_tech_idx')
--  order by indexname;
--
-- select count(*) as store_settings_rows from public.store_settings;
