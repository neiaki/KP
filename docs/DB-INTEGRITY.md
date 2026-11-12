# Integritas Database dan Runbook Verifikasi

Status: **usulan, belum disetujui, belum dijalankan**. Dokumen ini membandingkan
aturan yang dijaga Server Action dengan yang dijaga PostgreSQL, lalu menjelaskan
cara menguji migrasi usulan di database sekali pakai.

SQL lengkap ada di
[`migrations-proposed/20261025090000_db_integrity.sql`](migrations-proposed/20261025090000_db_integrity.sql).
Tidak ada migrasi lama yang diubah.

## 1. Batas dan metode

- Sumber yang dibaca: seluruh `supabase/migrations/*.sql`,
  `src/lib/actions/*.ts`, `src/lib/validations.ts`, `src/lib/pricing.ts`, dan
  `src/db/schema.ts`.
- Tidak ada database yang disentuh. Semua baris di bawah berlevel bukti
  **[BACA-KODE]**.
- Migrasi usulan sengaja tidak diletakkan di `supabase/migrations/`. Tiga test
  menganggap setiap file `.sql` di folder itu sudah disetujui dan ikut deploy:
  `run-all-pending`, `migration-ledger`, dan `deployment-runbook`. Setelah owner
  menyetujui, pindahkan file dengan timestamp baru dan perbarui ledger/runbook.
- Aturan bisnis tidak diubah. Usulan yang menyentuh kebijakan harga (bagian M)
  ditandai OPSIONAL dan wajib diputuskan owner.

## 2. Tabel aturan, penjagaan kode, dan penjagaan DB

