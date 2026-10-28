-- ============================================================================
-- USULAN MIGRASI INTEGRITAS DATA AT CELL
--
-- STATUS: BELUM DISETUJUI OWNER. JANGAN DIJALANKAN.
--
-- File ini sengaja disimpan di docs/migrations-proposed/, bukan di
-- supabase/migrations/, karena:
--   1. keputusan owner belum ada;
--   2. MISI melarang menjalankan migrasi;
--   3. tests/run-all-pending.test.ts, tests/migration-ledger.test.ts, dan
--      tests/deployment-runbook.test.ts menganggap setiap file .sql di
--      supabase/migrations/ sudah disetujui dan ikut deploy.
--
-- Setelah disetujui:
--   1. pindahkan ke supabase/migrations/<timestamp>_db_integrity.sql;
--   2. perbarui RUN-ALL-PENDING.sql, supabase/migrations-ledger.snapshot,
--      docs/DEPLOYMENT-REDUNDANCY.md, dan README bila perlu;
--   3. jalankan di database lokal/staging, bukan production;
--   4. verifikasi query di docs/db-integrity-proposals.md bagian 5.
--
-- Semua pernyataan idempoten. Bagian yang membutuhkan keputusan owner diberi
-- tanda OPSIONAL dan boleh dihapus sebelum migrasi dijalankan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Satu unit hanya boleh muncul di satu transaction_items
-- ----------------------------------------------------------------------------
-- Ini jaring pengaman terakhir anti double-sell. Aplikasi sudah memakai
-- SELECT ... FOR UPDATE dengan filter status = 'available' di pos.ts, tetapi
-- jalur SQL langsung tetap bisa menulis dua baris untuk unit yang sama.
-- Preflight wajib: query duplikat di docs/db-integrity-proposals.md harus 0.
create unique index if not exists transaction_items_unit_id_key
  on public.transaction_items (unit_id);

-- ----------------------------------------------------------------------------
-- B. transaction_items hanya untuk unit available, bukan demo, harga DB
-- ----------------------------------------------------------------------------
-- Aplikasi POS membaca selling_price dari database, bukan payload browser.
-- Trigger ini menegakkan aturan yang sama untuk semua jalur tulis, termasuk
-- PostgREST langsung. POS dan RPC yang ada sudah memakai harga DB, jadi lolos.
create or replace function private.guard_transaction_item()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_price numeric;
  v_status public.unit_status;
  v_is_demo boolean;
begin
  select u.selling_price, u.status, u.is_demo
    into v_price, v_status, v_is_demo
    from public.inventory_units u
   where u.id = new.unit_id
   for share;

  if not found then
    raise exception 'UNIT_NOT_FOUND';
  end if;
  if v_status <> 'available' then
    raise exception 'UNIT_NOT_AVAILABLE';
  end if;
  if v_is_demo then
    raise exception 'UNIT_IS_DEMO';
  end if;
  if new.unit_price is distinct from v_price then
    raise exception 'UNIT_PRICE_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_transaction_item on public.transaction_items;
create trigger trg_guard_transaction_item
  before insert or update of unit_id, unit_price on public.transaction_items
  for each row execute function private.guard_transaction_item();

-- ----------------------------------------------------------------------------
-- C. Item transaksi langsung menandai unit sold
-- ----------------------------------------------------------------------------
-- Tanpa ini, penulis SQL langsung bisa membuat transaction_items untuk unit
-- available lalu meninggalkan unit itu tetap available. Aplikasi POS tetap
-- melakukan update status setelah insert; update kedua menjadi no-op dan tidak
-- menggandakan audit karena status lama dan baru sama.
create or replace function private.mark_unit_sold_from_item()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.inventory_units
     set status = 'sold'
   where id = new.unit_id
     and status = 'available';
  return new;
end;
$$;

drop trigger if exists trg_mark_unit_sold_from_item on public.transaction_items;
create trigger trg_mark_unit_sold_from_item
  after insert on public.transaction_items
  for each row execute function private.mark_unit_sold_from_item();

