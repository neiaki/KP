-- ============================================================================
-- File gabungan untuk Supabase SQL Editor
--
-- Isi: SELURUH migrasi At Cell, 26 bagian, dari database kosong.
-- Urutannya mengikuti ketergantungan antar bagian, bukan hanya nomor file.
-- Menyalin file ini ke project Supabase yang benar-benar kosong sudah cukup:
-- bagian 1 (0001) yang membuat tabel, enum, RLS, view, trigger, dan bucket
-- Storage, jadi tidak ada satu langkah pun yang harus dijalankan sebelumnya.
--
-- STATUS untuk project At Cell yang sekarang: SEMUA bagian di bawah ini SUDAH
-- TERJALAN (diverifikasi 27 Sep 2026), jadi file ini tidak perlu di-paste lagi
-- ke project itu. Yang membutuhkannya hanya project yang belum ter-provision:
-- akun Supabase baru, staging terpisah, atau database yang di-reset dari nol.
--
-- DAFTAR BAGIAN, sesuai urutan di file ini:
--   1  0001_atcell_schema                            tabel, enum, RLS, trigger, view, Storage, seed
--   2  0002_harden_atcell_schema                     helper private, view security_invoker, grants
--   3  0003_lock_legacy_helpers                      kunci helper legacy di schema public
--   4  0004_align_schema_contract                    FK cascade, index performa, singleton store_settings
--   5  20260926025406_index_public_foreign_keys      index untuk foreign key yang belum punya index pendahulu
--   6  20260926103000_strengthen_ticket_codes        kode resi 8 karakter base32, kode lama tetap berlaku
--   7  0006_store_social_urls                        URL sosmed resmi toko, diisi Admin lewat portal/settings
--   8  0007_audit_trail                              audit trail unit + tiket servis (NFR-07), ditulis trigger database
--   9  0005_username_login                           kolom email + username, trigger profil, login portal pakai username
--   10 20260927130000_product_image_registry         registry gambar produk + bucket Storage product-images
--   11 20260927120000_auto_enable_rls_on_new_tables  jaring pengaman RLS untuk tabel baru di schema public
--   12 20260927140000_store_owner_and_real_contact   kolom owner_name + kontak asli toko
--   13 20260927150000_revoke_anon_write_on_product_images cabut hak tulis anon di product_images
--   14 20260927160000_harden_storage_access           bucket foto privat, storage_public_read hanya untuk katalog
--   15 20260927170000_demo_ticket_for_tracking_example tiket contoh supaya halaman lacak berfungsi
--   16 20260927180000_nullable_inventory_unit_product product_id nullable untuk unit trade-in
--   17 20260927190000_close_browser_role_write_grants  tutup hak tulis browser + default privileges
--  18 20260927200000_remove_ocean_photo_from_reno11_gallery keluarkan foto laut dari galeri resmi Oppo Reno 11
--  19 20260927201000_clear_unparseable_product_image_url bersihkan image_url produk yang bukan alamat foto
--  20 20260927202000_trim_crop_duplicate_a55_photos     pangkas foto Galaxy A55 yang saling potongan
--  21 20260930100000_catalogue_apple_iphone_15_pro      katalog Apple iPhone 15 Pro, tanpa unit
--  22 20260930101000_catalogue_samsung_galaxy_s24_ultra katalog Samsung Galaxy S24 Ultra, tanpa unit
--  23 20260930102000_catalogue_xiaomi_14                katalog Xiaomi 14, tanpa unit
--  24 20260930103000_catalogue_vivo_v30                 katalog Vivo V30, tanpa unit
--  25 20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9 katalog iPhone 14 Plus lalu tautkan unit trade-in id 9
--  26 20261001120000_hide_unidentified_product_6       sembunyikan produk yang brand dan modelnya bertentangan
--
-- CATATAN soal tabel schema_migrations: project ini tidak memakai Supabase CLI
-- untuk menjalankan migrasi, dan repo ini tidak punya supabase/config.toml.
-- Tabel supabase_migrations.schema_migrations karena itu bukan catatan resmi
-- dan tidak boleh dipakai untuk menyimpulkan status migrasi. Yang otoritatif
-- adalah daftar file di supabase/migrations/ dan file ini. Beberapa migrasi
-- sengaja dijalankan lewat psql dan tidak tercatat di ledger itu.
--
-- ATURAN: seluruh bagian di bawah idempoten dan tidak menghapus data. Aman
-- dijalankan berulang. SQL Editor membungkus semua Run dalam satu transaction,
-- jadi kalau satu bagian gagal semuanya batal. Jalankan per bagian kalau
-- ingin tahu bagian mana yang bermasalah.
--
-- CATATAN untuk bagian audit trail: actor_id hanya terisi kalau Server Action
-- menulisnya di transaction yang sama dengan UPDATE-nya. Perubahan lewat SQL
-- Editor manual tercatat dengan actor_id NULL. Itu bukan bug, justru sinyal
-- perubahan yang perlu ditinjau.
--
-- SETELAH DIJALANKAN, cek hasilnya dengan query di bagian paling bawah file ini.
-- tests/audit-trail-db.test.ts menguji bagian audit trail ini langsung ke
-- database, tapi hanya jalan kalau DATABASE_URL diisi:
--   set -a; . ./.env; set +a && npm test
-- ============================================================================

-- ###########################################################################
-- BAGIAN 1 dari 26: 0001_atcell_schema
-- ###########################################################################

do $$ begin create type user_role as enum ('admin','sales','technician','customer');
exception when duplicate_object then null; end $$;

do $$ begin create type unit_condition as enum ('new','second');
exception when duplicate_object then null; end $$;

do $$ begin create type unit_status as enum ('available','reserved','sold','in_service','returned');
exception when duplicate_object then null; end $$;

do $$ begin create type repair_status as enum
  ('received','diagnosing','waiting_approval','in_progress','testing','completed','picked_up','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type payment_method as enum ('cash','transfer','qris','debit','credit');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- 2. TABEL
-- --------------------------------------------------------------------------

-- Profil pengguna, 1:1 dengan auth.users (dibuat via trigger otomatis, Bab 2 RBAC)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'customer',
  phone_number text not null default '',
  created_at timestamptz not null default now()
);

