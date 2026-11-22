# Status, Backlog, dan Keputusan Owner

Diperbarui: 22 November 2026

Dokumen ini satu-satunya sumber status pekerjaan yang masih terbuka. Riwayat
rilis dan catatan yang sudah selesai ada di Git history, bukan dipertahankan di
sini.

## 1. Keadaan repo

- Baseline sebelum patch Next.js: `4114737`; patch Next.js 16.4.6 sudah masuk
  `main` di `0a3b31a`. `LAPORAN/` tetap lokal dan tidak dilacak Git.
- Jangan menganggap perubahan lokal sudah masuk remote sebelum
  `git status --short --branch` diperiksa.
- Pin image production ada di baris `FROM` `Dockerfile.coolify`. Pin itu belum
  membuktikan production sudah menjalankan commit tersebut; verifikasi lewat
  Coolify dan health check.
- Audit run-1 mencatat 0 confirmed dan satu lead rate limiter
  `needs_validation`. Run-2 parsial belum lengkap karena provider `opencode2`
  tidak tersedia: 6 unit blocked dan 27 deferred. Laporan ada di luar repo,
  pada `~/security-audit-skill/KP/run-2/`.
- CI main untuk commit `0a3b31a` lulus tests, typecheck, lint, dan production
  build; security, database contract tests, dan build image juga lulus.

## 2. Task aktif

### 2.1 UI/UX yang ditunda

| ID | Task | Alasan ditunda | Langkah berikutnya |
|---|---|---|---|
| U1 | Banner `BackendStatus` menyebabkan CLS 0.733-0.878 saat snapshot publik gagal | Mengubah perilaku dan posisi banner di semua halaman | Owner pilih overlay `fixed`, slot tinggi tetap, atau pindah ke widget chat |
| U2 | Footer bergeser intermiten di `/id/trade-in` (CLS 0.878-1.000 pada 2/3 run) | Akar belum terverifikasi | Rekam trace DevTools atau video Lighthouse sebelum mengubah CSS |
| U3 | Migrasi halaman portal lain ke `NoticeBanner`/`ModalShell` bersama | Refactor sukarela, sebagian menyentuh `components/ui/` | Satu halaman per PR setelah owner setuju |
| U4 | Grafik omzet harian/bulanan di dashboard (D1-A) | Fitur baru dan perubahan UI | Owner pilih A (grafik), B (ubah PRD), atau C (tunda) |
| U5 | Laporan performa per teknisi dengan rata-rata durasi (D2-A) | Butuh `completed_at`, migrasi, dan UI laporan | Owner pilih A, B, atau C sebelum schema disentuh |
| U6 | Foto resmi Oppo Reno 12 Pro 5G dan Samsung Galaxy S24 | Aset resmi belum tersedia | Owner/staf unggah lewat Master Produk atau Etalase & Harga |
| U7 | Copy peringatan link pembayaran di `/payment` dan `/terms` | Keputusan copy dan nada | Copy final sudah dipakai; sisa keputusan hanya kalau owner ingin mengubahnya |
| U8 | Tambah unit/IMEI untuk model katalog yang belum punya stok | IMEI asli belum diberikan | Owner beri IMEI asli, staf registrasi lewat inventaris |

### 2.2 Fitur dan perubahan perilaku

| ID | Task | Blocker |
|---|---|---|
| F1 | Aktor audit wajib pada tulis langsung (D3) | Owner pilih fallback `auth.uid()`, cabut tulis langsung, atau ubah NFR-07; butuh migrasi dan uji staging |
| F2 | Aturan integritas DB bagian A-L | Owner belum menyetujui; SQL ada di `docs/migrations-proposed/` |
| F3 | Aturan harga jual minimal sama dengan modal (bagian M) | Keputusan kebijakan harga, termasuk apakah loss leader diizinkan |
| F4 | Urutan penerapan D3, D2, lalu A-L | Menunggu keputusan D1-D3 dan M |
| F5 | Tampilkan biaya servis di tracking publik | Keputusan privasi; tracking sekarang hanya status, model, akhir IMEI, garansi, dan waktu |
| F6 | Batasi sales hanya ke harga acuan dan foto etalase | Keputusan produk; kalau admin-only, perlu perubahan kode dan migrasi |
| F7 | Audit harga/stok dan guard kolom sales lainnya | Belum ada keputusan; terkait migrasi A-L |