| No | Aturan | Dijaga di kode? | Dijaga di DB? | Usulan |
|---:|---|---|---|---|
| 1 | IMEI unit asli tepat 15 digit; unit demo boleh NULL | Ya. `IMEI_PATTERN`/`imeiSchema` di `validations.ts:11-16` | Ya. `inventory_units_imei_check` dan `inventory_units_demo_imei_check` di `20261023112316_demo_inventory_imei_nullable.sql`; `trade_in_records_imei_check` di `0001:120` | Tidak perlu |
| 2 | IMEI unit unik | Ya. Cek duplikat batch dan tangkap `23505` | Ya. `inventory_units.imei UNIQUE` | Tidak perlu. Unik global berarti IMEI yang pernah sold tidak bisa didaftarkan lagi; perilaku lama |
| 3 | Kode tiket `SRV-YYYYMMDD-XXXXXXXX` dan unik | Ya. `TICKET_CODE_PATTERN`; `createTicket` mengosongkan kode agar trigger DB mengisi | Ya. check format dan unique di `20260926103000_strengthen_ticket_codes.sql` | Tidak perlu |
| 4 | Hanya unit `available` yang boleh dijual | Ya. `pos.ts` memakai `for update` dan filter status; RPC sama | Tidak. Tidak ada constraint yang memaksa `transaction_items.unit_id` berasal dari unit available | **A dan B** |
| 5 | Unit `sold` hanya lewat POS atau transaksi | Ya. `updateUnitStatus` menolak sold; POS satu-satunya jalur aplikasi | Sebagian. `trg_prevent_sold_reactivation` hanya menolak sold kembali ke status lain; update langsung menjadi sold tetap boleh | **C dan D** |
| 6 | Unit sold tidak boleh diubah kondisi, harga, atau identitasnya | Ya. `updateUnitDetails` menolak unit sold dan harga <= modal | Tidak. Trigger lama hanya menyala saat kolom status berubah | **E** |
| 7 | `final_payment = max(0, total_amount - trade_in_deduction)` | Ya. `finalPaymentAmount` di `pricing.ts`; dipakai POS dan RPC | Tidak. Hanya check non-negatif | **F** |
| 8 | `total_fee = sparepart_fee + labor_fee` | Ya. `updateTicket` menghitung ulang dari nilai DB | Tidak. Hanya check non-negatif | **G** |
| 9 | `total_amount = jumlah transaction_items.unit_price` | Ya. POS menulis total dan item dari harga unit yang sama | Tidak. Skema mengizinkan total yang tidak cocok | **H** |
| 10 | Harga jual unit tidak di bawah modal | Sebagian. `updateUnitDetails` menolak, tetapi `registerUnits` tidak memeriksa dan POS memakai harga DB apa adanya | Tidak. Hanya check non-negatif | **M, OPSIONAL, keputusan owner** |
| 11 | Teknisi tiket harus berperan `technician` | Sebagian. `createTicket` mengisi sendiri bila pembuat teknisi, tetapi `updateTicket` hanya memvalidasi UUID | Tidak. FK hanya memastikan profil ada | **I**; action juga perlu diperbaiki |
| 12 | Sales hanya mencatat tiket, tidak mengubah biaya atau status | Ya untuk biaya/status; `costBreakdown`, `technicianNotes`, `warrantyDays`, dan `technicianId` masih bisa ditulis sales | Tidak. RLS mengizinkan semua staf update; tidak ada column guard | **J**; celah `costBreakdown` dicatat di bagian 4 |
| 13 | Minimal satu admin dan admin tidak boleh mengubah perannya sendiri | Ya. `wouldLeaveNoAdmin` dipakai `auth.ts`; self-role ditolak | Tidak. RLS `profiles_admin_write` mengizinkan admin update/delete | **L** |
| 14 | Transaksi baru dari sesi pengguna harus memakai `sales_id` sendiri | Ya. POS memakai profil sesi; RPC memeriksa `p_sales_id = auth.uid()` | Tidak. RLS hanya memeriksa role admin/sales | **K** |
| 15 | Harga item transaksi harus harga unit saat jual; unit demo tidak boleh dijual | Ya. POS membaca `selling_price` DB dan menolak unit demo | Tidak. `transaction_items.unit_price` hanya check non-negatif | **B** |
| 16 | Status unit `sold` terminal dan alur tiket resmi | Ya. `REPAIR_FLOW` dan `isAllowedTransition` | Ya. `trg_prevent_sold_reactivation` dan `trg_validate_ticket_transition` | Tidak perlu |
| 17 | Audit perubahan status unit dan tiket | Ya. Action menulis aktor lewat `setAuditActor` | Ya. `unit_status_audit`, `service_ticket_audit`, dan trigger di `0007_audit_trail.sql` | Tidak perlu untuk status. Aktor bisa NULL pada jalur PostgREST langsung |
| 18 | Audit perubahan harga dan stok | Tidak. Tidak ada penulisan audit harga di action | Tidak. Trigger audit hanya status | Tidak masuk migrasi ini; catat di `STATUS.md` |
| 19 | Sales hanya boleh mengubah harga acuan dan foto resmi produk | Ya. `updateProductListing` hanya menulis dua kolom | Ya. `products_sales_column_guard()` di `20261024120000_products_sales_column_guard.sql` | Tidak perlu |
| 20 | Username wajib, unik, dan formatnya terbatas | Ya. Schema login dan staff | Ya. `profiles_username_key` dan format check di `0005_username_login.sql` | Tidak perlu |
| 21 | Relasi tabel memakai foreign key | Ya. Action memakai ID dari DB | Ya. FK utama di `0001`; `profiles.id -> auth.users.id ON DELETE CASCADE` di `0004` | Tidak perlu |
| 22 | `store_settings` hanya satu baris | Tidak relevan untuk action | Ya. `store_settings_id_check (id = 1)` | Tidak perlu |
| 23 | `invoice_number` unik | Ya. Action membiarkan kosong dan membaca hasil trigger | Ya. Unique dan trigger generator di `0001` | Tidak perlu |
| 24 | Path foto Storage hanya milik staf sendiri | Ya. Validasi path di `validations.ts` dan action Storage | Tidak. Policy Storage mengizinkan semua staf menulis bucket | Di luar migrasi ini |
| 25 | Produk tidak boleh duplikat merek+model | Tidak ada aturan di action | Tidak ada unique | Tidak diusulkan; bukan invarian yang disebut owner |

## 3. Usulan yang membutuhkan migrasi

Setiap huruf merujuk ke bagian yang sama di file SQL usulan.

### A. Unique index `transaction_items(unit_id)`

- **SQL inti:** `create unique index ... on public.transaction_items (unit_id);`
- **Alasan:** aplikasi mengunci unit dengan `for update`, tetapi jalur SQL
  langsung tetap bisa membuat dua item untuk satu unit. Index ini jaring
  pengaman terakhir anti double-sell.
