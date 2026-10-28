# Usulan Integritas Data At Cell

Status: **usulan, belum disetujui, belum dijalankan**. Dokumen ini membandingkan
aturan integritas yang dijaga Server Action dengan yang benar-benar dijaga
PostgreSQL di `supabase/migrations/`. Tidak ada migrasi lama yang diubah. SQL
lengkap ada di [`migrations-proposed/20261025090000_db_integrity.sql`](migrations-proposed/20261025090000_db_integrity.sql).

## 1. Batas dan metode

- Sumber yang dibaca: seluruh `supabase/migrations/*.sql`, `src/lib/actions/*.ts`,
  `src/lib/validations.ts`, `src/lib/pricing.ts`, dan `src/db/schema.ts`.
- Tidak ada database yang disentuh. Tidak ada `psql`, Docker, atau koneksi
  production. Semua baris di bawah berlevel bukti **[BACA-KODE]**.
- Migrasi usulan sengaja tidak diletakkan di `supabase/migrations/`. Tiga test
  repo menganggap setiap file `.sql` di folder itu sudah disetujui dan ikut
  deploy: `run-all-pending`, `migration-ledger`, dan `deployment-runbook`.
  Setelah owner menyetujui, pindahkan file ke folder itu dengan timestamp baru
  dan perbarui ledger/runbook.
- Aturan bisnis tidak diubah. Usulan yang menyentuh kebijakan harga (bagian M)
  ditandai OPSIONAL dan wajib diputuskan owner.

## 2. Tabel aturan, penjagaan kode, penjagaan DB, dan usulan

