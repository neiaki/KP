-- Migration 0002: selaraskan project Supabase yang sudah menjalankan 0001
-- versi lama dengan kontrak schema canonical di repository.
--
-- Migration ini tidak menghapus data. Semua perubahan DDL dijalankan dalam
-- transaction oleh Supabase Management API.

-- --------------------------------------------------------------------------
-- 1. Helper role privat
-- --------------------------------------------------------------------------
-- Helper tidak lagi tinggal di schema public yang diekspos ke Data API.
-- Grant eksekusi tetap diberikan kepada role yang menjalankan policy RLS.
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
