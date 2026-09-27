-- Jaring pengaman: tabel baru di schema public otomatis dilindungi RLS.
--
-- Kenapa perlu di proyek ini: default privileges Supabase memberi
-- anon=arwdDxtm pada setiap tabel baru di schema public. Artinya tanpa RLS,
-- tabel bisa dibaca DAN ditulis siapa saja lewat PostgREST. RLS satu-satunya
-- penghalang, dan "lupa mengaktifkan RLS" adalah kesalahan yang mudah terjadi
-- tanpa sengaja.
--
-- Catatan: mengaktifkan RLS tanpa policy berarti tolak semua (fail closed),
-- jadi tabel yang sudah terproteksi tapi belum punya policy akan terlihat
-- kosong, bukan bocor. Itu perilaku yang memang diinginkan untuk keamanan.
--
-- Event trigger ini tidak dibuat otomatis oleh Supabase, harus dipasang
-- sendiri. Supabase menyertakan cuplikat ini sebagai contoh, tapi tidak
-- memasangnya sendiri di database kita.

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
