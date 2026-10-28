# Runbook Verifikasi Database untuk Migrasi Usulan

Status: **belum dijalankan**. Dokumen ini operasional, bukan klaim bahwa
migrasi sudah teruji. Jangan menerapkannya ke production sebelum owner
menyetujui `docs/OWNER-DECISION-BRIEF.md`.

Tujuan: menguji migrasi di database sekali pakai atau staging, membuktikan
constraint dan trigger bekerja, lalu mencatat bukti yang bisa diperiksa ulang.

## 1. Batas keselamatan

- Hanya boleh menunjuk ke database sekali pakai, database lokal, atau staging.
  Jangan pernah memakai connection string production.
- Sebelum menjalankan apa pun, cetak identitas database:

```sql
select current_database(), current_user, inet_server_addr(), version();
```

- Kalau nama database atau host tidak dikenali, **berhenti**.
- Jangan memakai `supabase db push` untuk database production. Repo ini memakai
  ledger manual seperti dijelaskan di `docs/DEPLOYMENT-REDUNDANCY.md`.
- Jangan menjalankan `DROP`, `TRUNCATE`, atau `DELETE` tanpa `WHERE` pada data
  yang bukan milik database uji.
- Ambil snapshot atau dump sebelum menerapkan migrasi usulan.
- Jangan menyalin kredensial ke log, issue, atau dokumen.
- Gunakan variabel `VERIFY_DATABASE_URL`, bukan `DATABASE_URL`. Di repo ini
  `DATABASE_URL` adalah connection pooler Supabase production; jangan
  mengekspornya ke shell saat menjalankan runbook ini.
- Jalankan guard berikut sebelum operasi tulis dan pastikan targetnya benar:

```bash
: "${VERIFY_DATABASE_URL:?Isi VERIFY_DATABASE_URL ke database uji}"
case "$VERIFY_DATABASE_URL" in
  *atcell.my.id*)
    echo "Tolak: VERIFY_DATABASE_URL menunjuk host production" >&2
    exit 1
    ;;
  *supabase.co*|*supabase.com*)
    if [ "${VERIFY_ALLOW_REMOTE:-0}" != "1" ]; then
      echo "Tolak: host Supabase remote. Set VERIFY_ALLOW_REMOTE=1 hanya setelah memastikan project ref bukan production." >&2
      exit 1
    fi
    ;;
esac
psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  'select current_database(), current_user, inet_server_addr();'
```

Kalau hasil query tidak sesuai database uji yang Anda buat, **berhenti**.
Untuk staging Supabase, set `VERIFY_ALLOW_REMOTE=1` hanya setelah membandingkan
project ref dengan production; jangan memakai nilai itu untuk project
production.

## 2. Jalur utama: CI `database-tests`

Workflow `.github/workflows/database-tests.yml` adalah jalur paling aman karena
database dibuat dari nol di runner dan tidak pernah menyentuh production.

1. Buat PR yang memuat perubahan migrasi atau test database.
2. Buka tab Checks, lalu jalankan atau tunggu job `database-tests`.
3. Workflow akan:
   - membuat PostgreSQL 17,
   - membuat schema `auth`/`storage` dan role `anon`, `authenticated`,
     `service_role` (bukan replika Supabase penuh),
   - menerapkan seluruh `supabase/migrations/*.sql` berurutan,
   - mengisi ledger dari `supabase/migrations-ledger.snapshot`,
   - memberi seed minimum untuk audit trail,
   - menjalankan semua test yang memakai `DATABASE_URL`.
4. Bukti yang dicatat: nomor run, commit, nama job, jumlah test lulus/gagal,
   dan nama test database yang dijalankan.

Catatan: workflow ini **tidak** menguji RLS karena PostgreSQL polos tidak punya
RLS Supabase. Untuk RLS dan `auth.uid()`, gunakan Supabase lokal atau staging.

## 3. Jalur lokal: Supabase lokal

Gunakan ini kalau perlu menguji RLS, `auth.uid()`, atau trigger yang bergantung
pada klaim JWT.

Prasyarat: Supabase CLI sudah terpasang di mesin. Ini bukan dependensi repo;
jangan menambahkannya ke `package.json` hanya untuk runbook ini.

Jika `supabase/config.toml` belum ada, jalankan `supabase init` sekali di root
repo. Tanpa config itu, `supabase start` tidak bisa membuat project lokal.

```bash
supabase init   # hanya jika supabase/config.toml belum ada
supabase start
supabase db reset
```

`supabase db reset` menerapkan migrasi repo ke database lokal. Setelah itu:

```bash
VERIFY_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
DATABASE_URL="$VERIFY_DATABASE_URL" bun run test
```