-- Singleton konten publik toko (FR-D-02). Hanya boleh ada id = 1.
create table if not exists public.store_settings (
  id int primary key check (id = 1),
  store_name text not null default 'At Cell',
  description_id text not null default '',
  description_en text not null default '',
  address text not null default '',
  latitude numeric,
  longitude numeric,
  maps_url text,
  phone_number text not null default '',
  whatsapp_number text,
  opening_hours jsonb not null default '{"monday_friday":"09:00 - 21:00","saturday_sunday":"10:00 - 22:00"}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Master katalog produk, eksklusif dikelola Admin (FR-D-04 / Bab 7 RLS)
create table if not exists public.products (
  id bigint generated always as identity primary key,
  brand text not null,
  model_name text not null,
  specs text not null default '',
  default_price numeric not null default 0 check (default_price >= 0),
  image_url text not null default '',
  official_images text[] not null default '{}',
  second_images text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists products_brand_idx on public.products (brand) where is_active;

-- Unit fisik per IMEI (FR-A-01: tepat 15 digit angka + UNIQUE)
create table if not exists public.inventory_units (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products(id) on delete restrict,
  imei text not null unique check (imei ~ '^\d{15}$'),
  condition unit_condition not null,
  status unit_status not null default 'available',
  purchase_cost numeric not null default 0 check (purchase_cost >= 0),
  selling_price numeric not null default 0 check (selling_price >= 0),
  created_at timestamptz not null default now()
);
create index if not exists inventory_units_product_status_idx
  on public.inventory_units (product_id, status);
create index if not exists inventory_units_status_idx on public.inventory_units (status);

-- Induk transaksi kasir. customer_id nullable untuk walk-in (PRD Bab 7 poin 3).
create table if not exists public.transactions (
  id bigint generated always as identity primary key,
  invoice_number text unique,
  sales_id uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_phone text not null default '',
  total_amount numeric not null default 0 check (total_amount >= 0),
  trade_in_deduction numeric not null default 0 check (trade_in_deduction >= 0),
  final_payment numeric not null default 0 check (final_payment >= 0),
  payment_method payment_method not null,
  created_at timestamptz not null default now()
);
create index if not exists transactions_created_idx on public.transactions (created_at desc);
create index if not exists transactions_sales_idx on public.transactions (sales_id);

create table if not exists public.transaction_items (
  id bigint generated always as identity primary key,
  transaction_id bigint not null references public.transactions(id) on delete cascade,
  unit_id bigint not null references public.inventory_units(id) on delete restrict,
  unit_price numeric not null default 0 check (unit_price >= 0),
  warranty_duration_months int not null default 3 check (warranty_duration_months >= 0)
);
create index if not exists transaction_items_tx_idx on public.transaction_items (transaction_id);

-- Hasil grading trade-in, menaut ke unit second hasil registrasi (FR-C-04)
create table if not exists public.trade_in_records (
  id bigint generated always as identity primary key,
  transaction_id bigint references public.transactions(id) on delete set null,
  resulting_unit_id bigint references public.inventory_units(id) on delete set null,
  original_brand_model text not null,
  imei text not null check (imei ~ '^\d{15}$'),
  grading_details jsonb not null default '{}'::jsonb,
  photo_urls jsonb not null default '[]'::jsonb,
  offered_price numeric not null default 0 check (offered_price >= 0),
  created_at timestamptz not null default now()
);

-- Tiket servis. customer_id nullable untuk walk-in.
create table if not exists public.service_tickets (
  id bigint generated always as identity primary key,
  ticket_code text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  technician_id uuid references public.profiles(id) on delete set null,
  customer_name text not null,
  customer_phone text not null default '',
  device_model text not null,
  device_name text,
  imei_or_sn text not null default '',
  issue_notes text not null default '',
  problem_description text,
  technician_notes text,
  repair_status repair_status not null default 'received',
  photo_urls jsonb not null default '[]'::jsonb,
  sparepart_fee numeric not null default 0 check (sparepart_fee >= 0),
  labor_fee numeric not null default 0 check (labor_fee >= 0),
  total_fee numeric not null default 0 check (total_fee >= 0),
  warranty_days int not null default 30 check (warranty_days >= 0),
  cost_breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_tickets_code_idx on public.service_tickets (ticket_code);
create index if not exists service_tickets_status_idx on public.service_tickets (repair_status);
create index if not exists service_tickets_tech_idx on public.service_tickets (technician_id);

-- --------------------------------------------------------------------------
-- 3. AUTO-PROFILE + AUTO-TICKET-CODE (PRD Bab 7: atomik, anti race-condition)
-- --------------------------------------------------------------------------

-- Setiap user Auth baru otomatis dapat baris profile (role default customer).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, phone_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    'customer',
    coalesce(new.raw_user_meta_data->>'phone_number', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Kode tiket SRV-YYYYMMDD-XXXX anti-tabrakan walau dibuat bersamaan.
create or replace function public.generate_ticket_code()
returns trigger language plpgsql as $$
declare d text := to_char(now(), 'YYYYMMDD'); candidate text;
begin
  if new.ticket_code is not null and new.ticket_code <> '' then return new; end if;
  -- Serialisasi generator per hari. Unique index tetap menjadi jaring
  -- pengaman terakhir, tetapi request paralel tidak saling memilih kode
  -- yang sama sebelum transaksi pertama commit.
  perform pg_advisory_xact_lock(hashtextextended('atcell-ticket-' || d, 0));
  loop
    candidate := 'SRV-' || d || '-' || lpad(floor(random()*9000+1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.service_tickets where ticket_code = candidate);
  end loop;
  new.ticket_code := candidate;
  return new;
end $$;
drop trigger if exists trg_ticket_code on public.service_tickets;
create trigger trg_ticket_code
  before insert on public.service_tickets for each row execute function public.generate_ticket_code();

-- Nomor nota otomatis INV-YYYYMMDD-XXXXXX bila tidak diisi aplikasi.
create or replace function public.generate_invoice_number()
returns trigger language plpgsql as $$
declare d text := to_char(now(), 'YYYYMMDD'); candidate text;
begin
  if new.invoice_number is not null and new.invoice_number <> '' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('atcell-invoice-' || d, 0));
  loop
    candidate := 'INV-' || d || '-'
      || lpad(floor(random()*900000+100000)::int::text, 6, '0');
    exit when not exists (select 1 from public.transactions where invoice_number = candidate);
  end loop;
  new.invoice_number := candidate;
  return new;
end $$;
drop trigger if exists trg_invoice_number on public.transactions;
create trigger trg_invoice_number
  before insert on public.transactions for each row execute function public.generate_invoice_number();

-- updated_at otomatis untuk store_settings & service_tickets
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_tickets_touch on public.service_tickets;
create trigger trg_tickets_touch
  before update on public.service_tickets for each row execute function public.touch_updated_at();
drop trigger if exists trg_settings_touch on public.store_settings;
create trigger trg_settings_touch
  before update on public.store_settings for each row execute function public.touch_updated_at();

-- Penjaga transisi di database juga mencegah path selain Server Action
-- menyimpan status servis yang melompati alur resmi.
create or replace function public.validate_service_ticket_transition()
returns trigger language plpgsql as $$
begin
  if new.repair_status = old.repair_status then return new; end if;
  if not (
    (old.repair_status = 'received' and new.repair_status in ('diagnosing', 'cancelled')) or
    (old.repair_status = 'diagnosing' and new.repair_status in ('waiting_approval', 'cancelled')) or
    (old.repair_status = 'waiting_approval' and new.repair_status in ('in_progress', 'cancelled')) or
    (old.repair_status = 'in_progress' and new.repair_status in ('testing', 'cancelled')) or
    (old.repair_status = 'testing' and new.repair_status in ('completed', 'in_progress', 'cancelled')) or
    (old.repair_status = 'completed' and new.repair_status = 'picked_up')
  ) then
    raise exception 'INVALID_REPAIR_TRANSITION';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_ticket_transition on public.service_tickets;
create trigger trg_validate_ticket_transition
  before update of repair_status on public.service_tickets
  for each row execute function public.validate_service_ticket_transition();

-- Status sold adalah terminal. POS tetap satu-satunya jalur aplikasi yang
-- boleh masuk ke status ini, sementara trigger mencegah pengembalian unit.
create or replace function public.prevent_sold_reactivation()
returns trigger language plpgsql as $$
begin
  if old.status = 'sold' and new.status <> 'sold' then
    raise exception 'SOLD_IS_TERMINAL';
  end if;
  return new;
end $$;
drop trigger if exists trg_prevent_sold_reactivation on public.inventory_units;
create trigger trg_prevent_sold_reactivation
  before update of status on public.inventory_units
  for each row execute function public.prevent_sold_reactivation();

-- --------------------------------------------------------------------------
-- 4. RPC ATOMIK TRADE-IN (PRD Bab 5 & 7: gagal sebagian = rollback total)
-- Fungsi ini dipertahankan sebagai kontrak SQL untuk integrasi internal.
-- Server Action POS saat ini memakai transaksi Drizzle yang setara.
-- --------------------------------------------------------------------------
create or replace function public.process_trade_in_sale(
  p_sales_id uuid,
  p_unit_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method payment_method,
  p_warranty_months int,
  p_trade_brand_model text default null,
  p_trade_imei text default null,
  p_trade_grading jsonb default '{}'::jsonb,
  p_trade_photo_urls jsonb default '[]'::jsonb,
  p_trade_price numeric default 0
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_price numeric; v_tx_id bigint; v_new_unit_id bigint;
begin
  -- Pemanggilan dari browser hanya boleh oleh admin/sales. Service role
  -- internal tetap dapat memakai fungsi ini tanpa JWT pengguna.
  if auth.uid() is not null
     and public.get_my_role() not in ('admin', 'sales') then
    raise exception 'FORBIDDEN';
  end if;
  if auth.uid() is not null and p_sales_id <> auth.uid() then
    raise exception 'FORBIDDEN';
  end if;

  -- Kunci baris unit agar tidak bisa double-sell (anti race-condition POS)
  select selling_price into v_price from public.inventory_units
   where id = p_unit_id and status = 'available' for update;
  if not found then
    raise exception 'UNIT_NOT_AVAILABLE';
  end if;

  insert into public.transactions
    (sales_id, customer_name, customer_phone, total_amount, trade_in_deduction, final_payment, payment_method)
  values
    (p_sales_id, p_customer_name, coalesce(p_customer_phone,''), v_price,
     greatest(p_trade_price,0), greatest(v_price - greatest(p_trade_price,0),0), p_payment_method)
  returning id into v_tx_id;

  insert into public.transaction_items (transaction_id, unit_id, unit_price, warranty_duration_months)
  values (v_tx_id, p_unit_id, v_price, greatest(p_warranty_months,0));

  update public.inventory_units set status = 'sold' where id = p_unit_id;

  -- Unit lama pelanggan langsung jadi stok second siap jual (FR-C-04)
  if p_trade_imei is not null and p_trade_imei <> '' then
    if p_trade_imei !~ '^\d{15}$' then raise exception 'INVALID_TRADE_IMEI'; end if;
    insert into public.inventory_units (product_id, imei, condition, status, purchase_cost, selling_price)
    select product_id, p_trade_imei, 'second', 'available',
           greatest(p_trade_price,0), round(greatest(p_trade_price,0) * 1.25)
      from public.inventory_units where id = p_unit_id
    returning id into v_new_unit_id;

    insert into public.trade_in_records
      (transaction_id, resulting_unit_id, original_brand_model, imei, grading_details, photo_urls, offered_price)
    values
      (v_tx_id, v_new_unit_id, coalesce(p_trade_brand_model,'Unit trade-in'), p_trade_imei,
       coalesce(p_trade_grading,'{}'::jsonb), coalesce(p_trade_photo_urls,'[]'::jsonb), greatest(p_trade_price,0));
  end if;

  return v_tx_id;
exception when unique_violation then raise exception 'DUPLICATE_IMEI';
end $$;

-- Fungsi ini hanya untuk internal/otomasi terisolasi. Server Action saat ini
-- memakai transaksi Drizzle secara langsung, jadi jangan expose RPC ke anon
-- atauAuthenticated user melalui Data API.
revoke execute on function public.process_trade_in_sale(
  uuid, bigint, text, text, payment_method, integer,
  text, text, jsonb, jsonb, numeric
) from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- 5. VIEW PUBLIK (PRD Bab 7 poin 4: sembunyikan purchase_cost dari anon)
-- View ini sengaja memakai projection aman, bukan SELECT * dari unit.
-- Jangan menambahkan purchase_cost, customer data, atau kolom internal.
-- --------------------------------------------------------------------------
create or replace view public.v_public_inventory as
select p.brand, p.model_name, p.specs, p.image_url, p.official_images, p.second_images,
       u.condition, u.selling_price, u.created_at as unit_created_at, p.id as product_id,
       u.id as unit_id, right(u.imei, 4) as imei_tail
  from public.inventory_units u
  join public.products p on p.id = u.product_id
 where u.status = 'available' and p.is_active;

-- --------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.inventory_units enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.trade_in_records enable row level security;
alter table public.service_tickets enable row level security;

-- Helper: peran user saat ini (dibaca dari tabel profiles, bukan JWT)
create or replace function public.get_my_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.get_my_role() in ('admin','sales','technician'), false);
$$;

-- Helper hanya dipakai oleh policy. Tutup default EXECUTE PUBLIC.
--
-- PENTING: JANGAN pernah memberi EXECUTE public.get_my_role() atau
-- public.is_staff() ke anon/authenticated. Keduanya SECURITY DEFINER, jadi
-- grant ke browser role di sini membuka privilege escalation lewat Data API.
-- Status akhir yang benar dibuat 0002 lalu dikunci 0003: hanya postgres dan
-- service_role boleh memanggilnya, dan 0003 mencabutnya dari public, anon,
-- dan authenticated. Grant browser role sengaja tidak ada di berkas ini
-- supaya 0001 aman di-replay: menjalankan ulang berkas ini tidak lagi
-- membuka kembali dua helper itu ke publik.
revoke execute on function public.get_my_role() from public;
revoke execute on function public.is_staff() from public;

-- profiles: user boleh baca dirinya; staf boleh baca semua; admin kelola semua.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- store_settings: publik boleh baca; tulis hanya admin.
drop policy if exists settings_public_read on public.store_settings;
create policy settings_public_read on public.store_settings for select to anon, authenticated
  using (true);
drop policy if exists settings_admin_write on public.store_settings;
create policy settings_admin_write on public.store_settings for all to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- products: publik baca yang aktif; tulis hanya admin.
drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated
  using (is_active or public.is_staff());
drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products for all to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

-- inventory_units: hanya staf (anon TIDAK boleh; etalase lewat view).
drop policy if exists units_staff on public.inventory_units;
create policy units_staff on public.inventory_units for select to authenticated
  using (public.is_staff());
drop policy if exists units_staff_insert on public.inventory_units;
create policy units_staff_insert on public.inventory_units for insert to authenticated
  with check (public.get_my_role() in ('admin','sales'));
drop policy if exists units_staff_update on public.inventory_units;
create policy units_staff_update on public.inventory_units for update to authenticated
  using (public.get_my_role() in ('admin','sales'))
  with check (public.get_my_role() in ('admin','sales'));
drop policy if exists units_staff_delete on public.inventory_units;
create policy units_staff_delete on public.inventory_units for delete to authenticated
  using (public.get_my_role() = 'admin');

-- transactions + items + trade_in: staf baca; customer baca miliknya.
drop policy if exists tx_read on public.transactions;
create policy tx_read on public.transactions for select to authenticated
  using (public.is_staff() or customer_id = auth.uid());
drop policy if exists tx_staff_write on public.transactions;
create policy tx_staff_write on public.transactions for insert to authenticated
  with check (public.get_my_role() in ('admin','sales'));
drop policy if exists tx_admin_update on public.transactions;
create policy tx_admin_update on public.transactions for update to authenticated
  using (public.get_my_role() = 'admin') with check (public.get_my_role() = 'admin');

drop policy if exists tx_items_read on public.transaction_items;
create policy tx_items_read on public.transaction_items for select to authenticated
  using (public.is_staff() or exists
    (select 1 from public.transactions t where t.id = transaction_id and t.customer_id = auth.uid()));
drop policy if exists tx_items_staff_write on public.transaction_items;
create policy tx_items_staff_write on public.transaction_items for insert to authenticated
  with check (public.get_my_role() in ('admin','sales'));

drop policy if exists tradein_read on public.trade_in_records;
create policy tradein_read on public.trade_in_records for select to authenticated
  using (public.is_staff());
drop policy if exists tradein_staff_write on public.trade_in_records;
create policy tradein_staff_write on public.trade_in_records for insert to authenticated
  with check (public.get_my_role() in ('admin','sales'));

-- service_tickets: teknisi/sales/admin kelola; customer baca miliknya.
-- Tracking publik TANPA login dieksekusi via Server Action (service role,
-- kolom aman saja) — lihat src/lib/actions/service.ts — bukan via RLS anon.
drop policy if exists tickets_read on public.service_tickets;
create policy tickets_read on public.service_tickets for select to authenticated
  using (public.is_staff() or customer_id = auth.uid());
drop policy if exists tickets_staff_write on public.service_tickets;
create policy tickets_staff_write on public.service_tickets for insert to authenticated
  with check (public.is_staff());
drop policy if exists tickets_staff_update on public.service_tickets;
create policy tickets_staff_update on public.service_tickets for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists tickets_staff_delete on public.service_tickets;
create policy tickets_staff_delete on public.service_tickets for delete to authenticated
  using (public.get_my_role() = 'admin');

-- Data API grants. RLS tetap menjadi pengaman utama; grant ini hanya
-- memberi hak akses minimum agar PostgREST tidak mengembalikan permission
-- denied pada project baru yang setting exposure-nya belum/default disabled.
revoke all on public.profiles, public.store_settings, public.products,
  public.inventory_units, public.transactions, public.transaction_items,
  public.trade_in_records, public.service_tickets,
  public.v_public_inventory from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
-- Browser hanya membaca data melalui RLS. Semua mutasi bisnis dilakukan
-- Server Action dengan koneksi DB server-side, sehingga role Data API tidak
-- perlu hak INSERT/UPDATE/DELETE.
grant select on public.store_settings, public.products to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.inventory_units to authenticated;
grant select on public.transactions, public.transaction_items,
  public.trade_in_records, public.service_tickets to authenticated;
grant all on public.profiles, public.store_settings, public.products,
  public.inventory_units, public.transactions, public.transaction_items,
  public.trade_in_records, public.service_tickets,
  public.v_public_inventory to service_role;
grant usage, select, update on all sequences in schema public to service_role;

-- View publik untuk anon (etalase ready-stock, tanpa purchase_cost)
grant select on public.v_public_inventory to anon, authenticated;

-- --------------------------------------------------------------------------
-- 7. STORAGE BUCKETS (PRD Bab 7 poin 5)
-- --------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('trade-in-photos','trade-in-photos', true),
       ('service-photos','service-photos', true)
on conflict (id) do nothing;

-- Baca publik; tulis hanya staf login (upload asli lewat Server Action).
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects for select to anon, authenticated
  using (bucket_id in ('trade-in-photos','service-photos'));
drop policy if exists storage_staff_write on storage.objects;
create policy storage_staff_write on storage.objects for insert to authenticated
  with check (bucket_id in ('trade-in-photos','service-photos')
              and public.is_staff());
drop policy if exists storage_staff_update on storage.objects;
create policy storage_staff_update on storage.objects for update to authenticated
  using (bucket_id in ('trade-in-photos','service-photos')
         and public.is_staff())
  with check (bucket_id in ('trade-in-photos','service-photos')
              and public.is_staff());
drop policy if exists storage_staff_delete on storage.objects;
create policy storage_staff_delete on storage.objects for delete to authenticated
  using (bucket_id in ('trade-in-photos','service-photos')
         and public.is_staff());

-- --------------------------------------------------------------------------
-- 8. SEED: baris singleton store_settings (id = 1)
-- --------------------------------------------------------------------------
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
-- BAGIAN 2 dari 26: 0002_harden_atcell_schema
-- ###########################################################################

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.get_my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(private.get_my_role() in ('admin', 'sales', 'technician'), false);
$$;

revoke execute on function private.get_my_role() from public;
revoke execute on function private.is_staff() from public;
grant execute on function private.get_my_role() to anon, authenticated, service_role;
grant execute on function private.is_staff() to anon, authenticated, service_role;

-- Helper lama di public tidak boleh dipanggil langsung lewat Data API.
-- Policy selanjutnya memakai private.get_my_role() dan private.is_staff().
revoke execute on function public.get_my_role() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
grant execute on function public.get_my_role() to service_role;
grant execute on function public.is_staff() to service_role;

-- --------------------------------------------------------------------------
-- 2. Fungsi trigger dan helper internal
-- --------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role, phone_number)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Pengguna'
    ),
    'customer',
    coalesce(new.raw_user_meta_data->>'phone_number', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.generate_ticket_code()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  d text := to_char(now(), 'YYYYMMDD');
  candidate text;
begin
  if new.ticket_code is not null and new.ticket_code <> '' then
    return new;
  end if;

  -- Serialisasi generator per hari tetap, dan unique index menjadi jaring pengaman.
  perform pg_advisory_xact_lock(hashtextextended('atcell-ticket-' || d, 0));
  loop
    candidate := 'SRV-' || d || '-' ||
      lpad(floor(random() * 9000 + 1000)::int::text, 4, '0');
    exit when not exists (
      select 1 from public.service_tickets where ticket_code = candidate
    );
  end loop;
  new.ticket_code := candidate;
  return new;
end;
$$;

create or replace function public.generate_invoice_number()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  d text := to_char(now(), 'YYYYMMDD');
  candidate text;
begin
  if new.invoice_number is not null and new.invoice_number <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('atcell-invoice-' || d, 0));
  loop
    candidate := 'INV-' || d || '-' ||
      lpad(floor(random() * 900000 + 100000)::int::text, 6, '0');
    exit when not exists (
      select 1 from public.transactions where invoice_number = candidate
    );
  end loop;
  new.invoice_number := candidate;
  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_service_ticket_transition()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if new.repair_status = old.repair_status then
    return new;
  end if;

  if not (
    (old.repair_status = 'received' and new.repair_status in ('diagnosing', 'cancelled')) or
    (old.repair_status = 'diagnosing' and new.repair_status in ('waiting_approval', 'cancelled')) or
    (old.repair_status = 'waiting_approval' and new.repair_status in ('in_progress', 'cancelled')) or
    (old.repair_status = 'in_progress' and new.repair_status in ('testing', 'cancelled')) or
    (old.repair_status = 'testing' and new.repair_status in ('completed', 'in_progress', 'cancelled')) or
    (old.repair_status = 'completed' and new.repair_status = 'picked_up')
  ) then
    raise exception 'INVALID_REPAIR_TRANSITION';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_sold_reactivation()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if old.status = 'sold' and new.status <> 'sold' then
    raise exception 'SOLD_IS_TERMINAL';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_ticket_code on public.service_tickets;
create trigger trg_ticket_code
  before insert on public.service_tickets
  for each row execute function public.generate_ticket_code();

drop trigger if exists trg_invoice_number on public.transactions;
create trigger trg_invoice_number
  before insert on public.transactions
  for each row execute function public.generate_invoice_number();

drop trigger if exists trg_tickets_touch on public.service_tickets;
create trigger trg_tickets_touch
  before update on public.service_tickets
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_settings_touch on public.store_settings;
create trigger trg_settings_touch
  before update on public.store_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_validate_ticket_transition on public.service_tickets;
create trigger trg_validate_ticket_transition
  before update of repair_status on public.service_tickets
  for each row execute function public.validate_service_ticket_transition();

drop trigger if exists trg_prevent_sold_reactivation on public.inventory_units;
create trigger trg_prevent_sold_reactivation
  before update of status on public.inventory_units
  for each row execute function public.prevent_sold_reactivation();

-- --------------------------------------------------------------------------
-- 3. RPC internal trade-in
-- --------------------------------------------------------------------------
create or replace function public.process_trade_in_sale(
  p_sales_id uuid,
  p_unit_id bigint,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method public.payment_method,
  p_warranty_months int,
  p_trade_brand_model text default null,
  p_trade_imei text default null,
  p_trade_grading jsonb default '{}'::jsonb,
  p_trade_photo_urls jsonb default '[]'::jsonb,
  p_trade_price numeric default 0
)
returns bigint
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_price numeric;
  v_tx_id bigint;
  v_new_unit_id bigint;
begin
  -- RPC hanya untuk service role. Bila dipanggil dengan JWT pengguna,
  -- hanya admin/sales yang boleh mengoperasikannya.
  if auth.uid() is not null then
    if (select private.get_my_role()) not in ('admin', 'sales') then
      raise exception 'FORBIDDEN';
    end if;
    if p_sales_id <> (select auth.uid()) then
      raise exception 'FORBIDDEN';
    end if;
  end if;

  select selling_price into v_price
    from public.inventory_units
   where id = p_unit_id and status = 'available'
   for update;
  if not found then
    raise exception 'UNIT_NOT_AVAILABLE';
  end if;

  insert into public.transactions
    (sales_id, customer_name, customer_phone, total_amount,
     trade_in_deduction, final_payment, payment_method)
  values
    (p_sales_id, p_customer_name, coalesce(p_customer_phone, ''), v_price,
     greatest(p_trade_price, 0),
     greatest(v_price - greatest(p_trade_price, 0), 0),
     p_payment_method)
  returning id into v_tx_id;

  insert into public.transaction_items
    (transaction_id, unit_id, unit_price, warranty_duration_months)
  values (v_tx_id, p_unit_id, v_price, greatest(p_warranty_months, 0));

  update public.inventory_units
     set status = 'sold'
   where id = p_unit_id;

  if p_trade_imei is not null and p_trade_imei <> '' then
    if p_trade_imei !~ '^\d{15}$' then
      raise exception 'INVALID_TRADE_IMEI';
    end if;

    insert into public.inventory_units
      (product_id, imei, condition, status, purchase_cost, selling_price)
    select product_id, p_trade_imei, 'second', 'available',
           greatest(p_trade_price, 0),
           round(greatest(p_trade_price, 0) * 1.25)
      from public.inventory_units
     where id = p_unit_id
    returning id into v_new_unit_id;

    insert into public.trade_in_records
      (transaction_id, resulting_unit_id, original_brand_model, imei,
       grading_details, photo_urls, offered_price)
    values
      (v_tx_id, v_new_unit_id, coalesce(p_trade_brand_model, 'Unit trade-in'),
       p_trade_imei, coalesce(p_trade_grading, '{}'::jsonb),
       coalesce(p_trade_photo_urls, '[]'::jsonb), greatest(p_trade_price, 0));
  end if;

  return v_tx_id;
exception
  when unique_violation then raise exception 'DUPLICATE_IMEI';
end;
$$;

revoke execute on function public.process_trade_in_sale(
  uuid, bigint, text, text, public.payment_method, integer,
  text, text, jsonb, jsonb, numeric
) from public, anon, authenticated;
grant execute on function public.process_trade_in_sale(
  uuid, bigint, text, text, public.payment_method, integer,
  text, text, jsonb, jsonb, numeric
) to service_role;

-- Fungsi trigger tidak perlu dapat dipanggil langsung oleh browser.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.generate_ticket_code() from public, anon, authenticated;
revoke execute on function public.generate_invoice_number() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.validate_service_ticket_transition() from public, anon, authenticated;
revoke execute on function public.prevent_sold_reactivation() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.generate_ticket_code() to service_role;
grant execute on function public.generate_invoice_number() to service_role;
grant execute on function public.touch_updated_at() to service_role;
grant execute on function public.validate_service_ticket_transition() to service_role;
grant execute on function public.prevent_sold_reactivation() to service_role;

-- --------------------------------------------------------------------------
-- 4. View katalog publik
-- --------------------------------------------------------------------------
-- View ini hanya dipakai oleh Server Action. security_invoker mencegah view
-- memakai hak owner untuk melewati RLS tabel dasar.
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
 where u.status = 'available'
   and p.is_active;

revoke all on public.v_public_inventory from public, anon, authenticated;
grant select on public.v_public_inventory to service_role;

-- --------------------------------------------------------------------------
-- 5. RLS policies
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.inventory_units enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_items enable row level security;
alter table public.trade_in_records enable row level security;
alter table public.service_tickets enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()));

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using ((select private.get_my_role()) = 'admin')
  with check ((select private.get_my_role()) = 'admin');