-- ----------------------------------------------------------------------------
-- D. Status sold wajib punya transaction_items
-- ----------------------------------------------------------------------------
-- Melengkapi arah sebaliknya: unit tidak boleh menjadi sold hanya karena
-- UPDATE status langsung. Aplikasi POS memasukkan item lebih dulu, jadi
-- trigger ini lolos. Jalur SQL manual tanpa nota akan ditolak.
create or replace function private.require_transaction_item_for_sold()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.status = 'sold' and old.status is distinct from 'sold' then
    if not exists (
      select 1 from public.transaction_items where unit_id = new.id
    ) then
      raise exception 'SOLD_REQUIRES_POS_TRANSACTION';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_transaction_item_for_sold on public.inventory_units;
create trigger trg_require_transaction_item_for_sold
  before update of status on public.inventory_units
  for each row execute function private.require_transaction_item_for_sold();

-- ----------------------------------------------------------------------------
-- E. Unit sold tidak boleh diubah harga, kondisi, atau identitasnya
-- ----------------------------------------------------------------------------
-- updateUnitDetails() sudah menolak unit sold, tetapi trigger lama hanya
-- menyala untuk perubahan status. Trigger ini menutup update harga/kondisi
-- langsung yang tidak menyentuh kolom status.
create or replace function private.prevent_sold_unit_edit()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.status = 'sold' and (
    new.imei is distinct from old.imei
    or new.product_id is distinct from old.product_id
    or new.condition is distinct from old.condition
    or new.purchase_cost is distinct from old.purchase_cost
    or new.selling_price is distinct from old.selling_price
    or new.is_demo is distinct from old.is_demo
  ) then
    raise exception 'SOLD_UNIT_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_sold_unit_edit on public.inventory_units;
create trigger trg_prevent_sold_unit_edit
  before update on public.inventory_units
  for each row execute function private.prevent_sold_unit_edit();

-- ----------------------------------------------------------------------------
-- F. final_payment harus sama dengan rumus yang dipakai aplikasi
-- ----------------------------------------------------------------------------
-- pricing.ts: max(0, total_amount - trade_in_deduction).
-- NOT VALID berarti baris lama tidak langsung diperiksa, tetapi baris baru
-- dan baris yang di-update tetap wajib lolos. Validasi penuh dilakukan setelah
-- query pelanggaran bersih.
alter table public.transactions
  drop constraint if exists transactions_final_payment_formula_chk;
alter table public.transactions
  add constraint transactions_final_payment_formula_chk
  check (final_payment = greatest(total_amount - trade_in_deduction, 0)) not valid;

-- ----------------------------------------------------------------------------
-- G. total_fee tiket servis harus sama dengan sparepart + labor
-- ----------------------------------------------------------------------------
-- service.ts selalu menulis totalFee = sparepart + labor. Trigger/check ini
-- menutup update langsung yang membuat tiga angka itu berbeda.
alter table public.service_tickets
  drop constraint if exists service_tickets_total_fee_formula_chk;
alter table public.service_tickets
  add constraint service_tickets_total_fee_formula_chk
  check (total_fee = sparepart_fee + labor_fee) not valid;

-- ----------------------------------------------------------------------------
-- H. total_amount transaksi harus sama dengan jumlah item
-- ----------------------------------------------------------------------------
-- Constraint trigger ditunda sampai COMMIT supaya transaksi boleh insert
-- header dulu, item kemudian. Aplikasi POS dan RPC selalu satu item, jadi
-- lolos. Transaksi tanpa item ditolak.
create or replace function private.check_transaction_total()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_tx_id bigint;
  v_total numeric;
  v_sum numeric;
