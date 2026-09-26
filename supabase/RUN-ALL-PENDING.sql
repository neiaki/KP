-- ============================================================================
-- File gabungan untuk Supabase SQL Editor
--
-- Isi: seluruh migrasi yang belum pernah dijalankan ke project At Cell,
-- digabung urut nomor supaya bisa di-paste sekali jalan.
--
-- SUDAH DIJALANKAN (jangan diulang):
--   0001_atcell_schema.sql        8 tabel, enum, trigger, RLS, view, storage, seed
--   0002_harden_atcell_schema.sql helper private, view security_invoker, grants
--   0003_lock_legacy_helpers.sql  revoke helper public
--
-- DI BAWAH INI YANG BARU (jalankan berurutan, jangan dipisah):
--   0004_align_schema_contract    FK cascade, 9 index, seed store_settings
--   20260926025406_index_fk       5 index untuk foreign key tanpa index
--   20260926103000_ticket_codes   kode resi 8 karakter base32
--   0006_store_social_urls        kolom URL sosmed di store_settings
--   0005_username_login           kolom email + username, trigger profil
--
-- ATURAN: seluruh bagian di bawah idempoten dan tidak menghapus data.
-- Kalau ada baris yang gagal, PostgreSQL membatalkan transaction itu saja.
-- SQL Editor membungkus semua Run dalam satu transaction, jadi jalankan
-- per bagian kalau ingin tahu bagian mana yang bermasalah.
--
-- Verifikasi ada di bagian paling bawah.
-- ============================================================================

-- ###########################################################################
-- BAGIAN 1 dari 5: 0004_align_schema_contract
-- Profiles harus ikut terhapus bersama auth.users, index pendukung untuk
-- katalog, POS, dan papan teknisi, serta baris singleton store_settings.
-- ###########################################################################

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

-- Index pendukung (sama seperti 0001, diulang dengan IF NOT EXISTS)
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

-- Baris singleton store_settings. updateStoreSettings() hanya menjalankan
-- UPDATE tanpa insert, jadi tanpa baris ini Admin melihat "Pengaturan toko
-- tidak ditemukan" dan situs publik menampilkan alamat serta WA kosong.
-- on conflict do nothing hanya mengisi kekosongan, tidak menimpa isi lama.
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


-- ###########################################################################
-- BAGIAN 2 dari 5: 20260926025406_index_public_foreign_keys
-- PostgreSQL tidak membuat index otomatis untuk foreign key, jadi kolom
-- ini akan full scan saat join atau saat RLS menyaring berdasarkan relasi.
-- ###########################################################################

create index if not exists service_tickets_customer_id_idx
  on public.service_tickets (customer_id);

create index if not exists trade_in_records_resulting_unit_id_idx
  on public.trade_in_records (resulting_unit_id);

create index if not exists trade_in_records_transaction_id_idx
  on public.trade_in_records (transaction_id);

create index if not exists transaction_items_unit_id_idx
  on public.transaction_items (unit_id);

create index if not exists transactions_customer_id_idx
  on public.transactions (customer_id);


-- ###########################################################################
-- BAGIAN 3 dari 5: 20260926103000_strengthen_ticket_codes
-- Kode resi 4 digit hanya 9.000 kombinasi per tanggal, jadi endpoint lacak
-- servis publik bisa ditembus enumerasi. Diperkuat ke 8 karakter base32.
-- Kode lama yang sudah tercetak di nota tetap berlaku: fungsi ini hanya
-- mengubah kode yang dibuat ke depan.
-- ###########################################################################

create or replace function public.generate_ticket_code()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  -- Alfabet base32 tanpa I, L, O, U supaya mudah dibaca dan ditulis di nota.
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  d text := to_char(now(), 'YYYYMMDD');
  raw bigint;
  suffix text := '';
  candidate text;
  g int;
begin
  if new.ticket_code is not null and new.ticket_code <> '' then
    return new;
  end if;

  -- Serialisasi generator per hari tetap, dan unique index menjadi jaring
  -- pengaman.
  perform pg_advisory_xact_lock(hashtextextended('atcell-ticket-' || d, 0));
  loop
    -- gen_random_uuid() milik pg_catalog, jadi selalu tersedia tanpa extension
    -- dan tanpa menambah schema ke search_path fungsi ini, yang sengaja di-pin
    -- untuk mencegah search_path hijacking. 10 karakter hex pertama = 40 bit,
    -- cukup untuk 8 karakter base32. random() dihindari karena bisa
    -- diprediksi dari urutan pemanggilan.
    raw := ('x' || substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint;
    suffix := '';
    for g in 0..7 loop
      suffix := suffix || substr(alphabet, (((raw >> (35 - 5 * g)) & 31)::int + 1), 1);
    end loop;

    candidate := 'SRV-' || d || '-' || suffix;
    exit when not exists (
      select 1 from public.service_tickets where ticket_code = candidate
    );
  end loop;
  new.ticket_code := candidate;
  return new;
end;
$$;

-- Kolom hanya menerima kode dengan bentuk yang didukung, sehingga klausa
-- WHERE pada lacak servis tetap bisa memakai perbandingan persis.
alter table public.service_tickets
  drop constraint if exists service_tickets_ticket_code_format_chk;

alter table public.service_tickets
  add constraint service_tickets_ticket_code_format_chk
  -- [0-9A-HJKMNP-TV-Z] adalah alfabet Crockford base32 yang sama persis
  -- dengan alphabet di fungsi generate_ticket_code() di atas.
  check (ticket_code ~ '^SRV-[0-9]{8}-([0-9]{4}|[0-9A-HJKMNP-TV-Z]{8})$');


-- ###########################################################################
-- BAGIAN 4 dari 5: 0006_store_social_urls
-- Memindahkan URL sosmed dari kode hardcode ke store_settings supaya Admin
-- bisa mengisinya lewat portal/settings. Kosong berarti platform itu tidak
-- ditampilkan di footer, jadi tidak ada lagi tautan ke halaman generik.
-- ###########################################################################

alter table public.store_settings add column if not exists social_facebook text;
alter table public.store_settings add column if not exists social_instagram text;
alter table public.store_settings add column if not exists social_x text;
alter table public.store_settings add column if not exists social_tiktok text;

update public.store_settings
   set social_facebook = nullif(social_facebook, ''),
       social_instagram = nullif(social_instagram, ''),
       social_x = nullif(social_x, ''),
       social_tiktok = nullif(social_tiktok, '')
 where id = 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.store_settings'::regclass
       and conname = 'store_settings_social_url_check'
  ) then
    alter table public.store_settings
      add constraint store_settings_social_url_check
      check (
        (social_facebook is null or social_facebook ~ '^https?://')
        and (social_instagram is null or social_instagram ~ '^https?://')
        and (social_x is null or social_x ~ '^https?://')
        and (social_tiktok is null or social_tiktok ~ '^https?://')
      );
  end if;
