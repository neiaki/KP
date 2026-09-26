-- ============================================================================
-- Migration 0007 — audit trail (NFR-07).
--
-- NFR-07: "Setiap mutasi status unit (IMEI) dan tiket servis tercatat dengan
-- stempel waktu dan identitas pengguna yang melakukan perubahan, untuk
-- keperluan penelusuran/audit." Sebelumnya tidak ada sama sekali: tidak ada
-- tabel, tidak ada kolom created_by, dan trigger yang sudah ada hanya menjaga
-- transisi tanpa mencatat siapa yang melakukannya. Siapa pun yang salah
-- mengubah status unit atau menutup tiket tidak bisa ditelusuri.
--
-- PILIHAN DESAIN: pencatatan lewat TRIGGER database, bukan lewat kode
-- aplikasi. Alasannya, trigger berjalan untuk semua jalur perubahan termasuk
-- SQL manual di SQL Editor, jadi tidak bisa dilewati. Ini pola yang sama
-- dengan validate_service_ticket_transition() dan prevent_sold_reactivation()
-- yang sudah dipakai di 0001.
--
-- AKTOR: src/db/client.ts memakai koneksi postgres langsung, bukan PostgREST,
-- jadi auth.uid() selalu NULL di jalur itu. Aktor dikirim lewat set_config
-- transaction-local: Server Action menulis atcell.actor_id sebelum UPDATE, dan
-- trigger membacanya. Nilai kosong berarti perubahan tanpa aktor, dan itu
-- sendiri worth-reviewed, bukan diam-diam lolos.
--
-- Semua pernyataan idempotent dan tidak menghapus data.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Tabel audit
-- --------------------------------------------------------------------------
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
