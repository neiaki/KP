-- Kolom waktu serah terima unit servis (FR-B-04).
--
-- FR-B-04 meminta pencatatan garansi perbaikan, dan garansi servis punya
-- awal yang jelas: saat unit benar-benar diserahkan ke pelanggan. Tanpa
-- kolom ini, halaman lacak publik hanya bisa menampilkan "30 hari" tanpa
-- titik mulai, dan tidak ada bukti kapan unit keluar dari toko.
--
-- Nilainya diisi trigger transisi status, bukan oleh aplikasi saja, supaya
-- jalur di luar Server Action (SQL Editor, psql operator) tetap tercatat.
-- Server Action tetap mengisi kolomnya eksplisit supaya baris hasilnya
-- langsung membawa waktu pengambilan.
--
-- `coalesce(new.picked_up_at, now())` membuat pengisian hanya terjadi sekali:
-- replay migrasi atau UPDATE ulang pada tiket yang sudah diambil tidak
-- menggeser waktu serah terima yang sudah tercatat.
--
-- Idempoten (IF NOT EXISTS dan CREATE OR REPLACE) dan tidak menyentuh data:
-- aman dijalankan berulang lewat supabase db push maupun paste SQL Editor.
alter table public.service_tickets
  add column if not exists picked_up_at timestamptz;

create or replace function public.validate_service_ticket_transition()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  if new.repair_status = old.repair_status then
    return new;
  end if;

  if not (
    (old.repair_status = 'received' and new.repair_status in ('diagnosing', 'cancelled')) or
    (old.repair_status = 'diagnosing' and new.repair_status in ('waiting_approval', 'cancelled')) or
    (old.repair_status = 'waiting_approval' and new.repair_status in ('in_progress', 'cancelled')) or
    (old.repair_status = 'in_progress' and new.repair_status in ('testing', 'cancelled')) or
    (old.repair_status = 'testing' and new.repair_status in ('completed', 'in_progress', 'cancelled')) or
    (old.repair_status = 'completed' and new.repair_status = 'picked_up')
  ) then
    raise exception 'INVALID_REPAIR_TRANSITION';
  end if;

  if new.repair_status = 'picked_up' then
    new.picked_up_at := coalesce(new.picked_up_at, now());
  end if;

  return new;
end;
$$;
