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
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_COOKIE_DOMAIN=.atcell.my.id
DATABASE_URL=
GOOGLE_PLACES_API_KEY=
```

`DATABASE_URL` harus menunjuk ke connection pooler Supabase production, bukan
ke `localhost` VPS. `SUPABASE_SECRET_KEY` hanya boleh tersedia sebagai secret
server. Jangan memakai legacy `anon` atau `service_role` untuk release baru.

## Migrasi database

Jalankan seluruh migration Supabase secara berurutan:

```text
supabase/migrations/0001_atcell_schema.sql
supabase/migrations/0002_harden_atcell_schema.sql
supabase/migrations/0003_lock_legacy_helpers.sql
supabase/migrations/20260925142137_align_schema_contract.sql
supabase/migrations/20260926025406_index_public_foreign_keys.sql
```

`0001` membuat tabel, enum, RLS, trigger, view, bucket Storage, grant Data API,
dan seed `store_settings`. `0002` menyelaraskan project yang awalnya memakai
versi `0001` lama dengan helper private, grant minimum, trigger anti-double-sell,
serta `security_invoker` pada view. `0003` menutup helper legacy di schema
`public`. Migration timestamp berikutnya menyelaraskan FK, index performa, dan
singleton `store_settings` dengan hasil audit production.

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
npm run smoke:deployment -- https://primary.example.com
```

Smoke test browser dilakukan pada URL Coolify production. Uji minimal:

- `/id` dan `/id/catalog` ketika public snapshot tersedia.
- `/id/tracking` dengan kode tiket valid dan kode invalid.
- login admin, sales, technician, customer.
- guard route sesuai role.
- registrasi IMEI, POS anti-double-sell, dan workflow tiket.
- RLS, Storage, advisor, bundle secret, dan security header.
