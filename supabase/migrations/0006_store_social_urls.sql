-- ============================================================================
-- Migration 0006 — URL sosmed resmi toko.
--
-- DASAR: src/components/public/footer.tsx masih menuliskan link sosmed
-- hardcode ke https://facebook.com/, https://instagram.com/, dan seterusnya.
-- Itu berarti semua pengunjung diarahkan ke halaman orang lain, dan Admin
-- tidak bisa memperbaikinya tanpa mengubah kode lalu deploy ulang.
--
-- SOLUSI: pindahkan ke store_settings sebagai kolom opsional. Admin
-- mengisinya lewat portal/settings, sama seperti alamat dan nomor WhatsApp.
-- Kolom kosong berarti platform itu tidak ditampilkan, jadi tidak ada lagi
-- link placeholder yang mengarah ke domain milik orang lain.
--
-- Idempoten dan tidak menghapus data. Kolom baru nullable supaya data
-- lama tetap utuh dan footer langsung berhenti menampilkan placeholder.
-- ============================================================================

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