| No | Aturan | Dijaga di kode? | Dijaga di DB? | Usulan |
|---:|---|---|---|---|
| 1 | IMEI unit asli tepat 15 digit; unit demo boleh NULL | Ya. `IMEI_PATTERN` dan `imeiSchema` di `src/lib/validations.ts:11-16`; dipakai registrasi, POS, trade-in | Ya. `inventory_units_imei_check` dan `inventory_units_demo_imei_check` di `20261023112316_demo_inventory_imei_nullable.sql:6-21`; `trade_in_records_imei_check` di `0001_atcell_schema.sql:120` | Tidak perlu |
| 2 | IMEI unit unik | Ya. Cek duplikat batch di `validations.ts:199-202`; action menangkap `23505` di `inventory.ts:119-123` | Ya. `inventory_units.imei UNIQUE` di `0001:77` | Tidak perlu. Catatan: unik global berarti IMEI yang sudah pernah sold tidak bisa didaftarkan lagi; ini perilaku lama, bukan temuan baru |
| 3 | Kode tiket `SRV-YYYYMMDD-XXXXXXXX` dan unik | Ya. `TICKET_CODE_PATTERN` di `validations.ts:21-22`; `createTicket` mengosongkan kode agar trigger DB mengisi (`service.ts:49-56`) | Ya. `service_tickets_ticket_code_format_chk` dan unique di `20260926103000_strengthen_ticket_codes.sql:50-59`; unique di `0001:130` | Tidak perlu |
| 4 | Hanya unit `available` yang boleh dijual | Ya. `pos.ts:62-69` memakai `for update` dan filter `status = 'available'`; RPC sama di `0002:247-253` | Tidak. Tidak ada constraint yang memaksa `transaction_items.unit_id` berasal dari unit available | **A dan B** |
| 5 | Unit `sold` hanya lewat POS atau transaksi | Ya. `updateUnitStatus` menolak status sold (`inventory.ts:152-154`); POS satu-satunya jalur aplikasi | Sebagian. `trg_prevent_sold_reactivation` hanya menolak sold kembali ke status lain (`0001:253-264`); update langsung menjadi sold tetap boleh | **C dan D** |
| 6 | Unit sold tidak boleh diubah kondisi, harga, atau identitasnya | Ya. `updateUnitDetails` menolak unit sold (`inventory.ts:254-272`) dan menolak harga baru <= modal (`inventory.ts:283-293`) | Tidak. Trigger lama hanya menyala saat kolom status berubah | **E** |
| 7 | `final_payment = max(0, total_amount - trade_in_deduction)` | Ya. `finalPaymentAmount` di `src/lib/pricing.ts:37-39`; dipakai `pos.ts:116` dan RPC `0002:259-262` | Tidak. Hanya check non-negatif di `0001:96-98` | **F** |
| 8 | `total_fee = sparepart_fee + labor_fee` | Ya. `service.ts:138-146` menghitung ulang dari nilai DB, bukan payload | Tidak. Hanya check non-negatif di `0001:143-145` | **G** |
| 9 | `total_amount = jumlah transaction_items.unit_price` | Ya. `pos.ts:107-126` menulis total dan item dari harga unit yang sama; RPC sama | Tidak. Skema mengizinkan banyak item dan total yang tidak cocok | **H** |
| 10 | Harga jual unit tidak di bawah modal | Sebagian. `updateUnitDetails` menolak harga baru <= modal (`inventory.ts:283-293`), tetapi `registerUnits` tidak memeriksa (`inventory.ts:78-126`) dan POS memakai harga DB apa adanya (`pos.ts:78`) | Tidak. Hanya check non-negatif di `0001:80-81` | **M, OPSIONAL, keputusan owner** |
| 11 | Teknisi tiket harus berperan `technician` | Sebagian. `createTicket` mengisi sendiri bila pembuat teknisi (`service.ts:63-64`), tetapi `updateTicket` hanya memvalidasi UUID (`validations.ts:348`), bukan role | Tidak. FK hanya memastikan profil ada (`0001:132`) | **I**; action juga perlu diperbaiki di Goal 3 |
| 12 | Sales hanya mencatat tiket, tidak mengubah biaya atau status | Ya untuk biaya/status. Guard di `service.ts:115-123`; tetapi `costBreakdown`, `technicianNotes`, `warrantyDays`, dan `technicianId` masih bisa ditulis sales (`service.ts:154-158`) | Tidak. RLS `tickets_staff_update` mengizinkan semua staf update (`0002:473-477`); tidak ada column guard | **J** untuk biaya/status. Celah `costBreakdown` dicatat di bagian 4 |
| 13 | Minimal satu admin dan admin tidak boleh mengubah perannya sendiri | Ya. `wouldLeaveNoAdmin` di `validations.ts:707-713`; dipakai `auth.ts:534-540` dan `auth.ts:566-571`; self-role ditolak `auth.ts:528` | Tidak. RLS `profiles_admin_write` mengizinkan admin update/delete (`0002:370-374`) | **L** |
| 14 | Transaksi baru dari sesi pengguna harus memakai `sales_id` sendiri | Ya. `pos.ts:110` memakai profil sesi; RPC memeriksa `p_sales_id = auth.uid()` di `0002:238-245` | Tidak. RLS hanya memeriksa role admin/sales (`0002:424-427`) | **K** |
| 15 | Harga item transaksi harus harga unit saat jual; unit demo tidak boleh dijual | Ya. `pos.ts:78` membaca `selling_price` DB; `pos.ts:72-75` menolak unit demo | Tidak. `transaction_items.unit_price` hanya check non-negatif; tidak ada check status/demo/harga | **B** |
| 16 | Status unit `sold` terminal dan alur tiket resmi | Ya. `REPAIR_FLOW` di `validations.ts:314-327`; `isAllowedTransition` dipakai `service.ts:109-114` | Ya. `trg_prevent_sold_reactivation` (`0001:253-264`) dan `trg_validate_ticket_transition` (`0002:200-203`) | Tidak perlu |
| 17 | Audit perubahan status unit dan tiket | Ya. Action menulis aktor lewat `setAuditActor`; lihat `pos.ts:59-61`, `inventory.ts:164-167`, `service.ts:92-95` | Ya. `unit_status_audit` dan `service_ticket_audit` plus trigger di `0007_audit_trail.sql:29-144` | Tidak perlu untuk status. Aktor bisa NULL pada jalur PostgREST langsung; itu temuan Goal 3 |
| 18 | Audit perubahan harga dan stok | Tidak. Tidak ada penulisan audit harga di action | Tidak. Trigger audit hanya status (`0007:105-109` dan `0007:128-132`) | **Tidak masuk migrasi ini**; catat di `NEEDS_HUMAN.md` dan Goal 3 |
| 19 | Sales hanya boleh mengubah harga acuan dan foto resmi produk | Ya. `updateProductListing` hanya menulis dua kolom (`products.ts:189-196`) | Ya. `private.products_sales_column_guard()` di `20261024120000_products_sales_column_guard.sql:17-41` | Tidak perlu |
| 20 | Username wajib, unik, dan formatnya terbatas | Ya. Schema login dan staff | Ya. `profiles_username_key` dan `profiles_username_format_check` di `0005_username_login.sql:65-84` | Tidak perlu |
| 21 | Relasi tabel memakai foreign key | Ya. Action memakai ID dari DB | Ya. FK utama di `0001:34-153`; `profiles.id -> auth.users.id ON DELETE CASCADE` di `0004:43-52` | Tidak perlu. Beberapa FK sengaja `ON DELETE SET NULL` atau `RESTRICT` |
| 22 | `store_settings` hanya satu baris | Tidak relevan untuk action | Ya. `store_settings_id_check (id = 1)` di `0001:44` | Tidak perlu |
| 23 | `invoice_number` unik | Ya. Action membiarkan kosong dan membaca hasil trigger | Ya. Unique di `0001:91`; trigger generator di `0001:198-215` | Tidak perlu. Format belum di-check, tetapi bukan aturan bisnis yang disebut owner |
| 24 | Path foto Storage hanya milik staf sendiri | Ya. Validasi path di `validations.ts:260-274` dan action Storage | Tidak. Policy Storage mengizinkan semua staf menulis bucket (`0002:490-516`); ini policy, bukan constraint tabel | Di luar migrasi ini; masuk peta cakupan L3 Storage |
| 25 | Produk tidak boleh duplikat merek+model | Tidak ada aturan di action | Tidak ada unique | Tidak diusulkan; bukan invarian yang disebut owner. Katalog bisa punya beberapa entri model dengan spesifikasi berbeda |

