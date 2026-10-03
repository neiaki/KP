-- Bootstrap minimum untuk restore test Supabase ke PostgreSQL biasa.
-- Jalankan sekali pada database restore target sebelum pg_restore.
--
-- Isi file ini DUA hal, dan keduanya tidak butuh data akun:
--
-- 1. Role Data API (anon, authenticated, service_role, authenticator). Policy
--    RLS dan GRANT di dump mengacu pada role-role ini, jadi pg_restore berhenti
--    di statement pertama kalau role belum ada.
-- 2. auth.users, auth.uid(), auth.role() sebagai tempat paling minimal.
--
-- Poin 2 hanya tempat singgah, bukan Auth. Sejak 3 Oktober 2026
-- scripts/backup-postgres.sh ikut men-dump schema auth, jadi dump modern
-- SUDAH membawa auth.users asli beserta identities, sesi, dan MFA. Karena dump
-- memuat entri SCHEMA auth dan dijalankan dengan --clean --if-exists, tabel dan
-- fungsi yang dibuat file ini diganti seluruhnya oleh isi dump. Yang tersisa
-- dari file ini pada target modern hanyalah role di poin 1.
--
-- Stub dipakai hanya untuk dump lama yang belum memuat schema auth. Dump
-- seperti itu butuh auth.users sebelum restore, karena public.profiles punya
-- FK ke auth.users(id) dan --single-transaction membatalkan seluruh restore
-- begitu satu FK gagal. Stub itu tidak membuat siapa pun bisa login, dan
-- scripts/restore-postgres.sh menolak melaporkan restore sukses kalau target
-- akhirnya tidak punya satu pun akun auth asli.
--
-- Stub memakai on conflict do nothing di sisi pemanggil, jadi file ini tidak
-- pernah menimpa auth.users yang sudah berisi akun asli. Karena itu berkas ini
-- aman dijalankan berulang, dan aman dijalankan pada target yang sudah pernah
-- diimpor Auth Supabase.

do $$
begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role service_role nologin;
exception when duplicate_object then null;
end $$;

do $$
begin
  create role authenticator nologin;
exception when duplicate_object then null;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists raw_user_meta_data jsonb;

-- Penandaan dilakukan di dalam database, bukan hanya di dokumen. Orang yang
-- inspecting target lalu melihat tabel dengan kolom email dan metadata tapi
-- tanpa password, tanpa email_confirmed_at, dan tanpa kolom lain milik GoTrue
-- akan langsung tahu bahwa yang mereka lihat bukan backup akun, lalu mencari
-- sumber aslinya. Tanpa penanda, tabel itu terlihat meyakinkan.
comment on schema auth is 'PLACEHOLDER At Cell. Schema asli ada di dump; isi minimal ini hanya biar FK public.profiles satisfied.';
comment on table auth.users is 'PLACEHOLDER At Cell, bukan Auth Supabase. Baris yang bukan hasil restore-postgres.sh (raw_user_meta_data->>atcell_restore_stub) akan hilang begitu dump schema auth di-restore.';

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;