### 2.3 Task non-UI

| ID | Task | Status dan blocker |
|---|---|---|
| N1 | Verifikasi DB-level di staging/lokal | CI PostgreSQL polos dan 6 test RLS lulus (run `40700897417`, 40/40). Supabase Auth/PostgREST/Storage dan RLS staging belum diuji. Jalankan `DATABASE_URL=<staging> bun run test`, jangan production |
| N3 | E2E Playwright tiga kali hijau | Paket Playwright tidak terpasang, tidak ada backend live. Butuh Supabase/PostgreSQL lokal sekali pakai |
| N4 | Audit dependensi lanjutan | `@sentry/nextjs` dinaikkan ke 11.11.0; `bun audit --production` sekarang bersih. Audit penuh masih melaporkan 2 moderat dev-only: `esbuild@0.18.20` melalui loader Drizzle dan `minimatch@10.2.6` melalui TypeScript-ESLint. Perbaikan memerlukan dukungan upstream yang kompatibel; hindari override major tanpa uji |
| N5 | Update dependensi tertunda | `next` dan `eslint-config-next` dinaikkan dari 16.4.2 ke 16.4.6; rilis 16.4.5 membawa patch keamanan dan 16.4.6 adalah patch LTS terbaru. Lockfile konsisten dan CI run `45018105681` lulus tests, typecheck, lint, serta production build. Kandidat lain tetap ditunda bila butuh major atau belum cukup matang |
| N6 | Branch protection `main` | Required check `verify`, `security`, `database-tests` aktif. Required PR review dan `enforce_admins` ditunda karena repo solo |
| N15 | Insiden 503 16 Nov 2026 (pooler `ClientRead` macet, situs down >24 jam) | Pulih 16 Nov: 16 backend diterminasi + container restart; `scripts/atcell-db-reaper.sh` + `tests/reaper-durability.test.ts` dibuat. Reaper belum dipasang di host (`/etc/cron.d/atcell-db-reaper`); notifikasi Sentry uptime email sudah aktif (alert `6352978`) tapi Telegram watchdog butuh token di `/root/.atcell-watchdog.env`; notifikasi kegagalan uptime baru menjangkau owner lewat email; healthcheck Coolify perlu diputuskan `live` vs `ready` di dashboard; investigasi sumber gelombang koneksi macet belum selesai (kandidat: pratinjau Vercel berbagi `DATABASE_URL` production, dan socket setengah-mati VPS↔Supavisor) |
| N16 | Error produksi Sentry `KP-1` (`57014` dari `GET /api/health/ready`) | Satu event 17 Nov, tidak berulang setelah insiden 503. Akar masalah di `postgres` 3.4.9: `fetchArrayTypes()` menjalankan query internal `pg_type` dari `ReadyForQuery` tanpa `await`/`catch`, sehingga `statement_timeout` 8 detik menjadi unhandled rejection. Reproduksi lokal dengan server PostgreSQL tiruan: `fetch_types: true` = 1 unhandled rejection, `fetch_types: false` = 0. Belum ada perubahan kode; owner pilih D5: upgrade `postgres` 4.1.1 atau `fetch_types: false` + normalisasi `text[]` |
| N7 | Backup off-site dan backup objek Storage | Butuh passphrase, `rclone`/endpoint upload, dan bukti restore. Lihat `DEPLOYMENT-REDUNDANCY.md` |
| N8 | Isolasi preview Vercel dari database production | Preview masih bisa membaca production. Butuh project Supabase terpisah dan pencabutan env |
| N9 | Pastikan proxy menimpa `X-Forwarded-Host` | Perlu verifikasi ops di Coolify/Traefik |
| N10 | Keputusan exclusion angka lab Lighthouse | Menunggu owner; angka jaringan nyata sudah baik |
| N12 | Arsipkan atau koreksi `docs/3.4 Perancangan Database At Cell.docx` | Lokal, gitignored, tidak ikut repo |
| N13 | Perbaiki urutan `lower()` dan `regexp_replace` di `handle_new_user` | Migrasi `20261122101041_fix_handle_new_user_lower_order.sql` memperbaiki trigger dan fallback format username. Tidak mengubah username akun lama otomatis; butuh uji staging sebelum diterapkan ke production |
| N14 | Validasi lead rate limit `cred-user` | Butuh fakta deployment: jumlah replika/container Coolify, kepercayaan `X-Forwarded-For` di Traefik, dan ada-tidaknya WAF. Tanpa itu tetap `needs_validation` |

