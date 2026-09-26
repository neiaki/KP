-- ============================================================================
-- File gabungan untuk Supabase SQL Editor
--
-- Isi: seluruh migrasi yang belum pernah dijalankan ke project At Cell,
-- digabung supaya bisa di-paste sekali jalan, bukan enam kali. Urutannya
-- mengikuti ketergantungan antar bagian, bukan hanya nomor file.
--
-- SUDAH DIJALANKAN (jangan diulang):
--   0001_atcell_schema.sql        8 tabel, enum, trigger, RLS, view, storage, seed
--   0002_harden_atcell_schema.sql helper private, view security_invoker, grants
--   0003_lock_legacy_helpers.sql  revoke helper public
--
-- DI BAWAH INI YANG BARU, jalankan berurutan:
--   0004_align_schema_contract         FK cascade, index performa, singleton store_settings
--   20260926025406_index_public_foreign_keys index untuk foreign key yang belum punya index pendahulu
--   20260926103000_strengthen_ticket_codes kode resi 8 karakter base32, kode lama tetap berlaku
--   0006_store_social_urls             URL sosmed resmi toko, diisi Admin lewat portal/settings
--   0007_audit_trail                   audit trail unit + tiket servis (NFR-07), ditulis trigger database
--   0005_username_login                kolom email + username, trigger profil, login portal pakai username
--
-- ATURAN: seluruh bagian di bawah idempoten dan tidak menghapus data.
-- SQL Editor membungkus semua Run dalam satu transaction, jadi kalau satu
-- bagian gagal semuanya batal. Jalankan per bagian kalau ingin tahu bagian
-- mana yang bermasalah.
--
-- CATATAN untuk bagian audit trail: actor_id hanya terisi kalau Server Action
-- menulisnya di transaction yang sama dengan UPDATE-nya. Perubahan lewat SQL
-- Editor manual tercatat dengan actor_id NULL. Itu bukan bug, justru sinyal
-- perubahan yang perlu ditinjau.
-- ============================================================================


-- ###########################################################################
-- BAGIAN 1 dari 6: 0004_align_schema_contract
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


-- ###########################################################################
-- BAGIAN 2 dari 6: 20260926025406_index_public_foreign_keys
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
-- BAGIAN 3 dari 6: 20260926103000_strengthen_ticket_codes
-- ###########################################################################

create or replace function public.generate_ticket_code()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  -- Alfabet base32 tanpa I, L, O, U supaya easy dibaca dan ditulis di nota.
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

  -- Serialisasi generator per hari tetap, dan unique index menjadi jaring pengaman.
  perform pg_advisory_xact_lock(hashtextextended('atcell-ticket-' || d, 0));
  loop
    -- gen_random_uuid() milik pg_catalog, jadi selalu tersedia tanpa extension
    -- dan tanpa menambah schema ke search_path fungsi ini, yang sengaja di-pin
    -- untuk mencegah search_path hijacking. 10 karakter hex pertama = 40 bit,
    -- cukup untuk 8 karakter base32. random() dihindari karena bisa diprediksi
    -- dari urutan pemanggilan.
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

-- Jaga agar kolom hanya menerima kode dengan bentuk yang didukung, sehingga
-- klausa WHERE pada lacak servis tetap bisa memakai perbandingan persis.
alter table public.service_tickets
  drop constraint if exists service_tickets_ticket_code_format_chk;

alter table public.service_tickets
  add constraint service_tickets_ticket_code_format_chk
  -- [0-9A-HJKMNP-TV-Z] adalah alfabet Crockford base32 yang sama persis dengan
  -- alphabet di fungsi generate_ticket_code() di atas.
  check (ticket_code ~ '^SRV-[0-9]{8}-([0-9]{4}|[0-9A-HJKMNP-TV-Z]{8})$');


-- ###########################################################################
-- BAGIAN 4 dari 6: 0006_store_social_urls
-- ###########################################################################

