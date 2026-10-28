# Audit Dokumentasi At Cell: 27 Oktober 2026

Status: **selesai direview, perbaikan aman sudah diterapkan dan di-commit pada
28 Oktober 2026 tanpa push.** Dokumen ini mencatat temuan, bukti, dan sisa
keputusan owner. Jangan menganggap temuan yang masih terbuka sudah diperbaiki.

## Ruang lingkup dan metode

- Branch: `improve/autoloop`, HEAD `5c93f53`; pembanding `origin/main`
  `33b2f26` (commit penghapusan konfigurasi Dependabot).
- Dibaca: seluruh Markdown tracked di `docs/`, `README.md`, `AGENTS.md`,
  `SECURITY.md`, `.github/CODEOWNERS`, workflow `.github/workflows/`, berkas
  SQL di `supabase/`, serta dokumen lokal yang tidak tracked.
- Diagram diperiksa dari sumber `.puml` dan ringkasannya, bukan hanya render.
- Pemeriksaan read-only: `git status`, `git diff`, pembacaan kode implementasi,
  dan verifikasi branch protection lewat GitHub API. Tidak ada koneksi ke
  production DB/Storage/Auth dan tidak ada `.env*` yang diubah.
- Tiga reviewer paralel dipakai untuk area produk/agent, operasional/keamanan/
  database, dan diagram. Temuan digabung dan diverifikasi ulang terhadap kode.

## Ringkasan

| Prioritas | Jumlah temuan | Sudah diperbaiki | Masih terbuka |
|---|---:|---:|---:|
| P0 | 4 | 4 | 0 |
| P1 | 12 | 10 | 2 (satu di antaranya sebagian) |
| P2 | 14 | 14 | 0 |

Lima temuan terpenting:

1. **P0** Runbook verifikasi DB memakai `$DATABASE_URL` untuk `psql` yang
   menerapkan migrasi. Di repo ini variabel itu menunjuk pooler production.
2. **P0** Status roadmap dan `LOOP_LOG` menyatakan baseline, jumlah commit, dan
   status push yang sudah tidak benar.
3. **P1** Klaim CODEOWNERS memberi persetujuan kedua tidak didukung branch
   protection aktual: `required_pull_request_reviews` masih `null`.
4. **P1** `.env.example` menyuruh hanya menjalankan `0001`, padahal repo punya
   34 migrasi.
5. **P1** Beberapa diagram sempat menggambarkan akses anon, batch IMEI parsial,
   dan otorisasi tiket lewat RLS yang tidak sesuai kode; sumber dan render
   sudah diperbaiki 28 Oktober 2026.

## P0: keselamatan dan status rilis

| # | Temuan | Bukti | Status |
|---|---|---|---|
| P0-1 | Runbook bisa menulis migrasi ke production tanpa disadari | `docs/DB-VERIFICATION-RUNBOOK.md` memakai `psql "$DATABASE_URL"`; `docs/DEPLOYMENT-REDUNDANCY.md:204` mendefinisikan `DATABASE_URL` sebagai pooler production | **Diperbaiki**: runbook memakai `VERIFY_DATABASE_URL`, guard host, dan peringatan eksplisit |
| P0-2 | Status roadmap basi dan saling bertentangan | `docs/agents/roadmap.md` menyebut baseline `ccc7c31`, `main` bersih, dan satu bagian berjudul "belum di-commit" padahal bagian lain menyatakan sudah di-commit | **Diperbaiki**: status 27 Oktober, baseline remote `33b2f26`, cabang kerja, dan pin image yang harus diverifikasi |
| P0-3 | `LOOP_LOG` menyatakan 16/16 commit dan "tidak ada push" | `docs/LOOP_LOG.md` bagian `LOOP_SELESAI`; aktual branch 19 commit di depan `main` lokal dan 9 commit di depan `origin/improve/autoloop` | **Ditambahkan koreksi** di akhir log; entri lama dipertahankan sebagai snapshot historis |
| P0-4 | Branch kerja masih membawa konfigurasi Dependabot | `.github/dependabot.yml` masih tracked di `improve/autoloop` meskipun sudah dihapus di `origin/main`; merge bisa menghidupkan bot lagi | **Diperbaiki**: file dihapus dari branch dan entri `.github/CODEOWNERS` dibersihkan |

## P1: fakta, keamanan, dan sumber ganda