## 3. Keputusan owner

### D1: grafik omzet

Dashboard sekarang hanya menampilkan total omzet, jumlah transaksi, tiket
aktif, dan stok rendah. PRD meminta grafik harian/bulanan.

- **A. Bangun grafik 30 hari tanpa library baru.** Agregasi
  `transactions.final_payment` per hari, kecuali `is_demo`, render SVG atau
  batang CSS. Perlu test agregasi, empty state, dan screenshot mobile 320px.
- **B. Ubah PRD menjadi ringkasan total.** Paling murah dan jujur pada
  perilaku sekarang.
- **C. Tunda.** Catat sampai ada kebutuhan operasional.

Rekomendasi: B kalau dashboard tidak dipakai melihat tren, A kalau tren
mingguan/bulanan benar-benar dipakai. Jangan menambah library chart.

### D2: laporan per teknisi

Halaman laporan sekarang menghitung agregat global. `service_tickets` sudah
punya `technician_id`, tetapi belum punya `completed_at`, dan `updated_at`
tidak bisa dipakai sebagai waktu selesai.

- **A. Tambah `completed_at`, backfill dari audit, agregasi per teknisi.**
  Isi saat status masuk `completed`, bukan `picked_up`.
- **B. Hitung dari `service_ticket_audit` tanpa kolom baru.** Lebih rapuh dan
  bergantung pada kelengkapan audit lama.
- **C. Ubah FR-D-03 dan PRD menjadi laporan global.**

Rekomendasi: A kalau laporan dipakai untuk beban kerja atau SLA, C kalau
tidak. Hindari B kecuali migrasi schema ditolak.

### D3: aktor audit pada tulis langsung

`private.current_actor_id()` hanya membaca `atcell.actor_id` yang diisi Server
Action. Policy RLS masih mengizinkan staf update `inventory_units` dan
`service_tickets` langsung, sehingga `actor_id` bisa NULL.

- **A. Fallback ke `auth.uid()`.** Kecil, tidak mencabut akses, menutup celah
  audit utama. `service_role` dan `psql` tetap NULL.
- **B. Cabut update langsung, paksa lewat Server Action.** Batas tulis paling
  kuat, tetapi berisiko memutus PostgREST/realtime.
- **C. Ubah NFR-07 menjadi "mutasi lewat Server Action".** Cepat, celah audit
  tetap ada.

Rekomendasi: A sebagai langkah pertama, B hanya kalau semua tulis langsung
ingin ditutup.

### D4: urutan penerapan

1. Owner memutuskan D1, D2, D3, dan bagian M.
2. Kalau D3 disetujui, terapkan migrasi aktor audit lebih dulu.
3. Kalau D2 disetujui, terapkan `completed_at` dan backfill.
4. Terapkan aturan bisnis A-L dari `docs/migrations-proposed/` secara terpisah.
5. Bagian M hanya kalau loss leader dilarang.
6. Setelah setiap migrasi, jalankan `DB-INTEGRITY.md` dan catat hasilnya.

### M: harga jual di atas modal

`selling_price >= purchase_cost`. Rekomendasi: setujui untuk mencegah jual di
bawah modal, kecuali toko sengaja memakai loss leader. Harga impas tetap
diizinkan.

### D5: driver `postgres` untuk KP-1

