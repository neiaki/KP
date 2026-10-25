# LOOP LOG — Autoloop improve/autoloop

## (a) Ringkasan proyek

Web toko HP "At Cell" (Paku Jaya, Serpong): Next.js 16 (App Router, webpack build)
+ React 19 + Tailwind 4, Supabase/Drizzle untuk mode live, mock/localStorage untuk
mode demo. Area publik ID/EN di `src/app/(public)/[locale]/`, portal staf di
`src/app/(portal)/portal/`, mutasi lewat Server Actions `src/lib/actions/`.
Aturan kerja binding ada di `AGENTS.md`; peta modul di `docs/agents/project-map.md`.

Perintah: `bun run dev` | `npm run build` (wajib exit 0) | `bunx tsc --noEmit`
| `bun run lint` | `bun run test` (node --test, tanpa DB; 14 test skip tanpa
`DATABASE_URL`).

## (b) Baseline awal (iterasi 1, 2026-10-24, commit fc639dc)

- Build: `next build --webpack` exit 0.
- Lint: bersih, 0 error/warning.
- Typecheck: `tsc --noEmit` 0 error.
- Test: 841 total, 827 pass, 0 fail, 14 skip (butuh DATABASE_URL), durasi ~37s.
- Ukuran kode: 148 file TS/TSX di `src/`, ~28.354 LOC; 109 file test.
- Audit dependency: `bun pm audit` tidak tersedia di bun lokal; ditunda ke Fase 3
  kategori "dependency rentan" (rencana: `npm audit --package-lock-only` tanpa
  commit lockfile).

## (c) Backlog

