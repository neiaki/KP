# Task Tertunda At Cell

Diperbarui: 28 Oktober 2026

Dokumen ini adalah pintu masuk untuk pekerjaan yang belum selesai. Sumber
rincian tetap [`NEEDS_HUMAN.md`](NEEDS_HUMAN.md),
[`OWNER-DECISION-BRIEF.md`](OWNER-DECISION-BRIEF.md), dan
[`agents/roadmap.md`](agents/roadmap.md). Dokumen ini tidak mengubah
requirement, kode, schema, atau perilaku aplikasi.

## Aturan kerja

- Task UI/UX, fitur baru, perubahan copy, dan redesign ditunda sampai owner
  memintanya secara eksplisit.
- Jangan mengubah `components/ui/`, route, slug, atau label navigasi utama
  tanpa persetujuan.
- Jangan mengubah schema atau menjalankan migrasi tanpa persetujuan owner dan
  verifikasi di staging/lokal. Produksi tidak dipakai untuk pengujian.
- Jangan menambah dependensi baru tanpa persetujuan.
- Setiap task yang diambil harus punya sumber, bukti, dan gate verifikasi yang
  jelas.

## 1. UI/UX yang ditunda

| ID | Task | Sumber | Alasan ditunda | Langkah berikutnya |
|---|---|---|---|---|
| U1 | Banner `BackendStatus` menyebabkan CLS 0.733-0.878 saat snapshot publik gagal | `NEEDS_HUMAN.md` butir 3 | Mengubah perilaku dan posisi banner di semua halaman | Owner pilih opsi: overlay `fixed`, slot tinggi tetap, atau pindah ke widget chat |
| U2 | Footer bergeser intermiten di `/id/trade-in` (CLS 0.878-1.000 pada 2/3 run) | `NEEDS_HUMAN.md` butir 4 | Akar belum terverifikasi; perbaikan butuh trace per-frame | Rekam trace DevTools atau video Lighthouse dulu, jangan tebak CSS |
| U3 | Migrasi halaman portal lain ke `NoticeBanner`/`ModalShell` bersama | `NEEDS_HUMAN.md` butir 2 | Refactor UI sukarela; sebagian menyentuh `components/ui/` | Kerjakan satu halaman per PR setelah owner setuju |
| U4 | Grafik omzet harian/bulanan di dashboard (D1-A) | `OWNER-DECISION-BRIEF.md` D1 | Fitur baru dan perubahan UI dashboard | Owner pilih A (grafik), B (ubah PRD), atau C (tunda) |
| U5 | Laporan performa per teknisi dengan rata-rata durasi (D2-A) | `OWNER-DECISION-BRIEF.md` D2 | Fitur baru, butuh `completed_at`, migrasi, dan UI laporan | Owner pilih A, B, atau C sebelum schema disentuh |
| U6 | Foto resmi Oppo Reno 12 Pro 5G dan Samsung Galaxy S24 | `agents/roadmap.md` prioritas 6 | Aset resmi belum tersedia; jangan pakai foto model lain | Owner/staf unggah foto resmi lewat Master Produk atau Etalase & Harga |
| U7 | Copy peringatan link pembayaran di `/payment` dan `/terms` | [`PAYMENT-WARNING-COPY.md`](PAYMENT-WARNING-COPY.md) | Keputusan copy dan nada, bukan bug teknis | Owner pilih copy final; jangan ubah sebelum ada keputusan |
| U8 | Tambah unit/IMEI untuk model katalog yang belum punya stok | `agents/roadmap.md` prioritas 6 | Data bisnis; IMEI asli belum diberikan owner | Owner beri IMEI asli, lalu staf registrasi lewat inventaris |

## 2. Fitur dan perubahan perilaku yang ditunda