Sentry `KP-1` (`57014`, culprit `GET /api/health/ready`) berasal dari
`postgres` 3.4.9, bukan dari kode repo. `fetchArrayTypes()` mengirim query
internal `pg_type` dari `ReadyForQuery` tanpa `await` atau `catch`, sehingga
`statement_timeout` 8 detik menjadi unhandled rejection. Reproduksi lokal
dengan server PostgreSQL tiruan: `fetch_types: true` menghasilkan 1 unhandled
rejection, `fetch_types: false` menghasilkan 0. `postgres` 4.1.1 memindahkan
pemuatan tipe ke pool, jadi bug ini tidak ada di 4.x.

- **A. Upgrade `postgres` ke 4.1.1.** Perbaikan bersih di sumbernya. Major
  version, jadi wajib gate penuh dan uji baca/tulis `text[]`, JSONB, dan
  transaksi.
- **B. Set `fetch_types: false` di `buildDb()`.** Tanpa major bump, tetapi
  `db.execute` mentah berhenti mem-parse array. `getPublicInventory` di
  `src/lib/actions/public.ts` membaca `official_images`/`second_images`
  (`text[]`), jadi perlu normalisasi sebelum opsi ini aman.
- **C. Biarkan.** Satu event, tidak berulang, tetapi unhandled rejection bisa
  mematikan proses kalau `statement_timeout` terpicu lagi.

Rekomendasi: A. 3.4.9 adalah rilis 3.x terakhir dan perbaikannya struktural;
B hanya kalau upgrade major ditunda.

## 4. Tindakan owner di luar kode

1. Sentry: ganti `SENTRY_DSN` di `~/.secrets` dengan DSN asli. Nilai sekarang
   `sntryu_...`, itu auth token. Simpan token terpisah sebagai
   `SENTRY_AUTH_TOKEN`. OAuth MCP Sentry kedaluwarsa 15 Nov 2026 (access token
   401, refresh `invalid_grant`), jadi jalankan `opencode mcp auth sentry` dari
   terminal yang bisa membuka browser. Scope yang diminta mencakup tulis
   (`project:write team:write event:write alerts:write`); jangan setujui kalau
   hanya butuh baca. Tanpa OAuth, issue yang punya share ID masih bisa dibaca
   read-only lewat
   `https://sentry.io/api/0/organizations/personal-x1b/shared/issues/<share_id>/`.
2. Backup off-site: buat passphrase, pasang `rclone` atau endpoint HTTP PUT,
   jalankan `atcell-offsite` manual, lalu buktikan restore.
3. Isi `STORAGE_*` di environment aplikasi dan jalankan
   `restore:storage-drill` satu kali.
4. Buat DNS `coolify.atcell.my.id`. Selama belum ada, panel hanya lewat SSH
   tunnel.
5. Arahkan preview Vercel ke project Supabase terpisah, lalu cabut
   `DATABASE_URL` dan `SUPABASE_SECRET_KEY` production dari preview.
6. Pastikan Coolify/Traefik menimpa `X-Forwarded-Host` dan
   `X-Forwarded-For`, atau set `SERVER_ACTIONS_ALLOWED_ORIGINS`.
7. Laporkan jumlah replika/container Coolify dan konfigurasi
   `forwardedHeaders` untuk menutup lead rate limit N14.

## 5. Data bisnis

Angka per 24 Oktober 2026, bukan tebakan:

- Katalog berisi 25 produk aktif, 5 model per merek.
- Stok tersedia 7 unit asli dari 10 unit asli. 4 unit demo bertanda `is_demo`
  tidak dihitung.
- `v_public_inventory` memuat 7 baris dari 25 model. Menambah unit, bukan
  menambah baris katalog, adalah cara memperluas etalase.
- Oppo Reno 12 Pro 5G dan Samsung Galaxy S24 masih memakai fallback logo.

## 6. Urutan kerja yang disarankan

1. Selesaikan keputusan D1-D4 dan M.
2. Perbaiki N13 karena bug trigger bisa menggagalkan pembuatan akun.
3. Verifikasi N1 di staging/lokal, lalu N3 kalau Playwright disetujui.
4. Kerjakan N7, N8, N9, dan N14 bersama owner karena semuanya menyentuh
   deployment.
5. Jangan mengubah UI, copy, route, atau schema tanpa persetujuan owner.
