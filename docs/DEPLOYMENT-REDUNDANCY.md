# Deployment Redundansi At Cell

Dokumen ini adalah runbook operasional untuk menjalankan satu codebase At Cell
di Coolify dan Vercel. Strategi awal adalah **active-passive**: Coolify menjadi
primary, Vercel menjadi standby, dan keduanya memakai backend Supabase yang sama.

## Arsitektur target

```text
DNS / load balancer
        |
        +-- primary : Coolify VPS
        |
        +-- failover: Vercel
                 |
Supabase PostgreSQL + Auth + Storage
```

Database tidak boleh dibuat di dalam container aplikasi. Jika database hanya
ada di VPS, ketika VPS down Vercel juga tidak dapat menjalankan portal.

## Environment production

Vercel Hobby hanya mengizinkan penggunaan non-komersial. At Cell adalah aplikasi
bisnis, jadi akun Vercel harus memakai Pro atau Enterprise sebelum deployment
production. Jangan menggunakan Hobby untuk traffic toko.

Set variabel berikut di Coolify dan Vercel Production. Nilai secret hanya diisi
lewat dashboard atau secret manager, tidak pernah commit ke repository.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_COOKIE_DOMAIN=.atcell.my.id
DATABASE_URL=
GOOGLE_PLACES_API_KEY=
```

`DATABASE_URL` untuk Vercel dan Coolify harus menunjuk ke project Supabase
production yang sama. Gunakan connection pooler, bukan connection string yang
menunjuk ke `localhost` VPS. Preview Vercel harus memakai project Supabase
staging atau tetap tidak memiliki env live.

## Migrasi database

Jalankan seluruh migration Supabase secara berurutan:

```text
supabase/migrations/0001_atcell_schema.sql
supabase/migrations/0002_harden_atcell_schema.sql
supabase/migrations/0003_lock_legacy_helpers.sql
```

`0001` membuat tabel, enum, RLS, trigger, view, bucket Storage, grant Data API,
dan seed `store_settings`. `0002` menyelaraskan project yang awalnya memakai
versi `0001` lama dengan helper private, grant minimum, trigger anti-double-sell,
serta `security_invoker` pada view. `0003` menutup helper legacy di schema
`public`.

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

Gunakan `/api/health/ready` sebagai target health check Coolify, Vercel, dan
DNS/load balancer. Response 503 harus dianggap sebagai not ready, bukan sebagai
keberanian untuk memakai data mock.

## Rilis yang aman

1. Jalankan test, typecheck, lint, dan build di commit yang sama.
2. Deploy ke preview/staging dengan database staging.
3. Jalankan smoke test login, role guard, IMEI, POS, service tracking, dan upload.
4. Jalankan migration canonical ke Supabase production dari satu release job.
5. Verifikasi RLS, trigger, view, Storage, dan backup.
6. Deploy Coolify production dan cek `/api/health/ready`.
7. Deploy Vercel dari branch/commit yang sama, tanpa mengganti DNS primary.
8. Uji fallback secara manual memakai URL fallback.
9. Aktifkan DNS atau load-balancer failover hanya setelah fallback lulus.

## DNS dan session

Domain At Cell dikelola melalui MyDomaiNesia. Buka **Domain → DNS Management**
dan ubah record hanya setelah deployment serta health check siap. Tambahkan
`atcell.my.id` dan `login.atcell.my.id` sebagai domain aplikasi di Coolify agar
Traefik mengetahui host yang harus dilayani.

| Host | Type | Target awal |
|------|------|-------------|
| `@` | A | IP public VPS Coolify |
| `login` | CNAME | `atcell.my.id` |
| `standby` | CNAME | target CNAME dari Vercel |

Untuk failover otomatis, Domainesia saja biasanya tidak menjadi health-check
router. Gunakan manual switch terlebih dahulu, atau pindahkan DNS ke layanan
load balancer yang mendukung health check. Jangan arahkan kedua target pada
record yang sama tanpa mekanisme failover.

- `atcell.my.id` dan `login.atcell.my.id` harus memakai sertifikat TLS yang
  valid di kedua provider.
- Jika memakai domain fallback yang berbeda, user dapat diminta login ulang
  karena cookie dan origin berbeda.
- Tambahkan URL production, URL login, dan URL fallback ke daftar redirect
  Supabase Auth.
- Untuk sesi lintas subdomain, set `SUPABASE_COOKIE_DOMAIN=.atcell.my.id`.

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

Script backup memakai format custom, checksum SHA-256, dan tidak mencetak URL
database. Script restore memakai `ALLOW_RESTORE=YES` sebagai guard karena
operation tersebut dapat menimpa data target.

Jangan menyimpan password database, token, atau checksum dump sensitif di
repository. Nilai secret hanya disimpan di Coolify secret manager.

## Testing wajib

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run smoke:deployment -- https://primary.example.com https://fallback.example.com
```

Smoke test browser harus dilakukan pada URL Coolify dan URL Vercel secara
terpisah. Uji minimal:

- `/id` dan `/id/catalog` ketika public snapshot tersedia.
- `/id/tracking` dengan kode tiket valid dan kode invalid.
- login admin, sales, technician, customer.
- guard route sesuai role.
- registrasi IMEI, POS anti-double-sell, dan workflow tiket.
- perpindahan dari URL Coolify ke URL Vercel dengan database yang sama.
