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

- `GOOGLE_PLACES_API_KEY` untuk sync ulasan Google. Kosong hanya mematikan
  auto-sync, bukan halaman ulasan.
- `GOOGLE_PLACE_ID` untuk memilih toko yang diulas. Ada nilai bawaan di
  `src/lib/reviews.ts`, jadi tidak wajib diisi kalau toko tidak pernah
  berubah.
- `NEXT_PUBLIC_SITE_URL` atau `SITE_URL` untuk URL kanonik di `sitemap.ts`.
  Kosong membuat sitemap memakai URL yang dikarang, bukan domain produksi.
- `SERVER_ACTIONS_ALLOWED_ORIGINS` untuk origin tambahan Server Actions,
  dipisah koma tanpa protocol dan tanpa path. `next.config.ts` sudah memakai
  domain apex sebagai bawaan.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` hanya untuk kompatibilitas project lama
  yang belum memakai publishable key.

`DATABASE_URL` harus menunjuk ke connection pooler Supabase production, bukan
ke `localhost` VPS. `SUPABASE_SECRET_KEY` hanya boleh tersedia sebagai secret
server. Jangan memakai legacy `anon` atau `service_role` untuk release baru.

## Migrasi database

Jalankan seluruh migration di `supabase/migrations/` secara berurutan. Urutannya
wajib, karena beberapa file bergantung pada objek yang dibuat file sebelumnya:

| Berkas | Isi |
|--------|-----|
| `0001_atcell_schema.sql` | Tabel, enum, RLS, trigger, view, bucket Storage, grant Data API, dan seed `store_settings` |
| `0002_harden_atcell_schema.sql` | Helper private, grant minimum, trigger anti-double-sell, `security_invoker` pada view |
| `0003_lock_legacy_helpers.sql` | Menutup helper legacy di schema `public` |
| `0004_align_schema_contract.sql` | Menyelaraskan FK, index performa, dan singleton `store_settings` dengan hasil audit production |
| `0005_username_login.sql` | Login berbasis username, bukan email |
| `0006_store_social_urls.sql` | Akun media sosial toko |
| `0007_audit_trail.sql` | Riwayat audit untuk mutasi data sensitif |
| `20260926025406_index_public_foreign_keys.sql` | Index untuk seluruh foreign key di schema `public` |
| `20260926103000_strengthen_ticket_codes.sql` | Format kode tiket servis 8 karakter base32 plus validasi transisi status |
| `20260927120000_auto_enable_rls_on_new_tables.sql` | RLS otomatis aktif pada tabel baru |
| `20260927130000_product_image_registry.sql` | Tabel `product_images` sebagai sumber kebenaran path gambar katalog |
| `20260927140000_store_owner_and_real_contact.sql` | Kolom `owner_name` dan kontak asli toko |
| `20260927150000_revoke_anon_write_on_product_images.sql` | Mengcabut hak tulis `anon` pada `product_images`, sisanya hanya `SELECT` |
| `20260927160000_harden_storage_access.sql` | Bucket foto pelanggan jadi privat, `storage_public_read` hanya untuk katalog, batas ukuran dan tipe MIME |
| `20260927170000_demo_ticket_for_tracking_example.sql` | Tiket contoh supaya kode contoh di halaman lacak benar-benar berfungsi |
| `20260927180000_nullable_inventory_unit_product.sql` | `inventory_units.product_id` jadi nullable untuk unit trade-in, etalase publik hanya menampilkan unit berkatalog, plus catatan perbaikan baris lama |

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
satu berkas urut untuk project yang belum punya skema sama sekali. Isinya
harus identik dengan berkas aslinya, dan `tests/run-all-pending.test.ts`
menjaga hal itu. Jangan menjalankan kedua sumber sekaligus.

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
3. Deploy Coolify production dari branch `main` dan cek `/api/health/ready`.
4. Jalankan smoke test public, login, role guard, IMEI, POS, service tracking,
   dan upload pada URL production.
5. Verifikasi RLS, trigger, view, Storage, advisor, dan backup.
6. Aktifkan domain final dan TLS hanya setelah deployment lulus.
7. Lakukan restore test terjadwal ke resource restore private.

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
   schema `public` dan `private`; data Auth dan Storage tetap menjadi backup
   layanan Supabase.
2. Hitung checksum dump dan simpan ke storage off-site.
3. Salin dump ke restore target Coolify saat jadwal restore test.
4. Jalankan bootstrap minimal pada PostgreSQL biasa dengan
   `scripts/restore-target-bootstrap.sql`. Bootstrap membuat role Data API
   minimal, `auth.users`, `auth.uid()`, dan `auth.role()`.
5. Isi `auth.users` pada target dengan UUID profil yang ada di dump sebelum
   restore karena foreign key `profiles.id -> auth.users.id` harus terpenuhi.
6. Jalankan `pg_restore --jobs=1`, lalu cek tabel wajib, RLS, trigger, dan view.
7. Hapus data restore test setelah selesai atau hentikan service agar RAM
   kembali ke aplikasi.

Contoh format dump dan restore:

```bash
SOURCE_DATABASE_URL="..." BACKUP_DIR="/path/backup" npm run backup:postgres
psql "$RESTORE_DATABASE_URL" -f scripts/restore-target-bootstrap.sql
ALLOW_RESTORE=YES RESTORE_DATABASE_URL="..." DUMP_FILE="/path/backup/atcell-....dump" npm run restore:postgres
```

`KEEP_DAYS` opsional dan default-nya 14. Setelah dump baru ditulis, dump yang
lebih tua dari `KEEP_DAYS` hari beserta file `.sha256`-nya dihapus, dan hanya
nama yang cocok pola `atcell-*.dump` yang disentuh. Nilai `0` mematikan rotasi
dan berarti orang yang memakai KEEP_DAYS=0 harus menyimpan salinannya sendiri
di luar. Tanpa rotasi direktori backup tumbuh tanpa batas sampai disk penuh, dan
disk penuh adalah tempat terakhir yang boleh menyimpan cadangan.

Script restore sudah mengisi `auth.users` dengan stub untuk setiap UUID profil di
dump sebelum menjalankan `pg_restore`, karena dump hanya mencakup schema `public`
dan `private` sedangkan `profiles.id` mereferensi `auth.users(id)`. Stub memakai
alamat `restore-stub-<uuid>@invalid.local` dan `on conflict do nothing`, jadi jelas
bukan akun sungguhan dan tidak merusak Auth asli yang sudah ada. Backfill Auth
Supabase tetap wajib dilakukan sebelum restore target dipakai sungguhan.

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

Untuk memastikan backup benar-benar bisa dipulihkan, jalankan restore test dari
dump terbaru ke PostgreSQL 17 sekali pakai, bandingkan jumlah baris dengan
produksi, lalu hapus container uji. Backup yang belum pernah di-restore belum
bisa disebut cadangan.

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