- **Data lama:** index gagal dibuat bila sudah ada duplikat. Jalankan query 5.1;
  duplikat diselidiki manual, bukan dihapus otomatis.
- **Rollback:** `drop index if exists public.transaction_items_unit_id_key;`
- **Dampak aplikasi:** `executeSale` menangkap `23505` sebagai pesan IMEI
  trade-in. Setelah migrasi, tambahkan pesan khusus untuk pelanggaran index ini.

### B. Guard `transaction_items`

- **SQL inti:** trigger `trg_guard_transaction_item` memanggil
  `private.guard_transaction_item()`.
- **Alasan:** memastikan unit yang dirujuk benar-benar `available`, bukan demo,
  dan `unit_price` sama dengan `selling_price` di database. Menutup payload
  harga palsu lewat PostgREST dan RPC yang belum memeriksa `is_demo`.
- **Data lama:** trigger hanya berlaku untuk insert/update baru. Jangan memakai
  query 5.2 sebagai syarat migrasi; selisih harga lama wajar.
- **Rollback:** drop trigger dan function.
- **Catatan:** POS dan RPC membaca harga dari DB, jadi harus lolos. Impor stok
  lama dengan harga berbeda perlu disesuaikan sebelum trigger diaktifkan.

### C. Item transaksi menandai unit sold

- **SQL inti:** trigger `trg_mark_unit_sold_from_item` menjalankan
  `update inventory_units set status = 'sold' where id = new.unit_id and status = 'available'`.
- **Alasan:** mencegah penulis SQL langsung membuat item lalu meninggalkan unit
  tetap `available`. Update status oleh POS menjadi no-op dan tidak menambah
  baris audit karena status lama dan baru sama.
- **Data lama:** trigger hanya untuk insert baru; audit dengan query 5.3.
- **Rollback:** drop trigger dan function.

### D. Status sold wajib punya item transaksi

- **SQL inti:** trigger `trg_require_transaction_item_for_sold`.
- **Alasan:** menutup arah sebaliknya, yaitu `update inventory_units set status
  = 'sold'` tanpa nota. POS memasukkan item lebih dulu, jadi lolos.
- **Data lama:** trigger hanya saat transisi ke sold; query 5.4 untuk audit.
- **Rollback:** drop trigger dan function.

### E. Unit sold tidak boleh diedit

- **SQL inti:** trigger `trg_prevent_sold_unit_edit` menolak perubahan `imei`,
  `product_id`, `condition`, `purchase_cost`, `selling_price`, dan `is_demo`
  saat `old.status = 'sold'`.
- **Alasan:** nota dan garansi sudah terbit, jadi identitas dan angka jual tidak
  boleh berubah. Koreksi manual harus lewat prosedur maintenance yang sadar
  menonaktifkan trigger.
- **Rollback:** drop trigger dan function.

### F. Check `final_payment`

- **SQL inti:** `check (final_payment = greatest(total_amount - trade_in_deduction, 0)) not valid`.
- **Alasan:** rumus yang sama dipakai `pricing.ts` dan RPC; tanpa check, update
  langsung bisa membuat nota dengan sisa bayar tidak konsisten.
- **Data lama:** `NOT VALID`; query 5.5. Setelah bersih, jalankan
  `alter table public.transactions validate constraint transactions_final_payment_formula_chk;`.
- **Rollback:** drop constraint.

### G. Check `total_fee`

- **SQL inti:** `check (total_fee = sparepart_fee + labor_fee) not valid`.
- **Alasan:** `updateTicket` menghitung ulang total dari komponen DB; check ini
  menjaga jalur update langsung.
- **Data lama:** `NOT VALID`; query 5.6. Validasi penuh setelah bersih.
- **Rollback:** drop constraint.

### H. Total transaksi sama dengan jumlah item

- **SQL inti:** constraint trigger `trg_check_transaction_total_tx` dan
  `trg_check_transaction_total_items`, deferred sampai commit.
- **Alasan:** header dan item ditulis dalam dua pernyataan; constraint trigger
  memeriksa setelah keduanya selesai. Transaksi tanpa item atau total berbeda
  ditolak.