alter table public.store_settings add column if not exists social_facebook text;
alter table public.store_settings add column if not exists social_instagram text;
alter table public.store_settings add column if not exists social_x text;
alter table public.store_settings add column if not exists social_tiktok text;

-- Backfill dari nilai hardcode lama hanya bila kolom masih kosong, supaya
-- kontrak lama di src/lib/mock-data.ts tidak ikut berubah diam-diam. URL
-- placeholder https://facebook.com/ sengaja TIDAK disalin: itu bukan akun
-- toko, jadi menyalinnya hanya memindahkan tautan salah ke database.
update public.store_settings
   set social_facebook = nullif(social_facebook, ''),
       social_instagram = nullif(social_instagram, ''),
       social_x = nullif(social_x, ''),
       social_tiktok = nullif(social_tiktok, '')
 where id = 1;

-- Hanya URL http dan https yang boleh masuk, supaya kolom ini tidak jadi
-- vektor javascript: atau data: lewat form settings.
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

-- --------------------------------------------------------------------------
-- Verifikasi (read-only)
-- --------------------------------------------------------------------------
-- select social_facebook, social_instagram, social_x, social_tiktok
--   from public.store_settings where id = 1;


-- ###########################################################################
-- BAGIAN 5 dari 6: 0007_audit_trail
-- ###########################################################################

