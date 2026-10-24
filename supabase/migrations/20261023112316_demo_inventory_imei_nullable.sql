-- Unit demo boleh tidak punya IMEI.
--
-- IMEI hanya boleh diisi 15 digit untuk unit asli. Unit demo memakai NULL
-- supaya data contoh tidak mengarang nomor IMEI yang bisa bentrok dengan
-- perangkat nyata. Unit non-demo tetap wajib IMEI lewat check kedua.
alter table public.inventory_units
  alter column imei drop not null;

alter table public.inventory_units
  drop constraint if exists inventory_units_imei_check;

alter table public.inventory_units
  add constraint inventory_units_imei_check
  check (imei is null or imei ~ '^[0-9]{15}$');

alter table public.inventory_units
  drop constraint if exists inventory_units_demo_imei_check;

alter table public.inventory_units
  add constraint inventory_units_demo_imei_check
  check (is_demo or imei is not null);