begin
  if tg_table_name = 'transactions' then
    v_tx_id := new.id;
  elsif tg_op = 'DELETE' then
    v_tx_id := old.transaction_id;
  else
    v_tx_id := new.transaction_id;
  end if;

  select t.total_amount into v_total
    from public.transactions t
   where t.id = v_tx_id;
  if not found then
    return null;
  end if;

  if not exists (
    select 1 from public.transaction_items ti where ti.transaction_id = v_tx_id
  ) then
    raise exception 'TRANSACTION_ITEMS_REQUIRED';
  end if;

  select coalesce(sum(ti.unit_price), 0) into v_sum
    from public.transaction_items ti
   where ti.transaction_id = v_tx_id;

  if v_total is distinct from v_sum then
    raise exception 'TRANSACTION_TOTAL_MISMATCH';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_check_transaction_total_tx on public.transactions;
create constraint trigger trg_check_transaction_total_tx
  after insert or update on public.transactions
  deferrable initially deferred
  for each row execute function private.check_transaction_total();

drop trigger if exists trg_check_transaction_total_items on public.transaction_items;
create constraint trigger trg_check_transaction_total_items
  after insert or update or delete on public.transaction_items
  deferrable initially deferred
  for each row execute function private.check_transaction_total();

-- ----------------------------------------------------------------------------
-- I. Teknisi tiket wajib punya role technician
-- ----------------------------------------------------------------------------
-- createTicket() hanya otomatis mengisi teknisi bila pembuatnya technician;
-- updateTicket() saat ini hanya memvalidasi UUID, bukan role. Trigger ini
-- menjadi jaring pengaman untuk kedua jalur dan untuk PostgREST langsung.
create or replace function private.guard_ticket_technician()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.technician_id is not null then
    if not exists (
      select 1 from public.profiles p
       where p.id = new.technician_id
         and p.role = 'technician'
    ) then
      raise exception 'TECHNICIAN_ROLE_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_ticket_technician on public.service_tickets;
create trigger trg_guard_ticket_technician
  before insert or update of technician_id on public.service_tickets
  for each row execute function private.guard_ticket_technician();

-- ----------------------------------------------------------------------------
-- J. Sales tidak boleh mengubah biaya atau status tiket servis
-- ----------------------------------------------------------------------------
-- service.ts sudah menolak sales untuk sparepartFee, laborFee, dan
-- repairStatus. RLS tickets_staff_update masih mengizinkan semua staf lewat
-- PostgREST, jadi aturan yang sama ditegakkan di database.
-- Catatan: cost_breakdown, technician_notes, warranty_days, dan technician_id
-- masih boleh diubah sales di action saat ini. Itu dicatat sebagai temuan
-- terpisah di docs/db-integrity-proposals.md dan NEEDS_HUMAN.md, bukan
-- diperluas diam-diam di trigger ini.
create or replace function private.service_ticket_sales_guard()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if (select private.get_my_role()) = 'sales' then
    if old.sparepart_fee is distinct from new.sparepart_fee
      or old.labor_fee is distinct from new.labor_fee
      or old.total_fee is distinct from new.total_fee
      or old.repair_status is distinct from new.repair_status then
      raise exception 'SALES_CANNOT_EDIT_SERVICE_FEES';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_ticket_sales_guard on public.service_tickets;
create trigger trg_service_ticket_sales_guard
  before update on public.service_tickets
  for each row execute function private.service_ticket_sales_guard();

-- ----------------------------------------------------------------------------
-- K. Transaksi baru dari sesi pengguna harus memakai sales_id sendiri
-- ----------------------------------------------------------------------------
-- RPC process_trade_in_sale() sudah memeriksa p_sales_id = auth.uid().
-- Trigger ini menutup jalur INSERT langsung ke tabel transactions oleh sesi
-- sales/admin. Server Action memakai koneksi service role (auth.uid() NULL),
-- jadi tidak terpengaruh.
create or replace function private.guard_transaction_actor()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if (select auth.uid()) is not null
     and new.sales_id is distinct from (select auth.uid()) then
    raise exception 'SALES_ACTOR_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_transaction_actor on public.transactions;
create trigger trg_guard_transaction_actor
  before insert on public.transactions
  for each row execute function private.guard_transaction_actor();