- **Data lama:** hanya insert/update baru; query 5.7 dan 5.8 untuk audit.
- **Rollback:** drop kedua trigger dan function.
- **Catatan:** kalau owner mengizinkan nota jasa tanpa unit, bagian ini harus
  diubah sebelum diterapkan.

### I. Role teknisi tiket

- **SQL inti:** trigger `trg_guard_ticket_technician`.
- **Alasan:** `updateTicket` hanya memvalidasi UUID, bukan role. UI mungkin
  memfilter, tetapi Server Action adalah endpoint HTTP.
- **Data lama:** trigger hanya saat insert atau `technician_id` diubah; query
  5.9 untuk audit. Update yang tidak menyentuh kolom itu tidak terpengaruh.
- **Rollback:** drop trigger dan function.
- **Tindak lanjut kode:** `updateTicket` sebaiknya memvalidasi role dan memberi
  pesan spesifik.

### J. Sales tidak boleh mengubah biaya/status tiket

- **SQL inti:** trigger `trg_service_ticket_sales_guard`.
- **Alasan:** RLS mengizinkan semua staf update. Action menolak sales untuk
  `sparepartFee`, `laborFee`, dan `repairStatus`, tetapi PostgREST langsung
  tidak. Trigger menyamakan kedua jalur.
- **Data lama:** hanya update baru oleh sesi sales. Server Action memakai
  service role, jadi tidak terpengaruh; guard action tetap yang utama.
- **Rollback:** drop trigger dan function.
- **Celah terpisah:** sales masih bisa mengubah `costBreakdown`,
  `technicianNotes`, `warrantyDays`, dan `technicianId` di action. Belum ada
  aturan tertulis; jangan diperluas diam-diam di trigger ini.

### K. `sales_id` harus aktor sesi

- **SQL inti:** trigger `trg_guard_transaction_actor`.
- **Alasan:** RLS hanya memeriksa role admin/sales, bukan pemilik `sales_id`.
  Sesi sales bisa membuat transaksi atas nama orang lain lewat PostgREST.
- **Data lama:** hanya insert baru dari sesi dengan `auth.uid()`. Server Action
  memakai service role, jadi tidak berubah. RPC sudah memeriksa hal yang sama.
- **Rollback:** drop trigger dan function.
- **Catatan:** update `sales_id` oleh admin tidak dicakup; buat aturan terpisah
  kalau koreksi admin dibutuhkan.

### L. Minimal satu admin dan larangan self-role

- **SQL inti:** trigger `trg_guard_profile_role` dengan
  `pg_advisory_xact_lock(hashtext('atcell-last-admin'))`.
- **Alasan:** `wouldLeaveNoAdmin` tidak atomik. Dua admin yang saling menurunkan
  bersamaan bisa sama-sama melihat dua admin. Advisory lock membuat pemeriksaan
  dan perubahan berurutan, sekaligus menolak admin mengubah perannya sendiri.
- **Data lama:** hanya update role/delete. Action service role tetap bisa
  mengubah role non-terakhir. Profil auth yatim tidak diperbaiki trigger ini.
- **Rollback:** drop trigger dan function.

### M. OPSIONAL: harga jual tidak di bawah modal

- **SQL inti:** `check (selling_price >= purchase_cost) not valid`.
- **Alasan:** `updateUnitDetails` sudah menolak, tetapi `registerUnits` tidak.
  Tanpa check, unit baru bisa didaftarkan di bawah modal dan POS menjualnya apa
  adanya.
- **Data lama:** `NOT VALID`; query 5.10. Baris baru/updated ditolak. Harga
  impas tetap diizinkan.
- **Keputusan owner:** kalau toko sengaja memakai loss leader, hapus bagian M
  sebelum migrasi dijalankan. Ini keputusan bisnis, bukan bug.
- **Rollback:** drop constraint.

## 4. Temuan yang tidak masuk migrasi ini

1. **Audit harga dan stok belum ada.** `0007_audit_trail.sql` hanya mencatat
   perubahan status. Perubahan harga produk, biaya unit, biaya servis, dan
   nominal transaksi tidak punya jejak aktor. Usulan: tabel audit append-only
   dan trigger harga, atau keputusan owner untuk tidak mencatat.
2. **Aktor audit NULL pada jalur PostgREST.** `private.current_actor_id()` hanya
   membaca `atcell.actor_id` yang diset Server Action. Perubahan langsung lewat
   PostgREST tercatat NULL. Bukan eskalasi, tetapi mengurangi kegunaan audit;
   fallback `auth.uid()` ada di keputusan D3.
