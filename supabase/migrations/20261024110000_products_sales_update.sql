-- Sales boleh memperbarui etalase produk tanpa menyentuh identitas katalog.
--
-- Latar: model katalog yang belum menerima unit tetap tampil ke pembeli
-- dengan harga acuan dan "Foto menyusul". Kebutuhan staf adalah memperbarui
-- harga acuan dan foto resmi model itu, tetapi policy products_admin_write
-- hanya mengizinkan admin, sehingga sales tidak punya jalur apa pun.
--
-- Policy ini mengizinkan UPDATE saja untuk sales; INSERT dan DELETE tetap
-- admin. Pembatasan kolom ditegakkan di Server Action updateProductListing
-- (hanya default_price dan official_images yang ditulis), bukan di sini,
-- karena RLS tidak membatasi kolom. Dua lapis berjalan bersamaan: action
-- membatasi kolom, policy membatasi peran.

drop policy if exists products_sales_update on public.products;
create policy products_sales_update on public.products
  for update to authenticated
  using ((select private.get_my_role()) = 'sales')
  with check ((select private.get_my_role()) = 'sales');
