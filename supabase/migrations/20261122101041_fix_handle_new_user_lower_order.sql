-- ============================================================================
-- Migrasi: perbaiki urutan lower() dan regexp_replace() di handle_new_user().
--
-- BUG (N13): trigger 0005 menjalankan regexp_replace(..., '[^a-z0-9._-]')
-- pada input yang belum di-lower(). Akibatnya huruf besar dari email atau
-- metadata username dihapus alih-alih diubah ke huruf kecil.
--
-- Contoh: email "John.Doe@example.com" menghasilkan username "ohn.oe"
-- (J dan D dihapus) alih-alih "john.doe".
--
-- PERBAIKAN: panggil lower() lebih dulu pada setiap sumber input (metadata
-- dan email), lalu regexp_replace() menghapus karakter yang memang bukan
-- alfanumerik. Backfill migration 0005 sudah benar (lower lalu regexp);
-- yang salah hanya di body trigger.
--
-- Idempoten: CREATE OR REPLACE.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_username text;
  v_full_name text;
  v_phone_number text;
  v_fallback_username text;
begin
  v_fallback_username := replace(new.id::text, '-', '');

  -- Username dari metadata invitation, kalau tidak ada diturunkan dari email.
  -- lower() diterapkan pada setiap sumber SEBELUM regexp_replace menghapus
  -- karakter yang tidak diizinkan, supaya huruf besar dikonversi bukan
  -- dihapus.
  v_username := regexp_replace(
    lower(coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      v_fallback_username
    )),
    '[^a-z0-9._-]', '', 'g'
  );
  v_username := left(v_username, 32);

  -- profiles.username mensyaratkan 3-32 karakter. Lowercase sebelum
  -- sanitasi bisa menghasilkan nama pendek (contoh: email prefix "A"
  -- menjadi "a"), jadi pakai UUID tanpa tanda hubung sebagai fallback.
  if length(v_username) < 3 then
    v_username := v_fallback_username;
  end if;

  v_full_name := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );
  v_phone_number := coalesce(new.raw_user_meta_data->>'phone_number', '');

  insert into public.profiles (id, full_name, role, phone_number, email, username)
  values (
    new.id,
    v_full_name,
    'customer',
    v_phone_number,
    new.email,
    v_username
  )
  on conflict do nothing;

  -- Konflik username tidak boleh menggagalkan signup. ON CONFLICT tanpa
  -- target menangani benturan username dan ID; jika nama dipakai akun lain,
  -- coba UUID penuh yang tetap memenuhi format 3-32 karakter.
  if not exists (select 1 from public.profiles where id = new.id) then
    insert into public.profiles (id, full_name, role, phone_number, email, username)
    values (
      new.id,
      v_full_name,
      'customer',
      v_phone_number,
      new.email,
      v_fallback_username
    )
    on conflict do nothing;
  end if;

  -- Jangan diam-diam membuat akun Auth tanpa profil bila username fallback
  -- yang berasal dari UUID ternyata sudah dipakai secara manual.
  if not exists (select 1 from public.profiles where id = new.id) then
    raise exception 'USERNAME_FALLBACK_CONFLICT';
  end if;

  return new;
end;
$$;

-- Tidak ada backfill otomatis. Username profile yang sudah ada bisa dipilih
-- manual dan menjadi ID login; mengubahnya berdasarkan email berisiko membuat
-- akun tidak dapat ditemukan dengan username yang biasa dipakai. Koreksi akun
-- lama dilakukan setelah pemilik akun dan username yang dimaksud diverifikasi.