| # | Temuan | Bukti | Status |
|---|---|---|---|
| P1-1 | Penomoran query 5.2-5.11 runbook bergeser dari sumber kanonik | `docs/DB-VERIFICATION-RUNBOOK.md` vs `docs/db-integrity-proposals.md` | **Diperbaiki**: daftar 5.1-5.11 diselaraskan dan dijaga test |
| P1-2 | Runbook tidak siap untuk Supabase lokal | `supabase start` dipakai tanpa `supabase/config.toml` dan tanpa `supabase init` | **Diperbaiki**: langkah `supabase init` ditambahkan |
| P1-3 | Klaim CODEOWNERS menyesatkan | `.github/workflows/security.yml` menyatakan CODEOWNERS "meminta persetujuan kedua"; API branch protection: `required_pull_request_reviews: null`, `enforce_admins: false` | **Sebagian**: komentar dibuat kondisional; branch protection belum diaktifkan, keputusan owner |
| P1-4 | `RUN-ALL-PENDING.sql` menyatakan baru 32 bagian, padahal 34 | Header `supabase/RUN-ALL-PENDING.sql` vs `supabase/migrations-ledger.snapshot` | **Diperbaiki**: status 34, daftar 33/34 ditambahkan |
| P1-5 | Onboarding hanya menjalankan migrasi `0001` | `.env.example:16` | **Terbuka**: tidak diubah karena batas `.env*`; perlu keputusan owner |
| P1-6 | Status ledger perluasan katalog basi | `docs/PERLUASAN-KATALOG-AT-CELL.md` menyatakan lima migrasi belum dicatat; snapshot sudah memuatnya | **Diperbaiki**: catatan bertanggal, verifikasi production tetap lewat ledger |
| P1-7 | Klaim laporan per teknisi dan durasi tidak ada di kode | `docs/USE-CASE-AtCell.md` vs `src/app/(portal)/portal/reports/page.tsx` | **Diperbaiki**: klaim diselaraskan, D1/D2 ditandai belum diimplementasikan |
| P1-8 | Skenario uji POS memeriksa tren harian yang tidak ada | `docs/UJI-ALUR-STAF.md` T-2 butir 4 | **Diperbaiki**: memeriksa Total Omzet all-time di dashboard |
| P1-9 | Versi Next.js README tertinggal | `README.md:92` `16.4.1` vs `package.json` `16.4.2` | **Diperbaiki** |
| P1-10 | PRD menyebut dependensi `shadcn/ui` | `docs/PRD-AtCell.md:6,263`; repo hanya punya komponen bergaya shadcn | **Diperbaiki** menjadi "komponen bergaya shadcn/ui" |
| P1-11 | Pointer handoff di peta proyek sudah usang | `docs/agents/project-map.md` menunjuk audit 17 Oktober | **Diperbaiki**: handoff aktif 23 Oktober dan audit 20 Oktober |
| P1-12 | Klaim pembuat kode tiket tidak lengkap | `AGENTS.md` menyebut hanya `createServiceTicket`; jalur live memakai trigger `generate_ticket_code()` | **Diperbaiki** |

## P2: link, perintah, dan konsistensi

| # | Temuan | Bukti | Status |
|---|---|---|---|
| P2-1 | Tautan `../UC-AtCell.md` rusak dan tabel Markdown pecah | `docs/Diagram/README.md:7,10-12` (folder lokal, di-gitignore) | **Diperbaiki lokal**; tidak ikut repo |
| P2-2 | Handoff 17 Oktober tidak ditandai arsip | `docs/agents/review-handoff-2026-10-17.md` | **Diperbaiki**: banner snapshot historis |
| P2-3 | Item 5 `NEEDS_HUMAN` sudah selesai tetapi judulnya belum | `docs/NEEDS_HUMAN.md` bagian 5 | **Diperbaiki**: judul diberi status selesai |
| P2-4 | README Drizzle hanya menyebut tiga migrasi | `supabase/drizzle/README.md` | **Diperbaiki**: menunjuk seluruh `supabase/migrations/` dan `RUN-ALL-PENDING.sql` |
| P2-5 | Prosa jumlah migrasi deployment basi | `docs/DEPLOYMENT-REDUNDANCY.md` menyebut 30 bagian | **Diperbaiki**: 34 bagian per 27 Oktober |
| P2-6 | Panel Coolify disuruh dibuka lewat HTTPS | `docs/VPS-HARDENING.md` | **Diperbaiki**: `http://` plus peringatan SSH tunnel |
| P2-7 | Perintah instalasi rclone punya kurung tutup berlebih | `docs/OFFSITE-BACKUP-SETUP.md` | **Diperbaiki** |
| P2-8 | Installer wrapper Storage menunjuk `.new` yang tidak pernah dibuat | `docs/OFFSITE-BACKUP-SETUP.md` | **Diperbaiki**: instruksi menulis dan memvalidasi `.new` |
| P2-9 | Constraint M selalu divalidasi | `docs/DB-VERIFICATION-RUNBOOK.md` | **Diperbaiki**: cek keberadaan constraint lebih dulu |
| P2-10 | Gate runbook masih memakai npm | `docs/DB-VERIFICATION-RUNBOOK.md` | **Diperbaiki**: memakai bun |
| P2-11 | Status foto katalog bertentangan dengan roadmap | `docs/agents/katalog-5-model-per-merek.md` | **Diperbaiki**: catatan 25 Oktober dan sisa dua model |
| P2-12 | Klaim verifikasi sequence hanya sintaks | `docs/diagram-uml/sequence-diagram-atcell.md` | **Diperbaiki 28 Oktober**: banner, isi `.puml`, dan render PNG/SVG diselaraskan |
| P2-13 | Route `/portal/listing` dan `/portal/customers` belum masuk use case sales | `docs/diagram-uml/sales/usecase-sales.puml` | **Diperbaiki**: use case sales dan use case sisi portal ditambah |
| P2-14 | Trigger `sold` diklaim menolak semua perubahan | `docs/diagram-uml/bersama/state-status-unit.puml`, `er-database.puml`; kode memakai `before update of status` | **Diperbaiki**: klaim diganti `BEFORE UPDATE OF status` |