drop policy if exists settings_public_read on public.store_settings;
create policy settings_public_read on public.store_settings
  for select to anon, authenticated
  using (true);

drop policy if exists settings_admin_write on public.store_settings;
create policy settings_admin_write on public.store_settings
  for all to authenticated
  using ((select private.get_my_role()) = 'admin')
  with check ((select private.get_my_role()) = 'admin');

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_active or (select private.is_staff()));

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all to authenticated
  using ((select private.get_my_role()) = 'admin')
  with check ((select private.get_my_role()) = 'admin');

drop policy if exists units_staff on public.inventory_units;
create policy units_staff on public.inventory_units
  for select to authenticated
  using ((select private.is_staff()));

drop policy if exists units_staff_insert on public.inventory_units;
create policy units_staff_insert on public.inventory_units
  for insert to authenticated
  with check ((select private.get_my_role()) in ('admin', 'sales'));

drop policy if exists units_staff_update on public.inventory_units;
create policy units_staff_update on public.inventory_units
  for update to authenticated
  using ((select private.get_my_role()) in ('admin', 'sales'))
  with check ((select private.get_my_role()) in ('admin', 'sales'));

drop policy if exists units_staff_delete on public.inventory_units;
create policy units_staff_delete on public.inventory_units
  for delete to authenticated
  using ((select private.get_my_role()) = 'admin');

