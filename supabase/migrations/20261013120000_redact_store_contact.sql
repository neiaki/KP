-- Kontak toko keluar dari repo. Nilai aslinya pernah ditulis langsung di
-- 20260927140000_store_owner_and_real_contact.sql, dan nomor itu memang tampil
-- di situs publik lewat footer serta tombol WhatsApp, jadi tidak ada yang
-- berpura-pura nilainya belum pernah terlihat. Yang diubah di sini adalah
-- kebijakan ke depan: repo tidak lagi menjadi tempat menyimpan nomor dan nama
-- penanggung jawab.
--
-- Migrasi ini mengganti ketiganya dengan nilai sintetis yang jelas bukan nomor
-- sungguhan. Nilai sungguhan diisi ulang lewat portal/settings oleh admin
-- setelah migrasi ini jalan di production, dan sejak itu hanya hidup di
-- database production, tidak pernah di repo.
--
-- Catatan: riwayat git lama tetap memuat nilai aslinya. Sama seperti IP pada
-- insiden PR #69, yang bisa dilakukan repo hanyalah berhenti menulisnya mulai
-- dari commit ini.

update public.store_settings
set phone_number    = '+62 800-0000-0000',
    whatsapp_number = '6280000000000',
    owner_name      = ''
where id = 1;
