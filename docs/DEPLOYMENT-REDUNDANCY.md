# Deployment Redundansi At Cell

Dokumen ini adalah runbook operasional untuk menjalankan satu codebase At Cell
di Coolify. Coolify menjadi satu-satunya host aplikasi production, sementara
Supabase menjadi sumber data, Auth, dan Storage production.

## Arsitektur target

```text
DNS / TLS
   |
   +-- Coolify VPS: aplikasi Next.js
             |
             +-- Supabase PostgreSQL + Auth + Storage
             +-- Coolify restore target private, hanya untuk restore test
```

Database tidak boleh dibuat di dalam container aplikasi. Resource PostgreSQL
di Coolify hanya boleh menjadi target restore test, bukan sumber data aplikasi
atau mirror aktif.

## Environment production

Set variabel berikut di Coolify Production. Nilai secret hanya diisi lewat
dashboard atau secret manager, tidak pernah commit ke repository.

```env
# Wajib ada di production
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# SUPABASE_SERVICE_ROLE_KEY adalah nama lama yang masih diterima sebagai
# cadangan dari SUPABASE_SECRET_KEY, jadi wajib ikut diisi kalau project
# masih memakai kunci service_role. src/lib/supabase/config.ts membaca
# SUPABASE_SECRET_KEY dulu, lalu SUPABASE_SERVICE_ROLE_KEY. requireRole() dan
# health check menolak jalan kalau keduanya kosong.
SUPABASE_COOKIE_DOMAIN=.atcell.my.id
DATABASE_URL=

# Opsional. Kosongkan kalau fitur terkait memang tidak dipakai, tapi baca
# penjelasan di bawah sebelum mengosongkan.
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACE_ID=
NEXT_PUBLIC_SITE_URL=
SITE_URL=
SERVER_ACTIONS_ALLOWED_ORIGINS=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Batas koneksi dan query database. Opsional, ada bawaannya.
#
# STATEMENT_TIMEOUT_MS = 8000 (bawaan), rentang 1000 sampai 30000. Batas
# ini yang mencegah satu query yang menggantung menahan seluruh pool
# koneksi. Nilai yang bukan integer positif, atau di luar rentang, diabaikan
# dan bawaannya yang dipakai, jadi salah ketik di dashboard tidak membuat
# seluruh aplikasi gagal terhubung.
#
# DB_POOL_MAX = 12 (bawaan), rentang 1 sampai 50. Jumlah koneksi per
# instance aplikasi. Lima terlalu kecil untuk halaman publik: satu render
# halaman berat memakai lima sampai tujuh query, jadi dengan lima koneksi
# dua pengunjung yang membuka beranda bersamaan sudah menghabiskan pool.
# Gejalanya di produksi pada 29 September 2026: halaman ringan tetap 0,1
# detik, sementara halaman berat semuanya timeout bersamaan, lalu container
# ditandai unhealthy dan Traefik membalas 503 selama sekitar 90 detik.
STATEMENT_TIMEOUT_MS=8000
DB_POOL_MAX=12

# Pemantauan error, opsional semua. NEXT_PUBLIC_* wajib ada saat build image.
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_COMMIT_SHA=
VERCEL_GIT_COMMIT_SHA=

# Backup off-site. Tanpa passphrase atau tanpa tujuan upload, script keluar
# BUKAN-NOL dan cron mencatat GAGAL. Exit 0 berarti off-host copy terkirim.
# Isi passphrase plus satu tujuan untuk mengaktifkan.
OFFSITE_PASSPHRASE=
OFFSITE_PASSPHRASE_FILE=
OFFSITE_RCLONE_REMOTE=
OFFSITE_PUT_URL=
OFFSITE_PUT_TOKEN=
OFFSITE_PUT_TOKEN_FILE=
OFFSITE_STAGING_DIR=
OFFSITE_KEEP_ENCRYPTED=

# Verifikasi aplikasi Android. Wajib diisi kalau my.id.atcell sudah ada
# release, kosongkan kalau belum pernah ada APK. Sengaja tanpa prefix
# NEXT_PUBLIC_ supaya nilainya dibaca dari env container saat runtime, bukan
# membeku di dalam bundle saat build.
ANDROID_APP_SHA256=
```

Wajib ada di production:

- `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` untuk
  browser.
- `SUPABASE_SECRET_KEY` untuk admin client. `SUPABASE_SERVICE_ROLE_KEY` adalah
  nama lama yang masih diterima sebagai cadangan, dan wajib ikut diisi kalau
  project Supabase masih memakai kunci `service_role`. `src/lib/supabase/config.ts`
  membaca `SUPABASE_SECRET_KEY` dulu, lalu `SUPABASE_SERVICE_ROLE_KEY`.
  `requireRole()` dan health check menolak jalan kalau keduanya kosong, jadi
  production yang hanya mengisi satu-duanya akan gagal saat login, saat
  mengelola staf, dan saat `/api/health/ready` diperiksa.
- `DATABASE_URL` ke connection pooler Supabase production, bukan ke `localhost`
  VPS. Koneksi ini melewati RLS, jadi penegakan peran tetap di
  `requireRole()` tiap Server Action.
- `SUPABASE_COOKIE_DOMAIN` untuk sesi lintas subdomain antara
  `atcell.my.id` dan `login.atcell.my.id`.

Opsional, tapi kosong berarti fitur tertentu mati:

- `GOOGLE_PLACES_API_KEY` untuk sync ulasan Google. Kosong **matikan bagian
  ulasan sepenuhnya**, bukan cuma auto-sync: `getGoogleReviews()` langsung
  mengembalikan null, jadi beranda menampilkan kartu "Tulis Review" dan
  structured data berhenti memancarkan `aggregateRating`. Gejalanya sama
  dengan "belum ada ulasan", jadi diagnosisnya selalu cek dua tempat:
  `curl https://atcell.my.id/api/reviews` harus mengembalikan
  `{"ok":true,...}`, dan `docker logs` memuat baris `[reviews] ...` yang
  menyebut variabel atau status Places API yang salah. Ini yang terjadi di
  produksi pada 1 Oktober 2026: key tidak pernah diisi di Coolify.
- `GOOGLE_PLACE_ID` untuk memilih toko yang diulas. Ada nilai bawaan di
  `src/lib/reviews.ts`, jadi tidak wajib diisi kalau toko tidak pernah
  berubah.
- Tanpa `GOOGLE_PLACES_API_KEY`, ulasannya diambil dari snapshot manual di
  `src/lib/ulasan-manual.ts`: salinan dari halaman Google Maps, bertanggal, dan
  punya batas umur `SNAPSHOT_MAKS_UMUR_HARI` (180 hari). Lewat batas itu
  snapshot diabaikan, kartu "Tulis Review" muncul lagi, dan `aggregateRating`
  berhenti dipancarkan, supaya angka lama tidak bertahan sebagai data resmi.
  Cara memperbaruinya ada di komentar berkas itu.
- `NEXT_PUBLIC_SITE_URL` atau `SITE_URL` untuk URL kanonik di `sitemap.ts`.
  Kosong membuat sitemap memakai URL yang dikarang, bukan domain produksi.