drop policy if exists tx_read on public.transactions;
create policy tx_read on public.transactions
  for select to authenticated
  using ((select private.is_staff()) or customer_id = (select auth.uid()));

drop policy if exists tx_staff_write on public.transactions;
create policy tx_staff_write on public.transactions
  for insert to authenticated
  with check ((select private.get_my_role()) in ('admin', 'sales'));

drop policy if exists tx_admin_update on public.transactions;
create policy tx_admin_update on public.transactions
  for update to authenticated
  using ((select private.get_my_role()) = 'admin')
  with check ((select private.get_my_role()) = 'admin');

drop policy if exists tx_items_read on public.transaction_items;
create policy tx_items_read on public.transaction_items
  for select to authenticated
  using (
    (select private.is_staff())
    or exists (
      select 1
        from public.transactions t
       where t.id = transaction_id
         and t.customer_id = (select auth.uid())
    )
  );

drop policy if exists tx_items_staff_write on public.transaction_items;
create policy tx_items_staff_write on public.transaction_items
  for insert to authenticated
  with check ((select private.get_my_role()) in ('admin', 'sales'));

drop policy if exists tradein_read on public.trade_in_records;
create policy tradein_read on public.trade_in_records
  for select to authenticated
  using ((select private.is_staff()));

drop policy if exists tradein_staff_write on public.trade_in_records;
create policy tradein_staff_write on public.trade_in_records
  for insert to authenticated
  with check ((select private.get_my_role()) in ('admin', 'sales'));

drop policy if exists tickets_read on public.service_tickets;
create policy tickets_read on public.service_tickets
  for select to authenticated
  using ((select private.is_staff()) or customer_id = (select auth.uid()));

drop policy if exists tickets_staff_write on public.service_tickets;
create policy tickets_staff_write on public.service_tickets
  for insert to authenticated
  with check ((select private.is_staff()));

drop policy if exists tickets_staff_update on public.service_tickets;
create policy tickets_staff_update on public.service_tickets
  for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

drop policy if exists tickets_staff_delete on public.service_tickets;
create policy tickets_staff_delete on public.service_tickets
  for delete to authenticated
  using ((select private.get_my_role()) = 'admin');

-- Storage: staff check memakai role dari profiles, bukan hanya memeriksa login.
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('trade-in-photos', 'service-photos'));

drop policy if exists storage_staff_write on storage.objects;
create policy storage_staff_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('trade-in-photos', 'service-photos')
    and (select private.is_staff())
  );

drop policy if exists storage_staff_update on storage.objects;
create policy storage_staff_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('trade-in-photos', 'service-photos')
    and (select private.is_staff())
  )
  with check (
    bucket_id in ('trade-in-photos', 'service-photos')
    and (select private.is_staff())
  );

