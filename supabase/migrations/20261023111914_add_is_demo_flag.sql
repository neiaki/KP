-- Tambah penanda demo pada unit inventaris dan transaksi.
--
-- Unit/transaksi demo tidak boleh muncul di etalase publik dan tidak boleh
-- ikut laporan penjualan. Kolom ini default false supaya data lama tetap
-- dianggap data asli.
alter table public.inventory_units
  add column if not exists is_demo boolean not null default false;

alter table public.transactions
  add column if not exists is_demo boolean not null default false;

-- Etalase publik tidak boleh menampilkan unit demo.
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
   and coalesce(u.is_demo, false) = false
   and p.is_active;

revoke all on public.v_public_inventory from public, anon, authenticated;
grant select on public.v_public_inventory to service_role;