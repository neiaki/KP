-- Registry gambar produk + bucket Supabase Storage.
--
-- Latar: foto produk sebelumnya hanya file lokal di public/products/ sehingga
-- tidak terlihat di database dan tidak bisa dikelola staf dari portal.
-- Foto servis dan trade-in sudah memakai Storage, jadi produk mengikuti pola
-- yang sama supaya ada satu sumber kebenaran.
--
-- Tabel ini adalah daftar (registry) gambar, bukan tempat menyimpan biner.
-- Binernya ada di bucket Storage "product-images"; kolom path dan public_url
-- menunjuk ke sana.

-- 1) Bucket Storage publik. Produk tampil di katalog publik, jadi bucketnya
--    public supaya URL bisa dipakai <img> tanpa token.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Jenis gambar. "hero" dipakai foto carousel halaman depan yang modelnya
--    tidak ada di katalog, jadi product_id-nya null.
create type public.image_kind as enum ('official', 'second', 'hero', 'payment');

-- 3) Tabel registry.
create table public.product_images (
  id bigint generated always as identity primary key,
  -- null untuk foto hero dan logo pembayaran: gambarnya ada di web tapi tidak
  -- menempel pada satu produk di katalog.
  product_id bigint references public.products(id) on delete cascade,
  path text not null unique,
  public_url text not null,
  kind public.image_kind not null default 'official',
  -- Wajib deskriptif karena alt teks ini dipakai sebagai fallback alt saat
  -- merender gambar, dan gambar produk adalah konten utama katalog.
  alt_text text not null default '',
  byte_size integer not null default 0 check (byte_size >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.product_images is
  'Daftar gambar produk dan aset web. Binernya ada di bucket Storage product-images.';
comment on column public.product_images.path is
  'Path objek di bucket Storage, tanpa domain. Contoh: products/iphone-13-1.jpg';
comment on column public.product_images.is_primary is
  'Gambar sampul produk. Dipakai sebagai products.image_url.';

create index product_images_product_idx on public.product_images(product_id);
create index product_images_kind_idx on public.product_images(kind);

-- 4) RLS. Daftar gambar bukan data sensitif: nama file, ukuran, dan alt teks
--    sudah tampil di halaman publik. Yang dilindungi adalah hak ubah.
alter table public.product_images enable row level security;

create policy "product_images_public_read"
  on public.product_images
  for select
  to anon, authenticated
  using (true);

create policy "product_images_staff_write"
  on public.product_images
  for insert
  to authenticated
  with check (private.is_staff());

create policy "product_images_staff_update"
  on public.product_images
  for update
  to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create policy "product_images_admin_delete"
  on public.product_images
  for delete
  to authenticated
  using ((select private.get_my_role()) = 'admin');