drop policy if exists storage_staff_delete on storage.objects;
create policy storage_staff_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('trade-in-photos', 'service-photos')
    and (select private.is_staff())
  );

-- --------------------------------------------------------------------------
-- 6. Grants minimum untuk Data API
-- --------------------------------------------------------------------------
revoke all on public.profiles, public.store_settings, public.products,
  public.inventory_units, public.transactions, public.transaction_items,
  public.trade_in_records, public.service_tickets,
  public.v_public_inventory
  from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.store_settings, public.products to anon, authenticated;
grant select on public.profiles, public.inventory_units, public.transactions,
  public.transaction_items, public.trade_in_records, public.service_tickets
  to authenticated;

grant all on public.profiles, public.store_settings, public.products,
  public.inventory_units, public.transactions, public.transaction_items,
  public.trade_in_records, public.service_tickets
  to service_role;
grant select on public.v_public_inventory to service_role;
grant usage, select, update on all sequences in schema public to service_role;

-- ###########################################################################
-- BAGIAN 3 dari 26: 0003_lock_legacy_helpers
-- ###########################################################################

revoke execute on function public.get_my_role() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
grant execute on function public.get_my_role() to service_role;
grant execute on function public.is_staff() to service_role;

-- ###########################################################################
-- BAGIAN 4 dari 26: 0004_align_schema_contract
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
-- BAGIAN 5 dari 26: 20260926025406_index_public_foreign_keys
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
-- BAGIAN 6 dari 26: 20260926103000_strengthen_ticket_codes
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
-- BAGIAN 7 dari 26: 0006_store_social_urls
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
-- BAGIAN 8 dari 26: 0007_audit_trail
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
-- BAGIAN 9 dari 26: 0005_username_login
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
-- BAGIAN 10 dari 26: 20260927130000_product_image_registry
-- ###########################################################################
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Jenis gambar. "hero" dipakai foto carousel halaman depan yang modelnya
--    tidak ada di katalog, jadi product_id-nya null.
do $$ begin create type public.image_kind as enum ('official', 'second', 'hero', 'payment');
exception when duplicate_object then null; end $$;

-- 3) Tabel registry.
create table if not exists public.product_images (
  id bigint generated always as identity primary key,
  -- null untuk foto hero dan logo pembayaran: gambarnya ada di web tapi tidak
  -- menempel pada satu produk di katalog.
  product_id bigint references public.products(id) on delete cascade,
  path text not null unique,
  public_url text not null,
  kind public.image_kind not null default 'official',
  -- Wajib deskriptif karena alt teks ini dipakai sebagai fallback alt saat
  -- merender gambar, dan gambar produk adalah konten utama katalog.
  alt_text text not null default '',
  byte_size integer not null default 0 check (byte_size >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.product_images is
  'Daftar gambar produk dan aset web. Binernya ada di bucket Storage product-images.';
comment on column public.product_images.path is
  'Path objek di bucket Storage, tanpa domain. Contoh: products/iphone-13-1.jpg';
comment on column public.product_images.is_primary is
  'Gambar sampul produk. Dipakai sebagai products.image_url.';

create index if not exists product_images_product_idx on public.product_images(product_id);
create index if not exists product_images_kind_idx on public.product_images(kind);

-- 4) RLS. Daftar gambar bukan data sensitif: nama file, ukuran, dan alt teks
--    sudah tampil di halaman publik. Yang dilindungi adalah hak ubah.
alter table public.product_images enable row level security;

drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read
  on public.product_images
  for select
  to anon, authenticated
  using (true);

drop policy if exists product_images_staff_write on public.product_images;
create policy product_images_staff_write
  on public.product_images
  for insert
  to authenticated
  with check (private.is_staff());

drop policy if exists product_images_staff_update on public.product_images;
create policy product_images_staff_update
  on public.product_images
  for update
  to authenticated
  using (private.is_staff())
  with check (private.is_staff());

drop policy if exists product_images_admin_delete on public.product_images;
create policy product_images_admin_delete
  on public.product_images
  for delete
  to authenticated
  using ((select private.get_my_role()) = 'admin');

-- ###########################################################################
-- BAGIAN 11 dari 26: 20260927120000_auto_enable_rls_on_new_tables
-- ###########################################################################
CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS EVENT_TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
      AND schema_name = 'public'
  LOOP
    EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
    RAISE LOG 'rls_auto_enable: RLS aktif di %', cmd.object_identity;
  END LOOP;
END;
$$;

-- Sengaja tidak memakai EXCEPTION WHEN OTHERS. Kalau RLS gagal diaktifkan,
-- CREATE TABLE harus dibatalkan agar tabel tanpa proteksi tidak pernah ada.
-- Versi yang menelan error dengan RAISE LOG membuat kontrol ini fail open:
-- gagal diam-diam, tabel tetap bocor.

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
EXECUTE FUNCTION rls_auto_enable();

-- ###########################################################################
-- VERIFIKASI (read-only, aman dijalankan berkali-kali)
--
-- 1. Index pendukung, harus keluar 17 baris:
--    select indexname from pg_indexes where schemaname = 'public' and indexname in
--      ('products_brand_idx', 'inventory_units_product_status_idx', 'inventory_units_status_idx',
--       'transactions_created_idx', 'transactions_sales_idx', 'transaction_items_tx_idx',
--       'service_tickets_code_idx', 'service_tickets_status_idx', 'service_tickets_tech_idx',
--       'service_tickets_customer_id_idx', 'transactions_customer_id_idx', 'transaction_items_unit_id_idx',
--       'trade_in_records_transaction_id_idx', 'trade_in_records_resulting_unit_id_idx', 'profiles_username_key',
--       'product_images_product_idx', 'product_images_kind_idx')
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
--
-- 9. Registry gambar produk, harus keluar 5 baris untuk 5 produk aktif:
--    select p.model_name, count(*) as jumlah_gambar
--      from public.product_images i join public.products p on p.id = i.product_id
--     group by 1 order by 1;
--
-- 10. Bucket Storage produk, harus keluar 1 baris public = true:
--    select id, public, file_size_limit from storage.buckets where id = 'product-images';
--
-- 11. Policy registry gambar, harus keluar 4 baris:
--    select policyname from pg_policies
--      where schemaname = 'public' and tablename = 'product_images' order by policyname;
--
-- 12. Jaring pengaman RLS terpasang, harus keluar 1 baris:
--    select evtname, evtevent, evtenabled from pg_event_trigger where evtname = 'ensure_rls';
--
-- 13. Semua tabel public harus punya RLS aktif. Query di bawah mengembalikan
--     baris HANYA kalau ada tabel yang bocor, jadi hasil kosong berarti aman:
--    select c.relname, c.relrowsecurity
--      from pg_class c join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relkind = 'r'
--       and not c.relrowsecurity;
--    (query di atas mengembalikan baris HANYA kalau ada tabel yang bocor, jadi
--     hasil kosong berarti semua aman)
-- ###########################################################################


-- ###########################################################################
-- BAGIAN 12 dari 26: 20260927140000_store_owner_and_real_contact
-- ###########################################################################
alter table public.store_settings
  add column if not exists owner_name text not null default '';

comment on column public.store_settings.owner_name is
  'Nama pemilik toko. Tampil di ajakan WhatsApp agar pelanggan tahu siapa yang akan membalas.';

-- Nomor WhatsApp dan telepon toko sebelumnya berisi angka contoh
-- (081234567890), bukan nomor asli. Karena kolom itu terisi, nilai cadangan di
-- kode tidak pernah dipakai, dan link wa.me yang dihasilkan tidak valid:
-- WhatsApp tidak mengenali format nomor lokal tanpa kode negara.
update public.store_settings
set phone_number    = '+62 857-7539-8389',
    whatsapp_number = '6285775398389',
    owner_name      = 'Steven Eka'
where id = 1;


-- ###########################################################################
-- BAGIAN 13 dari 26: 20260927150000_revoke_anon_write_on_product_images
-- ###########################################################################

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
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 14 dari 26: 20260927160000_harden_storage_access
-- ###########################################################################

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
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 15 dari 26: 20260927170000_demo_ticket_for_tracking_example
-- ###########################################################################

-- Tiket demo untuk kode contoh di halaman lacak servis publik.
--
-- Latar: halaman /id/tracking mengajari format kode dengan contoh
-- SRV-20260912-7K4M2QX9, jadi pelanggan yang mengikutinya akan menyimpan kode itu
-- lalu mengetiknya. Sebelum migrasi ini kode tersebut tidak ada di database,
-- sehingga setiap orang yang mengikutinya mendapat "Kode tidak ditemukan".
-- Contoh yang tidak bisa dipakai mengajarkan format yang salah.
--
-- Tiket ini memakai data yang jelas ditandai sebagai contoh, lalu dipindahkan
-- melalui hampir seluruh alur status supaya lini masa progress di halaman publik
-- punya isi. Baris auditnya bukan ditulis manual, tapi diturunkan trigger
-- trg_audit_ticket_status, jadi riwayat di sini sama dengan riwayat yang
-- dihasilkan pemakaian nyata.
--
-- Nama pelanggan dan IMEI sengaja memakai angka yang tidak mungkin milik orang
-- sungguhan, supaya halaman publik yang bisa diakses tanpa login tidak
-- membocorkan identitas siapa pun.
--
-- Idempoten. ticket_code punya constraint UNIQUE, jadi insert kedua akan gagal
-- kalau tidak dijaga. Maju status juga dijaga per langkah: trigger
-- validate_service_ticket_transition menolak perpindahan mundur, jadi tanpa
-- syarat "hanya kalau status sekarang masih yang sebelumnya" dijalankan kedua
-- kali akan menabrak validasi itu.

insert into public.service_tickets (
  ticket_code,
  customer_name,
  customer_phone,
  device_model,
  device_name,
  imei_or_sn,
  issue_notes,
  problem_description,
  technician_notes,
  repair_status,
  sparepart_fee,
  labor_fee,
  total_fee,
  warranty_days
)
select
  'SRV-20260912-7K4M2QX9',
  'Pelanggan Contoh',
  '0000-0000-0000',
  'iPhone 13 128GB',
  'Apple iPhone 13 128GB',
  '000000000000000',
  'Layar tidak responsif setelah terkena air',
  'Layar touchscreen tidak merespons di sebagian area, tombol home masih berbunyi',
  'Papan tombol sudah diperiksa, masalah ada di digitizer',
  'received',
  0,
  150000,
  150000,
  30
where not exists (
  select 1 from public.service_tickets
  where ticket_code = 'SRV-20260912-7K4M2QX9'
);

-- Majukan status satu per satu supaya trigger audit terekam tiap perpindahan
-- dan halaman publik menampilkan proses yang berjalan, bukan lompatan ke akhir.
-- Syaratnya status sekarang masih persis status sebelumnya, jadi migrasi ini
-- berhenti di tempat yang benar kalau sudah pernah dijalankan.
update public.service_tickets set repair_status = 'diagnosing'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'received';

update public.service_tickets set repair_status = 'waiting_approval'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'diagnosing';

update public.service_tickets set repair_status = 'in_progress'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'waiting_approval';

update public.service_tickets set repair_status = 'testing'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'in_progress';

-- ###########################################################################
-- ###########################################################################

-- ###########################################################################

-- ###########################################################################
-- BAGIAN 16 dari 26: 20260927180000_nullable_inventory_unit_product
-- ###########################################################################

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
--     from public.trade_in_records t, public.products p
--    where t.resulting_unit_id = u.id
--      and p.id = u.product_id
--      and u.product_id is not null
--      and lower(p.brand || ' ' || p.model_name)
--          is distinct from lower(t.original_brand_model);
--
-- Syarat terakhir itu wajib, bukan hiasan. Tanpa itu pernyataan ini memakai
-- setiap unit hasil trade-in, termasuk unit yang katalognya sudah benar, jadi
-- operator yang menjalankan persis seperti tertulis justru memutus tautan
-- katalog stok second yang masih layak jual. Kedua sisi dinormalisasi huruf
-- kecil supaya beda kapital tidak salah dinilai sebagai "salah".
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
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 17 dari 26: 20260927190000_close_browser_role_write_grants
-- ###########################################################################

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
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 18 dari 26: 20260927200000_remove_ocean_photo_from_reno11_gallery
-- ###########################################################################

-- Lepaskan foto laut dari galeri resmi Oppo Reno 11.
--
-- Latar: audit visual menemukan oppo-reno11-2.jpg tercatat sebagai
-- official_images produk "Oppo Reno 11 5G 12/256GB" (products id 4), pada
-- posisi kedua dari empat. Isinya cuma horizon, air, dan langit. Tidak ada
-- telepon di dalam frame. Berkasnya 4320x4152, paling besar di antara foto
-- produk, dan ukuran itulah yang membuatnya lolos pemeriksaan kasar.
--
-- Produk ini aktif dan unitnya bisa dibeli, jadi pembeli yang menekan tombol
-- foto berikutnya pada kartunya melihat laut, bukan unit yang dijual.
--
-- Keputusan: hapus entry-nya, jangan ganti dengan oppo-reno11-4.jpg.
--
-- Alasannya tiga. Pertama, isi oppo-reno11-4.jpg belum dilihat oleh siapa pun
-- yang menulis migrasi ini, jadi menukarnya hanya memindahkan risiko ke nama
-- file lain. Kedua, setelah dihapus galerinya masih berisi tiga foto
-- perangkat, jadi kartu produk tidak kehilangan sampul. Ketiga, menambah
-- foto yang bagus adalah perubahan satu baris yang kecil dan reversibel,
-- sedangkan memuat foto yang salah mahal diperbaiki belakangan.
--
-- Berkas gambarnya sendiri tidak dihapus dari public/products/ maupun dari
-- bucket Storage product-images. Foto itu masih dirujuk src/app/global-not-found.tsx
-- sebagai foto halaman 404, jadi menghapusnya akan merusak halaman itu.
--
-- Idempoten: pernyataan di bawah hanya menyentuh baris yang masih memuat
-- nama file itu. Dijalankan kedua kali tidak ada baris yang cocok.
--
-- Pencocokan pakai sufiks nama file, bukan satu bentuk penulisan. Foto
-- produk bisa tersimpan sebagai path lokal "/products/oppo-reno11-2.jpg"
-- atau sebagai URL absolut dari Supabase Storage.

-- =============================================================================
-- 1) official_images: buang entri foto laut, sisa daftar tetap berurutan
-- =============================================================================
update public.products p
   set official_images = (
         select coalesce(array_agg(u.nama order by u.urutan), '{}'::text[])
           from unnest(p.official_images) with ordinality as u(nama, urutan)
          where u.nama not like '%products/oppo-reno11-2.jpg'
       )
 where exists (
         select 1
           from unnest(p.official_images) as u(nama)
          where u.nama like '%products/oppo-reno11-2.jpg'
       );