3. **Sales masih bisa mengubah `costBreakdown`, `technicianNotes`,
   `warrantyDays`, dan `technicianId`.** Guard action hanya memeriksa biaya dan
   status. Belum ada aturan tertulis apakah itu disengaja.
4. **`registerUnits` tidak memeriksa harga jual > modal.** Bagian M adalah
   usulan DB; action sebaiknya juga memeriksa di server.
5. **RPC `process_trade_in_sale` tidak memeriksa `is_demo`.** Aplikasi tidak
   memakai RPC ini lagi, tetapi fungsi masih bisa dieksekusi service role.
   Trigger B menutup jalur ini bila disetujui.
6. **Policy Storage mengizinkan semua staf menulis kedua bucket.** Validasi
   path ada di action, bukan di policy. Ini policy Storage, bukan constraint
   tabel.
7. **`products` tidak punya unique (brand, model_name).** Tidak ada aturan owner
   yang melarang duplikat katalog; tidak diusulkan.
8. **`trade_in_records.imei` tidak unik.** Kalau owner ingin menerima trade-in
   ulang handset yang sama, aturan unik global di `inventory_units` perlu
   ditinjau. Ini keputusan bisnis.

## 5. Query pelanggaran sebelum migrasi

Jalankan di database lokal/staging, jangan di production. Catat jumlah baris
setiap query. Kalau ada pelanggaran, perbaiki manual dulu; jangan hapus
otomatis.

Daftar periksa:

- 5.1 duplikat unit di item transaksi
- 5.2 item dengan harga/status yang tidak cocok
- 5.3 item transaksi yang unitnya belum sold
- 5.4 unit sold tanpa item transaksi
- 5.5 `final_payment` tidak sesuai rumus
- 5.6 `total_fee` tiket tidak sesuai komponen
- 5.7 transaksi tanpa item
- 5.8 total transaksi tidak sama dengan jumlah item
- 5.9 tiket dengan teknisi bukan role technician
- 5.10 unit di bawah modal (khusus keputusan M)
- 5.11 jumlah admin

### 5.1 Duplikat unit di transaction_items (wajib 0 untuk index A)

```sql
select unit_id, count(*) as jumlah
  from public.transaction_items
 group by unit_id
having count(*) > 1
 order by jumlah desc, unit_id;
```

### 5.2 Item dengan harga/status yang tidak cocok (informasi, bukan syarat)

```sql
select ti.id, ti.transaction_id, ti.unit_id, ti.unit_price,
       u.selling_price, u.status, u.is_demo
  from public.transaction_items ti
  join public.inventory_units u on u.id = ti.unit_id
 where ti.unit_price <> u.selling_price
    or u.status <> 'sold'
    or u.is_demo;
```

### 5.3 Item transaksi yang unitnya belum sold (informasi)

```sql
select ti.id, ti.transaction_id, ti.unit_id, u.status
  from public.transaction_items ti
  join public.inventory_units u on u.id = ti.unit_id
 where u.status <> 'sold';
```

### 5.4 Unit sold tanpa item transaksi

```sql
select u.id, u.imei, u.status
  from public.inventory_units u
 where u.status = 'sold'
   and not exists (
     select 1 from public.transaction_items ti where ti.unit_id = u.id
   );
```

### 5.5 `final_payment` tidak sesuai rumus

```sql
select id, total_amount, trade_in_deduction, final_payment,
       greatest(total_amount - trade_in_deduction, 0) as seharusnya
  from public.transactions
 where final_payment <> greatest(total_amount - trade_in_deduction, 0);
```

### 5.6 `total_fee` tiket tidak sesuai komponen

```sql
select id, ticket_code, sparepart_fee, labor_fee, total_fee,
       sparepart_fee + labor_fee as seharusnya
  from public.service_tickets
 where total_fee <> sparepart_fee + labor_fee;
```

### 5.7 Transaksi tanpa item

```sql
select t.id, t.invoice_number, t.total_amount
  from public.transactions t
 where not exists (
   select 1 from public.transaction_items ti where ti.transaction_id = t.id
 );
```

### 5.8 Total transaksi tidak sama dengan jumlah item