- `SERVER_ACTIONS_ALLOWED_ORIGINS` untuk origin tambahan Server Actions,
  dipisah koma tanpa protocol dan tanpa path. `next.config.ts` sudah memakai
  domain apex sebagai bawaan.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` hanya untuk kompatibilitas project lama
  yang belum memakai publishable key.
- `STATEMENT_TIMEOUT_MS` untuk batas waktu satu query lewat koneksi Drizzle,
  dibaca `src/db/client.ts`. Bawaannya 8000 milidetik, hanya bilangan
  bulat positif yang dipakai, dan nilai di atas 30000 dipangkas ke 30000.
  Naikkan lewat environment kalau query etalase di VPS produksi sering
  terpotong, karena jalur ini tidak butuh build image baru sementara pin
  image di `Dockerfile.coolify` punya keterlambatan satu commit. Nilai yang
  kosong, nol, atau bukan angka diam-diam dinonaktifkan oleh driver
  postgres, jadi kode mengembalikan bawaannya, bukan meneruskan apa adanya.
  Jangan lewat `DATABASE_URL`, karena klausa `options` pada connection
  string ditimpa `src/db/client.ts`. Jangan naikkan melewati kebutuhan: di
  Vercel `max` cuma 1 koneksi, jadi satu statement panjang menahan seluruh
  instance dan request lain antre di belakang socket yang sama.

Pemantauan error, semua opsional dan tidak saling terkait:

- `SENTRY_DSN` untuk sisi server, dibaca `src/instrumentation.ts`. Kosong
  berarti `register()` keluar di baris 16 tanpa menginisialisasi SDK sama
  sekali: tidak ada request ke pihak ketiga dan tidak ada overhead. Isi kalau
  error produksi perlu terlihat di dashboard.
- `NEXT_PUBLIC_SENTRY_DSN` untuk sisi browser, dibaca
  `src/instrumentation-client.ts` dan kedua error boundary
  (`src/app/error.tsx:23`, `src/app/global-error.tsx:26`). Kosong berarti
  `Sentry.init()` dilewati dan `captureException()` tidak dijalankan, jadi
  error browser tidak terkirim. Nilai DSN memang muncul di HTML yang dikirim
  ke browser dan itu wajar; yang harus tetap server-only adalah Sentry Auth
  Token, yang tidak pernah memakai prefix `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_COMMIT_SHA` dan `VERCEL_GIT_COMMIT_SHA` hanya untuk tag
  `release` di dashboard, bukan untuk logika aplikasi. Kosong berarti event
  tanpa release dan Sentry mengelompokkannya sebagai "latest".

Catatan build untuk dua variabel `NEXT_PUBLIC_`: Next.js menyalin
`NEXT_PUBLIC_*` ke dalam bundle saat build, jadi Coolify yang hanya menyetel
environment saat container berjalan TIDAK akan mengirim DSN ke browser. Kalau
pemantauan error browser dibutuhkan, `NEXT_PUBLIC_SENTRY_DSN` dan
`NEXT_PUBLIC_COMMIT_SHA` wajib ada di environment build image. Server-side
(`SENTRY_DSN`) tidak punya batasan ini karena dibaca saat runtime.

`DATABASE_URL` harus menunjuk ke connection pooler Supabase production, bukan
ke `localhost` VPS. `SUPABASE_SECRET_KEY` hanya boleh tersedia sebagai secret
server. Jangan memakai legacy `anon` atau `service_role` untuk release baru.

## Migrasi database

Jalankan seluruh migration di `supabase/migrations/` secara berurutan. Urutannya
wajib, karena beberapa file bergantung pada objek yang dibuat file sebelumnya:

| Berkas | Isi |
|--------|-----|
| `0001_atcell_schema.sql` | Tabel, enum, RLS, trigger, view, bucket Storage, grant Data API, dan seed `store_settings`. Aman di-replay: tidak memberi `EXECUTE` ke browser role |
| `0002_harden_atcell_schema.sql` | Helper private, grant minimum, trigger anti-double-sell, `security_invoker` pada view |
| `0003_lock_legacy_helpers.sql` | Menutup helper legacy di schema `public` sehingga tidak bisa dipanggil lewat Data API |
| `0004_align_schema_contract.sql` | Menyelaraskan FK, index performa, dan singleton `store_settings` dengan hasil audit production |
| `0005_username_login.sql` | Login berbasis username, bukan email |
| `0006_store_social_urls.sql` | Akun media sosial toko |
| `0007_audit_trail.sql` | Riwayat audit untuk mutasi data sensitif, lengkap dengan identitas pelaku (lihat "Aktor di audit trail") |
| `20260926025406_index_public_foreign_keys.sql` | Index untuk seluruh foreign key di schema `public` |
| `20260926103000_strengthen_ticket_codes.sql` | Format kode tiket servis 8 karakter base32 plus validasi transisi status |
| `20260927120000_auto_enable_rls_on_new_tables.sql` | RLS otomatis aktif pada tabel baru |
| `20260927130000_product_image_registry.sql` | Tabel `product_images` sebagai sumber kebenaran path gambar katalog |
| `20260927140000_store_owner_and_real_contact.sql` | Kolom `owner_name` dan kontak asli toko |
| `20260927150000_revoke_anon_write_on_product_images.sql` | Mengcabut hak tulis `anon` pada `product_images`, sisanya hanya `SELECT` |
| `20260927160000_harden_storage_access.sql` | Bucket foto pelanggan jadi privat, `storage_public_read` hanya untuk katalog, batas ukuran dan tipe MIME |
| `20260927170000_demo_ticket_for_tracking_example.sql` | Tiket contoh supaya kode contoh di halaman lacak benar-benar berfungsi |
| `20260927180000_nullable_inventory_unit_product.sql` | `inventory_units.product_id` jadi nullable untuk unit trade-in, etalase publik hanya menampilkan unit berkatalog, plus catatan perbaikan baris lama |
| `20260927190000_close_browser_role_write_grants.sql` | Menutup hak tulis `authenticated` di `product_images` dan hak tulis `anon`/`authenticated` di `storage.buckets`, mencabut `EXECUTE` publik dari `rls_auto_enable()`, dan revoke default privilege tabel di schema `public` supaya tabel baru tidak lagi mewarisi grant tulis |
| `20260927200000_remove_ocean_photo_from_reno11_gallery.sql` | Mengeluarkan foto laut `oppo-reno11-2.jpg` dari galeri resmi Oppo Reno 11, karena shopper yang menekan tombol foto berikutnya melihat laut tanpa perangkat. Alt teks registry-nya diluruskan dan berkasnya tidak dihapus, karena `global-not-found.tsx` masih memakainya |
| `20260927201000_clear_unparseable_product_image_url.sql` | Mengosongkan `products.image_url` yang isinya bukan alamat foto, terutama string `undefined/storage/...` hasil template literal tanpa host di `portal/products/page.tsx`. Merek, model, specs, dan harga tidak disentuh: itu keputusan merchandising staf |
| `20260927202000_trim_crop_duplicate_a55_photos.sql` | Memangkas tiga foto Galaxy A55 yang saling potongan, jadi galerinya dua render berbeda bukan lima. Sampul `oppo-reno11-1.png` yang hanya 427x601 piksel tidak disentuh dan butuh sumber resolusi tinggi dari pemotret |
| `20260930100000_catalogue_apple_iphone_15_pro.sql` | Menambah satu baris katalog Apple iPhone 15 Pro tanpa unit, jadi tampil sebagai kartu "Stok Habis" dengan tombol kabari WhatsApp. Tidak menambah baris `inventory_units` sama sekali. Laporan stafnya di `docs/PERLUASAN-KATALOG-AT-CELL.md` |
| `20260930101000_catalogue_samsung_galaxy_s24_ultra.sql` | Baris katalog Samsung Galaxy S24 Ultra tanpa unit, foto tunggal `s24-ultra-1.jpg` karena tiga file lain bukan S24 Ultra dan satu lagi potongan dari foto yang sama. Tidak menambah unit |
| `20260930102000_catalogue_xiaomi_14.sql` | Baris katalog Xiaomi 14 tanpa unit dengan tiga foto yang memang bingkai berbeda. Baris Xiaomi `iphone 16` yang rusak tidak disentuh, itu keputusan staf |
| `20260930103000_catalogue_vivo_v30.sql` | Baris katalog Vivo V30 tanpa unit. Banner promosi `vivo-v30-1.jpg` tidak dipakai karena fine print-nya menyebut V30 Pro. Tidak menambah unit |
| `20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9.sql` | Membuat baris katalog Apple iPhone 14 Plus tanpa storage di namanya, lalu menautkan `inventory_units` id 9 ke baris itu. **Satu-satunya penulisan ke `inventory_units` di seluruh perluasan katalog ini, dan hanya mengubah `product_id`.** IMEI, condition, status, dan harganya tidak disentuh. Jalankan hanya setelah unit 9 dicek fisik, dan perhatikan syarat `product_id is null` supaya berkas ini tidak merebut tautan yang sudah dibuat staf |
| `20261001120000_hide_unidentified_product_6.sql` | Menonaktifkan produk id 6 yang brand 'Xiaomi' dan model_name 'iphone 16' saling bertentangan, jadi etalase publik tidak menampilkan identitas yang belum dipastikan. Merek dan modelnya tidak diubah: itu keputusan staf yang harus melihat unit fisiknya, unit 10 masih di konter. Aktifkan lagi lewat portal Master Produk setelah identitasnya benar |
`0001` aman dijalankan ulang kapan saja, termasuk `supabase db push` yang
terhenti di tengah lalu diulang. Rananya sudah dibetulkan pada 27 Sep 2026:
versi lama `0001` memberi `EXECUTE` pada `public.get_my_role()` dan
`public.is_staff()` ke `anon` dan `authenticated`, lalu `0002` dan `0003`
mencabutnya. Kalau `0001` dijalankan lagi "untuk jaga-jaga", kedua helper itu
terbuka kembali sampai migrasi berikutnya dijalankan. Keduanya
`SECURITY DEFINER`, jadi ini jalur privilege escalation lewat Data API, bukan
sekadar kosmetik. Grant itu sekarang tidak ada di `0001` sama sekali, dan status
akhirnya dibuat `0002` lalu dikunci `0003`: hanya `postgres` dan
`service_role` boleh memanggilnya.

Kalau perlu memastikan, cek ACL-nya tanpa mengubah apa pun:

```sql
select proname, proacl::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('get_my_role', 'is_staff');
```

Hasil yang benar hanya memuat `postgres` dan `service_role`. Kalau `anon` atau
`authenticated` muncul, `0003` belum terpasang.

### Aktor di audit trail

`0007` mencatat siapa yang mengubah status unit dan tiket servis, sesuai
NFR-07. Mekanismenya bukan `auth.uid()`: `src/db/client.ts` memakai koneksi
Postgres langsung sehingga `auth.uid()` selalu NULL di jalur itu. Aktor
dikirim lewat setting transaction-local `atcell.actor_id`, diisi oleh
`setAuditActor()` di dalam transaction yang sama dengan `UPDATE`-nya, lalu
dibaca trigger lewat `private.current_actor_id()`. Parameter `is_local` membuat
nilainya hilang begitu transaction selesai, jadi tidak bocor ke request
berikutnya.

Konsekuensinya harus diketahui operator sebelum membaca hasil audit:

- `actor_id` terisi hanya untuk perubahan yang lewat Server Action
  (`updateUnitStatus` dan `updateTicket`). Perubahan lewat SQL Editor atau
  psql tercatat dengan `actor_id` NULL.
- Baris `actor_id` NULL bukan kegagalan pencatatan. Itu justru penanda
  perubahan yang perlu ditinjau, karena pelakunya tidak diketahui:

```sql
select created_at, actor_id, old_status, new_status
  from public.unit_status_audit
 where actor_id is null
 order by created_at desc;