## 3. Rincian usulan yang membutuhkan migrasi

Setiap huruf di bawah merujuk ke bagian yang sama di file SQL usulan.

### A. Unique index `transaction_items(unit_id)`

- **SQL inti:** `create unique index ... on public.transaction_items (unit_id);`
- **Alasan:** aplikasi sudah mengunci unit dengan `for update` dan filter
  `available`, tetapi jalur SQL langsung tetap bisa membuat dua item untuk satu
  unit. Unique index adalah jaring pengaman terakhir anti double-sell.
- **Risiko data lama:** index gagal dibuat bila sudah ada duplikat. Jalankan
  query 5.1. Duplikat harus diselidiki manual, bukan dihapus otomatis oleh
  migrasi.
- **Rollback:** `drop index if exists public.transaction_items_unit_id_key;`
- **Dampak aplikasi:** `executeSale` menangkap `23505` sebagai "IMEI unit
  trade-in sudah terdaftar" (`pos.ts:183-185`). Setelah migrasi diterapkan,
  tambahkan pesan khusus untuk pelanggaran `transaction_items_unit_id_key`.
  Jalur normal tidak boleh menghasilkan `23505` karena unit sudah sold dan
  gagal di `UNIT_NOT_AVAILABLE`.

### B. Guard `transaction_items`

- **SQL inti:** trigger `trg_guard_transaction_item` memanggil
  `private.guard_transaction_item()`.
- **Alasan:** memastikan unit yang dirujuk item benar-benar `available`, bukan
  demo, dan `unit_price` sama dengan `selling_price` di database. Ini menutup
  payload harga palsu lewat PostgREST dan melindungi jalur RPC yang belum
  memeriksa `is_demo`.
- **Risiko data lama:** trigger hanya berlaku untuk insert/update baru. Baris
  lama dengan harga snapshot berbeda tidak diperiksa. Jangan memakai query 5.2
  sebagai syarat migrasi; selisih harga lama wajar karena harga unit bisa
  berubah setelah penjualan.
- **Rollback:** drop trigger dan function.
- **Catatan:** POS dan RPC yang ada membaca harga dari DB, jadi harus lolos.
  Kalau ada impor stok lama yang menulis `transaction_items` dengan harga
  berbeda, impor itu perlu penyesuaian sebelum trigger diaktifkan.

### C. Item transaksi menandai unit sold

- **SQL inti:** trigger `trg_mark_unit_sold_from_item` melakukan
  `update inventory_units set status = 'sold' where id = new.unit_id and status = 'available'`.
- **Alasan:** mencegah penulis SQL langsung membuat item transaksi lalu
  meninggalkan unit tetap `available`. Aplikasi POS tetap melakukan update
  status setelah insert; update kedua menjadi no-op dan tidak menambah baris
  audit karena status lama dan baru sama.
