-- Perkuat kode resi servis dari 4 digit (9.000 kombinasi per tanggal) menjadi
-- 8 karakter base32 (32^8 = 1,1 triliun kombinasi) supaya endpoint lacak servis
-- publik tidak bisa ditembus dengan enumerasi.
--
-- Kode lama yang sudah tercetak di nota pelanggan tetap berlaku: fungsi ini
-- hanya mengubah kode yang dibuat ke depan, tidak menyentuh data yang sudah ada.

create or replace function public.generate_ticket_code()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  -- Alfabet base32 tanpa I, L, O, U supaya easy dibaca dan ditulis di nota.
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  d text := to_char(now(), 'YYYYMMDD');
  raw bigint;
  suffix text := '';
  candidate text;
  g int;
begin
  if new.ticket_code is not null and new.ticket_code <> '' then
    return new;
  end if;

  -- Serialisasi generator per hari tetap, dan unique index menjadi jaring pengaman.
  perform pg_advisory_xact_lock(hashtextextended('atcell-ticket-' || d, 0));
  loop
    -- gen_random_uuid() milik pg_catalog, jadi selalu tersedia tanpa extension
    -- dan tanpa menambah schema ke search_path fungsi ini, yang sengaja di-pin
    -- untuk mencegah search_path hijacking. 10 karakter hex pertama = 40 bit,
    -- cukup untuk 8 karakter base32. random() dihindari karena bisa diprediksi
    -- dari urutan pemanggilan.
    raw := ('x' || substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint;
    suffix := '';
    for g in 0..7 loop
      suffix := suffix || substr(alphabet, (((raw >> (35 - 5 * g)) & 31)::int + 1), 1);
    end loop;

    candidate := 'SRV-' || d || '-' || suffix;
    exit when not exists (
      select 1 from public.service_tickets where ticket_code = candidate
    );
  end loop;
  new.ticket_code := candidate;
  return new;
end;
$$;

-- Jaga agar kolom hanya menerima kode dengan bentuk yang didukung, sehingga
-- klausa WHERE pada lacak servis tetap bisa memakai perbandingan persis.
alter table public.service_tickets
  drop constraint if exists service_tickets_ticket_code_format_chk;

alter table public.service_tickets
  add constraint service_tickets_ticket_code_format_chk
  -- [0-9A-HJKMNP-TV-Z] adalah alfabet Crockford base32 yang sama persis dengan
  -- alphabet di fungsi generate_ticket_code() di atas.
  check (ticket_code ~ '^SRV-[0-9]{8}-([0-9]{4}|[0-9A-HJKMNP-TV-Z]{8})$');