-- =============================================================================
-- 2) Registry: alt_text lama menyatakan foto itu unit Oppo Reno 11
-- =============================================================================
-- Alt teks ikut dirender jadi atribut alt, jadi klaim yang keluar ke pembaca
-- dan ke mesin pencari harus jujur walau gambarnya masih dipakai di tempat
-- lain. Barisnya tidak dihapus di sini: product_images adalah daftar aset,
-- penghapusannya keputusan staf admin, bukan efek samping migrasi.
update public.product_images
   set alt_text = 'Foto laut tanpa perangkat, tidak dipakai di etalase'
 where path like '%products/oppo-reno11-2.jpg'
   and alt_text is distinct from 'Foto laut tanpa perangkat, tidak dipakai di etalase';

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- Berkas ini memakai kesimpulan audit visual, bukan pembacaan metadata.
-- Tidak ada satu pun baris di sini yang bisa membuktikan isi gambarnya.
--
-- 1. Buka /products/oppo-reno11-2.jpg dan lihat sendiri pikselnya. Kalau
--    ternyata ada telepon di frame, migrasi ini salah dan jangan dijalankan.
--
-- 2. Lihat dulu baris yang akan tersentuh:
--
--      select id, brand, model_name, official_images
--        from public.products
--       where exists (
--               select 1 from unnest(official_images) as u(nama)
--                where u.nama like '%products/oppo-reno11-2.jpg'
--             );
--
--    Kalau yang muncul bukan Oppo Reno 11 yang dimaksud, jangan dijalankan.
--    Sufiks pencocokan sengaja longgar supaya tahan terhadap perbedaan path
--    lokal dan URL Storage, jadi hasilnya tetap perlu dilihat manusia.
--
-- 3. Setelah dijalankan, buka kartu produknya di beranda dan katalog, lalu
--    tekan tombol foto berikutnya sampai habis. Sisa fotonya harus perangkat.
--
-- Setara lewat aplikasi: updateProduct(id, { official_images: [...] }) di
-- src/lib/actions/products.ts. Jalur itu requireRole(["admin"]), divalidasi
-- productUpdateSchema, dan merevalidasi /portal/products serta /id layout.
-- Pakai jalur itu untuk pengeditan rutin, dan migrasi ini untuk perubahan
-- yang perlu jejjak yang bisa diaudit ulang.
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 19 dari 26: 20260927201000_clear_unparseable_product_image_url
-- ###########################################################################

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
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 20 dari 26: 20260927202000_trim_crop_duplicate_a55_photos
-- ###########################################################################

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
-- ###########################################################################
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 21 dari 26: 20260930100000_catalogue_apple_iphone_15_pro
-- ###########################################################################

-- Masukkan Apple iPhone 15 Pro ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya satu produk Apple ("iPhone 13 128GB")
-- dan tidak punya jalur iPhone 15 Pro sama sekali. Toko sudah punya foto
-- produknya di public/products/, tapi tidak ada baris products yang
-- merujuk foto itu, jadi foto tersebut tidak pernah tampil di etalase.
--
-- Yang TIDAK boleh terjadi di berkas ini: membuat baris inventory_units.
-- Unit adalah satu handset fisik dengan satu IMEI asli yang tertempel di
-- cip di dalamnya. IMEI tidak bisa dibuat, dan baris unit yang dikarang
-- berarti situs mengiklankan perangkat keras yang tidak ada di rak toko.
-- Karena itu berkas ini hanya menambah baris products tanpa unit sama
-- sekali. Baris tanpa unit dirender sebagai kartu "Stok Habis" plus tombol
-- kabari lewat WhatsApp, bukan sebagai stok yang bisa dibeli. Alasan
-- pemisahan etalase unit dan katalog ada di
-- 20260927180000_nullable_inventory_unit_product.sql.
--
-- Idempoten: products tidak punya constraint UNIQUE pada (brand,
-- model_name), jadi pola `insert ... select ... where not exists` dipakai
-- di sini, dikunci pada brand dan model_name. Pencocokan model_name
-- memakai lower(btrim(...)) supaya perbedaan huruf besar-kecil dan spasi
-- di tepi tidak menghasilkan baris kembar. Dijalankan kedua kali tidak
-- ada baris yang cocok, jadi tidak ada duplikat.
--
-- Foto dirujuk lewat path lokal /products/..., bukan URL absolut Supabase
-- Storage. next.config.ts sengaja tidak mengeraskan host Storage supaya
-- host project tidak bocor ke dalam database, dan berkas gambarnya sudah
-- ada di public/ sehingga bisa dilayani same-origin tanpa environment
-- apa pun.
--
-- Harga dan spesifikasi disalin apa adanya dari src/lib/mock-data.ts,
-- initialProducts id 1, baris 77 sampai 79. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga atau warna,
-- ubah satu nilai di bawah dan jalankan ulang berkasnya, karena migrasi
-- ini idempoten.

