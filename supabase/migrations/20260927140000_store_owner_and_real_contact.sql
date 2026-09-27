-- Nama pemilik toko, dipakai sebagai nama orang yang dihubungi lewat WhatsApp.
--
-- Catatan: kolom ini tidak ada sebelumnya, padahal nomor WhatsApp toko sudah
-- dipakai di footer, katalog, POS, dan widget live chat. Tanpa nama, pelanggan
-- hanya melihat nomor telepon tanpa tahu siapa yang akan membalas.

alter table public.store_settings
  add column if not exists owner_name text not null default '';

comment on column public.store_settings.owner_name is
  'Nama pemilik toko. Tampil di ajakan WhatsApp agar pelanggan tahu siapa yang akan membalas.';

-- Nomor WhatsApp dan telepon toko sebelumnya berisi angka contoh
-- (081234567890), bukan nomor asli. Karena kolom itu terisi, nilai cadangan di
-- kode tidak pernah dipakai, dan link wa.me yang dihasilkan tidak valid:
-- WhatsApp tidak mengenali format nomor lokal tanpa kode negara.
update public.store_settings
set phone_number    = '+62 857-7539-8389',
    whatsapp_number = '6285775398389',
    owner_name      = 'Steven Eka'
where id = 1;