```sql
select t.id, t.invoice_number, t.total_amount,
       coalesce(sum(ti.unit_price), 0) as jumlah_item
  from public.transactions t
  left join public.transaction_items ti on ti.transaction_id = t.id
 group by t.id, t.invoice_number, t.total_amount
having t.total_amount <> coalesce(sum(ti.unit_price), 0);
```

### 5.9 Tiket dengan teknisi bukan role technician

```sql
select st.id, st.ticket_code, st.technician_id, p.role
  from public.service_tickets st
  join public.profiles p on p.id = st.technician_id
 where p.role <> 'technician';
```

### 5.10 Unit di bawah modal (untuk keputusan M)

```sql
select id, imei, purchase_cost, selling_price
  from public.inventory_units
 where selling_price < purchase_cost
 order by id;
```

### 5.11 Jumlah admin

```sql
select count(*) as jumlah_admin from public.profiles where role = 'admin';
```

## 6. Batas keselamatan runbook

- Hanya boleh menunjuk ke database sekali pakai, database lokal, atau staging.
  Jangan pernah memakai connection string production.
- Jangan memakai `supabase db push` untuk database production. Repo ini memakai
  ledger manual seperti dijelaskan di `DEPLOYMENT-REDUNDANCY.md`.
- Jangan menjalankan `DROP`, `TRUNCATE`, atau `DELETE` tanpa `WHERE` pada data
  yang bukan milik database uji. Ambil snapshot atau dump sebelum menerapkan
  migrasi usulan.
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

Kalau hasil query tidak sesuai database uji yang Anda buat, **berhenti**. Untuk
staging Supabase, set `VERIFY_ALLOW_REMOTE=1` hanya setelah membandingkan
project ref dengan production.

## 7. Jalur verifikasi

### 7.1 CI `database-tests` (paling aman)

Workflow `.github/workflows/database-tests.yml` membuat database dari nol di
runner dan tidak pernah menyentuh production.

1. Buat PR yang memuat perubahan migrasi atau test database.
2. Buka tab Checks, lalu jalankan atau tunggu job `database-tests`.
3. Workflow akan:
   - membuat PostgreSQL 17;
   - membuat schema `auth`/`storage` dan role `anon`, `authenticated`,
     `service_role` (bukan replika Supabase penuh);
   - menerapkan seluruh `supabase/migrations/*.sql` berurutan;
   - mengisi ledger dari `supabase/migrations-ledger.snapshot`;
   - memberi seed minimum untuk audit trail;
   - menguji policy RLS dengan `auth.uid()` dari `request.jwt.claim.sub`;
   - menjalankan semua test yang memakai `DATABASE_URL`.
4. Catat nomor run, commit, nama job, jumlah test lulus/gagal, dan nama test
   database yang dijalankan.

CI menguji policy RLS dengan role PostgreSQL, tetapi bukan replika Supabase
penuh. Auth, PostgREST, Storage, dan perilaku staging tetap perlu diuji di
Supabase lokal atau staging.

### 7.2 Supabase lokal

Gunakan ini kalau perlu menguji RLS, `auth.uid()`, atau trigger yang bergantung
pada klaim JWT. Supabase CLI bukan dependensi repo; jangan menambahkannya ke
`package.json` hanya untuk runbook ini.

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

Kalau port lokal berbeda, sesuaikan dengan output `supabase status`.

### 7.3 PostgreSQL polos

Jalur ini untuk constraint, trigger, dan ledger. RLS bisa diuji kalau bootstrap
role dan `auth.uid()` disiapkan seperti CI, tetapi Auth, PostgREST, dan Storage
tetap butuh Supabase lokal atau staging. Jalankan guard di bagian 6 lebih dulu.

1. Buat database baru, misalnya `atcell_verify`.
2. Tiru bootstrap dari `.github/workflows/database-tests.yml` bagian
   `Bootstrap Supabase surface yang dipakai migrasi`.
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

### 7.4 Verifikasi migrasi yang sudah ada

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

- `migration-ledger` tidak menemukan selisih antara ledger dan nama berkas.
- `audit-trail-db` menulis mutasi status lalu membaca baris audit dari trigger.
- `pos-concurrent-sale` menjalankan dua penjualan bersamaan dan memastikan tepat
  satu unit terjual.