## Temuan diagram yang sudah diperbaiki

Sebelas temuan diagram dari audit awal sudah diperbaiki di sumber `.puml`
dan render PNG/SVG pada 28 Oktober 2026. Sisa keputusan owner hanya apakah
grant anon ke view publik dipulihkan; diagram saat ini mengikuti jalur
koneksi database langsung yang berjalan.

| # | Temuan | Perbaikan |
|---|---|---|
| 1 | Akses anon ke view publik sudah dicabut | `supabase/migrations/20261023111914_add_is_demo_flag.sql:34-35` mencabut SELECT dari `public, anon, authenticated` dan hanya memberi `service_role`. Diagram `component-arsitektur`, `er-database`, `sequence-pengunjung`, dan `activity-pengunjung` sekarang menyatakan view dibaca server lewat koneksi database langsung; anon tidak punya grant SELECT. |
| 2 | Batch IMEI all-or-nothing | `src/lib/actions/inventory.ts:103-125` memakai satu `insert().values(...)`; satu duplikat membatalkan seluruh batch. Diagram `sales/sequence-sales` sekarang menggambar cabang unique violation dan `sales/activity-registrasi-imei` menegaskan tidak ada keberhasilan sebagian. |
| 3 | Otorisasi tiket lewat `requireRole`, bukan RLS | `src/lib/actions/service.ts:83` mengizinkan admin, technician, dan sales; sales dibatasi pada biaya/status di baris 116-119. Diagram `teknisi/sequence-teknisi`, `teknisi/usecase-teknisi`, dan `teknisi/activity-servis-tiket` sekarang menyebut `requireRole`. |
| 4 | Sales boleh `UPDATE` produk terbatas | `20261024110000_products_sales_update.sql` memberi policy UPDATE; `20261024120000_products_sales_column_guard.sql` membatasi kolom. `admin/sequence-admin.puml` sekarang menyebut kolom yang boleh dan trigger yang menolak identitas katalog. |
| 5 | State machine unit tidak lengkap | `bersama/state-status-unit.puml` sekarang menampilkan `returned -> in_service` dan mencatat bahwa admin/sales boleh memilih status non-sold mana pun, sedangkan teknisi hanya `in_service` dan `returned`. |
| 6 | `imei` nullable untuk unit demo | `src/db/schema.ts:193-194`; diagram `bersama/er-database.puml` dan `bersama/class-domain.puml` sekarang menandainya opsional. |
| 7 | Label cabang validasi registrasi terbalik | `sales/activity-registrasi-imei.puml` sekarang memakai cabang valid/tidak valid yang benar. |
| 8 | Alur serah terima tidak konsisten | `teknisi/activity-servis-tiket.puml`, `sales/sequence-sales.puml`, dan `teknisi/sequence-teknisi.puml` sekarang memakai konfirmasi nota servis dan `completed` ke `picked_up`, bukan "catat pelunasan". |
| 9 | Perubahan peran sendiri selalu ditolak | `admin/sequence-admin.puml` sekarang menggambar penolakan perubahan peran akun sendiri dan kasus admin terakhir; `src/lib/actions/auth.ts:528` sesuai. |
| 10 | Route baru belum masuk use case sales | `/portal/listing` dan `/portal/customers` sudah ada di `sales/usecase-sales.puml` dan `bersama/usecase-sisi-portal.puml`. |
| 11 | Klaim trigger sold terlalu luas | `state-status-unit.puml` dan `er-database.puml` sekarang menyebut `BEFORE UPDATE OF status`, bukan semua perubahan dari sold. |

## Perbaikan yang sudah diterapkan

