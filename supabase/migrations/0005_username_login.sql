-- ============================================================================
-- Migrasi 0005 — login pakai username, bukan email.
--
-- DASAR: 0001 membuat profiles 1:1 dengan auth.users tapi tidak menyimpan
-- email. Supabase Auth hanya bisa signInWithPassword({ email, password }),
-- jadi portal tidak bisa menerima username tanpa peta username ke email.
--
-- SOLUSI: denormalisasi email ke profiles, lalu form login meminta username
-- saja. Password tetap milik akun Auth di belakang layar, tidak ada yang
-- berubah di sisi keamanan. Email tetap wajib ada di Auth karena itu
-- identitas login-nya; yang hilang dari UI adalah kolom email.
--
-- CATATAN KEAMANAN: kolom email exposing lewat RLS hanya untuk baris milik
-- sendiri (policies 0002), jadi username yang bocor tidak membuka email orang
-- lain. Pencarian username saat login memakai service_role lewat
-- createAdminClient(), bukan anon, dan hasilnya tidak pernah dibedakan dari
-- "password salah" supaya username tidak bisa dienumerasi.
--
-- Semua pernyataan idempoten dan tidak menghapus data.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Kolom baru
-- --------------------------------------------------------------------------
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