end $$;


-- ###########################################################################
-- BAGIAN 5 dari 5: 0005_username_login
-- Portal login memakai username, bukan email. Supabase Auth hanya bisa
-- signInWithPassword({ email, password }), jadi email disimpan di profiles
-- lalu dipetakan di server. Kolom email tidak hilang dari sistem, hanya
-- tidak lagi diketik staf.
-- ###########################################################################

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists username text;

-- Backfill email dari auth.users berdasarkan id yang sama.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;

-- Username diturunkan dari bagian email sebelum @ supaya akun lama langsung
-- punya username. Dibatasi 32 karakter dan hanya huruf, angka, titik, garis
-- bawah, atau strip supaya aman di URL.
update public.profiles p
   set username = coalesce(
     nullif(
       left(
         regexp_replace(
           lower(split_part(coalesce(p.email, ''), '@', 1)),
           '[^a-z0-9._-]', '', 'g'
         ),
         32
       ),
       ''
     ),
     'user_' || left(replace(p.id::text, '-', ''), 8)
   )
 where p.username is null;

update public.profiles set username = 'user_' || left(replace(id::text, '-', ''), 8)
 where username is null or username = '';

create unique index if not exists profiles_username_key
  on public.profiles (username);

-- NOT NULL tanpa default: baris baru hanya bisa masuk lewat trigger
-- handle_new_user() yang sudah mengisi username, jadi tidak ada INSERT manual
-- yang bisa meninggalkan kolom kosong.
alter table public.profiles alter column username set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_username_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (username ~ '^[a-z0-9._-]{3,32}$');
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_username text;
begin
  -- Username dari metadata invitation, kalau tidak ada diturunkan dari email.
  v_username := lower(
    regexp_replace(
      coalesce(
        nullif(new.raw_user_meta_data->>'username', ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'user_' || left(replace(new.id::text, '-', ''), 8)
      ),
      '[^a-z0-9._-]', '', 'g'
    )
  );
  v_username := left(coalesce(nullif(v_username, ''), 'user'), 32);

  insert into public.profiles (id, full_name, role, phone_number, email, username)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Pengguna'
    ),
    'customer',
    coalesce(new.raw_user_meta_data->>'phone_number', ''),
    new.email,
    v_username
  )
  on conflict (id) do nothing;

  -- Username bentrok atau formatnya tidak lolos check: pakai fallback
  -- per-user supaya trigger tidak menggagalkan pembuatan akun.
  begin
    update public.profiles
       set username = v_username
     where id = new.id
       and (username is distinct from v_username)
       and not exists (
         select 1 from public.profiles p2
          where p2.username = v_username and p2.id <> new.id
       );
  exception when others then
    update public.profiles
       set username = 'user_' || left(replace(new.id::text, '-', ''), 8)
     where id = new.id;
  end;

  return new;
end;
$$;

grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;


-- ###########################################################################
-- VERIFIKASI (read-only, aman dijalankan berkali-kali)
--
-- Jalankan tiap query satu per satu, hasilnya yang diharapkan:
--
-- 1. Index pendukung, harus keluar 14 baris:
--    select indexname from pg_indexes
--      where schemaname = 'public'
--        and indexname in (
--          'products_brand_idx',
--          'inventory_units_product_status_idx', 'inventory_units_status_idx',
--          'transactions_created_idx', 'transactions_sales_idx',
--          'transaction_items_tx_idx',
--          'service_tickets_code_idx', 'service_tickets_status_idx',
--          'service_tickets_tech_idx',
--          'service_tickets_customer_id_idx', 'transactions_customer_id_idx',
--          'transaction_items_unit_id_idx',
--          'trade_in_records_transaction_id_idx',
--          'trade_in_records_resulting_unit_id_idx',
--          'profiles_username_key')
--      order by indexname;
--
-- 2. Baris singleton, harus keluar 1:
--    select count(*) as store_settings_rows from public.store_settings;
--
-- 3. Tidak ada profil tanpa username, harus keluar 0:
--    select count(*) as tanpa_username
--      from public.profiles where username is null or username = '';
--
-- 4. Tidak ada username ganda, harus keluar 0 baris:
--    select username, count(*) from public.profiles
--     group by username having count(*) > 1;
--
-- 5. Daftar username yang bisa diketik staf:
--    select username, full_name, role from public.profiles order by role, username;
-- ###########################################################################