- `docs/DB-VERIFICATION-RUNBOOK.md`: variabel `VERIFY_DATABASE_URL`, guard
  host, `supabase init`, nomor 5.1-5.11, constraint M kondisional, gate bun.
- `README.md`: Next.js `16.4.2`.
- `docs/agents/project-map.md`: pointer handoff terbaru.
- `docs/agents/roadmap.md`: status 27 Oktober, koreksi "belum di-commit", sisa
  foto katalog.
- `docs/NEEDS_HUMAN.md`: item 5 ditandai selesai.
- `docs/UJI-ALUR-STAF.md`: T-2 memeriksa total omzet, bukan tren harian.
- `docs/USE-CASE-AtCell.md`: klaim laporan per teknisi diselaraskan.
- `docs/PERLUASAN-KATALOG-AT-CELL.md`: status ledger bertanggal.
- `docs/PRD-AtCell.md`: shadcn/ui menjadi komponen bergaya shadcn/ui.
- `AGENTS.md`: pembuat kode tiket per jalur.
- `supabase/drizzle/README.md`: migrasi menunjuk seluruh folder.
- `supabase/RUN-ALL-PENDING.sql`: header 34 bagian dan daftar 33/34.
- `docs/DEPLOYMENT-REDUNDANCY.md`: jumlah migrasi 34.
- `docs/VPS-HARDENING.md`: panel Coolify memakai HTTP.
- `docs/OFFSITE-BACKUP-SETUP.md`: perintah rclone dan instruksi `.new`.
- `docs/Diagram/README.md`: tautan dan tabel (lokal, gitignored).
- `docs/agents/katalog-5-model-per-merek.md`: catatan foto 25 Oktober.
- `docs/agents/review-handoff-2026-10-17.md`: banner snapshot historis.
- `docs/diagram-uml/sequence-diagram-atcell.md` dan `docs/README.md`: status
  verifikasi isi diperbarui menjadi "sudah diselaraskan" setelah sumber dan
  render PNG/SVG diperbarui 28 Oktober 2026.
- `.github/workflows/security.yml`: klaim CODEOWNERS dibuat kondisional dan
  komentar jadwal Dependabot diperbarui.
- `tests/db-verification-runbook.test.ts`: penjaga agar runbook tidak kembali
  memakai `$DATABASE_URL` dan daftar 5.x tetap lengkap.
- `.github/dependabot.yml`: dihapus dari branch kerja; entri
  `.github/dependabot.yml` di `.github/CODEOWNERS` juga dihapus.

## Masih menunggu keputusan owner

1. **Branch protection `main`.** Aktifkan required PR review, code owner review,
   dan "Do not allow bypassing" jika CODEOWNERS memang ingin ditegakkan.
2. **`.env.example:16`.** Arahkan onboarding ke `supabase/RUN-ALL-PENDING.sql`
   atau daftar lengkap migrasi. Tidak diubah karena batas `.env*`.
3. **D1/D2/D3/D4 dan bagian M.** Grafik omzet, laporan per teknisi, aktor audit
   pada tulis langsung, dan constraint harga di bawah modal masih pending.
4. **Diagram.** Putuskan apakah grant anon ke view publik dipulihkan.
   Diagram sudah diubah ke jalur koneksi database server dan render sudah
   diperbarui; keputusan ini hanya menentukan apakah grant anon perlu
   dikembalikan.
5. **Dependabot.** Setelah config dihapus, tidak ada PR pembaruan dependensi
   otomatis. `security.yml` hanya audit advisory. Putuskan apakah pembaruan
   manual diterima atau perlu Renovate/Dependabot lagi.
6. **Dokumen lokal.** `docs/3.4 Perancangan Database At Cell.docx` masih
   mengklaim sales-products dan tidak tracked; putuskan apakah akan dikoreksi,
   dihapus, atau dijadikan arsip. `LOOP_LOG.local.md` sudah diberi catatan
   bahwa `docs/LOOP_LOG.md` adalah log tracked; file lokal itu tetap scratch.
7. **Verifikasi DB.** Tidak ada `DATABASE_URL` staging; 14 test DB di-skip.
   Jalankan runbook yang sudah diperbaiki di database sekali pakai sebelum
   menyetujui migrasi integritas.

## Verifikasi

- `node --experimental-strip-types --test tests/db-verification-runbook.test.ts tests/docs-index.test.ts`
  lulus 11/11.
- `bun run test`: 873 tes, 859 pass, 14 skip DB, 0 fail.
- `bunx tsc --noEmit`: exit 0.
- `bun run lint`: exit 0, 0 warning.
- `bun run build`: exit 0 (Next.js 16.4.2, webpack).
- Jangan menganggap laporan ini bukti bahwa production sudah diuji; tidak ada
  koneksi ke production DB/Storage/Auth.