Kalau port lokal berbeda, sesuaikan dengan output `supabase status`. Jangan
menyalin connection string production.

## 4. Jalur lokal: PostgreSQL polos

Jalur ini hanya untuk constraint, trigger, dan ledger. RLS tidak diuji.
Jalankan guard di bagian 1 lebih dulu. Set variabel database uji sebelum
langkah menulis:

```bash
VERIFY_DATABASE_URL='postgresql://.../atcell_verify'
```

1. Buat database baru, misalnya `atcell_verify`.
2. Tiru bootstrap dari `.github/workflows/database-tests.yml` bagian
   `Bootstrap Supabase surface yang dipakai migrasi`. Bootstrap itu membuat
   schema `auth`/`storage`, role, `auth.users`, `auth.uid()`, dan
   `storage.objects` seperlunya.
3. Terapkan migrasi berurutan:

```bash
for f in supabase/migrations/*.sql; do
  psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -q -f "$f"
done
```

4. Isi ledger dari `supabase/migrations-ledger.snapshot` seperti langkah
   `Isi ledger dari snapshot production` di workflow.
5. Beri seed minimum seperti langkah `Seed data minimum untuk test audit trail`.
6. Jalankan:

```bash
DATABASE_URL="$VERIFY_DATABASE_URL" bun run test
```

## 5. Verifikasi migrasi yang sudah ada

Jalankan di database uji, bukan production:

```bash
VERIFY_DATABASE_URL='postgresql://.../atcell_verify'

DATABASE_URL="$VERIFY_DATABASE_URL" \
  node --experimental-strip-types --test tests/migration-ledger.test.ts

DATABASE_URL="$VERIFY_DATABASE_URL" \
  node --experimental-strip-types --test tests/audit-trail-db.test.ts

DATABASE_URL="$VERIFY_DATABASE_URL" \
  node --experimental-strip-types --test tests/pos-concurrent-sale.test.ts
```

Yang harus terlihat:

- `migration-ledger` membandingkan ledger dengan nama berkas migrasi dan
  tidak menemukan selisih.
- `audit-trail-db` menulis mutasi status lalu membaca baris audit yang dibuat
  trigger.
- `pos-concurrent-sale` menjalankan dua penjualan bersamaan dan memastikan
  tepat satu unit terjual.

Kalau salah satu gagal, jangan lanjut ke migrasi usulan. Perbaiki dulu
penyebabnya dan ulangi dari database bersih.

## 6. Verifikasi migrasi usulan

Migrasi usulan ada di
`docs/migrations-proposed/20261025090000_db_integrity.sql`. File itu belum
masuk `supabase/migrations/` dan belum dijalankan.

### 6.1 Sebelum menerapkan

Jalankan query pelanggaran dari `docs/db-integrity-proposals.md` bagian 5
terhadap salinan database:

- 5.1 duplikat unit di item transaksi,
- 5.2 item dengan harga/status yang tidak cocok,
- 5.3 item transaksi yang unitnya belum sold,
- 5.4 unit sold tanpa item transaksi,
- 5.5 `final_payment` tidak sesuai rumus,
- 5.6 `total_fee` tiket tidak sesuai komponen,
- 5.7 transaksi tanpa item,
- 5.8 total transaksi tidak sama dengan jumlah item,
- 5.9 tiket dengan teknisi bukan role technician,
- 5.10 unit di bawah modal (khusus keputusan M),
- 5.11 jumlah admin.

Catat jumlah baris setiap query. Kalau ada pelanggaran, perbaiki manual dulu.
Jangan menghapus otomatis.

### 6.2 Terapkan di database uji

Ambil snapshot lebih dulu, jalankan guard di bagian 1, lalu:

```bash
psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f docs/migrations-proposed/20261025090000_db_integrity.sql
```

Kalau ada error, transaksi harus rollback. Jangan memaksa dengan
`ON_ERROR_STOP=0`.

### 6.3 Uji negatif

Setiap percobaan harus dilakukan di dalam transaksi yang diakhiri `ROLLBACK`,
supaya data uji tidak tertinggal.

| Aturan | Percobaan | Hasil yang diharapkan |
|---|---|---|
| A | Masukkan unit yang sama dua kali ke `transaction_items` | unique violation |
| B | Jual unit yang statusnya bukan `available` | trigger menolak |
| C | Insert item tanpa menandai unit sold | trigger menandai sold atau menolak |
| D | Ubah unit sold menjadi available | trigger menolak |
| E | Ubah harga unit sold | trigger menolak |
| F | Transaksi dengan `final_payment` salah | check constraint menolak |
| G | Tiket dengan `total_fee` tidak sama dengan sparepart + labor | check constraint menolak |
| H | Transaksi dengan total tidak sama dengan item | trigger menolak |
| I | Tiket dengan `technician_id` bukan role technician | trigger menolak |
| J | Sales mengubah biaya atau status tiket | trigger menolak |
| K | Transaksi baru dengan `sales_id` bukan `auth.uid()` | trigger menolak |
| L | Mencabut admin terakhir atau mengubah peran sendiri | trigger menolak |
| M | Harga jual di bawah modal (kalau disetujui) | check constraint menolak |