- **Risiko data lama:** trigger hanya untuk insert baru. Item lama yang
  unitnya belum sold bisa dicari dengan query 5.3. Kalau ada, selidiki sebelum
  mengaktifkan trigger.
- **Rollback:** drop trigger dan function.

### D. Status sold wajib punya item transaksi

- **SQL inti:** trigger `trg_require_transaction_item_for_sold`.
- **Alasan:** menutup arah sebaliknya, yaitu `update inventory_units set
  status = 'sold'` tanpa nota. POS memasukkan item lebih dulu, jadi lolos.
- **Risiko data lama:** trigger hanya saat transisi ke sold. Unit sold lama
  tanpa item tidak diperiksa sampai ada update status. Query 5.4 untuk audit.
- **Rollback:** drop trigger dan function.

### E. Unit sold tidak boleh diedit

- **SQL inti:** trigger `trg_prevent_sold_unit_edit` menolak perubahan `imei`,
  `product_id`, `condition`, `purchase_cost`, `selling_price`, dan `is_demo`
  saat `old.status = 'sold'`.
- **Alasan:** `updateUnitDetails` sudah menolak, tetapi trigger lama hanya
  menyala saat status berubah. Nota dan garansi sudah terbit, jadi identitas
  dan angka jual tidak boleh berubah.
- **Risiko data lama:** tidak ada, trigger hanya untuk update baru. Koreksi
  manual unit sold harus lewat prosedur maintenance yang menonaktifkan trigger
  secara sadar, bukan lewat aplikasi.
- **Rollback:** drop trigger dan function.

### F. Check `final_payment`

- **SQL inti:** `check (final_payment = greatest(total_amount - trade_in_deduction, 0)) not valid`.
- **Alasan:** rumus yang sama sudah dipakai `pricing.ts` dan RPC. Tanpa check,
  update langsung bisa membuat nota dengan sisa bayar yang tidak konsisten.
- **Risiko data lama:** `NOT VALID` membuat baris lama tidak langsung
  diperiksa. Query 5.5 mencari pelanggaran. Setelah bersih, jalankan
  `alter table public.transactions validate constraint transactions_final_payment_formula_chk;`.
- **Rollback:** `alter table public.transactions drop constraint if exists transactions_final_payment_formula_chk;`

### G. Check `total_fee`

- **SQL inti:** `check (total_fee = sparepart_fee + labor_fee) not valid`.
- **Alasan:** `updateTicket` selalu menghitung ulang total dari dua komponen
  yang dibaca dari DB, bukan payload. Check ini menjaga jalur update langsung.
- **Risiko data lama:** `NOT VALID`; query 5.6. Validasi penuh setelah bersih.
- **Rollback:** drop constraint.

### H. Total transaksi sama dengan jumlah item

- **SQL inti:** constraint trigger `trg_check_transaction_total_tx` dan
  `trg_check_transaction_total_items`, deferred sampai commit.
- **Alasan:** header transaksi dan item ditulis dalam dua pernyataan. Constraint
  trigger memeriksa setelah keduanya selesai. Transaksi tanpa item ditolak;
  total yang tidak sama dengan jumlah item ditolak.
- **Risiko data lama:** trigger hanya untuk insert/update baru. Transaksi lama
  tanpa item atau dengan total berbeda tidak diperiksa sampai ada update.
  Query 5.7 dan 5.8 untuk audit.
- **Rollback:** drop kedua trigger dan function.
- **Catatan:** kalau owner mengizinkan transaksi tanpa item (misalnya nota
  jasa tanpa unit), bagian ini harus diubah sebelum diterapkan.

### I. Role teknisi tiket

- **SQL inti:** trigger `trg_guard_ticket_technician`.
- **Alasan:** `updateTicket` hanya memvalidasi UUID, bukan role. Sales atau
  admin bisa menetapkan pelanggan sebagai teknisi lewat payload. UI mungkin
  memfilter, tetapi Server Action adalah endpoint HTTP.
- **Risiko data lama:** trigger hanya saat insert atau saat `technician_id`
  diubah. Tiket lama dengan teknisi non-teknisi tetap bisa dibaca; query 5.9
  untuk audit. Update yang tidak menyentuh kolom itu tidak terpengaruh.
