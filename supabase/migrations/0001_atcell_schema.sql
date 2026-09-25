-- ============================================================================
-- Migrasi 0001 — Skema backend At Cell (referensi: docs/PRD-AtCell.md Bab 6-7)
-- Cara pakai: buat project baru di https://supabase.com/dashboard,
-- lalu paste SELURUH file ini ke SQL Editor dan Run. Aman di-run ulang
-- (idempoten untuk tipe/tabel; RLS policy di-drop dulu bila sudah ada).
-- Setelah itu isi .env.local (lihat .env.example) dan buat user awal
-- via Authentication > Users + baris padanannya di tabel profiles.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. ENUM NATIVE (PRD Bab 7 poin 3 — bukan string bebas)
-- --------------------------------------------------------------------------
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

-- Helper hanya dipakai oleh policy. Tutup default EXECUTE PUBLIC dan
-- berikan hak eksplisit kepada role yang memang menjalankan policy.
revoke execute on function public.get_my_role() from public;
revoke execute on function public.is_staff() from public;
grant execute on function public.get_my_role() to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;

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