-- ----------------------------------------------------------------------------
-- L. Minimal satu admin dan larangan ubah peran sendiri
-- ----------------------------------------------------------------------------
-- auth.ts sudah memeriksa wouldLeaveNoAdmin(), tetapi pemeriksaannya tidak
-- atomik dan RLS profiles_admin_write mengizinkan admin mengubah role langsung.
-- Advisory lock membuat dua demosi bersamaan tidak bisa sama-sama melihat dua
-- admin lalu sama-sama lolos.
create or replace function private.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_admin_count int;
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' then
      perform pg_advisory_xact_lock(hashtext('atcell-last-admin'));
      select count(*) into v_admin_count
        from public.profiles where role = 'admin';
      if v_admin_count <= 1 then
        raise exception 'LAST_ADMIN_REQUIRED';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'admin' and new.role <> 'admin' then
    perform pg_advisory_xact_lock(hashtext('atcell-last-admin'));
    select count(*) into v_admin_count
      from public.profiles where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN_REQUIRED';
    end if;
  end if;

  if (select auth.uid()) is not null
     and (select auth.uid()) = old.id
     and new.role is distinct from old.role then
    raise exception 'SELF_ROLE_CHANGE';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update of role or delete on public.profiles
  for each row execute function private.guard_profile_role();

-- ----------------------------------------------------------------------------
-- M. OPSIONAL: harga jual tidak boleh di bawah modal
-- ----------------------------------------------------------------------------
-- Keputusan owner. updateUnitDetails() sudah menolak harga baru <= modal,
-- tetapi registerUnits() belum memeriksa. Constraint ini menolak harga di
-- bawah modal untuk baris baru/updated, dan membiarkan harga impas (sama
-- dengan modal) karena action lama memang mengizinkan impas yang tidak diubah.
-- Hapus blok ini kalau owner sengaja mengizinkan loss leader.
alter table public.inventory_units
  drop constraint if exists inventory_units_selling_price_not_below_cost_chk;
alter table public.inventory_units
  add constraint inventory_units_selling_price_not_below_cost_chk
  check (selling_price >= purchase_cost) not valid;

-- ============================================================================
-- ROLLBACK (jalankan dalam urutan ini bila migrasi sudah diterapkan)
-- ============================================================================
-- alter table public.inventory_units
--   drop constraint if exists inventory_units_selling_price_not_below_cost_chk;
-- drop trigger if exists trg_guard_profile_role on public.profiles;
-- drop function if exists private.guard_profile_role();
-- drop trigger if exists trg_guard_transaction_actor on public.transactions;
-- drop function if exists private.guard_transaction_actor();
-- drop trigger if exists trg_service_ticket_sales_guard on public.service_tickets;
-- drop function if exists private.service_ticket_sales_guard();
-- drop trigger if exists trg_guard_ticket_technician on public.service_tickets;
-- drop function if exists private.guard_ticket_technician();
-- drop trigger if exists trg_check_transaction_total_items on public.transaction_items;
-- drop trigger if exists trg_check_transaction_total_tx on public.transactions;
-- drop function if exists private.check_transaction_total();
-- alter table public.service_tickets
--   drop constraint if exists service_tickets_total_fee_formula_chk;
-- alter table public.transactions
--   drop constraint if exists transactions_final_payment_formula_chk;
-- drop trigger if exists trg_prevent_sold_unit_edit on public.inventory_units;
-- drop function if exists private.prevent_sold_unit_edit();
-- drop trigger if exists trg_require_transaction_item_for_sold on public.inventory_units;
-- drop function if exists private.require_transaction_item_for_sold();
-- drop trigger if exists trg_mark_unit_sold_from_item on public.transaction_items;
-- drop function if exists private.mark_unit_sold_from_item();
-- drop trigger if exists trg_guard_transaction_item on public.transaction_items;
-- drop function if exists private.guard_transaction_item();
-- drop index if exists public.transaction_items_unit_id_key;
-- ============================================================================