```

- Kalau Server Action baru menulis tanpa `setAuditActor`, audit tetap terisi
  tapi kolomnya NULL. Rekap per aktor ada di bagian 5 berkas `0007`.

Setiap migrasi baru wajib ditambah ke tabel ini. `tests/deployment-runbook.test.ts`
memeriksa dua arah: berkas yang sudah di-commit tapi belum disebut akan
menggagalkan test, dan nama berkas di tabel ini yang tidak ada di
`supabase/migrations/` juga akan menggagalkan test.

Dua baris terakhir sangat penting untuk keamanan dan sering terlewat. Tanpa
`20260927150000`, tabel `product_images` tetap memberi `anon` hak tulis
warisan default privilege Supabase. Tanpa `20260927160000`, foto servis dan
trade-in tetap dapat diambil siapa pun yang punya URL, karena bucket `public`
melayani path `/object/public/` tanpa token dan tanpa cek RLS.

`20260927180000` memperbaiki tautan yang salah, jadi jangan dilewatkan. Tanpa
migrasi ini, `executeSale` menautkan handset yang pelanggan tukar ke baris
katalog unit yang baru terjual, sehingga tukar S9 dengan S24 terdaftar dan
tampil di etalase sebagai S24. Migrasi ini sengaja tidak memperbaiki data
lama; cara mengenali dan memperbaiki baris yang sudah salah ada di catatan
di dalam berkasnya, dan harus dijalankan operator setelah datanya dicek.

`20260927190000` menutup lapisan grant yang sebelumnya hanya ditutup RLS.
`20260927150000` mencabut hak tulis untuk `anon`, tapi `authenticated` masih
memegang DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, dan UPDATE di
`product_images`. Migrasi ini menurunkan keduanya ke `SELECT` saja,
mencabut `EXECUTE` untuk `PUBLIC` dari fungsi `rls_auto_enable()`, dan
menjalankan `alter default privileges in schema public` supaya tabel yang
dibuat setelahnya tidak lagi mewarisi `arwdDxtm` dari Supabase. Jalankan
setelah `20260927180000`, tidak boleh dilewati: tanpa baris
`alter default privileges`, setiap tabel berikutnya akan diam-diam mendapat
hak tulis penuh lagi dan hanya tertahan oleh policy yang harus orang ingat
menulis sendiri.

Satu hal yang perlu diketahui operator soal bagian `storage.buckets` di
migrasi itu. Grant tulis di sana diberikan oleh role `supabase_storage_admin`
yang juga pemilik tabelnya, sedangkan `REVOKE` hanya bisa mencabut hak yang
diberikan oleh role yang sedang berjalan, dan role `postgres` bukan anggota
`supabase_storage_admin`. Jadi `revoke` di sana hanya menghapus grant milik
`postgres`. Pengawal yang benar-benar bekerja tetap RLS dengan nol policy:
`select count(*) from storage.buckets` sebagai `authenticated` mengembalikan
0 baris, dan `update` menyentuh 0 baris, bukan error. Jangan dibaca sebagai
grant sudah tertutup, dan jangan dihapus hanya karena terlihat tidak
berpengaruh.

Cara menjalankan:

1. Buka SQL Editor di Supabase, atau `psql "$SOURCE_DATABASE_URL"`.
2. Jalankan setiap berkas sesuai urutan tabel di atas.
3. Catat hasilnya di `supabase_migrations.schema_migrations` dengan nama berkas
   tanpa ekstensi, supaya `supabase db push` tidak mencoba menjalankannya ulang.
4. Uji idempotensi dengan menjalankan ulang di dalam `begin; ... rollback;`
   sebelum schema perlu dibuka ke publik.

Jangan memakai `supabase db push` untuk database ini. Angka versi di ledger
untuk beberapa berkas tidak sama dengan nama berkasnya, karena berkas `0001`
sampai `0007` dulu diterapkan dengan stempel waktu Supabase sebelum repo memakai
penamaan berurutan. CLI akan membandingkan keduanya, menemukan angka versi yang
tidak cocok, lalu menawarkan menjalankan ulang berkas yang sebenarnya sudah
terapkan. Terapkan lewat SQL Editor atau psql, lalu catat di ledger manual.

`supabase/RUN-ALL-PENDING.sql` menggabungkan seluruh migrasi di atas menjadi
satu berkas urut, dua puluh enam bagian, untuk project yang belum punya skema
sama sekali. Database kosong tidak perlu langkah apa pun sebelumnya: bagian 1
(`0001`) yang membuat tabel, enum, RLS, view, trigger, dan bucket Storage.
Dulu berkas itu hanya berisi bagian 4 ke atas, jadi janji "sekali paste
mengisi project kosong" di kepalanya tidak terpenuhi: paste ke project baru
menghasilkan nol tabel, nol enum, dan nol RLS. Bagian 1 sampai 3 ditambahkan
pada 27 Sep 2026 dan seluruh penandanya ditulis ulang dari "dari 14" menjadi
"dari 17".

Isi tiap bagian harus identik dengan berkas aslinya, dan
`tests/run-all-pending.test.ts` menjaga dua hal: tiap bagian sama dengan
migrasi sumbernya, dan **setiap** berkas di `supabase/migrations/` muncul
tepat sekali sebagai bagian. Dahulu test itu punya pengecualian
`ALREADY_PROVISIONED = ["0001", "0002", "0003"]`, jadi assertion "tidak ada
migrasi yang tertinggal" selalu hijau secara konstruksi, bukan karena benar.
Pengecualian itu dihapus,
karena berkas gabungan harus benar-benar bisa dipakai dari nol. Jangan
menjalankan kedua sumber sekaligus.

Jangan menjalankan `supabase/drizzle/0000_*.sql` sebagai migration production
karena file tersebut tidak mencakup RLS, trigger, view, Storage, dan grant.

Setelah migration, pastikan schema `public` dan tabel yang diperlukan sudah
di-expose melalui Data API. RLS tetap harus aktif dan grant di migration
mempertahankan least privilege. Role `anon` dan `authenticated` hanya mendapat
hak SELECT; mutasi bisnis harus melalui Server Action server-side, bukan
PostgREST browser. `service_role` hanya boleh tersedia sebagai secret server.

Migration harus dijalankan satu kali dari release yang terkontrol, kemudian
diverifikasi sebelum deployment production dibuka. Jangan menjalankan
migration dari dua pipeline secara bersamaan.

## Health check

- `GET /api/health/live` hanya memastikan proses Next.js hidup.
- `GET /api/health/ready` hanya mengembalikan 200 ketika Supabase public env,
  `DATABASE_URL`, koneksi database, schema wajib, dan service-role secret
  semuanya tersedia.
- Health endpoint tidak boleh mengembalikan connection string, password, atau
  pesan driver mentah.

Gunakan `/api/health/ready` sebagai target health check Coolify. Response 503
harus dianggap sebagai not ready, bukan sebagai keberanian untuk memakai data
mock.

## Header proxy dan rate limit

Batas percobaan login dan batas lacak resi memakai IP klien sebagai kunci,
diambil di `src/lib/client-ip.ts`. Fungsi itu membaca entri TERAKHIR
`X-Forwarded-For`, bukan yang pertama, dan itu pilihan yang disengaja.

Traefik tidak menimpa `X-Forwarded-For`, melainkan menambahkan IP aslinya di
belakang nilai yang sudah ada. Dengan `forwardedHeaders.insecure = false`
(konfigurasi bawaan sejak Traefik v2.10) header itu dibersihkan dulu dari
permintaan tak tepercaya lalu diisi satu IP saja, jadi entri pertama dan
terakhir sama-sama benar dan tidak ada perbedaan perilaku.

Bedanya baru muncul kalau `insecure` dinyalakan atau ada proxy lain di depan
Traefik. Penyerang yang mengirim `X-Forwarded-For: 1.2.3.4` akan membuat
aplikasi menerima `1.2.3.4, ip-asli`. Dengan entri pertama tiap percobaan
membuat kunci bucket yang berbeda sehingga batasnya tidak pernah tercapai.
Dengan entri terakhir semua percobaan menumpuk pada satu IP dan batasnya
berlaku.

Kalau struktur ini diubah, tiga hal ikut berubah:

1. Rate limit kehilangan nilainya kalau IP tidak bisa dipercaya. Pastikan
   tidak ada job internal yang memakai IP proxy bersama, karena semua trafik
   seperti itu lalu berbagi satu kuota.
2. `X-Real-Ip` bukan cadangan yang lebih aman. Middleware `forwardedheaders`
   Traefik hanya menulisnya kalau masih kosong, jadi pada konfigurasi longgar
   nilai dari klien justru dipertahankan.
3. Kalau aplikasi bisa dijangkau langsung tanpa lewat Traefik, semua
   permintaan tanpa header berakhir pada satu kunci tunggal. Itu disengaja
   karena membuat batas lebih ketat, tapi gejalanya rate limit yang tiba-tiba
   terasa sangat rapat.


## Rilis yang aman

1. Jalankan test, typecheck, lint, dan build di commit yang sama.
2. Pastikan migration canonical sudah tercatat dan diterapkan satu kali.
3. Tulis tag image di `Dockerfile.coolify` memakai `sha-<commit>` sesuai bagian
   tag image di bawah, lalu commit.
4. Deploy Coolify production dari branch `main`, cek `/api/health/ready`, lalu
   pastikan header `content-security-policy` muncul di `/id`. Header itu hanya
   ada di image yang sudah memuat `src/lib/csp.ts`, jadi ia penanda image baru
   benar-benar yang jalan, bukan hanya health check yang hijau. Cara lengkapnya
   ada di [`docs/CSP.md`](CSP.md).
5. Jalankan smoke test public, login, role guard, IMEI, POS, service tracking,
   dan upload pada URL production.
6. Verifikasi RLS, trigger, view, Storage, advisor, dan backup.
7. Aktifkan domain final dan TLS hanya setelah deployment lulus.
8. Lakukan restore test terjadwal ke resource restore private.

## Tag image di Dockerfile.coolify

`Dockerfile.coolify` menarik image yang sudah dibangun GitHub Actions, dan tag
yang dipakai wajib `sha-<commit>`. Tag `latest` tidak boleh dipakai.

Coolify menjalankan `docker build --no-cache` tanpa `--pull`. `--no-cache`
hanya membersihkan cache lapisan build, bukan cache base image. Dengan tag
`latest`, Docker memakai salinan tag itu yang sudah tersimpan di lokal VPS dan
tidak pernah menanyakan registry lagi. Deploy selesai hijau, health check hijau,
tetapi image yang jalan adalah image lama.

Kejadian itu tidak terlihat dari status mana pun. Penandanya hanya
respons: `/robots.txt` dilayani sebagai HTML, footer masih memakai warna
lama, nomor telepon kosong, dan ukuran HTML landing tidak berubah satu byte
pun. `tests/deploy-image-pin.test.ts` menjaga tag tetap berbentuk `sha` dan
bukan `latest`, menjaga commit yang disebut ada di repository, dan menjaga
formatnya sama dengan yang diturunkan `docker-publish.yml`.

Ada satu commit keterlambatan yang harus dipahami. Tag ditulis di commit yang
sekarang, sedangkan image untuk commit itu baru ada setelah commit itu dipush.
Jadi deploy commit P menjalankan image commit sebelumnya. Untuk menjalankan
image commit Q, tuliskan `sha-Q` di `Dockerfile.coolify`, commit, lalu deploy
lagi. Menjalankan image commit Q berarti commit yang berisi tag `sha-Q`
belum pernah menjadi image, dan itu tidak bisa dihindari selama tag
ditulis manual di dalam repository.

Cara memastikan image yang benar-benar jalan bukan cuma lewat `/robots.txt`.
Bandingkan ukuran dan isi HTML landing sebelum dan sesudah deploy, atau ambil
digest image yang berjalan lewat Coolify lalu bandingkan dengan digest tag
`sha-<commit>` di GHCR.

Cara paling langsung adalah label yang dipasang GitHub Actions di image itu.
Label `org.opencontainers.image.revision` berisi commit yang jadi sumber build.
Perintahnya membaca container yang SEDANG MELAYANI, bukan tag di registry:

```bash
docker ps --filter "label=com.docker.compose.project=<project>" -q | head -1 | \
  xargs -I{} docker inspect --format \
  '{{ index .Config.Labels "org.opencontainers.image.revision" }}' {}