| ID | Task | Sumber | Blocker |
|---|---|---|---|
| F1 | Aktor audit wajib pada tulis langsung (D3) | `NEEDS_HUMAN.md` butir 11, `OWNER-DECISION-BRIEF.md` D3 | Owner pilih fallback `auth.uid()`, cabut tulis langsung, atau ubah NFR-07; butuh migrasi dan uji staging |
| F2 | Aturan integritas DB bagian A-L | `NEEDS_HUMAN.md` butir 9, [`db-integrity-proposals.md`](db-integrity-proposals.md) | Owner belum menyetujui; SQL masih di `docs/migrations-proposed/` |
| F3 | Aturan harga jual minimal sama dengan harga modal (bagian M) | `NEEDS_HUMAN.md` butir 9 | Keputusan kebijakan harga, termasuk apakah loss leader diizinkan |
| F4 | Urutan penerapan migrasi D3, D2, lalu A-L (D4) | `OWNER-DECISION-BRIEF.md` D4 | Menunggu keputusan D1-D3 dan M |
| F5 | Tampilkan biaya servis di tracking publik | `NEEDS_HUMAN.md` butir 6 | Keputusan privasi; saat ini tracking hanya menampilkan status, model, akhir IMEI, garansi, dan waktu |
| F6 | Batasi sales hanya ke harga acuan dan foto etalase | `NEEDS_HUMAN.md` butir 6 | Keputusan produk; kalau admin-only, perlu perubahan kode dan migrasi |
| F7 | Audit harga/stok dan guard kolom sales lainnya | `NEEDS_HUMAN.md` butir 9 | Belum ada keputusan; terkait migrasi A-L |

## 3. Task non-UI yang masih terbuka

| ID | Task | Status | Blocker |
|---|---|---|---|
| N1 | Verifikasi DB-level di staging/lokal | Sebagian: CI PostgreSQL polos dan RLS lulus | CI `database-tests` run `40700897417` lulus 40/40, termasuk 6 test RLS baru untuk anon, customer, sales, admin/audit, service_role, dan grant anon. Bootstrap `auth.uid()` membaca `request.jwt.claim.sub` transaction-local. Yang belum: perilaku Supabase Auth/PostgREST/Storage dan RLS di staging/lokal. 20 test DB masih skip di suite lokal tanpa `DATABASE_URL` |
| N2 | Jalankan `tests/pos-concurrent-sale.test.ts` di database sekali pakai | Selesai di CI | Run `40695117148` lulus setelah seed `products.is_demo` dan stub nota diperbaiki di `a21cecd` dan `a4a69aa`; run `40700897417` menjalankan ulang seluruh suite DB 40/40. Verifikasi di Supabase staging tetap terpisah |
| N3 | E2E Playwright tiga kali hijau | Belum bisa | Paket Playwright tidak terpasang, tidak ada PostgreSQL/Supabase lokal, dan tes lintas peran butuh backend live |
| N4 | Audit dependensi lanjutan | Sebagian selesai | `bun audit` sudah jalan; satu advisory moderate dev-only `esbuild` lewat `drizzle-kit`, belum ada perbaikan upstream |
| N5 | Update dependensi tertunda | Menunggu | Semua kandidat baru berumur kurang dari 14 hari atau major; versi di-pin exact |
| N6 | Branch protection `main` | Sebagian: conversation resolution aktif | Wajib check `verify`, `security`, `database-tests` dengan strict mode; `required_conversation_resolution=true` sejak 28 Oktober 2026. Required PR review dan `enforce_admins` ditunda; PR review tidak praktis untuk repo solo karena GitHub tidak mengizinkan self-approval |
| N7 | Backup off-site dan backup objek Storage | Menunggu owner | Butuh passphrase, `rclone`/endpoint upload, dan bukti restore; lihat [`OFFSITE-BACKUP-SETUP.md`](OFFSITE-BACKUP-SETUP.md) |
| N8 | Isolasi deployment pratinjau Vercel dari database production | Menunggu owner | Preview masih bisa membaca data production; butuh project Supabase terpisah dan pencabutan env production dari preview |
| N9 | Pastikan proxy menimpa `X-Forwarded-Host` | Perlu verifikasi ops | Risiko hanya jika Coolify/Traefik meneruskan header dari klien; lihat `NEEDS_HUMAN.md` butir 7 |
| N10 | Keputusan exclusion angka lab Lighthouse | Menunggu owner | Target lab tidak tercapai karena throttling; angka jaringan nyata sudah baik. Lihat `NEEDS_HUMAN.md` butir 4 |
| N11 | Sinkronkan branch dengan `origin/main` | Selesai | `origin/main` (`33b2f26`) sudah di-merge ke `improve/autoloop` lewat `6acf375`; tidak ada konflik dan tree branch tidak berubah karena penghapusan Dependabot sudah setara |
| N12 | Arsipkan atau koreksi `docs/3.4 Perancangan Database At Cell.docx` | Lokal, gitignored | Dokumen lama tidak ikut repo; owner putuskan arsipkan atau perbarui isinya |
| N13 | Perbaiki urutan `lower()` dan `regexp_replace` di `handle_new_user` | Ditemukan saat test RLS 28 Oktober 2026 | `supabase/migrations/0005_username_login.sql` menjalankan regexp sebelum `lower()`, sehingga huruf besar di prefix email dibuang. `customerA@...` dan `customerB@...` bisa jatuh ke username yang sama dan insert kedua gagal `profiles_username_key`. Test seed sementara memakai email lowercase; perbaikan butuh migrasi baru, persetujuan owner, dan uji staging |

