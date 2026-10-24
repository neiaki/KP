-- Sales hanya boleh mengubah harga acuan dan foto resmi produk.
--
-- Policy products_sales_update mengizinkan UPDATE full-row untuk sales karena
-- RLS tidak bisa membatasi kolom. Pembatasan kolom sebelumnya hanya ada di
-- Server Action updateProductListing, padahal browser membawa sesi Supabase
-- sales yang bisa memanggil PostgREST langsung dan melewati action.
-- Trigger ini menegakkan batasan yang sama di sisi database: kalau peran
-- pemanggil adalah sales dan baris yang berubah menyentuh kolom identitas
-- katalog (merek, nama model, spesifikasi, galeri second, status aktif,
-- image_url fallback), perubahan ditolak.
--
-- Harga acuan (default_price) dan foto resmi (official_images) tetap boleh —
-- dua kolom itulah yang ditulis Server Action etalase. Admin tidak terpengaruh.
--
-- Pola search_path mengikuti migrasi 20261016081500_current_actor_id_search_path.

create or replace function private.products_sales_column_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select private.get_my_role()) = 'sales' then
    if old.brand is distinct from new.brand
      or old.model_name is distinct from new.model_name
      or old.specs is distinct from new.specs
      or old.second_images is distinct from new.second_images
      or old.is_active is distinct from new.is_active
      or old.image_url is distinct from new.image_url then
      raise exception 'Sales hanya boleh mengubah harga acuan dan foto resmi produk.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_sales_column_guard on public.products;
create trigger products_sales_column_guard
  before update on public.products
  for each row
  execute function private.products_sales_column_guard();