```

Bentuk lama yang meng-inspect tag `ghcr.io/neiaki/kp:sha-<commit>` langsung
tidak berlaku di host ini. Buildx menyimpan image di dalam container builder,
bukan di daemon, jadi tag itu tidak ada di `docker images` dan `docker
inspect` menjawab `no such object` walaupun image itu jelas sedang berjalan.
Label di atas dibaca dari container yang melayani trafik, jadi tidak bergantung
ke mana pun image-nya disimpan.

Kalau yang muncul bukan commit yang diharapkan, image itu bukan yang kamu kira,
dan deploy hijau tidak berarti apa-apa. Label yang sama bisa dibaca langsung dari
GHCR tanpa akses VPS, karena registry menyimpan config image-nya, dan isi tag
`sha-<commit>` di repository bisa dibandingkan dengan commit yang ada di sana
sebelum deploy dimulai.

Bukti yang lebih kuat daripada label adalah membandingkan rootfs. Ambil
`{{.RootFS.Layers}}` dari image container yang berjalan, lalu bandingkan dengan
`rootfs.diff_ids` dari config blob tag `sha-<commit>` di GHCR. Keduanya harus
sama persis, seluruh layer, urutannya ikut. Label bisa salah tempel;
rootfs tidak.

### Dua container aplikasi sesaat setelah deploy

Sesudah deploy, sempat terlihat dua container dari project compose yang sama,
dengan nama yang berbeda suffix dan image yang berbeda tag commit. Risikonya itu
bukan dua versi aplikasi yang melayani trafik. Compose menyelesaikan perpindahan
ke container baru, dan container lama tetap tertinggal sebagai container
compose yang tidak lagi ada di file compose hasil build. Namanya pun bukan
nama service yang bisa dibaca, melainkan nama acak, jadi tidak bisa dipakai
untuk mengira versi mana yang sedang melayani permintaan.

Keadaan itu perlu diketahui supaya tidak salah dibaca sebagai kegagalan
deploy. Dua pengamatan yang membuatnya terpisah dari insiden "deploy gagal":

- Health check dan `/api/health/ready` tetap hijau sepanjang masa transien,
  karena keduanya dijawab oleh container baru.
- Setelah transien, `docker ps` untuk project itu kembali ke satu baris.

Periksanya read-only dan cukup satu perintah. Ganti `<project>` dengan nilai
label `com.docker.compose.project` container aplikasi:

```bash
docker ps -a --filter "label=com.docker.compose.project=<project>" \
  --format '{{.Names}} | {{.Status}} | {{.Image}}'