## 4. Selesai pada 28 Oktober 2026

- Dependabot dimatikan: konfigurasi dihapus, security updates dimatikan, PR
  #176/#177 ditutup.
- Audit dokumen dan render diagram diselaraskan; 30 PNG/SVG ikut di-commit.
- Branch `improve/autoloop` di-push dan sinkron dengan remote.
- CI `database-tests` run `40695117148` lulus setelah dua bug fixture POS
  diperbaiki di `a21cecd` dan `a4a69aa`; ini memverifikasi lapis 2 di
  PostgreSQL polos, bukan RLS Supabase.
- CI `database-tests` run `40700897417` lulus 40/40, termasuk 6 test RLS baru
  di `tests/rls-db.test.ts`. Bootstrap CI sekarang mengisi `auth.uid()` dari
  `request.jwt.claim.sub`, sehingga policy diuji sebagai anon, customer,
  sales, admin, dan service_role. Ini tetap bukan replika Supabase penuh.
- Ditemukan bug trigger username di `0005_username_login.sql`: regexp
  dijalankan sebelum `lower()`, sehingga prefix email dengan huruf besar bisa
  kehilangan huruf dan bertabrakan. Belum diperbaiki karena butuh migrasi dan
  persetujuan owner; dicatat sebagai N13.
- Branch `improve/autoloop` disinkronkan dengan `origin/main` (`33b2f26`)
  lewat merge commit `6acf375`. Tidak ada konflik; tree branch tidak berubah
  karena perubahan Dependabot di main sudah setara.
- Branch protection `main` mengaktifkan `required_conversation_resolution`.
  Required check `verify`, `security`, `database-tests` dengan strict mode
  tetap; `enforce_admins` tetap false dan required PR review tetap ditunda.
- `bun audit` dijalankan: produksi bersih, satu advisory moderate dev-only
  pada `esbuild`.
- `.env.example` diperbaiki agar menyuruh `supabase/RUN-ALL-PENDING.sql`
  (34 migrasi), bukan hanya `0001`.
- Status roadmap dan `LOOP_LOG` disinkronkan dengan kondisi remote.

## 5. Cara memilih task berikutnya

1. Pilih task non-UI yang tidak membutuhkan keputusan produk, misalnya N1,
   N2, N9, atau N11.
2. Untuk task UI/UX dan fitur, minta keputusan owner lebih dulu; jangan
   mengubah kode hanya karena task ada di tabel ini.
3. Untuk task schema, siapkan migrasi di `docs/migrations-proposed/`, uji di
   staging, lalu baru pindahkan ke `supabase/migrations/` setelah disetujui.
4. Setelah setiap perubahan, jalankan gate yang relevan dan catat buktinya di
   `LOOP_LOG.md`.