Kalau salah satu gagal, jangan lanjut ke migrasi usulan. Perbaiki dulu dan ulangi
dari database bersih.

## 8. Verifikasi migrasi usulan

Migrasi usulan ada di
`docs/migrations-proposed/20261025090000_db_integrity.sql`. File itu belum masuk
`supabase/migrations/` dan belum dijalankan.

### 8.1 Sebelum menerapkan

Jalankan semua query bagian 5 terhadap salinan database, lalu catat jumlah
barisnya. Kalau ada pelanggaran, perbaiki manual dulu.

### 8.2 Terapkan di database uji

Ambil snapshot lebih dulu, jalankan guard di bagian 6, lalu:

```bash
psql "$VERIFY_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f docs/migrations-proposed/20261025090000_db_integrity.sql
```

Kalau ada error, transaksi harus rollback. Jangan memaksa dengan
`ON_ERROR_STOP=0`.

### 8.3 Uji negatif

Setiap percobaan harus di dalam transaksi yang diakhiri `ROLLBACK`, supaya data
uji tidak tertinggal.

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
dengan sesi `authenticated` yang sah. PostgreSQL polos tidak punya `auth.uid()`
yang terisi.

### 8.4 Validasi constraint

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

Kalau `VALIDATE CONSTRAINT` gagal, ada data lama yang melanggar. Jangan menghapus
data; selidiki dan perbaiki lewat alur bisnis.

### 8.5 Verifikasi D2 dan D3 (kalau disetujui)

**D3: aktor audit.** Setelah migrasi fallback `auth.uid()` diterapkan:

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

**D2: `completed_at`.** Setelah migrasi `completed_at` diterapkan:

1. Buat tiket, ubah status ke `in_progress`, lalu `completed`.
2. Periksa `completed_at` terisi tepat sekali dan tidak berubah saat edit
   catatan atau biaya.
3. Ubah ke `picked_up`; `completed_at` tidak boleh berubah.
4. Batalkan tiket lain; `completed_at` harus NULL.
5. Jalankan backfill pada salinan data lama; bandingkan jumlah tiket
   `completed` dengan jumlah `completed_at` yang terisi.

## 9. Urutan penerapan dan rollback

Urutan yang disarankan:

1. Jalankan query 5.1. Kalau ada duplikat, selidiki dan perbaiki manual.
2. Putuskan bagian M. Kalau loss leader diizinkan, hapus blok M dari SQL.
3. Pindahkan SQL ke `supabase/migrations/` dengan timestamp baru, perbarui
   `RUN-ALL-PENDING.sql`, ledger, dan runbook.
4. Jalankan di database lokal/staging. Trigger B dapat menolak impor lama yang
   menulis harga berbeda; itu sinyal, bukan alasan melonggarkan trigger.
5. Setelah semua baris baru bersih, jalankan `VALIDATE CONSTRAINT` untuk F, G,
   dan M (kalau M dipakai).
6. Verifikasi ulang empat gerbang repo dan test DB di staging.

Rollback lengkap ada di komentar akhir file SQL usulan. Urutannya: drop
constraint M, trigger L/K/J/I/H, constraint G/F, trigger E/D/C/B, lalu index A.
Rollback tidak menghapus data; semua objek baru di-drop.

Kalau migrasi D2/D3 dibuat terpisah, sediakan rollback masing-masing:

- D3: kembalikan definisi `private.current_actor_id()` ke versi sebelumnya.
- D2: drop kolom `completed_at` setelah memastikan tidak ada laporan yang
  memakainya.

Kalau rollback gagal atau data tidak konsisten, pulihkan snapshot database uji.
Jangan mencoba memperbaiki production secara manual tanpa backup.

## 10. Bukti yang harus dicatat

Salin template ini ke issue PR atau catatan rilis:

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

Setelah verifikasi:

- Perbarui `supabase/migrations-ledger.snapshot` hanya setelah migrasi benar
  benar diterapkan di production.
- Tambahkan migrasi ke tabel di `DEPLOYMENT-REDUNDANCY.md`.
- Jalankan empat gerbang repo: `bun run test`, `bunx tsc --noEmit`,
  `bun run lint`, `bun run build`.
- Jangan push atau menerapkan ke production tanpa persetujuan owner.