```

Hasil yang benar adalah tepat satu baris, dan kolom `Status` berbunyi
`Up ... (healthy)`. Lebih dari satu baris sesaat setelah deploy adalah
keadaan transien di atas. Satu baris dengan `Exited` atau `Restarting` adalah
masalah yang berbeda, dan itulah yang harus ditelusuri lewat log Coolify.

Yang perlu diketahui sebelum menyimpulkan apa pun: `docker inspect` pada tag
`ghcr.io/neiaki/kp:sha-<commit>` bisa menjawab `no such object` di host ini,
padahal image itu jelas dipakai. Buildx yang dipakai Coolify menyimpan image
di dalam container builder, bukan di daemon, jadi tag image lokal tidak bisa
dibaca lewat `docker images` seperti yang biasa diasumsikan. Karena itu
verifikasi image yang benar tetap lewat respons, bukan lewat daftar image
lokal.

Jangan menambahkan `--remove-orphans` untuk membersihkan container yang
tertinggal itu. Flag tersebut menghapus semua container dalam project yang
absen dari file compose yang baru, dan pada project yang memuat lebih dari
satu layanan, itu bisa ikut menghapus layanan yang tidak seharusnya ikut
dihapus. Untuk At Cell, yang perlu dijaga hanya satu hal: jangan menghitung
container aplikasi sebagai alat untuk menyimpulkan versi yang sedang berjalan.
Gunakan respons, seperti bagian di atas.

### Verifikasi etalase di HTML, bukan hanya di browser

Sejak layout area publik membaca snapshot di server, HTML yang sampai ke crawler
sudah berisi etalase. `/api/health/ready` yang menjawab 200 tidak
membuktikannya: health check hanya membuktikan database terjangkau, sedangkan
etalase membaca view `v_public_inventory` dan tabel produk.

Setelah deploy, cek dua hal ini:

```bash
curl -s https://atcell.my.id/id/catalog | sed -e 's/<[^>]*>//g' | tr -s ' ' | grep -oE "[0-9]+ unit, harga"
curl -s https://atcell.my.id/id/catalog | grep -c "Redmi Note 13"
```

Angka dan kata "unit" dipisah simpul komentar React di dalam HTML, jadi
bentuknya `7<!-- --> <!-- -->unit, harga termasuk garansi toko`. Pola yang
mencari HTML mentah tidak akan pernah cocok, dan hasil kosong karena itu
terlihat seperti kegagalan deploy padahal etalase sedang terisi. Karena itu
tag dibuang lebih dulu, lalu spasi dirapatkan.

Yang benar: hitungannya bukan 0, dan nama model dari `v_public_inventory`
muncul di HTML. Kalau perintahnya tidak mengeluarkan apa pun, snapshot gagal
dibaca, dan kegagalan itu terlihat di halaman sebagai "Tidak ada yang cocok".
Keadaan itu sah secara kode: pembacaan yang gagal menghasilkan
tanpa seed, browser mencoba lagi sendiri lewat `loadLiveData`, dan pengunjung
manusia tetap melihat katalog yang benar setelah sepersekian detik. Yang tidak
memperoleh kesempatan itu Google dan pratinjau tautan WhatsApp, karena keduanya
hanya membaca HTML.

Urutan pemeriksaan saat hitungannya 0:

1. `/api/health/ready` mengembalikan `databaseReachable: true` dan
   `databaseSchemaReady: true`.
2. `select count(*) from public.v_public_inventory;` mengembalikan lebih dari 0.
3. Log container di Coolify memuat `Data publik sedang tidak dapat dimuat`,
   yaitu pesan kegagalan snapshot. Pesan ini hanya ada di log, tidak pernah
   tampil di halaman, jadi halaman kosong tanpa penjelasan itu sendiri.

#### Produk baru tidak muncul padahal etalase tidak kosong

Gejalanya mirip dengan yang di atas, tapi bedanya ada di bagian yang dihitung:
`select count(*) from public.v_public_inventory` mengembalikan lebih dari 0
dan halaman tidak kosong, sedangkan satu produk yang baru ditambahkan lewat
`/portal/products` tetap tidak ada di katalog.

Bukan cache. Halaman area publik tidak memakai cache sama sekali:
`getPublicSnapshot()` dipanggil ulang di dalam jalur render pada tiap
permintaan (`src/app/(public)/[locale]/layout.tsx`), tidak ada `revalidate`
atau `unstable_cache` di jalur itu, jadi tidak ada jeda refresh yang bisa
menahan data baru lebih dari satu permintaan.

Penyebabnya lebih muda: etalase dibangun dari unit, bukan dari katalog.
`v_public_inventory` hanya memuat baris `inventory_units` yang punya
`product_id` dan `status = 'available'`, dan setiap kartu katalog dibangun
dari satu unit. Konsekuensinya:

- Produk yang sudah masuk ke `products` tapi belum punya unit berstatus
  `available` tidak punya satu pun kartu, karena belum ada yang bisa dijual.
- Produk yang unitnya sudah `sold` atau `reserved` juga tidak muncul.

Jadi menambah katalog belum cukup; unit fisiknya harus didaftarkan juga
lewat `/portal/inventory` dengan IMEI 15 digit. Untuk memastikan satu produk
tertentu benar-benar punya unit siap jual:

```sql
select p.brand, p.model_name, v.unit_id, v.condition, v.selling_price
  from public.v_public_inventory v
  join public.products p on p.id = v.product_id
 where p.model_name ilike '%Galaxy S26%';