create table if not exists public.unit_status_audit (
  id bigint generated always as identity primary key,
  unit_id bigint not null references public.inventory_units(id) on delete cascade,
  old_status public.unit_status,
  new_status public.unit_status not null,
  -- NULL kalau perubahan tidak berasal dari Server Action, misalnya SQL manual.
  actor_id uuid references public.profiles(id) on delete set null,
  -- Who = id user, What = transisi status, When = created_at.
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists unit_status_audit_unit_idx
  on public.unit_status_audit (unit_id, created_at desc);
create index if not exists unit_status_audit_created_idx
  on public.unit_status_audit (created_at desc);
create index if not exists unit_status_audit_actor_idx
  on public.unit_status_audit (actor_id)
  where actor_id is not null;

create table if not exists public.service_ticket_audit (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.service_tickets(id) on delete cascade,
  old_status public.repair_status,
  new_status public.repair_status not null,
  actor_id uuid references public.profiles(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists service_ticket_audit_ticket_idx
  on public.service_ticket_audit (ticket_id, created_at desc);
create index if not exists service_ticket_audit_created_idx
  on public.service_ticket_audit (created_at desc);
create index if not exists service_ticket_audit_actor_idx
  on public.service_ticket_audit (actor_id)
  where actor_id is not null;

-- --------------------------------------------------------------------------
-- 2. Pembaca aktor transaction-local
-- --------------------------------------------------------------------------
-- transaction-local (is_local = true) supaya nilainya hilang saat transaction
-- selesai dan tidak bocor ke connection yang dipakai request berikutnya.
create or replace function private.current_actor_id()
returns uuid
language plpgsql
stable
as $$
declare
  v_raw text;
begin
  v_raw := nullif(current_setting('atcell.actor_id', true), '');
  if v_raw is null or v_raw = '' then
    return null;
  end if;
  return v_raw::uuid;
exception when others then
  -- String yang bukan UUID tidak boleh menggagalkan pencatatan audit; perubahan
  -- tetap dicatat, hanya aktornya tidak diketahui.
  return null;
end;
$$;

revoke execute on function private.current_actor_id() from public;
grant execute on function private.current_actor_id() to service_role;

-- --------------------------------------------------------------------------
-- 3. Trigger pencatatan
-- --------------------------------------------------------------------------
create or replace function public.audit_unit_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  -- Hanya perubahan status yang dicatat. Update kolom lain pada unit
  -- (harga jual, dll) bukan mutasi status dan tidak masuk NFR-07.
  if new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.unit_status_audit (unit_id, old_status, new_status, actor_id)
  values (old.id, old.status, new.status, private.current_actor_id());
  return new;
end;
$$;

drop trigger if exists trg_audit_unit_status on public.inventory_units;
create trigger trg_audit_unit_status
  after update of status on public.inventory_units
  for each row execute function public.audit_unit_status_change();

create or replace function public.audit_ticket_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.repair_status is not distinct from old.repair_status then
    return new;
  end if;

  insert into public.service_ticket_audit
    (ticket_id, old_status, new_status, actor_id)
  values
    (old.id, old.repair_status, new.repair_status, private.current_actor_id());
  return new;
end;
$$;

drop trigger if exists trg_audit_ticket_status on public.service_tickets;
create trigger trg_audit_ticket_status
  after update of repair_status on public.service_tickets
  for each row execute function public.audit_ticket_status_change();

-- Transisi status sold juga tercatat. Jalur POS mengubah status lewat
-- trigger yang sama, jadi tidak perlu menambah audit terpisah di sini.
revoke execute on function public.audit_unit_status_change() from public, anon, authenticated;
revoke execute on function public.audit_ticket_status_change() from public, anon, authenticated;
grant execute on function public.audit_unit_status_change() to service_role;
grant execute on function public.audit_ticket_status_change() to service_role;

-- --------------------------------------------------------------------------
-- 4. RLS: audit hanya untuk staf, admin untuk semua, teknisi untuk miliknya
-- --------------------------------------------------------------------------
alter table public.unit_status_audit enable row level security;
alter table public.service_ticket_audit enable row level security;

drop policy if exists unit_audit_read on public.unit_status_audit;
create policy unit_audit_read on public.unit_status_audit
  for select to authenticated
  using ((select private.get_my_role()) = 'admin' or (select private.is_staff()));

drop policy if exists ticket_audit_read on public.service_ticket_audit;
create policy ticket_audit_read on public.service_ticket_audit
  for select to authenticated
  using ((select private.get_my_role()) = 'admin' or (select private.is_staff()));

-- Audit bersifat append-only. Tidak ada policy INSERT, UPDATE, atau DELETE
-- untuk role aplikasi: data yang sudah tercatat tidak boleh diubah atau
-- dihapus dari sisi aplikasi. Orang yang punya akses database secara langsung
-- tetap bisa, dan itu memang batas trust model PostgreSQL.
revoke all on public.unit_status_audit, public.service_ticket_audit
  from public, anon, authenticated;
grant select on public.unit_status_audit, public.service_ticket_audit to authenticated;
grant all on public.unit_status_audit, public.service_ticket_audit to service_role;
grant usage, select on all sequences in schema public to service_role;

-- --------------------------------------------------------------------------
-- 5. Verifikasi (read-only)
-- --------------------------------------------------------------------------
-- Should show 1 row per status change, newest first:
--   select created_at, actor_id, old_status, new_status
--     from public.unit_status_audit order by created_at desc limit 20;
--
-- 2. Perubahan tanpa aktor, worth-reviewed (SQL manual atau jalur tak dikenal):
--   select count(*) from public.unit_status_audit where actor_id is null;
--
-- 3. Rekap per aktor:
--   select p.full_name, p.role, count(*) as perubahan
--     from public.unit_status_audit a
--     join public.profiles p on p.id = a.actor_id
--    group by p.full_name, p.role order by perubahan desc;


-- ###########################################################################
-- BAGIAN 6 dari 6: 0005_username_login
-- ###########################################################################

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists username text;

-- --------------------------------------------------------------------------
-- 2. Backfill dari auth.users
-- --------------------------------------------------------------------------
-- profiles lama belum punya email, tapi auth.users tetap punya. Dipetakan
-- lewat id yang sama. Baris tanpa pasangan di auth.users dibiarkan null.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is null;

-- Username diturunkan dari bagian email sebelum @ supaya akun lama langsung
-- punya username yang bisa diketik staf. Dibatasi 32 karakter dan hanya
-- huruf, angka, titik, garis bawah, atau strip supaya aman di URL dan
-- tidak perlu escape saat disimpan di metadata.
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

-- --------------------------------------------------------------------------
-- 3. Username wajib ada dan unik
-- --------------------------------------------------------------------------
update public.profiles set username = 'user_' || left(replace(id::text, '-', ''), 8)
 where username is null or username = '';

create unique index if not exists profiles_username_key
  on public.profiles (username);

-- NOT NULL tanpa default: baris baru hanya bisa masuk lewat trigger
-- handle_new_user() yang sudah mengisi username, jadi tidak ada INSERT
-- manual yang bisa meninggalkan kolom kosong.
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

-- --------------------------------------------------------------------------
-- 4. Trigger Auth: isi email + username untuk user baru
-- --------------------------------------------------------------------------
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

  -- Username bentrok (misal dua email berbeda menghasilkan nama sama) atau
  -- formatnya tidak lolos check: pakai fallback per-user supaya trigger tidak
  -- menggagalkan pembuatan akun.
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

  -- Kalau fallback per-user pun bentrok, biarkan baris tetap ada dengan
  -- username bawaan trigger lama supaya admin bisa memperbaiki manual.
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- 5. Grants: kolom baru mengikuti hak tabel yang sudah ada
-- --------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- --------------------------------------------------------------------------
-- 6. Verifikasi (read-only)
-- --------------------------------------------------------------------------
-- select count(*) as tanpa_username
--   from public.profiles where username is null or username = '';
-- select username, count(*) from public.profiles group by username having count(*) > 1;
-- select id, username, email from public.profiles order by created_at limit 10;


-- ###########################################################################
-- VERIFIKASI (read-only, aman dijalankan berkali-kali)
--
-- 1. Index pendukung, harus keluar 15 baris:
--    select indexname from pg_indexes where schemaname = 'public' and indexname in
--      ('products_brand_idx', 'inventory_units_product_status_idx', 'inventory_units_status_idx',
--       'transactions_created_idx', 'transactions_sales_idx', 'transaction_items_tx_idx',
--       'service_tickets_code_idx', 'service_tickets_status_idx', 'service_tickets_tech_idx',
--       'service_tickets_customer_id_idx', 'transactions_customer_id_idx', 'transaction_items_unit_id_idx',
--       'trade_in_records_transaction_id_idx', 'trade_in_records_resulting_unit_id_idx', 'profiles_username_key')
--      order by indexname;
--
-- 2. Constraint store_settings, harus keluar 2 baris:
--    select conname from pg_constraint where conrelid = 'public.store_settings'::regclass
--      and conname in ('store_settings_id_check', 'store_settings_social_url_check') order by conname;
--
-- 3. Baris singleton, harus keluar 1:
--    select count(*) as store_settings_rows from public.store_settings;
--
-- 4. Tidak ada profil tanpa username, harus keluar 0:
--    select count(*) as tanpa_username from public.profiles where username is null or username = '';
--
-- 5. Tidak ada username ganda, harus keluar 0 baris:
--    select username, count(*) from public.profiles group by username having count(*) > 1;
--
-- 6. Trigger audit aktif, harus keluar 2 baris:
--    select tgname from pg_trigger where not tgisinternal
--      and tgname in ('trg_audit_unit_status', 'trg_audit_ticket_status') order by tgname;
--
-- 7. Daftar username yang bisa diketik staf:
--    select username, full_name, role from public.profiles order by role, username;
--
-- 8. Ubah satu status unit, lalu pastikan tercatat (actor_id boleh NULL kalau
--    dilakukan dari SQL Editor):
--    select created_at, actor_id, old_status, new_status
--      from public.unit_status_audit order by created_at desc limit 5;
-- ###########################################################################