Untuk aturan yang bergantung pada JWT, gunakan Supabase lokal atau staging
dengan sesi `authenticated` yang sah. PostgreSQL polos tidak punya
`auth.uid()` yang terisi.

### 6.4 Validasi constraint

Setelah data baru bersih:

```sql
alter table public.transactions
  validate constraint transactions_final_payment_formula_chk;
alter table public.service_tickets
  validate constraint service_tickets_total_fee_formula_chk;
```

Constraint `inventory_units_selling_price_not_below_cost_chk` hanya ada kalau
keputusan M dipertahankan. Cek dulu sebelum memvalidasinya:

```sql
select conname
  from pg_constraint
 where conname = 'inventory_units_selling_price_not_below_cost_chk';
```

Kalau barisnya ada, jalankan:

```sql
alter table public.inventory_units
  validate constraint inventory_units_selling_price_not_below_cost_chk;
```

Kalau `VALIDATE CONSTRAINT` gagal, ada data lama yang melanggar. Jangan
menghapus data; selidiki dan perbaiki lewat alur bisnis.

## 7. Verifikasi D2 dan D3 (kalau disetujui)

### D3: aktor audit

Setelah migrasi fallback `auth.uid()` diterapkan:

1. Login sebagai staf di Supabase lokal/staging.
2. Ubah status unit lewat PostgREST langsung, bukan lewat Server Action.
3. Periksa:

```sql
select actor_id, old_status, new_status, created_at
  from public.unit_status_audit
 order by created_at desc
 limit 1;
```

`actor_id` harus sama dengan `auth.uid()` sesi tersebut.

4. Ulangi lewat Server Action. `actor_id` harus tetap sama dengan aktor yang
   diisi `setAuditActor`.
5. Ubah lewat `service_role` atau `psql`. `actor_id` boleh NULL; catat sebagai
   jalur operasional tepercaya.

### D2: `completed_at`

Setelah migrasi `completed_at` diterapkan:

1. Buat tiket, ubah status ke `in_progress`, lalu `completed`.
2. Periksa `completed_at` terisi tepat sekali dan tidak berubah saat edit
   catatan atau biaya.
3. Ubah ke `picked_up`; `completed_at` tidak boleh berubah.
4. Batalkan tiket lain; `completed_at` harus NULL.
5. Jalankan backfill pada salinan data lama; bandingkan jumlah tiket
   `completed` dengan jumlah `completed_at` yang terisi.

## 8. Rollback

Rollback objek ada di komentar bagian akhir
`docs/migrations-proposed/20261025090000_db_integrity.sql`. Urutannya:
drop constraint M, trigger L/K/J/I/H, constraint G/F, trigger E/D/C/B, lalu
index A. Rollback tidak menghapus data.

Kalau migrasi D2/D3 dibuat terpisah, sediakan rollback masing-masing:

- D3: kembalikan definisi `private.current_actor_id()` ke versi sebelumnya.
- D2: drop kolom `completed_at` setelah memastikan tidak ada laporan yang
  memakainya.

Kalau rollback gagal atau data tidak konsisten, pulihkan snapshot database uji.
Jangan mencoba memperbaiki production secara manual tanpa backup.

## 9. Bukti yang harus dicatat

Salin template ini ke `docs/LOOP_LOG.md` atau issue PR:

```text
Tanggal:
Commit:
Database uji (host disamarkan):
Migrasi yang diuji:
Jumlah pelanggaran sebelum migrasi:
Hasil uji negatif:
Hasil VALIDATE CONSTRAINT:
Test migration-ledger:
Test audit-trail-db:
Test pos-concurrent-sale:
Rollback diuji:
Catatan:
```

## 10. Setelah verifikasi

- Perbarui `supabase/migrations-ledger.snapshot` hanya setelah migrasi benar
  benar diterapkan di production.
- Tambahkan migrasi ke tabel di `docs/DEPLOYMENT-REDUNDANCY.md`.
- Jalankan empat gerbang repo: `bun run test`, `bunx tsc --noEmit`,
  `bun run lint`, `bun run build`.
- Jangan push atau menerapkan ke production tanpa persetujuan owner.
