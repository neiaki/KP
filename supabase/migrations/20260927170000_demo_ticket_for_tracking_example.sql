-- Tiket demo untuk kode contoh di halaman lacak servis publik.
--
-- Latar: halaman /id/tracking mengajari format kode dengan contoh
-- SRV-20260912-7K4M2QX9, jadi pelanggan yang mengikutinya akan menyimpan kode itu
-- lalu mengetiknya. Sebelum migrasi ini kode tersebut tidak ada di database,
-- sehingga setiap orang yang mengikutinya mendapat "Kode tidak ditemukan".
-- Contoh yang tidak bisa dipakai mengajarkan format yang salah.
--
-- Tiket ini memakai data yang jelas ditandai sebagai contoh, lalu dipindahkan
-- melalui hampir seluruh alur status supaya lini masa progress di halaman publik
-- punya isi. Baris auditnya bukan ditulis manual, tapi diturunkan trigger
-- trg_audit_ticket_status, jadi riwayat di sini sama dengan riwayat yang
-- dihasilkan pemakaian nyata.
--
-- Nama pelanggan dan IMEI sengaja memakai angka yang tidak mungkin milik orang
-- sungguhan, supaya halaman publik yang bisa diakses tanpa login tidak
-- membocorkan identitas siapa pun.
--
-- Idempoten. ticket_code punya constraint UNIQUE, jadi insert kedua akan gagal
-- kalau tidak dijaga. Maju status juga dijaga per langkah: trigger
-- validate_service_ticket_transition menolak perpindahan mundur, jadi tanpa
-- syarat "hanya kalau status sekarang masih yang sebelumnya" dijalankan kedua
-- kali akan menabrak validasi itu.

insert into public.service_tickets (
  ticket_code,
  customer_name,
  customer_phone,
  device_model,
  device_name,
  imei_or_sn,
  issue_notes,
  problem_description,
  technician_notes,
  repair_status,
  sparepart_fee,
  labor_fee,
  total_fee,
  warranty_days
)
select
  'SRV-20260912-7K4M2QX9',
  'Pelanggan Contoh',
  '0000-0000-0000',
  'iPhone 13 128GB',
  'Apple iPhone 13 128GB',
  '000000000000000',
  'Layar tidak responsif setelah terkena air',
  'Layar touchscreen tidak merespons di sebagian area, tombol home masih berbunyi',
  'Papan tombol sudah diperiksa, masalah ada di digitizer',
  'received',
  0,
  150000,
  150000,
  30
where not exists (
  select 1 from public.service_tickets
  where ticket_code = 'SRV-20260912-7K4M2QX9'
);

-- Majukan status satu per satu supaya trigger audit terekam tiap perpindahan
-- dan halaman publik menampilkan proses yang berjalan, bukan lompatan ke akhir.
-- Syaratnya status sekarang masih persis status sebelumnya, jadi migrasi ini
-- berhenti di tempat yang benar kalau sudah pernah dijalankan.
update public.service_tickets set repair_status = 'diagnosing'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'received';

update public.service_tickets set repair_status = 'waiting_approval'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'diagnosing';

update public.service_tickets set repair_status = 'in_progress'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'waiting_approval';

update public.service_tickets set repair_status = 'testing'
where ticket_code = 'SRV-20260912-7K4M2QX9' and repair_status = 'in_progress';