```

Baris yang keluar berarti produk itu tampil di etalase. Hasil kosong berarti
unitnya belum terdaftar sebagai `available`.

### Verifikasi lokal memakai database yang sama

Kalau `DATABASE_URL` lokal menunjuk pooler Supabase yang sama dengan production,
jalankan hanya satu proses Next.js di mesin lokal. Tiap proses menahan sampai 5
koneksi (`max` di `src/db/client.ts`), sehingga `next dev` di repo utama
bersamaan dengan `next start` di worktree, ditambah beberapa permintaan curl
bersamaan, bisa membuat antrean menumpuk di belakang
`statement_timeout` 8000 milidetik, atau lebih tinggi kalau
`STATEMENT_TIMEOUT_MS` dinaikkan.

Gejalanya halaman publik yang menggantung, yaitu melewati batas waktu curl,
sementara `/robots.txt` dan `/api/health/live` tetap menjawab dalam sepersekian
detik. Itu gejala rebutan lokal, bukan bug kode. Cara memastikan: hentikan
proses Next.js lain, kirim satu permintaan, lalu periksa waktunya. Halaman
publik yang sehat menjawab antara 0,1 sampai 3 detik.

## DNS dan session

Domain At Cell dikelola melalui MyDomaiNesia. Buka **Domain → DNS Management**
dan ubah record hanya setelah deployment serta health check siap. Tambahkan
`atcell.my.id` dan `login.atcell.my.id` sebagai domain aplikasi di Coolify agar
Traefik mengetahui host yang harus dilayani.

| Host | Type | Target awal |
|------|------|-------------|
| `@` | A | IP public VPS Coolify |
| `login` | CNAME | `atcell.my.id` |

- `atcell.my.id` dan `login.atcell.my.id` harus memakai sertifikat TLS yang
  valid.
- Tambahkan URL production dan URL login ke daftar redirect Supabase Auth.
- Untuk sesi lintas subdomain, set `SUPABASE_COOKIE_DOMAIN=.atcell.my.id`.
- Jangan membuat record standby ke provider yang sudah tidak dipakai.

## Backup dan rollback

- Aktifkan backup/PITR sesuai paket Supabase dan export database secara berkala.
- Backup objek Storage dicadangkan terpisah dari backup database.
- Simpan hash/commit deployment dan satu dump database sebelum migration.
- Rollback aplikasi tidak membatalkan migration database. Migration rollback
  harus ditinjau dan tidak boleh menghapus data transaksi.

### Restore target lokal di Coolify

Resource ini hanya menjadi target restore test, bukan mirror aktif atau
sumber data aplikasi. Karena VPS At Cell hanya memiliki 2 vCPU dan 2 GB RAM,
spesifikasi awal yang disepakati adalah:

- 1 vCPU
- RAM maksimum 512 MB
- Disk 10 GB
- PostgreSQL private tanpa public port
- `max_connections` dan `shared_buffers` dibatasi
- Restore memakai `pg_restore --jobs=1`

Resource yang sama tidak boleh menjadi alasan utama untuk mengganti
Supabase production. Coolify, aplikasi, dan restore database berada
pada failure domain yang sama. Dump asli tetap harus disalin ke object storage
off-site terenkripsi.

Pembuatan resource di Coolify:

1. Buka project At Cell, pilih environment production, lalu **New Resource →
   PostgreSQL**.
2. Beri nama `atcell-restore-local`.
3. Pilih image PostgreSQL yang sama atau lebih baru dari major version Supabase.
4. Pilih destination/network Coolify yang sama dengan VPS At Cell.
5. Batasi CPU 1, RAM 512 MB, dan volume 10 GB.
6. Matikan public port dan jangan masukkan URL database ini ke aplikasi.
7. Start resource dan tunggu health check hijau.
8. Simpan credential internal di Coolify secret manager, bukan di repository.

Urutan backup yang aman:

1. Ambil dump logis dari Supabase dengan format custom. Script backup mencakup
   schema `public`, `private`, dan `auth`. Auth ikut karena account staf ada di
   database yang sama dengan data bisnis: `public.profiles` mereferensi
   `auth.users(id)`. **Storage belum ikut** dan itu masih celah terbuka, lihat
   bagian "Storage belum ikut ter-backup" di bawah.
2. Script backup membuktikan isi dumpnya sendiri. Kalau `auth.users` tidak ada
   di dalam daftar isi arsip, dump tetap ditulis (data bisnis lebih baik ada
   daripada tidak ada) tapi script keluar dengan kode 70 dan cron mencatat
   `GAGAL`. Tidak ada lagi jalur yang melaporkan backup lengkap padahal Auth
   tidak ikut.
3. Hitung checksum dump, enkripsi, dan kirim ke storage off-site
   (`npm run backup:offsite`; berjalan otomatis lewat cron harian).
4. Salin dump ke restore target Coolify saat jadwal restore test.
5. Jalankan bootstrap minimal pada PostgreSQL biasa dengan
   `scripts/restore-target-bootstrap.sql`. Bootstrap membuat role Data API
   minimal, `auth.users`, `auth.uid()`, dan `auth.role()`.
6. Jalankan `pg_restore --jobs=1`. Untuk dump modern, tabel `auth.users` yang
   dibuat bootstrap langsung diganti oleh isi dump, sehingga akun staf ikut
   pulih. Stub hanya dipakai untuk dump lama yang belum memuat schema auth.
7. Cek tabel wajib, RLS, trigger, view, dan jumlah akun auth asli.
8. Hapus data restore test setelah selesai atau hentikan service agar RAM
   kembali ke aplikasi.

### Storage belum ikut ter-backup

`storage` tidak ikut dalam `pg_dump` pada `scripts/backup-postgres.sh`, sama
seperti keadaannya sebelum Auth ikut diperbaiki. Jadi foto produk, foto servis,
dan foto trade-in hanya ada di backup layanan Supabase, bukan di dump At Cell
dan bukan di standby. Kalau dump itu dipakai untuk memulihkan setelah
kejadian yang menghapus bucket, data foto tidak ikut pulih, sementara tabel
`product_images` tetap berisi baris yang menunjuk path yang sudah tidak ada.
Celah ini butuh keputusan tersendiri: dump `storage` menambah ukuran arsip
secara langsung, dan bucket produksi berisi foto yang tidak boleh bocor ke
dump yang berisi data bisnis. Yang dilakukan repo sekarang hanya mencatat
keadaan ini supaya tidak dianggap sudah selesai.

### Apa yang masih perlu langkah manusia untuk Auth

Dump At Cell sekarang memuat akun staf, jadi tidak ada data Auth yang hilang
diam-diam. Tapi memulihkan **login** adalah urusan Supabase Auth, bukan
PostgreSQL biasa, dan langkah itu tidak bisa dilakukan oleh script repo:

1. `pg_dump` mengembalikan baris `auth.users` ke database. GoTrue tidak
   berjalan di sana, jadi tabel itu adalah data, bukan layanan yang bisa
   menerima login.
2. Agar orang bisa login lagi di Supabase, baris itu harus diimpor kembali ke
   Auth project Supabase. Itu operasi Supabase Auth, jadi butuh kredensial
   project yang tidak ada di VPS ini dan sengaja tidak dibuat oleh repo.
3. Dump modern sudah berisi `auth.identities` juga, sehingga akun berbasis
   email/password dan akun yang terhubung ke provider bisa keduanya ikut.

Selama Supabase projectnya utuh, seluruh ini tidak perlu dilakukan: Auth sudah
punya backup dan PITR sendiri. Yang baru dibutuhkan adalah ketika projectnya
sendiri hilang, dan saat itu yang dicari adalah dump At Cell yang memuat
`auth.users`. Keadaan sebelum 3 Oktober 2026 adalah kebalikannya: tidak ada
satu pun salinan yang memuat akun, sehingga kehilangan project berarti kehilangan
login tanpa ada apa pun untuk dipulihkan.

Contoh format dump dan restore:

```bash
SOURCE_DATABASE_URL="..." BACKUP_DIR="/path/backup" npm run backup:postgres
psql "$RESTORE_DATABASE_URL" -f scripts/restore-target-bootstrap.sql
# Cek dulu targetnya tanpa menyentuh database apa pun:
ALLOW_RESTORE=YES RESTORE_DRY_RUN=1 RESTORE_DATABASE_URL="..." \
  DUMP_FILE="/path/backup/atcell-....dump" npm run restore:postgres
# Jalankan sungguhan. Host di bawah harus diizinkan lebih dulu lewat
# RESTORE_ALLOWED_HOSTS; tanpa itu script berhenti dengan kode 3.
ALLOW_RESTORE=YES RESTORE_ALLOWED_HOSTS="atcell-restore-local" \
  RESTORE_DATABASE_URL="..." DUMP_FILE="/path/backup/atcell-....dump" \
  npm run restore:postgres
