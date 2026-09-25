-- Migration 0003: tutup helper legacy di schema public.
-- Helper baru yang dipakai policy berada di schema private.

revoke execute on function public.get_my_role() from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon, authenticated;
grant execute on function public.get_my_role() to service_role;
grant execute on function public.is_staff() to service_role;