- **Rollback:** drop trigger dan function.
- **Tindak lanjut kode:** `updateTicket` sebaiknya memvalidasi role dan memberi
  pesan spesifik. Itu masuk Goal 3, bukan migrasi ini.

### J. Sales tidak boleh mengubah biaya/status tiket

- **SQL inti:** trigger `trg_service_ticket_sales_guard`.
- **Alasan:** RLS `tickets_staff_update` mengizinkan semua staf update. Action
  sudah menolak sales untuk `sparepartFee`, `laborFee`, dan `repairStatus`,
  tetapi PostgREST langsung tidak. Trigger menyamakan kedua jalur.
- **Risiko data lama:** hanya update baru oleh sesi sales. Server Action memakai
  service role, jadi tidak terpengaruh; guard action tetap yang utama.
- **Rollback:** drop trigger dan function.
- **Celah terpisah:** sales masih bisa mengubah `costBreakdown`,
  `technicianNotes`, `warrantyDays`, dan `technicianId` di action. Apakah itu
  disengaja? Belum ada aturan tertulis. Catat di `NEEDS_HUMAN.md`; jangan
  diperluas diam-diam di trigger ini.

### K. `sales_id` harus aktor sesi

- **SQL inti:** trigger `trg_guard_transaction_actor`.
- **Alasan:** RLS hanya memeriksa role admin/sales, bukan pemilik `sales_id`.
  Sesi sales bisa membuat transaksi atas nama orang lain lewat PostgREST.
- **Risiko data lama:** hanya insert baru dari sesi dengan `auth.uid()`.
  Server Action memakai service role (`auth.uid()` NULL), jadi tidak berubah.
  RPC sudah memeriksa hal yang sama dan tetap lolos.
- **Rollback:** drop trigger dan function.
- **Catatan:** update `sales_id` oleh admin tidak dicakup. Action tidak punya
  jalur update transaksi; kalau koreksi admin dibutuhkan, buat aturan terpisah.

### L. Minimal satu admin dan larangan self-role

- **SQL inti:** trigger `trg_guard_profile_role` dengan
  `pg_advisory_xact_lock(hashtext('atcell-last-admin'))`.
- **Alasan:** `wouldLeaveNoAdmin` di action tidak atomik. Dua admin yang saling
  menurunkan bersamaan bisa sama-sama melihat dua admin. Advisory lock membuat
  pemeriksaan dan perubahan berurutan. Trigger juga menolak admin mengubah
  perannya sendiri lewat sesi langsung.
- **Risiko data lama:** hanya update role/delete. Server Action yang memakai
  service role tetap bisa mengubah role non-terakhir; action sudah menolak
  self-role. Penghapusan auth user oleh admin untuk staf non-terakhir tetap
  lolos; penghapusan admin terakhir ditolak.
- **Rollback:** drop trigger dan function.
- **Catatan:** trigger ini tidak memperbaiki profil auth yang sudah yatim. Itu
  masalah data lama; query terpisah bila perlu.

### M. OPSIONAL: harga jual tidak di bawah modal

- **SQL inti:** `check (selling_price >= purchase_cost) not valid`.
- **Alasan:** `updateUnitDetails` sudah menolak harga baru <= modal, tetapi
  `registerUnits` tidak. Tanpa check, unit baru bisa didaftarkan di bawah modal
  dan POS akan menjualnya apa adanya.
- **Risiko data lama:** `NOT VALID`; query 5.10. Baris lama di bawah modal tidak
  langsung diperiksa. Baris baru/updated akan ditolak. Harga impas (sama dengan
  modal) tetap diizinkan karena action lama mengizinkan impas yang tidak diubah.
- **Keputusan owner:** kalau toko sengaja memakai loss leader, hapus bagian M
  sebelum migrasi dijalankan. Ini keputusan bisnis, bukan bug.
- **Rollback:** drop constraint.

## 4. Temuan yang tidak masuk migrasi ini

1. **Audit harga dan stok belum ada.** `0007_audit_trail.sql` hanya mencatat
   perubahan status unit dan tiket. Perubahan `products.default_price`,
   `inventory_units.purchase_cost/selling_price`, `service_tickets.sparepart_fee/labor_fee/total_fee`,
   dan `transactions.total_amount/final_payment` tidak punya jejak aktor.
   Ini kebutuhan Goal 3. Usulan: tabel audit append-only dan trigger harga,
   atau NEEDS_HUMAN kalau owner memilih tidak mencatat.