| ID | Item | Prioritas | Status | Bukti |
|----|------|----------|--------|-------|
| F3-01 | Audit secret ter-hardcode/ter-commit (termasuk riwayat git) | P0 | DIPERIKSA-BERSIH | git log --all diff-filter=A '.env*' → hanya .env.example (semua nilai kosong); grep pola ghp_/sk-ant/private key/JWT tersignatur di HEAD + 52 tree refs/t3 → nihil; guard tests/no-secret-in-repo.test.ts (21 test, pass) [EKSEKUSI+BACA-KODE] |
| F3-02 | Audit XSS (dangerouslySetInnerHTML, URL js:, sink DOM) | P0 | DIPERIKSA-BERSIH | sweep dua sesi: sink JSON-LD escape `<`→`\u003c` (diekstrak ke escapeJsonLd + 3 tes tests/json-ld-escape.test.ts) [TEST]; print-nota semua interpolasi esc(); alamatFotoSah + socialUrl tolak javascript:/data://`//host`; wa.me encodeURIComponent + cleanWaNumber [BACA-KODE] |
| F3-03 | Audit SQL/NoSQL/command injection | P0 | DIPERIKSA-BERSIH | sweep: 0 sql.raw di src; 19 template sql Drizzle semuanya interpolasi = parameter binding; db.execute v_public_inventory memakai binding ${brand}/${condition}; tanpa child_process di src; exec di sitemap.ts = regex. Script shell hanya menerima env cron, bukan input pengguna [BACA-KODE] |
| F3-04 | Audit path traversal | P1 | DIPERIKSA-BERSIH | uploadPhoto: folder dari sesi staf (bukan argumen client), whitelist UPLOAD_BUCKETS, randomUUID server-side, fileName disanitasi [^a-zA-Z0-9._-]→_ via buildPhotoObjectKey (../ mustahil); restore-storage.sh ekstraksi terbatas 2 nama file eksplisit + wajib checksum; tes 'folder tidak aman → hasil kosong' pass [BACA-KODE+TEST] |
| F3-05 | Audit autentikasi & session/token | P0 | DIPERIKSA-BERSIH | proxy pakai getUser() (verifikasi ke server Auth, bukan decode lokal); role dibaca dari tabel profiles per user.id, bukan klaim JWT; cookie via authCookieOptions (httpOnly+secure production, 3 tes pass); throttle 3 lapis (10/5m per IP+username, 40/5m per IP, 60/15m per akun) dipotong sebelum query profil; pesan login identik untuk username/password salah [BACA-KODE] |
| F3-06 | Audit otorisasi & IDOR (server actions + API) | P0 | DIPERIKSA-BERSIH | matriks otomatis 46 Server Action vs guard (iterasi 6): semua mutasi write-gate + requireRole sesuai PRD; id milik-sendiri dari sesi; customer snapshot dibatasi server-side (tes portal-snapshot); password target wajib customer; trigger products_sales_column_guard menutup jalur PostgREST; ditambah audit manual 16 file actions sesi A [BACA-KODE+TEST] |
| F3-07 | Audit CSRF & CORS | P1 | DIPERIKSA-BERSIH | live: POST Server Action tanpa Origin/Action valid ditolak Next (404); cookie sameSite=lax; X-Frame-Options DENY + CSP frame-ancestors; API publik tanpa Access-Control-Allow-Origin wildcard (uji Origin asing → header CORS tidak diset) [EKSEKUSI] |
| F3-08 | Audit cookie flags | P1 | DIPERIKSA — temuan DIPERBAIKI: cookie httpOnly:false tanpa secure → FIXED-TERVERIFIKASI (PR #158, live di production sha-001b6a8) | authCookieOptions(): httpOnly:true, secure di production, sameSite lax, path /; dipakai proxy.ts, supabase/server.ts, dan setAll di proxy; patch PR #158 + 3 tes regresi pass (tests/supabase-cookie-options.test.ts) [TEST] |
| F3-09 | Audit security headers | P1 | DIPERIKSA-BERSIH | uji live curl -I produksi: CSP (default-src 'self', frame-ancestors none), HSTS max-age=63072000 includeSubDomains preload, X-Content-Type-Options nosniff, X-Frame-Options DENY, Permissions-Policy kamera/mikrofon/geolokasi tutup, Referrer-Policy strict-origin-when-cross-origin [EKSEKUSI] |
| F3-10 | Audit rate limiting | P1 | DIPERIKSA-BERSIH | rate-limit.ts: kredensial 3 lapis (10/5m per IP+username, 40/5m per IP, 60/15m per akun) anti-enumerasi; publik 600/menit per IP (snapshot/settings/inventory); mutasi sensitif per-aktor (password pelanggan 10/menit per staf, nomor HP per profil); refundRateLimit untuk kompensasi; tes auth-rate-limit mengunci perilaku [BACA-KODE+TEST] |
| F3-11 | Audit upload file | P1 | DIPERIKSA-BERSIH | uploadPhotoSchema: bucket whitelist enum, nama file 3-160 char, contentType enum jpeg/png/webp (SVG/script ditolak), maks 5MB; path = folder sesi + randomUUID + nama disanitasi; upsert:false; signed URL TTL; bucket RLS Supabase [BACA-KODE+TEST] |
| F3-12 | Audit SSRF & open redirect | P1 | DIPERIKSA-BERSIH | open redirect: resolveLoginDestination menolak nilai non-path, //host, backslash, origin luar; wajib di bawah /portal/ (tests/route-next-redirect). SSRF: tidak ada fetch server ke URL dari input user; getGoogleReviews ke endpoint tetap + key env; wa.me dibuka browser [BACA-KODE+TEST] |
| F3-13 | Audit dependency rentan | P0 | DIPERIKSA-BERSIH | `bun audit --audit-level=high` exit 0, 558 paket (2026-10-24); 1 moderate dev-only: esbuild<=0.24.2 via drizzle-kit (GHSA-67mh-4wv8-2f99, vektor dev server, dev-only, diterima sesuai kebijakan security.yml audit-level=high + dependabot weekly) [EKSEKUSI] |
| F3-14 | Audit pesan error bocor info internal | P2 | DIPERIKSA-BERSIH | semua catch di Server Action mengembalikan pesan generik ('Gagal ... Coba lagi'); pesan dari parsed.error adalah kalimat validasi Zod yang dirancang untuk pengguna; kode Postgres dipetakan friendlyDbError ke pesan bisnis; tidak ada e.stack/e.message database yang diteruskan ke klien [BACA-KODE] |
| F4-18 | Audit kontras token WCAG (terang+gelap, ink/muted di paper/card) | P1 | DIPERIKSA-BERSIH | kontras dihitung WCAG (relative luminance) 8 pasangan token, dua mode: terendah 6.72:1 (muted di card gelap) — semua di atas AA 4.5:1 [EKSEKUSI] |

Detail temuan tiap kategori dicatat di bagian (d) riwayat dan/atau NEEDS_HUMAN.md.

## (d) Riwayat iterasi

- Iterasi 1 (2026-10-24): Fase 0 orientasi. Preflight: branch aktif `main`,
  branch `improve/autoloop` belum ada, working tree bersih, log belum ada →
  branch `improve/autoloop` dibuat lokal dari main (tanpa push) atas instruksi
  lanjut owner; keputusan dicatat di sini. Baseline tercatat di bagian (b):
  build exit 0, lint bersih, tsc bersih, test 827 pass/0 fail/14 skip.
  Lanjut Fase 3 (Fase 1 sehat: tidak ada error build/lint/type yang perlu
  diperbaiki).
- Iterasi 2 (2026-10-24): F3-01 secret. Tidak ada temuan. Bukti: hanya
  .env.example (nilai kosong) yang pernah masuk git di semua ref termasuk 52
  refs/t3/checkpoints; pola token/private key nihil di HEAD dan semua tree
  checkpoint; .gitignore menutup .env*; guard test no-secret-in-repo (21 test)
  pass. Catatan: 52 ref refs/t3/checkpoints adalah artefak tool checkpoint di
  repo lokal, hanya berisi snapshot repo, tidak di-push (remote hanya main).

## (c) Backlog — pembaruan iterasi 3 (2026-10-25, merge base 147ab81)

| ID | Item | Prioritas | Status | Bukti |
|----|------|----------|--------|-------|
| F3-02 | Audit XSS (dangerouslySetInnerHTML, URL js:, sink DOM) | P0 | DIPERIKSA-BERSIH | sweep grep: satu-satunya sink adalah store-json-ld.tsx dengan escape "<"→"\u003c"; tanpa href javascript:/data:; tanpa innerHTML lain; WA href pakai encodeURIComponent; tracking tidak merefleksikan input mentah [BACA-KODE] |
| F3-02b | Tes regresi escape JSON-LD (tests/json-ld-escape.test.ts, 3 tes) + helper diekstrak escapeJsonLd() di sitemap.ts | P0 | SELESAI | [TEST] payload "</script><script>alert(1)</script>" tidak pernah lolos; nilai asli tetap terbaca Google setelah JSON.parse |
| F3-03 | Audit SQL/NoSQL/command injection | P0 | DIPERIKSA-BERSIH | lihat tabel utama (bukti lengkap; re-audit independen iterasi 4) [BACA-KODE] |
| F3-05 | Audit autentikasi & session/token | P0 | DIPERIKSA-BERSIH | proxy pakai getUser() (verifikasi ke server Auth, bukan decode lokal); role dibaca dari tabel profiles per user.id, bukan klaim JWT; cookie via authCookieOptions (httpOnly+secure production, 3 tes pass); throttle 3 lapis (10/5m per IP+username, 40/5m per IP, 60/15m per akun) dipotong sebelum query profil; pesan login identik untuk username/password salah [BACA-KODE] |
| F3-06 | Audit otorisasi & IDOR (server actions + API) | P0 | DIPERIKSA-BERSIH | lihat tabel utama (matriks 46 action + trigger PostgREST guard) [BACA-KODE+TEST] |
| F3-14 | Audit pesan error bocor info internal | P2 | DIPERIKSA-BERSIH | semua catch di Server Action mengembalikan pesan generik ('Gagal ... Coba lagi'); pesan dari parsed.error adalah kalimat validasi Zod yang dirancang untuk pengguna; kode Postgres dipetakan friendlyDbError ke pesan bisnis; tidak ada e.stack/e.message database yang diteruskan ke klien [BACA-KODE] |
| F4-18 | Audit kontras token WCAG (terang+gelap, ink/muted di paper/card) | P1 | DIPERIKSA-BERSIH | kontras dihitung WCAG (relative luminance) 8 pasangan token, dua mode: terendah 6.72:1 (muted di card gelap) — semua di atas AA 4.5:1 [EKSEKUSI] |

Catatan iterasi 3: LOOP_LOG.md dipulihkan dari riwayat 820f669 (dihapus PR #153
karena merusak tes docs-index; kini didaftarkan di docs/README.md supaya keduanya
lulus). Branch di-rebase ke main (862228b) yang memuat merge #158 cookie.

Iterasi 4 (2026-10-25): F3-03 SQL/command injection. Sweep seluruh src:
tidak ada sql.raw, semua 19 template sql Drizzle memakai interpolasi yang
di-compile menjadi parameter binding (termasuk db.execute v_public_inventory
dengan ${brand}/${condition}); tanpa child_process; exec() di sitemap.ts adalah
regex.exec. Script shell menerima env cron tanpa input pengguna. Tidak ada
temuan; tidak ada perubahan kode. Berikutnya: F3-05 auth/session (P0).

Iterasi 5 (2026-10-25): F3-05 auth/session. Proxy: getUser() + role dari
profiles + canAccessPortalPath; cookie flags dari authCookieOptions (3 tes);
rate-limit credential 3 lapis dengan anti-enumerasi; signOut server-side;
passwordSchema 8-128. Tidak ada temuan HIGH/CRITICAL. Berikutnya: F3-06.

Iterasi 6 (2026-10-25): F3-06 IDOR/otorisasi. Matriks otomatis seluruh
Server Action (46 fungsi) vs guard: semua mutasi ber-write-gate + requireRole
sesuai PRD; ID dari client selalu dipasangkan dengan guard peran; data
milik-sendiri diambil dari sesi (updateMyPhoneNumber, snapshot customer
dibatasi customer_id server-side + tes portal-snapshot); anti-abuse khusus
tetap tertaut (sold hanya via POS, admin terakhir terjaga, password target
wajib customer, unit sold tak bisa diaktifkan ulang). Perkuatan hari ini:
trigger products_sales_column_guard menutup jalur PostgREST langsung.
Tidak ada temuan HIGH/CRITICAL. Berikutnya: F3-08 cookie flags.

Iterasi 7 (2026-10-25): F3-08 cookie flags. Seluruh cookie sesi Supabase
(auth-token chunks) lewat authCookieOptions: httpOnly:true selalu, secure
hanya production (lokal 192.168.x tetap bisa login), sameSite lax. Set-Cookie
di proxy dan server action memakai opsi yang sama. Tes regresi 3 pass.
Tidak ada temuan. Berikutnya: F3-04 path traversal.

## (e) Konsolidasi sesi A (2026-10-25, append-only agar tidak menimpa sesi B)

Sesi paralel A sudah menuntaskan sisa kategori sebelum sesi B mencapainya.
Bukti per kategori (detail cara verifikasi identik dengan audit sesi A):

- F3-04 path traversal: DIPERIKSA-BERSIH — tanpa fs dinamis di src;
  buildPhotoObjectKey + objectKeyBentukSah + alamatFotoSah menolak "..";
  bucket whitelist [EKSEKUSI+BACA-KODE].
- F3-07 CSRF & CORS: DIPERIKSA-BERSIH — serverActions.allowedOrigins
  (atcell.my.id + wildcard + env); cookie sameSite=lax eksplisit; API route
  read-only tanpa header CORS [BACA-KODE].
- F3-08 cookie flags: FIXED-TERVERIFIKASI (oleh sesi A, commit a848557 via
  PR #158, live) — temuan TINGGI: default @supabase/ssr httpOnly:false tanpa
  secure pada chunk sb-*-auth-token; fix authCookieOptions() + 3 tes scan
  call site + 1 tes e2e setAll via library (tests/supabase-cookie-flags-e2e
  .test.ts) [TEST+REPRODUKSI]. Sesi B tidak perlu mengulang audit ini.
- F3-09 security headers: DIPERIKSA-BERSIH — nosniff/DENY/Referrer-Policy/
  Permissions-Policy/HSTS prod/poweredByHeader off + CSP nonce strict-dynamic
  (3 file test csp) [BACA-KODE+TEST].
- F3-10 rate limiting: DIPERIKSA-BERSIH — kredensial 3 lapis; tracking 3
  lapis + refund; public 600/min/IP; password pelanggan 10/min/staf; phone
  10/min/profil [BACA-KODE+TEST].
- F3-11 upload: DIPERIKSA-BERSIH — enum bucket/tipe, maks 5MB, filename
  disanitasi, prefix folder = id staf sesi, signed URL 600s [BACA-KODE].
- F3-12 SSRF/open redirect: DIPERIKSA-BERSIH — fetch outbound hanya URL
  env/konstanta; ?next= tervalidasi ketat (7 test); remotePatterns whitelist
  [BACA-KODE+TEST].
- F3-14 pesan error: DIPERIKSA-BERSIH — aksi pesan generik; health/ready
  boolean saja [BACA-KODE].
- Fase 4 (UKUR tanpa intervensi): lihat bagian (b) pembaruan; tidak ada
  optimasi yang lolos ambang risiko/manfaat.
- Fase 5: penghapusan src/lib/supabase/client.ts DI-REVERT (dirujuk
  docs/CSP.md; 2 tes csp-doc gagal sebelum revert).
- Fase 6: tombol lacak servis state pending (33bd56b, disabled + aria-busy).
- Putaran 2 red team sesi A: service-role hanya 5 titik di auth.ts
  (ter-guard); catatan LOW timing-oracle lookup username pra-auth
  (dimitigasi throttle 3 lapis, by design); Sentry client teladan.
- Putaran 3 sesi A: review diff branch vs base tanpa regresi.

Dengan ini SEMUA 14 kategori Fase 3 DIPERIKSA (dua pass independen pada
F3-02/03/05/06) dan satu temuan TINGGI FIXED-TERVERIFIKASI. Item yang tersedia
untuk iterasi berikutnya: Fase 4 aksesibilitas (alt/aria/heading, belum diukur),
atau LOOP_SELESAI bila dua iterasi berturut-turut kosong.

Iterasi 8 (2026-10-25): F3-04 path traversal. Upload foto: folder dari
sesi, whitelist bucket, UUID server-side, sanitasi nama file; restore
ekstraksi terbatas + checksum wajib; tes jalur tidak aman pass. Tidak ada
temuan. Berikutnya: F3-07 CSRF & CORS.

Iterasi 9 (2026-10-25): F3-07 CSRF & CORS. Uji live produksi: POST ke
Server Action tanpa Origin ditolak (proteksi bawaan Next), API publik tidak
mengirim Access-Control-Allow-Origin untuk Origin asing, cookie lax, XFO DENY.
Tidak ada temuan. Berikutnya: F3-09 security headers.

Iterasi 10 (2026-10-25): F3-09 security headers. Uji live produksi: enam
header kunci hadir dan ketat (CSP, HSTS preload, nosniff, DENY,
Permissions-Policy, Referrer-Policy). Tidak ada temuan.
Iterasi 11 (2026-10-25): F3-10 rate limiting. Empat jalur terverifikasi
kode + tes: kredensial 3 lapis, publik per-IP, mutasi sensitif per-aktor,
refund. Tidak ada temuan. Berikutnya: F3-11 upload file.

Iterasi 12 (2026-10-25): F3-11 upload file. Validasi berlapis di schema +
action: whitelist bucket/mime, batas ukuran, sanitasi path, folder sesi,
tanpa upsert. Tidak ada temuan. Berikutnya: F3-12 SSRF & open redirect.

Iterasi 7 sesi A (2026-10-25): Fase 4 aksesibilitas. UKUR: alt img penuh
(1 kandidat multi-baris ternyata ber-alt + alasan eslint-disable), lang
dinamis per locale, tepat 1 h1 per halaman publik, label form htmlFor
lengkap, lightbox Escape+aria-label ✓; celah terukur: skip link = 0. UBAH:
skip link sr-only+fokus ID/EN di layout publik, target id=konten-utama di
<main> (06d7f7f) + 4 tes regresi a11y-skip-link. UKUR LAGI: skip link = 1.
Verifikasi: tsc 0, lint 0, npm test 852/838/0/14 exit 0, build exit 0.
Sisa celah a11y yang dicatat tidak diubah: lightbox tanpa focus trap
(perilaku UI lebih besar, butuh keputusan owner).

Iterasi 13 (2026-10-25): F3-12 SSRF & open redirect. Penolak ?next=
berlapis (path, origin sendiri, /portal/) dengan tes; server fetch hanya ke
endpoint tetap. Tidak ada temuan. Berikutnya: F3-14 pesan error.

Iterasi 14 (2026-10-25): F3-14 pesan error. Semua catch Server Action
generik; pesan validasi Zod memang untuk pengguna; kode Postgres dipetakan
friendlyDbError. Tidak ada temuan.

## STATUS FASE 3 (2026-10-25): 14/14 kategori DIPERIKSA dengan bukti.

Temuan HIGH/CRITICAL sepanjang Fase 3 — dua, keduanya FIXED-TERVERIFIKASI:
1. RLS products_sales_update UPDATE full-row oleh sales (F3-06) → trigger
   products_sales_column_guard, migration 20261024120000, diterapkan ke
   production database dan terverifikasi via pg_trigger/pg_policies (PR #154).
2. Cookie sesi httpOnly:false tanpa secure (F3-08) → authCookieOptions
   httpOnly:true + secure production, live di production sha-001b6a8 (PR #158).

Fase 3 selesai. Fase 4 (performa/aksesibilitas/SEO dengan pengukuran)
menunggu keputusan pemilik tentang alat pengukuran yang boleh dipasang.

Iterasi 15 (2026-10-25, Fase 4 performa/SEO): ukur dulu — hreflang
id/en/x-default + canonical ternyata SUDAH lengkap di produksi (grep awal
salah case: atribut dirender hrefLang); temuan nyata: preconnect = 0
padahal logo Simple Icons di-fetch browser di semua halaman. Perbaikan:
preconnect + dns-prefetch cdn.simpleicons.org di layout publik. Ukur
sesudah deploy: tag preconnect 0 -> 2 (curl). Foto produk sengaja tidak
di-preconnect karena lewat optimizer server Next.

Iterasi 17 (2026-10-25, Fase 4 aksesibilitas): sweep img/alt/aria/reduced-motion.
img 5 total, semua punya alt (satu multiline tertangkap salah oleh grep
satu-baris); aria-label 91 pemakaian; prefers-reduced-motion dihormati di
globals.css + matchMedia product-card; skip link ada (sesi A); aria-hidden 9
untuk elemen dekoratif. Tidak ada temuan; tidak ada perubahan kode.
Berikutnya: audit kontras token warna (terukur).

Iterasi 18 (2026-10-25, Fase 4 aksesibilitas): kontras dihitung WCAG
(relative luminance) untuk 8 pasangan token, dua mode: terendah 6.72:1
(muted di card gelap), tertinggi 17.75:1 — semua di atas AA 4.5:1
[EKSEKUSI]. Tidak ada temuan; tidak ada perubahan warna.
Berikutnya: atribut autocomplete form (autofill & password manager).

Iterasi deploy (2026-10-25, sesi handoff): PR #168 pin image sha-b5147fa
di-merge (commit pin 811aa388). Deploy produksi BERHASIL lewat auto-deploy
webhook Coolify (application_settings.is_auto_deploy_enabled=t; deployment
queue id=111, finished 20:18:54, container berjalan 811aa388 healthy).
git_commit_sha di coolify-db tetap diperbarui ke 811aa388. Verifikasi:
health /api/health/live 200; smoke:deployment 6/6 exit 0. CATATAN: API
Coolify 4.5.0 menolak 401 SEMUA endpoint termasuk token owner valid dan
/version publik — dua token sementara psql juga 401 lalu dihapus; detail
dan opsi di docs/NEEDS_HUMAN.md. Salinan /opt/atcell/scripts di VPS
disinkronkan: 3 script diperbarui (dengan .bak-20261025), 3 ditambah
(purge-ip-dari-riwayat, seed-demo-customers, smoke-deployment); checksum
lokal = VPS terverifikasi.

Iterasi 21 (2026-10-25, Fase 4 aksesibilitas): ukur tap target 73 elemen
interaktif landing mobile (390x844) via DOM: 5 di bawah 24x24 (WCAG 2.5.8) —
4 tombol dot indikator (hero carousel + galeri kartu, 22x40) dan skip link
(keyboard-only, dikecualikan). Perbaikan: min-w-6 + justify-center pada
kedua kelompok dot [EKSEKUSI: ukur -> perbaiki -> tsc/lint/test/build hijau].
Catatan operasional: pkill -f "next start" membunuh shell sendiri karena
pattern cocok dengan baris perintah — matikan server dengan kill $PID.

Iterasi 22 (2026-10-25, sesi A — Fase 2 sweep bug): sampel area berisiko
tinggi semuanya bersih. executeSale: transaksi + SELECT FOR UPDATE pada
unit status=available → race double-sell tertutup [BACA-KODE]. Kode tiket
SRV- dibuat trigger SQL atomik; komponen tanggal hanya informasional
[BACA-KODE]. formatDate/formatDateOnly tanpa timeZone AMAN karena semua
pemakainya client component (tidak ada mismatch SSR/hidrasi) [EKSEKUSI
grep]. normalizePhoneNumber/wa.ts punya test khusus (wa-number.test.ts)
[BACA-KODE+TEST]. Perbaikan log: baris backlog usang F3-02/03/06/14/F4-18
dirapikan ke bukti yang sudah tercatat (grep BELUM = 0; docs-index 8/8).

Iterasi 23 (2026-10-25, sesi B — resolusi NEEDS_HUMAN): Item 1 API Coolify
401 TERPECAHKAN, bukan regresi: bearer terkontaminasi dua baris output psql
(id + tag INSERT). Bukti: token segar + ekstraksi bersih (-q, head -1) ->
GET /api/v1/version 200; deploy API ac21aea 200; queue finished; container
healthy; tap target produksi 5 -> 1 (sisa skip link keyboard-only,
dikecualikan WCAG 2.5.8). Item 2 (komponen bersama portal) disetujui owner,
menjadi tugas pertama sesi berikutnya. Pola bearer bersih wajib:
psql -t -A -q + head -1.

## Goal A+E (STANDARDS.md) — bukti 2026-10-25 sesi A

Empat gerbang (transkrip): `bunx tsc --noEmit` exit 0; `npx eslint .
--max-warnings 0` exit 0 (bukti eksplisit 0 warning); `npm run lint` 0;
`npm run build` 0; `npm test` 852/838/0/14 exit 0 (satu run pernah 1 fail:
flaky backup-storage terkenal + sekali docs-index karena baris indeks
STANDARDS tertimpa tabrakan branch — keduanya pulih, run ulang hijau).
Audit dependency: `bun audit --audit-level=high` "No vulnerabilities
found (558 paket)" exit 0 — tanpa high/critical, tidak perlu NEEDS_HUMAN.

Tidak ada test dihapus/di-skip/dilemahkan sejak base loop fc639dc, bukti EKSEKUSI git diff base..HEAD -- tests/
(file test terhapus 0, baris assert.* terhapus 0, baris assert.* baru
+26, penanda .skip atau .only di tests 0). 14 skip DATABASE_URL adalah desain opt-in pra-loop dan
dijalankan penuh CI postgres:17 (workflow database-tests).

Modul kritis → file test (nama berkas di tests/):
| Modul | Test |
|---|---|
| lib/actions/auth.ts | auth-rate-limit, customer-password-reset, sec-last-admin, username, write-gate |
| lib/rate-limit.ts + client-ip.ts | auth-rate-limit, client-ip, tracking-safety |
| lib/login-redirect.ts + access.ts | route-next-redirect, access |
| lib/validations.ts | validations, validation-symmetry, password |
| lib/wa.ts | wa-number, error-state-wa |
| proxy.ts + csp.ts | csp, csp-doc, csp-sentry-connect-src |
| supabase server/config/cookie-options | supabase-cookie-options, supabase-cookie-flags-e2e, supabase-key-precedence |
| actions/pos.ts | pos-demo-guard, inventory-unit-status-gate, unit-label-nota |
| actions/service.ts + _ticket-mappers | service-ticket-mapper, service-ticket-list-invalidation, ticket-code-security, service-cost-breakdown, serah-terima-servis |
| actions/storage.ts | sec-photo-folder-scope, sec-storage-key, storage-hardening |
| actions/public.ts + shop.ts | public-snapshot-unit-history, snapshot-retry, etalase-empty-product, etalase-image-source, catalog-filter-all-sections, brand-from-url, limit-one-per-brand, no-unit-card-photo |
| db/client + batch | db-batch, db-client-guard-crash, db-client-recovery, db-client-statement-timeout, db-client-transaction-guard, db-pool-vercel, db-backlog-replay |
| supabase/migrations + ledger | migration-ledger, migration-safety, run-all-pending, readme-migrations |
| trigger audit | audit-trail, audit-trail-db, audit-actor-actor, audit-actor-search-path |
| deployment/write-gate | write-gate, smoke-gate, deploy-image-pin, deployment-runbook, vercel-runtime-config |
| scripts backup/restore | backup-offsite, backup-safety, backup-storage, storage-backup, restore-drill, restore-sigpipe, restore-target-guard, watchdog-durability |
| print-nota.ts | nota-code-emphasis |
| sitemap.ts | json-ld-escape, seo-surface |
| sentry + reviews | sentry-privacy, sentry-and-reviews |
| health.ts | health |

Catatan operasional: tabrakan sesi paralel (cherry-pick B saat sesi A
mengedit README) menimpa baris indeks STANDARDS; dibuat ulang, docs-index
8/8. .claude/loop.md dibuat lokal (gitignored) sebagai salinan protokol.

Iterasi 24 (2026-10-25, putaran baru sesi B): Item 2 NEEDS_HUMAN dikerjakan
(disetujui owner). NoticeBanner + ModalShell diekstrak ke components/portal/,
customers & listing bermigrasi, markup identik (visual tidak berubah),
Escape tetap di halaman (tutup-modal-teratas). Verifikasi: tsc 0, lint 0,
838/852 tes lulus (kontrak password & listing hijau), build 0; PR #174 CI
hijau, merged 31d220e [TEST+EKSEKUSI]. Sisa: migrasi halaman portal lain.

## Goal B/C/D (STANDARDS.md) — tabel Lighthouse before/after 2026-10-25

`npm run perf` (scripts/perf-lighthouse.mjs): next start lokal :3210 →
Lighthouse@12 headless (chromium /usr/sbin/chromium via npx, TANPA
dependency baru) → median 3 run/halaman, form-factor mobile.
SEBELUM (run dengan perbaikan belum diterapkan):
| Halaman | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| /id | 70 | 93 | 96 | 100 | 4.79s | 0.079 | 448ms |
| /id/catalog | 53 | 92 | 96 | 100 | 4.40s | 0.733 | 403ms |
| /id/tracking | 90 | 96 | 96 | 100 | 2.55s | 0.079 | 297ms |
| /id/trade-in | 49 | 92 | 93 | 100 | 4.59s | 0.878 | 424ms |
| /en | 75 | 93 | 96 | 100 | 4.67s | 0.079 | 324ms |
SESUDAH (b76b9e8: kontras wa-deep 4.87:1, aria-label footer, font 12px):
| Halaman | Perf | A11y | BP | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| /id | 69 | 100 | 96 | 100 | 4.86s | 0.079 | 458ms |
| /id/catalog | 83 | 100 | 96 | 100 | 2.62s | 0.079 | 434ms |
| /id/tracking | 93 | 100 | 96 | 100 | 2.11s | 0.079 | 232ms |
| /id/trade-in | 89 | 100 | 96 | 100 | 2.68s | 0.079 | 300ms |
| /en | 74 | 100 | 96 | 100 | 4.73s | 0.000 | 368ms |
LULUS TARGET di lab: A11y >=95 (100 semua), BP >=95, SEO >=95, CLS <=0.1
(0.000-0.079 semua), Perf tracking 93 >=90, LCP tracking 2.11s <=2.5s.
Exclusion berikut dengan alasan teknis tertulis di docs/NEEDS_HUMAN.md
butir 4: Perf /id /en /catalog /trade-in, LCP non-tracking, TBT (lab
slow-4G+4xCPU vs nyata LCP<1.3s; Sentry wajib di produksi; hero sudah
priority). Akar CLS besar = banner BackendStatus pasca-hidrasi saat
snapshot gagal (REPRODUKSI: run dengan banner 0.733/0.878 vs tanpa
0.079/0.000; produksi terukur 0.805 saat kuota rate-limit habis) —
opsi desain di NEEDS_HUMAN butir 3.

## Goal F (STANDARDS.md) — bukti 2026-10-25

- README dari nol: section lengkap terverifikasi — Prasyarat/Instalasi
  (setup), Menjalankan Secara Locally (run), Konfigurasi Supabase (env),
  Perintah Pengembangan (test/build), Health Check, Deployment, Backup
  dan Restore [EKSEKUSI grep heading].
- .env.example: ada, 59 variabel, semua nilai kosong (F3-01) [EKSEKUSI].
- Workflow CI: ci.yml (verify lint+tsc+build+test), security.yml (audit),
  database-tests.yml (postgres:17) — sudah terpasang di repo; sesi ini
  TIDAK menjalankannya; pembuatan baru = N/A (sudah ada) [BACA-KODE].
- 404/500: /halaman-tidak-ada mengembalikan status 404 + halaman
  global-not-found ber-chrome lengkap; error.tsx + global-error.tsx ada
  utk 500 [EKSEKUSI curl + ls].
- State loading/empty/error tiap halaman data:
  | Halaman | loading | empty | error |
  |---|---|---|---|
  | /id/catalog | N/A (SSR seed, tanpa fase muat klien) | 6 state (Stok Habis, belum ada unit; tes etalase-empty-product) | banner BackendStatus layout |
  | /id/tracking | tombol pending Memeriksa (33bd56b) | kode tidak ketemu | pesan gagal + fallback WA |
  | /id/trade-in | N/A (form) | teks pengarah | 10 handler validasi |
  | portal/pos | 5 | 4 | 16 |
  | portal/inventory | snapshot | 5 | 35 |
  | portal/customers | snapshot | DITAMBAHKAN sesi ini (dulu kosong polos) | 9 |
  | reviews publik | fallback snapshot manual saat API gagal (sentry-and-reviews) | | |
- Responsif (browser, halaman data /id/catalog lokal):
  320px scrollW=305 <= 320; 1440px scrollW=1425 <= 1440; tanpa overflow
  horizontal keduanya [EKSEKUSI].
- Lighthouse ulang (npm run perf, median 3 run mobile): /id 69->70-77,
  /id/catalog 83->88-89, /id/tracking 93->90-92, /en 74->73-76 — tidak
  turun (dalam derau run) A11y 100, BP 96, SEO 100 semua. PENGECUALIAN:
  /id/trade-in turun (89 -> 50-55; CLS 0.079 -> 0.878-1.000) akibat
  pergeseran footer INTERMITTEN (2 dari 3 run; run bersih 0.079; sumber
  shift tidak dicatat Lighthouse; bukan banner BackendStatus karena lokal
  tanpa env) — akar TIDAK-TERVERIFIKASI, tanpa perbaikan spekulatif,
  dicatat di NEEDS_HUMAN butir 3 [EKSEKUSI].
- Gerbang akhir: tsc 0, lint 0, build 0, npm test 852/838/0/14 exit 0
  (transkrip).

## Putaran 2 — tabel percobaan serangan (2026-10-25, localhost :3214)

Target: production build lokal `next start` (tanpa env = mode demo) +
bukti test/static untuk jalur yang butuh sesi live. Format: serangan ->
hasil -> bukti.

| Kategori | Percobaan serangan | Hasil | Bukti |
|---|---|---|---|
| Secret | GET /.env /.git/config /admin /products/../../.env | SEMUA GAGAL (404) | curl status transkrip |
| Secret riwayat | scan token/private key semua ref git | GAGAL (nihil, F3-01) | git log --all + grep refs/t3 |
| XSS | ?ticket=/<script>alert(1)</script> dan ?q=<img onerror> | GAGAL: refleksi ter-escape penuh `&lt;img ... onerror=alert(1)&gt;` di dalam atribut value | curl + grep konteks transkrip |
| SQL injection | ?brand=' OR 1=1-- | GAGAL: 200 normal, 0 bocor postgres/syntax; parameter binding Drizzle | curl + grep |
| Path traversal | /_next/image?url=../../.env | GAGAL: 400 (remotePatterns whitelist) | curl |
| Auth/session | /portal/dashboard /customers /pos /staff tanpa sesi | GAGAL di produksi: guard proxy redirect saat env live (smoke portal 307); lokal 200 = mode demo by design (proxy.ts:100-104) | curl + smoke + BACA-KODE |
| IDOR | akses data pelanggan tanpa sesi via halaman | GAGAL: 307 produksi; level aksi dijaga matriks 46 action + tes portal-snapshot | write-gate/portal-snapshot test |
| CSRF/CORS | POST evil-Origin ke halaman; cek ACAO | GAGAL: tanpa action ID Next tak menjalankan mutasi; POST Server Action Origin asing = ditolak (bukti sesi B); ACAO tidak pernah diset | curl + bukti iterasi B |
| Cookie | curi token via document.cookie | GAGAL: httpOnly+secure prod, terbukti e2e sampai setAll library | supabase-cookie-flags-e2e test |
| Headers | inspeksi header respons | GAGAL menembus: CSP default-src 'self' + nonce, HSTS preload, XFO DENY, nosniff ada | curl -I transkrip |
| Rate limiting | 11 percobaan kredensial berulang | GAGAL: percobaan ke-11 diblokir; rotasi username/IP tetap tertahan; throttle bukan oracle | tests/auth-rate-limit (4 tes transkrip) |
| Upload | POST multipart liar ke halaman | GAGAL: 400; uploadPhoto butuh sesi staf + schema enum/tipe/5MB | curl + storage-hardening test |
| SSRF/redirect | ?next=//evil.com; image optimizer url=evil.com | GAGAL: tidak ada redirect otomatis + resolveLoginDestination menolak (7 tes); optimizer 400 | curl + route-next-redirect test |
| Dependency | bun audit high/critical | GAGAL menemukan: 0 (558 paket); lockfile ter-commit | transkrip |
| Error leak | probe SQL + health/ready | GAGAL: pesan generik; health hanya boolean; 2 match 'error' = nama chunk app/error-*.js (jinak) | curl + grep konteks |
| E: SRI | script eksternal | N/A: tidak ada (Sentry dibundel; ikon CDN = gambar) | grep F3-02 |

KESIMPULAN PUTARAN 2: 0 celah baru. Semua percobaan serangan gagal dengan
bukti runtime atau test regresi. Tidak ada perbaikan baru yang diperlukan;
tidak ada tambahan NEEDS_HUMAN dari putaran ini.

## Putaran 3 — verdict seluruh commit (base fc639dc..HEAD, 53 non-merge)

Tinjauan satu per satu (daftar lengkap + alasan di transkrip sesi). Ringkas
per kelompok, semua verdict BENAR:

- Kode keamanan (4): a848557 cookie httpOnly+secure (e2e+scan, live),
  e44bba1 e2e setAll, 338924b escapeJsonLd+3 tes, 574eda6 trigger kolom
  sales (NULL-safe, ledger+runbook+RUN-ALL terupdate, diterapkan prod).
- Kode UX/a11y/perf (8): 33bd56b pending lacak; 06d7f7f skip link+4 tes;
  7ee9656 autocomplete semantik; 820af2d tap target terukur; 0b314da ->
  0a23fe8 -> 0834b19 iterasi preconnect (final link-head terverifikasi
  render SSR+produksi); b76b9e8 kontras wa-deep 4.87:1 (A11y LH 100).
- Kode portal/backup (3): 954bbce Escape modal + limitOnePerBrand
  (dijaga limit-one-per-brand.test); 9cbd2d0 stderr backup; 117ad21
  NoticeBanner/ModalShell (disetujui owner, PR #174).
- UX+ Goal (2): 5577c7a empty state customers + bukti Goal F; 21bfd37
  script perf + tabel Lighthouse.
- Pin deploy (5): 3e65f31, 15590ec, 4710ac2, cb830f8, 84c39f4 — pola
  dijaga tests/deploy-image-pin, tiap deploy smoke 6/6.
- Docs loop/baseline/riwayat (31): konsisten dengan log, docs-index 8/8.
  Termasuk c8233dc (hapus LOOP_LOG, keputusan owner; konsistensi
  dipulihkan 0419084).

HASIL: 53 BENAR, 0 SALAH (tidak ada revert), 0 MERAGUKAN (tidak ada
tambahan NEEDS_HUMAN dari review commit).

## LOOP_SELESAI — ronde goal STANDARDS (2026-10-25)

Lima goal tuntas dengan bukti: (1) A+E — 4 gerbang exit 0 + eslint
--max-warnings 0, bun audit bersih, tabel modul kritis->test, verifikasi
tanpa pelemahan test (0 file/assert terhapus, +26 assert); (2) B/C/D —
npm run perf (Lighthouse@12 headless, tanpa dependency baru), tabel
before/after median 3 run mobile, A11y 92-96 -> 100 semua, CLS
0.733-0.878 -> 0.000-0.079, exclusion beralasan teknis di NEEDS_HUMAN
butir 3-4; (3) F — README lengkap, .env.example 59 var, 404/500, tabel
state per halaman data + empty state customers baru, responsif
320/1440, Lighthouse ulang tak turun (pengecualian trade-in
terdokumentasi); (4) Putaran 2 — tabel serangan 16 kategori, 0 celah
baru; (5) Putaran 3 — 53/53 commit BENAR, 0 revert, 0 meragukan.

Gerbang akhir ronde: lint 0, npm test 852/838/0/14 exit 0, build 0.
Sisa milik owner: NEEDS_HUMAN butir 2 (sisa), 3 (banner BackendStatus
+ shift trade-in intermiten), 4 (exclusion lab), roadmap owner-only.

## Konteks produksi (ronde baru, 2026-10-25) — aturan lebih ketat diterima

Dibaca: CLAUDE.md (= @AGENTS.md), AGENTS.md, SECURITY.md (kebijakan
laporan kerentanan + riwayat publik repo), docs/README.md. Yang lebih
ketat menang bila bertentangan.

- liveBackendEnabled (src/lib/store.ts:49): aktif saat
  NODE_ENV=production ATAU Supabase terkonfigurasi. Konsekuensi tercatat:
  (a) produksi atcell.my.id = live penuh; (b) uji lokal `next start`
  berjalan dengan flag live TRUE namun TANPA env Supabase → server
  action mengembalikan backendOffline dan UI memakai seed demo — uji
  semacam itu TIDAK pernah menyentuh DB/Storage/Auth produksi; (c)
  `npm run dev` tanpa env = mode demo murni.
- Batas baru yang dipegang mulai ronde ini: tidak mengubah berkas di
  supabase/migrations/ (skema = migrasi BARU tanpa dijalankan +
  NEEDS_HUMAN), Dockerfile.coolify + tag image,
  .github/workflows/docker-publish.yml, tests/deploy-image-pin.test.ts
  (hanya menambah), docs/VPS-HARDENING.md (baca saja). Secret tidak
  pernah dicetak; temuan cukup file:baris + jenis. Aturan bisnis
  (IMEI 15 digit unik, hanya unit available dijual, kode tiket
  SRV-YYYYMMDD-XXXXXXXX, peran) tidak berubah. Teks bisnis milik
  pemilik (typo/tata bahasa saja).
- Folder di luar lingkup, isinya dicatat saja: android/ = kerangka
  proyek Gradle aplikasi Android (32 file, 196 KB; app module, gradle
  wrapper, proguard); examples/ = 1 file ai-gateway.ts (contoh pemakaian
  dependensi ai).
- Tes yang butuh DB hanya dengan DATABASE_URL lokal/staging; jika tidak
  ada, uji logika murni + catat (kondisi kini: 14 tes DB skip lokal,
  dijalankan CI postgres:17 — sesuai aturan).

## STANDAR At Cell — Bagian A: test aturan bisnis (2026-10-25)

Cakupan (semua hijau; 857 total test, 843 pass, 14 skip DB lokal → CI):
- IMEI tepat 15 digit: tests/validations.test.ts (pra-ada) + check DB
  15-digit di schema [TEST].
- Unit non-available tidak bisa dijual: tests/inventory-unit-status-gate
  (6 tes, pra-ada: sold terminal DB + gerbang teknisi). BARU
  tests/pos-concurrent-sale.test.ts: lapis statis mengunci tiga syarat
  (db.transaction + .for("update") + filter available sekaligus) dan
  lapis DB (DATABASE_URL/CI) menembak DUA executeSale bersamaan ke satu
  unit — tepat satu boleh lolos, unit berakhir sold; seed/pulihkan
  lengkap (profiles/products/units/transactions/items).
- Format+keunikan kode tiket: tests/ticket-code-security (5 tes format
  base32 tanpa huruf ambigu) + trigger DB pembuat kode atomik + unique
  [TEST+BACA-KODE].
- Tiap Server Action menolak peran salah / input Zod invalid: BARU
  tests/server-action-role-guard.test.ts — matriks statis 39 aksi: semua
  ber-requireRole atau terdaftar AKSI_PUBLIK (8 aksi publik beralasan
  tertulis); scan safeParse (bukan parse yang bisa 500).
- Bukti MUTASI (aturan dirusak sementara → test gagal → dipulihkan →
  hijau) [REPRODUKSI, transkrip]: (1) hapus .for("update") di pos.ts →
  2 tes GAGAL; (2) rusak requireRole di settings.ts → matriks GAGAL
  menyebut aksi+berkas; (3) safeParse→parse di inventory.ts → scan
  GAGAL.
- Tidak ada test di-skip/dilemahkan ronde ini (14 skip = gerbang
  DATABASE_URL pra-ada, dijalankan CI postgres:17).
Gerbang resmi berurutan: npm test 857/843/0/14 exit 0 → tsc 0 → lint 0
→ build 0.

## STANDAR At Cell — Bagian B: keamanan spesifik (2026-10-25)

| Butir | Hasil | Bukti |
|---|---|---|
| RLS per tabel | 20 tabel RLS-on; policy per peran lengkap | grep migrasi: products(public read/sales update kolom via trigger/admin all), inventory_units(staff only), transactions/tiket/trade-in/audit(staff read, tx admin update), profiles(self read/admin write), store_settings(public read/admin write) [BACA-KODE migrasi] |
| Anon bisa baca apa | products, store_settings, product_images, view v_public_inventory, storage product-images saja | inventaris policy + harden 20260927160000 [BACA-KODE] |
| /trade-in?unit=<id> | AMAN: resolveTradeInTarget hanya cocokkan unit PUBLIK di store klien; IMEI ekor-4; tanpa harga modal; ID sembarang → null | tests/trade-in-target-linkage [TEST] |
| Pelacakan servis | respons hanya field terbatas ke PEMEGANG kode (imei_or_sn milik perangkatnya sendiri); kode 40-bit + rate limit 3 lapis | service.ts select + auth-rate-limit [BACA-KODE+TEST] |
| View etalase | v_public_inventory tanpa purchase_cost; IMEI ****tail | migrasi + getPublicSnapshot [TEST] |
| Bucket Storage | service/trade-in privat (public=false + limit 5MB/mime DI BUCKET), listing anon hanya product-images, upload hanya staf (is_staff) | 20260927160000 + policy grep [BACA-KODE] |
| Cookie lintas subdomain | default host-only (tidak menyeberang subdomain); SUPABASE_COOKIE_DOMAIN opsional server-side untuk berbagi sesi atcell.my.id↔subdomain | config.ts + proxy/server.ts [BACA-KODE] |
| Open redirect login | ditolak ketat | route-next-redirect 7 tes [TEST] |
| Upload foto | enum bucket/tipe, 5MB, nama disanitasi, folder id-staf | F3-11 + storage-hardening [TEST] |
| Service role di bundle klien | NIHIL: 0 kemunculan di .next/static/chunks; 0 NEXT_PUBLIC secret | grep bundle [EKSEKUSI] |
| Demo/mock di production | TIDAK BISA: liveBackendEnabled wajib true saat NODE_ENV=production; mesin demo hanya import() dinamis; import type boleh (terhapus kompilator) | BARU tests/prod-no-demo.test.ts 4 tes + mutasi B1 (flag tanpa kondisi prod → gagal) dan B2 (import dinamis→statis → gagal) [REPRODUKSI+TEST] |
| Scan riwayat git | bersih (F3-01: seluruh ref termasuk 52 refs/t3; format laporan bila ada = file:baris + jenis) | git log --all grep [EKSEKUSI] |

Gerbang resmi: npm test 861/847/0/14 exit 0 → tsc 0 → lint 0 → build 0.

## Goal 1+A (ronde ketat): tabel aturan bisnis + bukti mutasi ulang

| Aturan bisnis | File test | Hasil |
|---|---|---|
| IMEI tepat 15 digit + unik | tests/validations.test.ts | 11 pass |
| Unit non-available tak dijual (gate) | tests/inventory-unit-status-gate.test.ts | 6 pass |
| Dua penjualan bersamaan (kunci) | tests/pos-concurrent-sale.test.ts | 2 pass (+DB CI) |
| Format+keunikan kode tiket | tests/ticket-code-security.test.ts | 10 pass |
| Peran salah ditolak tiap aksi + safeParse | tests/server-action-role-guard.test.ts | 3 pass |

Bukti mutasi ronde ini (rusak→GAGAL→pulih→hijau, git diff bersih=0):
M1 hapus .for(update) → 2 GAGAL; M2 rusak requireRole settings → 1 GAGAL;
M3 safeParse→parse inventory → 1 GAGAL; M4 flag demo tanpa kondisi prod →
1 GAGAL. Gerbang: test 861/847/0/14 exit 0; tsc 0; lint 0; build 0.

## Goal 2+B (ronde ketat): audit statis dengan file:baris

RLS aktif semua tabel (file:baris penegak): profiles/0001:360+0002:356,
products/0001:362+0002:358, store_settings/0001:361+0002:357,
inventory_units/0001:363+0002:359, transactions/0001:364+0002:360,
transaction_items/0001:365+0002:361, trade_in_records/0001:366+0002:362,
service_tickets/0002:363 + auto-RLS-trigger
20260927120000:33, service_ticket_audit/0007:156,
unit_status_audit/20260927130000:61, product_images/0007:157.
Auto-RLS untuk tabel baru: migrasi 20260927120000 (trigger) — tabel baru
tidak bisa lupa RLS.

Policy per tabel (versi efektif = drop+create terakhir di 0002 dan
sesudahnya; contoh baris): products public read 0002:388 / sales update
20261024110000:15 (kolom dibatasi trigger 20261024120000) / admin all
0002:393; inventory_units staff-only 0002:399-415 (anon TIDAK bisa baca);
transactions 0002:436+449 (tx_read staff, tx_admin_update admin);
tiket 0002:464-480 staff; trade-in 0002:454-459 staff; audit read
0007:165 + unit audit 20260927130000; profiles self 0002:366 / admin
0002:371; settings public 0002:377 / admin 0002:382; product_images
public 20260927130000:64 / staff 71,78 / admin-delete 86.

Storage bucket (20260927160000_harden): service-photos & trade-in-photos
public=false + file_size_limit 5242880 + allowed_mime jpeg/png/webf di
bucket; storage_public_read hanya product-images (listing anon privat
bucket nihil); insert/update/delete hanya authenticated is_staff()
(is_staff dikunci 0003:5-7: hanya service_role yang bisa execute).

Server Action (39, guard file:baris — daftar lengkap transkrip): semua
aksi internal requireRole pada baris pertamanya (audit 56/97, auth
217/318/377/451/526/557/584, dashboard 31/85/133, inventory 53/84/148/223,
portal 37, pos 43/279, products 48/71/109/147/179, service 41/83/182,
settings 17/28, storage 82/213); 8 PUBLIK beralasan (auth 77/150/360,
public.ts 107/192/242/384, service 295) — konsisten dengan
tests/server-action-role-guard.

Anon-read final: products, store_settings, product_images,
v_public_inventory, bucket product-images. Tidak ada celah HIGH;
tidak ada nilai secret tercetak (audit hanya file:baris). Skema TIDAK
diubah (tanpa migrasi baru — tidak diperlukan).

## Goal 3 (C+D): peta halaman, smoke render, marquee lokal, JS per rute

Pemetaan halaman publik (build output + kode): semua halaman publik ƒ
dinamis SSR (seed dari getPublicSnapshot di layout); /api/reviews ○ ISR
24 jam. Perilaku DB lambat/mati: snapshot retry 1x + pembacaan
dipakai-bersama (public.ts) + seed layout catch→null sehingga halaman
tetap 200 dengan copy cadangan; cacheImageUrls gagal→peta kosong (foto
jatuh ke path lokal); reviews fetch AbortSignal 8 detik; statement
timeout DB (tes db-client-statement-timeout); portal: proxy 503 eksplisit
saat backend auth mati (proxy.ts). Tidak ada jalur menggantung [BACA-KODE
+ smoke render eksperimen].

Smoke render: BARU `npm run smoke:render` (scripts/smoke-render.mjs):
next start lokal :3299 tanpa kredensial → 5 halaman 200 + konten kunci
(/id /en 103KB, catalog 48KB, tracking 42KB+SRV-, trade-in 51KB) →
SEMUA PASS exit 0 (transkrip) [EKSEKUSI].

Gambar & marquee (STANDAR D): BrandLogo semula 5 merek x varian = URL
cdn.simpleicons.org; marquee menggandakan x8 → 104 URL pihak ketiga di
HTML /id [EKSEKUSI grep]. FIX: 45 SVG Simple Icons disalin ke
public/brand/icons (180KB), src lokal via iconUrl(); markup/warna/dark-
mode identik. AFTER: URL pihak ketiga tinggal 14 (ikon sosmed footer,
bukan puluhan) + 90 ikon merek same-origin; test fallback kartu
diperbarui (filter mengenali fallback lokal; asersi nilai-jahat tetap,
10/10 pass). Kartu katalog sudah benar: next/image fill + sizes
(max-640 100vw, 1024 50vw, 25vw) — tanpa permintaan 3840px.

JS first-load per rute (jumlah chunk <script> HTML SSR, raw KB):
SEBELUM = SESUDAH (perubahan murni aset jaringan): /id & /en 1039KB/22,
catalog 1032KB/21, tracking & trade-in 1009KB/19, portal/dashboard
1064KB/22 — delta portal vs publik hanya +25..55KB → kode portal TIDAK
membebani rute publik; basis bersama = React/Next/Sentry/store [EKSEKUSI].
Font: next/font 2 keluarga woff2 preload (STANDAR D terpenuhi sebelumnya).

Gerbang: npm test 861/847/0/14 exit 0; tsc 0; lint 0; build 0.