-- =============================================================================
-- 1) Apple iPhone 15 Pro 128GB, tanpa unit
-- =============================================================================
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
  'iPhone 15 Pro 128GB',
  'Titanium Blue, Super Retina XDR OLED 6.1", A17 Pro Chip, 48MP Camera, USB-C 3.0',
  18499000,
  '/products/iphone-15-pro-1.jpg',
  array['/products/iphone-15-pro-1.jpg']::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Apple'
     and lower(btrim(p.model_name)) = lower(btrim('iPhone 15 Pro 128GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 18499000 disalin dari src/lib/mock-data.ts:79. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Satu-satunya foto iPhone 15 Pro yang dipakai di sini adalah
--    iphone-15-pro-1.jpg, dan berkas itu sudah dibuka dan dilihat
--    langsung: foto keluarga iPhone 15 Pro di atas latar putih, empat
--    bodi dan satu unit menghadap depan. Empat file lain di kelompok ini
--    sengaja tidak dipakai, dan alasannya isi gambarnya, bukan sekadar
--    preferensi:
--      - iphone-15-pro-2.jpg  Galaxy Note dengan S Pen, bukan iPhone.
--      - iphone-15-pro-3.jpg  MacBook dan iPhone di atas meja, bukan foto produk.
--      - iphone-15-pro-4.jpg  orang berenang di kolam, tidak ada telepon.
--      - iphone-15-pro-5.jpg  orang di malam hari, tidak ada telepon.
--    src/lib/mock-data.ts baris 81 dan 82 sudah menandai 3, 4, dan 5
--    sebagai sampel kamera, MacBook, dan perenang. Kalau salah satunya
--    kelak ditambahkan ke galeri, isi gambarnya dicek ulang lebih dulu.
--
-- 3. Karena hanya ada satu foto yang jujur, official_images-nya satu
--    elemen dan kartu produknya tidak punya tombol foto berikutnya.
--    Jangan menambah iphone-15-pro-3 atau -4 hanya supaya galerinya
--    terlihat lengkap: galeri yang berpindah antara potongan dan lifestyle
--    shot terbaca sebagai galeri rusak, dan itu yang sudah dibetulkan di
--    20260927202000_trim_crop_duplicate_a55_photos.sql.
--
-- 4. Sebelum dijalankan, lihat baris Apple yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'apple'
--       order by id;
--
-- 5. Produk ini belum punya baris di registry product_images, jadi foto
--    resminya belum terdaftar di portal admin. Penambahannya lewat
--    portal, bukan lewat migrasi, karena tabel itu menyimpan daftar aset
--    dan path Storage-nya harus diisi lengkap.
-- ###########################################################################
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 22 dari 26: 20260930101000_catalogue_samsung_galaxy_s24_ultra
-- ###########################################################################

-- Masukkan Samsung Galaxy S24 Ultra ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya satu produk Samsung ("Galaxy A55 5G
-- 8/256GB"). Foto Galaxy S24 Ultra sudah lengkap di public/products/
-- dan sudah ikut terunggah ke bucket product-images, tapi tidak ada baris
-- products yang memakainya, jadi flagship Samsung tidak pernah tampil di
-- etalase.
--
-- Yang TIDAK boleh terjadi di berkas ini: membuat baris inventory_units.
-- Unit adalah satu handset fisik dengan satu IMEI asli yang tertempel di
-- cip di dalamnya. IMEI tidak bisa dibuat, dan baris unit yang dikarang
-- berarti situs mengiklankan perangkat keras yang tidak ada di rak toko.
-- Karena itu berkas ini hanya menambah baris products tanpa unit sama
-- sekali. Baris tanpa unit dirender sebagai kartu "Stok Habis" plus tombol
-- kabari lewat WhatsApp, bukan sebagai stok yang bisa dibeli. Alasan
-- pemisahan etalase unit dan katalog ada di
-- 20260927180000_nullable_inventory_unit_product.sql.
--
-- Idempoten: products tidak punya constraint UNIQUE pada (brand,
-- model_name), jadi pola `insert ... select ... where not exists` dipakai
-- di sini, dikunci pada brand dan model_name. Pencocokan model_name
-- memakai lower(btrim(...)) supaya perbedaan huruf besar-kecil dan spasi
-- di tepi tidak menghasilkan baris kembar. Dijalankan kedua kali tidak
-- ada baris yang cocok, jadi tidak ada duplikat.
--
-- Foto dirujuk lewat path lokal /products/..., bukan URL absolut Supabase
-- Storage. next.config.ts sengaja tidak mengeraskan host Storage supaya
-- host project tidak bocor ke dalam database, dan berkas gambarnya sudah
-- ada di public/ sehingga bisa dilayani same-origin tanpa environment
-- apa pun.
--
-- Harga dan spesifikasi disalin apa adanya dari src/lib/mock-data.ts,
-- initialProducts id 3, baris 121 sampai 123. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga atau warna,
-- ubah satu nilai di bawah dan jalankan ulang berkasnya, karena migrasi
-- ini idempoten.

-- =============================================================================
-- 1) Samsung Galaxy S24 Ultra 256GB, tanpa unit
-- =============================================================================
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
  'Samsung',
  'Galaxy S24 Ultra 256GB',
  'Titanium Gray, Dynamic AMOLED 2X 6.8" 120Hz, Snapdragon 8 Gen 3, S-Pen',
  21999000,
  '/products/s24-ultra-1.jpg',
  array['/products/s24-ultra-1.jpg']::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Samsung'
     and lower(btrim(p.model_name)) = lower(btrim('Galaxy S24 Ultra 256GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 21999000 disalin dari src/lib/mock-data.ts:123. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Hanya s24-ultra-1.jpg yang dipakai, dan berkas itu sudah dibuka dan
--    dilihat langsung: bodi titanium dengan S Pen di sisi kanan, satu
--    bodi ungu dan satu bodi kuning di belakang. Empat file lain di
--    kelompok ini sengaja tidak dipakai:
--      - s24-ultra-2.jpg  lifestyle shot Galaxy Note dengan S Pen.
--      - s24-ultra-3.jpg  bingkai yang sama dengan s24-ultra-1.jpg, hanya
--                         sedikit lebih rapat. Memakainya berdua membuat
--                         tombol foto berikutnya mengulang foto yang sama.
--      - s24-ultra-4.jpg  Galaxy Note di tangan yang sedang memakai
--                         aplikasi kamera. Fine print di sudut gambarnya
--                         menulis "S24 Ultra's rear camera rendering",
--                         jadi teksnya menyesatkan; peralatannya Note.
--      - s24-ultra-5.jpg  lifestyle shot Galaxy Note dengan S Pen.
--    Catatan s24-ultra-4.jpg sudah tercatat sebagai belum dinilai di
--    20260927202000_trim_crop_duplicate_a55_photos.sql. Berkas ini yang
--    memutuskan, dan keputusannya tidak memakainya.
--
-- 3. Karena hanya ada satu foto yang jujur, official_images-nya satu
--    elemen dan kartu produknya tidak punya tombol foto berikutnya.
--    Itu lebih baik daripada galeri yang berpindah antara potongan yang
--    nyaris sama dan lifestyle shot perangkat lain. Pola galeri rusak itu
--    sudah dibetulkan di 20260927202000_trim_crop_duplicate_a55_photos.sql.
--
-- 4. Sebelum dijalankan, lihat baris Samsung yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'samsung'
--       order by id;
--
-- 5. Spesifikasi menyebut S-Pen dan "Titanium Gray". Foto s24-ultra-1.jpg
--    memang menampilkan S Pen, dan bodi abu-abu metalik ada di bingkai
--    depan. Kalau stok yang akan datang bukan warna itu, koreksi kolom
--    specs-nya, jangan hanya warnanya di foto.
--
-- 6. Produk ini belum punya baris di registry product_images, jadi foto
--    resminya belum terdaftar di portal admin. Penambahannya lewat
--    portal, bukan lewat migrasi, karena tabel itu menyimpan daftar aset
--    dan path Storage-nya harus diisi lengkap.
-- ###########################################################################
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 23 dari 26: 20260930102000_catalogue_xiaomi_14
-- ###########################################################################

-- Masukkan Xiaomi 14 ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya "Redmi Note 13 8/256GB" sebagai satu-
-- satunya produk Xiaomi yang tercatat, dan ada satu baris lain
-- brand Xiaomi yang rusak (products id 6, model_name "iphone 16", specs
-- kosong, image_url berisi string "undefined/storage/..."). Baris rusak itu
-- BUKAN disentuh di sini: merek dan modelnya harus diputuskan staf setelah
-- unit fisiknya dilihat, dan keputusannya tercatat di
-- 20260927201000_clear_unparseable_product_image_url.sql.
--
-- Toko sudah punya tiga foto Xiaomi 14 di public/products/ dan ketiganya
-- sudah pernah dipakai sebagai official_images di src/lib/mock-data.ts,
-- tapi tidak ada baris products di database yang merujuknya.
--
-- Yang TIDAK boleh terjadi di berkas ini: membuat baris inventory_units.
-- Unit adalah satu handset fisik dengan satu IMEI asli yang tertempel di
-- cip di dalamnya. IMEI tidak bisa dibuat, dan baris unit yang dikarang
-- berarti situs mengiklankan perangkat keras yang tidak ada di rak toko.
-- Karena itu berkas ini hanya menambah baris products tanpa unit sama
-- sekali. Baris tanpa unit dirender sebagai kartu "Stok Habis" plus tombol
-- kabari lewat WhatsApp, bukan sebagai stok yang bisa dibeli. Alasan
-- pemisahan etalase unit dan katalog ada di
-- 20260927180000_nullable_inventory_unit_product.sql.
--
-- Idempoten: products tidak punya constraint UNIQUE pada (brand,
-- model_name), jadi pola `insert ... select ... where not exists` dipakai
-- di sini, dikunci pada brand dan model_name. Pencocokan model_name
-- memakai lower(btrim(...)) supaya perbedaan huruf besar-kecil dan spasi
-- di tepi tidak menghasilkan baris kembar. Dijalankan kedua kali tidak
-- ada baris yang cocok, jadi tidak ada duplikat.
--
-- Foto dirujuk lewat path lokal /products/..., bukan URL absolut Supabase
-- Storage. next.config.ts sengaja tidak mengeraskan host Storage supaya
-- host project tidak bocor ke dalam database, dan berkas gambarnya sudah
-- ada di public/ sehingga bisa dilayani same-origin tanpa environment
-- apa pun.
--
-- Harga dan spesifikasi disalin apa adanya dari src/lib/mock-data.ts,
-- initialProducts id 5, baris 166 sampai 169. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga, kapasitas, atau
-- warna, ubah satu nilai di bawah dan jalankan ulang berkasnya, karena
-- migrasi ini idempoten.

-- =============================================================================
-- 1) Xiaomi 14 12/512GB, tanpa unit
-- =============================================================================
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
  'Xiaomi',
  '14 12/512GB',
  'Jade Green, LTPO OLED 6.36" 120Hz, Leica Summilux Lens, Snapdragon 8 Gen 3',
  11999000,
  '/products/xiaomi-14-1.jpeg',
  array[
    '/products/xiaomi-14-1.jpeg',
    '/products/xiaomi-14-3.jpg',
    '/products/xiaomi-14-5.jpg'
  ]::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Xiaomi'
     and lower(btrim(p.model_name)) = lower(btrim('14 12/512GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 11999000 disalin dari src/lib/mock-data.ts:169. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Kapasitas 12/512GB ikut diambil dari nama model di
--    src/lib/mock-data.ts:167, jadi nama produk dan harganya berasal dari
--    satu keputusan yang sama. Kalau stok yang akan datang hanya 12/256GB
--    atau 8/256GB, ubah model_name DAN price-nya, karena keduanya
--    tertulis di kartu publik.
--
-- 3. Ketiga foto sudah dibuka dan dilihat satu per satu. Semuanya memang
--    Xiaomi 14 warna Jade Green, dan ketiganya bingkai yang berbeda, bukan
--    potongan satu sama lain:
--      - xiaomi-14-1.jpeg  badan depan dan belakang di atas latar putih.
--      - xiaomi-14-3.jpg  potongan rapat badan belakang dan layar.
--      - xiaomi-14-5.jpg  unit dipegang tangan, latar gelap.
--    Warna pada specs ("Jade Green") cocok dengan isi ketiga foto.
--
-- 4. Perhatikan juga file products id 6 yang sudah ada: brand Xiaomi tapi
--    model_name "iphone 16". Berkas ini tidak menyentuhnya. Kalau nanti
--    owner memutuskan baris itu sebenarnya Xiaomi, jalankan
--    updateProduct(id, {...}) dari portal sesuai catatan di
--    20260927201000_clear_unparseable_product_image_url.sql.
--
-- 5. Sebelum dijalankan, lihat baris Xiaomi yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'xiaomi'
--       order by id;
--
-- 6. Produk ini belum punya baris di registry product_images, jadi ketiga
--    fotonya belum terdaftar di portal admin. Penambahannya lewat portal,
--    bukan lewat migrasi, karena tabel itu menyimpan daftar aset dan path
--    Storage-nya harus diisi lengkap.

-- ###########################################################################
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 24 dari 26: 20260930103000_catalogue_vivo_v30
-- ###########################################################################

-- Masukkan Vivo V30 ke katalog tanpa membuat unit inventaris.
--
-- Latar: katalog production punya satu produk Vivo ("Y36 8/256GB") dan
-- tidak punya jalur Vivo V30 sama sekali. Foto Vivo V30 sudah ada di
-- public/products/ dan sudah pernah dipakai sebagai official_images di
-- src/lib/mock-data.ts, tapi tidak ada baris products di database yang
-- merujuknya.
--
-- Yang TIDAK boleh terjadi di berkas ini: membuat baris inventory_units.
-- Unit adalah satu handset fisik dengan satu IMEI asli yang tertempel di
-- cip di dalamnya. IMEI tidak bisa dibuat, dan baris unit yang dikarang
-- berarti situs mengiklankan perangkat keras yang tidak ada di rak toko.
-- Karena itu berkas ini hanya menambah baris products tanpa unit sama
-- sekali. Baris tanpa unit dirender sebagai kartu "Stok Habis" plus tombol
-- kabari lewat WhatsApp, bukan sebagai stok yang bisa dibeli. Alasan
-- pemisahan etalase unit dan katalog ada di
-- 20260927180000_nullable_inventory_unit_product.sql.
--
-- Idempoten: products tidak punya constraint UNIQUE pada (brand,
-- model_name), jadi pola `insert ... select ... where not exists` dipakai
-- di sini, dikunci pada brand dan model_name. Pencocokan model_name
-- memakai lower(btrim(...)) supaya perbedaan huruf besar-kecil dan spasi
-- di tepi tidak menghasilkan baris kembar. Dijalankan kedua kali tidak
-- ada baris yang cocok, jadi tidak ada duplikat.
--
-- Foto dirujuk lewat path lokal /products/..., bukan URL absolut Supabase
-- Storage. next.config.ts sengaja tidak mengeraskan host Storage supaya
-- host project tidak bocor ke dalam database, dan berkas gambarnya sudah
-- ada di public/ sehingga bisa dilayani same-origin tanpa environment
-- apa pun.
--
-- Harga dan spesifikasi disalin apa adanya dari src/lib/mock-data.ts,
-- initialProducts id 7, baris 205 sampai 208. Angka itu keputusan harga
-- toko, bukan hasil karangan. Kalau owner mengoreksi harga atau kapasitas,
-- ubah satu nilai di bawah dan jalankan ulang berkasnya, karena migrasi
-- ini idempoten.

-- =============================================================================
-- 1) Vivo V30 5G 8/256GB, tanpa unit
-- =============================================================================
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
  'Vivo',
  'V30 5G 8/256GB',
  'Waving Aqua, AMOLED 6.78" 120Hz 3D Curved, Snapdragon 7 Gen 3, 50MP OIS Aura Light',
  5999000,
  '/products/vivo-v30-2.jpg',
  array['/products/vivo-v30-2.jpg']::text[],
  true
where not exists (
  select 1
    from public.products p
   where p.brand = 'Vivo'
     and lower(btrim(p.model_name)) = lower(btrim('V30 5G 8/256GB'))
);

-- =============================================================================
-- YANG WAJIB DICEK MANUSIA SEBELUM MENJALANKAN
-- =============================================================================
-- 1. Harga 5999000 disalin dari src/lib/mock-data.ts:208. Angka itu harga
--    katalog mode seed, belum pernah dikonfirmasi owner ke supplier.
--    Selain itu angka itu tampil publik sebagai "Harga katalog" pada kartu
--    Stok Habis, jadi owner wajib mengoreksinya sebelum migrasi ini
--    dijalankan. Nilai yang tidak terkonfirmasi tidak boleh dipakai diam-diam.
--
-- 2. Hanya vivo-v30-2.jpg yang dipakai, dan berkas itu sudah dibuka dan
--    dilihat langsung: dua unit Vivo warna aqua di atas kain dan buku,
--    satu menghadap depan dengan notch, satu menunjukkan belakang. Warna
--    pada specs ("Waving Aqua") cocok dengan isi foto.
--
-- 3. vivo-v30-1.jpg sengaja tidak dipakai. Berkasnya banner promosi
--    bergambar dengan teks cetak, dan fine print-nya menyebut V30 Pro,
--    sedangkan produk ini V30. src/lib/mock-data.ts:210 sudah mencatat
--    hal yang sama dan hanya memakai foto perangkat bersih.
--
-- 4. Foto yang paling rawan salah di brand ini adalah foto Vivo
--    Y36 (vivo-y36-1.jpg) yang sudah menempel di produk id 5. Audit
--    sebelumnya tidak berhasil memastikan modelnya dari foto depan saja, dan
--    berkas ini tidak mengubah apa pun pada baris itu. Kalau owner ingin
--    memastikan Y36, foto unit fisiknya harus diambil ulang, bukan dibaca
--    ulang dari gambar yang sekarang.
--
-- 5. Sebelum dijalankan, lihat baris Vivo yang sudah ada supaya tidak
--    ada nama model lain yang sebenarnya menunjuk model yang sama:
--
--      select id, brand, model_name, default_price, is_active
--        from public.products
--       where lower(brand) = 'vivo'
--       order by id;
--
-- 6. Produk ini belum punya baris di registry product_images, jadi foto
--    resminya belum terdaftar di portal admin. Penambahannya lewat
--    portal, bukan lewat migrasi, karena tabel itu menyimpan daftar aset
--    dan path Storage-nya harus diisi lengkap.

-- ###########################################################################
-- ###########################################################################

-- ###########################################################################
-- BAGIAN 25 dari 26: 20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9
-- ###########################################################################

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

-- ###########################################################################
-- ###########################################################################

-- BAGIAN 26 dari 26: 20261001120000_hide_unidentified_product_6
-- ###########################################################################

update public.products p
   set is_active = false
 where p.id = 6
   and p.is_active
   and p.brand = 'Xiaomi'
   and lower(btrim(p.model_name)) = 'iphone 16';

-- ###########################################################################