2. **Aktor audit NULL pada jalur PostgREST.** `private.current_actor_id()`
   hanya membaca `atcell.actor_id` yang diset Server Action. Perubahan status
   langsung lewat PostgREST tercatat dengan `actor_id` NULL. Bukan celah
   eskalasi, tetapi mengurangi kegunaan audit. Goal 3 dapat menambahkan
   fallback `auth.uid()`.
3. **Sales masih bisa mengubah `costBreakdown`, `technicianNotes`,
   `warrantyDays`, dan `technicianId`.** Guard `service.ts:115-123` hanya
   memeriksa biaya dan status. Apakah sales boleh mengubah rincian biaya dan
   penugasan teknisi? Belum ada aturan tertulis. Catat di NEEDS_HUMAN.
4. **`registerUnits` tidak memeriksa harga jual > modal.** Bagian M adalah
   usulan DB; action juga sebaiknya memeriksa di server. Perubahan action
   menunggu keputusan owner karena menyentuh kebijakan harga.
5. **RPC `process_trade_in_sale` tidak memeriksa `is_demo`.** Aplikasi tidak
   memakai RPC ini lagi, tetapi fungsi masih bisa dieksekusi service role.
   Trigger B menutup jalur ini bila disetujui. Sampai saat itu, RPC adalah
   jalur lama yang perlu dihindari.
6. **Policy Storage mengizinkan semua staf menulis kedua bucket.** Validasi
   path ada di action, bukan di policy. Ini policy Storage, bukan constraint
   tabel; masuk peta cakupan L3 Storage, bukan migrasi ini.
7. **`products` tidak punya unique (brand, model_name).** Tidak ada aturan
   owner yang menyebut duplikat katalog dilarang. Tidak diusulkan.
8. **`trade_in_records.imei` tidak unik.** Unik global ada di
   `inventory_units.imei`; unit yang pernah sold tidak bisa masuk lagi. Kalau
   owner ingin menerima trade-in ulang handset yang sama, aturan unik global
   perlu ditinjau. Ini keputusan bisnis.

## 5. Query pelanggaran sebelum migrasi

Jalankan di database lokal/staging. Jangan di production.

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

## 6. Urutan penerapan yang disarankan

1. Jalankan query 5.1. Kalau ada duplikat, selidiki dan perbaiki manual. Jangan
   hapus otomatis.
2. Putuskan bagian M. Kalau loss leader diizinkan, hapus blok M dari SQL.
3. Pindahkan SQL ke `supabase/migrations/` dengan timestamp baru, perbarui
   `RUN-ALL-PENDING.sql`, ledger, dan runbook.
4. Jalankan di database lokal/staging. Periksa error yang muncul. Trigger B
   dapat menolak impor lama yang menulis harga berbeda; itu sinyal, bukan alasan
   melonggarkan trigger.
5. Setelah semua baris baru bersih, jalankan `VALIDATE CONSTRAINT` untuk F, G,
   dan M (kalau M dipakai).
6. Verifikasi ulang empat gerbang repo dan test DB di staging.

## 7. Rollback

Rollback lengkap ada di komentar bagian akhir file SQL usulan. Urutannya:
drop constraint M, trigger L/K/J/I/H, constraint G/F, trigger E/D/C/B, lalu
index A. Tidak ada data yang dihapus oleh rollback; semua objek baru di-drop.

## 8. Status verifikasi

- Tabel dan usulan: **[BACA-KODE]**, tidak ada DB yang dijalankan.
- Test fixture `tests/pos-concurrent-sale.test.ts` diperbaiki agar membuat
  `auth.users` sebelum `profiles`. CI database run `40154382070` gagal di
  `profiles_id_fkey`; perbaikannya belum diverifikasi ulang karena
  `DATABASE_URL` tidak tersedia dan MISI melarang push/docker/psql.
- Empat gerbang lokal pada tree ini: `npm test` 870 tes (856 pass, 14 skip DB,
  0 fail), `npx tsc --noEmit` bersih, `npm run lint` bersih. `npm run build`
  di repo utama tertahan proses `next dev` yang sudah berjalan; verifikasi
  build dilakukan lewat salinan bersih tanpa `.env*` dan exit 0 (compile 26,3
  detik, 10 static page).