```

Script restore menolak jalan sebelum menyentuh database kalau salah satu hal ini
tidak terpenuhi:

- `ALLOW_RESTORE=YES` tetap syarat pertama, tapi tidak lagi cukup.
- Host target harus `localhost`, `127.0.0.1`, atau `::1`, atau hostnya disebut
  eksplisit di `RESTORE_ALLOWED_HOSTS`. Target restore resmi
  (`atcell-restore-local` di network Coolify) bukan localhost, jadi operator
  wajib menyebutnya sekali di environment restore. Drill ke container
  PostgreSQL sekali pakai di host yang sama tidak butuh flag tambahan.
- Host produksi ditolak tanpa syarat apa pun. Pola `*.supabase.co`,
  `*.supabase.com`, dan `*.atcell.my.id` berhenti dengan kode 3, dan tidak ada
  flag yang membukanya, termasuk saat host itu sengaja ditulis ke
  `RESTORE_ALLOWED_HOSTS`. Produksi adalah sumber dump, bukan target restore.
- Tanpa `RESTORE_ASSUME_YES=1`, script meminta konfirmasi di terminal dan hanya
  melanjutkan kalau nama database target diketik ulang persis. Prompt ditulis
  ke `/dev/tty`, bukan ke stdout, supaya tidak ikut ter-log tanpa disadari.
- `RESTORE_DRY_RUN=1` menjalankan seluruh guard, mencetak host dan database
  target beserta perintah `pg_restore` yang akan dijalankan, lalu berhenti
  tanpa membuka koneksi.

Yang tidak bisa dilompati adalah daftar host produksi dan daftar host target.
Yang bisa dilompati hanya prompt, lewat `RESTORE_ASSUME_YES=1`, dan itu tetap
tunduk pada kedua daftar. Sisa risikonya adalah alamat IP produksi yang ditulis
manual ke `RESTORE_DATABASE_URL` tanpa nama hostnya, karena itu tidak bisa
dibedakan dari IP mana pun; karena itu konfirmasi tetap wajib di jalur interaktif.

Script juga menolak dijalankan dengan `sh`. Ia memakai `[[ ]]` dan
`${var//[[:space:]]/}`, yang tidak dijamin ada di `/bin/sh`; jalankan dengan
`bash`, seperti `npm run restore:postgres` sudah lakukan.

`KEEP_DAYS` opsional dan default-nya 14. Setelah dump baru ditulis, dump yang
lebih tua dari `KEEP_DAYS` hari beserta file `.sha256`-nya dihapus, dan hanya
nama yang cocok pola `atcell-*.dump` yang disentuh. Nilai `0` mematikan rotasi
dan berarti orang yang memakai KEEP_DAYS=0 harus menyimpan salinannya sendiri
di luar. Tanpa rotasi direktori backup tumbuh tanpa batas sampai disk penuh, dan
disk penuh adalah tempat terakhir yang boleh menyimpan cadangan.

Script restore membaca daftar isi dump dulu dan memilih jalurnya. Kalau dump
memuat data `auth.users`, stub tidak dibuat sama sekali: akun staf ikut pulih
darinya, dan verifikasi setelah restore memastikan target punya akun auth
**asli**. Kalau dump tidak memuat `auth.users` (dump lama), baris stub dibuat
untuk setiap UUID profil di dump memakai alamat `restore-stub-<uuid>@invalid.local`
dan `on conflict do nothing`, supaya relasi `profiles.id -> auth.users.id`
terpenuhi tanpa menimpa akun asli yang sudah ada. Jalur stub membuat restore
bisa berjalan, tidak membuat siapa pun bisa login, dan restore seperti itu
ditolak dengan kode 5 beserta alasannya.

Sebelum 3 Oktober 2026 dump hanya mencakup `public` dan `private`, sehingga
setiap restore target berisi tabel `auth.users` yang isinya 100% stub: nol akun
asli, nol kolom password, nol `email_confirmed_at`. Pemeriksaan lama menghitung
kelengkapan stub dan selalu lolos. restored standby pada 3 Oktober 2026 memang
berisi tepat kondisi itu.

#### Standby terisi di VPS

Resource yang sama itu sekarang berjalan dan diisi ulang secara terjadwal, jadi
restore target tidak lagi sekadar resource yang di-start manual saat restore test.
Ini **bukan mirror aktif**: aplikasi tidak pernah terhubung ke database ini,
dan setiap sinkronisasi bersifat destruktif terhadap standby karena isinya
di-restore ulang dari dump.

| Komponen | Lokasi |
|----------|--------|
| Resource Coolify | `atcell-restore-local`, image `postgres:18-alpine` |
| Container | `ah5xioiowolm1uub4lpthnnd`, network `coolify` saja, tanpa port host |
| Jadwal | `/etc/cron.d/atcell-standby-sync`, 03.17/09.17/15.17/21.17 waktu host |
| Wrapper | `/usr/local/bin/atcell-standby-sync` (mode 700, root) |
| Log | `/var/log/atcell-standby-sync.log`, diputar `/etc/logrotate.d/atcell-standby-sync` |
| Dump perantara | `/data/backups/atcell-standby/atcell-<timestamp>.dump`, `KEEP_DAYS=7` |

Database standby tidak punya port host. Ia hanya terjangkau dari container lain
di network `coolify`, jadi dari luar VPS tidak bisa diakses:

```bash
# dari luar VPS: harus gagal
nc -vz <ip-vps> 5432

# dari container lain di network coolify: berhasil.
# Alamat dibaca dari Docker, bukan ditulis manual: IP container berubah saat
# di-restart, dan IP yang dilepas langsung dipakai container lain.
STANDBY=ah5xioiowolm1uub4lpthnnd
STANDBY_HOST=$(docker inspect "$STANDBY" \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
docker exec <container> pg_isready -h "$STANDBY_HOST" -p 5432
```

Jangan pernah mengunci alamat standby di dokumen atau di script. Pada
2026-10-02T10:05Z standby di-restart dan Docker memindahkannya dari
`10.0.1.4` ke `10.0.1.8`; enam menit kemudian `coolify-db` dibuat dan
mengambil `10.0.1.4`. Wrapper yang masih aims ke `10.0.1.4` selama tiga
percobaan sync berikutnya mengirim password standby ke database platform
Coolify, yang menolaknya dengan `password authentication failed`. Wrapper
kini membaca alamat dari Docker setiap kali jalan, dan mencatat baris
`Standby <container> di <ip>:5432` ke log supaya target yang dipakai selalu
bisa diaudit dari `/var/log/atcell-standby-sync.log`.

Jalankan sinkronisasi manual dengan cara yang sama seperti cron, supaya
redireksi log terjadi sebagai root:

```bash
sudo /usr/local/bin/atcell-standby-sync
```

Alur tiap sinkronisasi: dump logis dari Supabase (script repo, mode 0600 untuk
`DATABASE_URL` yang diambil runtime dari container aplikasi), bootstrap
minimum, lalu `pg_restore`. Karena dump modern sudah membawa `auth.users`,
`pg_restore --clean --if-exists` yang menentukan hasil akhir.

Wrapper tidak lagi menghapus schema `auth` tanpa syarat. Schema itu hanya
dibuang kalau target tidak punya akun auth asli, sehingga operator yang sudah
mengimpor Auth sungguhan ke standby tidak kehilangan account-nya diam-diam.
Kalau ada akun asli, langkah itu dilewati dan dicatat di log.

Wrapper meneruskan dua variabel ke `scripts/restore-postgres.sh` selain
`ALLOW_RESTORE`: `RESTORE_ALLOWED_HOSTS` diisi dari alamat standby yang baru saja
dibaca dari Docker, dan `RESTORE_ASSUME_YES=1` karena cron tidak punya terminal.
Keduanya wajib: tanpa yang pertama restore berhenti dengan "Host target tidak
diizinkan", tanpa yang kedua berhenti dengan "tidak ada terminal untuk
konfirmasi". Guard yang tidak bisa dilewati tetap berlaku, yaitu daftar host
produksi dan daftar host target.

Wrapper memverifikasi hasil akhir sebelum melapor sukses: `v_public_inventory`
tidak boleh kosong, `to_regclass` untuk tabel wajib, tidak boleh ada profil
tanpa pasangan di `auth.users`, dan harus ada minimal satu akun auth **asli**.
Hitungan stub tidak lagi dipakai sebagai bukti apa pun. Tidak ada satu pun
container yang disentuh kalau dump gagal.

Contoh verifikasi manual:

```bash
docker exec ah5xioiowolm1uub4lpthnnd psql -U postgres -d postgres \
  -c "select count(*) from v_public_inventory" \
  -c "select count(*) from auth.users" \
  -c "select count(*) from auth.users where coalesce(raw_user_meta_data->>'atcell_restore_stub','') <> 'true'" \
  -c "select to_regclass('public.products') is not null"
```

**Batas failure domain.** Standby ini ada di VPS yang sama dengan Coolify dan
aplikasi, jadi ia melindungi dari kerusakan data, migration yang salah, atau
`drop` yang tidak disengaja, dan memperpendek RTO karena tidak perlu install
apa pun untuk memulihkan. Ia **tidak** melindungi dari kehilangan VPS, dari
akun Supabase yang dikompromikan, atau dari ransomware di host yang sama.
Salinan terenkripsi off-host dibuat oleh `scripts/backup-offsite.sh`
(`npm run backup:offsite`): dump terbaru diverifikasi checksum-nya, lalu
dicoba dibaca dengan `pg_restore --list` dan dipastikan memuat data
`auth.users`, baru dienkripsi AES-256-CBC dengan PBKDF2 dan dikirim ke tujuan
rclone atau HTTP PUT. Pemeriksaan kedua itu wajib: checksum hanya membuktikan
berkas tidak berubah sejak ditulis, jadi arsip korup yang checksum-nya cocok
bisa lolos dan terkirim ke luar host, memberi rasa aman semu karena salinannya
ada di dua tempat tapi tidak bisa dipakai memulihkan akun staf.
Exit 0 berarti off-host copy benar-benar terkirim. Kalau passphrase atau
tujuan upload kosong, script keluar bukan-nol dan cron mencatat `GAGAL`,
karena cadangan yang diam-diam tidak jalan memunculkan rasa aman yang
palas. Keadaan di host ini per 3 Oktober 2026: file env yang dirujuk cron
belum dibuat, jadi job itu gagal setiap malam dan belum pernah mengirim
satu pun byte ke luar host. Cara dekripsi dan daftar variabel ada di
`scripts/backup-offsite.sh` dan `.env.example` (awalan `OFFSITE_`).


### Backup otomatis di VPS

`scripts/backup-postgres.sh` dijadwalkan lewat cron, bukan dijalankan manual:

| Komponen | Lokasi |
|----------|--------|
| Jadwal | `/etc/cron.d/atcell-backup`, setiap hari 02.17 waktu host |
| Wrapper | `/usr/local/bin/atcell-backup` |
| Script repo | `/opt/atcell/scripts/backup-postgres.sh` |
| Hasil | `/data/backups/atcell/atcell-<timestamp>.dump` + `.sha256` |
| Log | `/var/log/atcell-backup.log`, diputar `/etc/logrotate.d/atcell-backup` |

App container tidak punya `pg_dump`, jadi wrapper menjalankan script itu di dalam
`postgres:17-alpine` yang sudah ada di host. Versi 17 wajib karena server
Supabase masih 17.x; `postgres:15` akan menolak dengan `server version mismatch`.
`DATABASE_URL` dibaca dari app container saat runtime ke file sementara mode 0600
yang langsung dihapus, jadi tidak ada salinan kedua dari secret itu di disk.

Untuk memastikan backup benar-benar bisa dipulihkan, ada drill terjadwal.
`scripts/restore-drill.sh` (`npm run restore:drill`) mengambil dump terbaru,
memverifikasi checksum-nya, merestore-nya ke PostgreSQL 17 sekali pakai,
memeriksa hasilnya, lalu membuang container itu. Exit 0 berarti dump terbaru
memang bisa dipulihkan **dan** hasil restorenya punya akun auth asli.

| Komponen | Lokasi |
|----------|--------|
| Jadwal | `/etc/cron.d/atcell-restore-drill`, Minggu 04.17 waktu host |
| Wrapper | `/usr/local/bin/atcell-restore-drill` |
| Script repo | `/opt/atcell/scripts/restore-drill.sh` |
| Sumber dump | `/data/backups/atcell` (bisa diubah lewat `DUMP_DIR`) |
| Log | `/var/log/atcell-restore-drill.log`, diputar `/etc/logrotate.d/atcell-restore-drill` |

Drill tidak pernah menyentuh standby atau produksi. Container drill dibuat
sendiri oleh script itu dengan `--network none`, tanpa port yang dipublikasikan,
tanpa password sama sekali, dan selalu dibuang lewat `trap` walau drill gagal di
tengah. Kaidah yang dijaga: drill yang berhenti sebelum membuktikan apa pun sama
nilainya dengan tidak ada drill.

Backup yang belum pernah di-restore belum bisa disebut cadangan. Drill terjadwal
sekarang yang membuat klaim itu bisa dibuktikan: baris `Drill restore LULUS` di
log, atau `GAGAL` beserta pemeriksaan mana yang gagal.

#### Rotasi log At Cell

Semua log At Cell punya config logrotate, satu berkas per log, dengan pola yang
sama: `su root adm`, `weekly`, `rotate 8`, `compress`, `delaycompress`,
`missingok`, `notifempty`, `copytruncate`.

| Log | Config |
|-----|--------|
| `/var/log/atcell-backup.log` | `/etc/logrotate.d/atcell-backup` |
| `/var/log/atcell-standby-sync.log` | `/etc/logrotate.d/atcell-standby-sync` |
| `/var/log/atcell-offsite.log` | `/etc/logrotate.d/atcell-offsite` |
| `/var/log/atcell-watchdog.log` | `/etc/logrotate.d/atcell-watchdog` |
| `/var/log/atcell-restore-drill.log` | `/etc/logrotate.d/atcell-restore-drill` |

Setiap config baru diuji dengan `logrotate -d /etc/logrotate.d/<nama>` sebelum
dipasang. Tanpa itu, salah ketik satu baris berarti satu log tumbuh tanpa
batas sampai disk penuh, dan disk penuh adalah tempat terakhir yang boleh
menyimpan cadangan.

#### Notifikasi kegagalan uptime

`scripts/atcell-watchdog.sh` dijalankan `/usr/local/bin/atcell-watchdog` lewat
`/etc/cron.d/atcell-watchdog` setiap lima menit. Script ini hanya bersuara saat
status berubah, **tapi** pencatatannya tidak hilang: transisi dan pengulangan
selama outage berjalan ditulis ke log berkas, ke syslog lewat
`logger -t atcell-watchdog`, dan ke `/var/lib/atcell-watchdog/incident` yang
isinya dihapus saat pulih. Jadi `journalctl -t atcell-watchdog`,
`grep atcell-watchdog /var/log/syslog`, dan `/var/lib/atcell-watchdog/incident`
semuanya menunjukkan insiden yang sedang berjalan.

Notifikasi ke luar hanya lewat Telegram, dan **hanya** kalau
`/root/.atcell-watchdog.env` ada dengan dua variabel ini:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Tanpa kedua variabel itu `notify()` keluar tanpa melakukan apa pun; pencatatan
di tiga tempat di atas tetap berjalan, yang hilang hanya pesan ke telepon. Bot
dibuat lewat `@BotFather`, dan `TELEGRAM_CHAT_ID` adalah id chat tujuan, bukan
nama akun. Jangan tulis nilainya ke repository.

Jangan menyimpan password database, token, atau checksum dump sensitif di
repository. Nilai secret hanya disimpan di Coolify secret manager.

## Testing wajib

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run smoke:deployment -- https://primary.example.com
```

Smoke test browser dilakukan pada URL Coolify production. Uji minimal:

- `/id` dan `/id/catalog` ketika public snapshot tersedia.
- `/id/tracking` dengan kode tiket valid dan kode invalid.
- login admin, sales, technician, customer.
- guard route sesuai role.
- registrasi IMEI, POS anti-double-sell, dan workflow tiket.
- RLS, Storage, advisor, bundle secret, dan security header.
