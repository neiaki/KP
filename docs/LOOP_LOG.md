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
| F3-02 | Audit XSS (dangerouslySetInnerHTML, URL js:, sink DOM) | P0 | BELUM | - |
| F3-03 | Audit SQL/NoSQL/command injection | P0 | DIPERIKSA-BERSIH | sweep: 0 sql.raw di src; 19 template sql Drizzle semuanya interpolasi = parameter binding; db.execute v_public_inventory memakai binding ${brand}/${condition}; tanpa child_process di src; exec di sitemap.ts = regex. Script shell hanya menerima env cron, bukan input pengguna [BACA-KODE] |
| F3-04 | Audit path traversal | P1 | DIPERIKSA-BERSIH | uploadPhoto: folder dari sesi staf (bukan argumen client), whitelist UPLOAD_BUCKETS, randomUUID server-side, fileName disanitasi [^a-zA-Z0-9._-]→_ via buildPhotoObjectKey (../ mustahil); restore-storage.sh ekstraksi terbatas 2 nama file eksplisit + wajib checksum; tes 'folder tidak aman → hasil kosong' pass [BACA-KODE+TEST] |
| F3-05 | Audit autentikasi & session/token | P0 | DIPERIKSA-BERSIH | proxy pakai getUser() (verifikasi ke server Auth, bukan decode lokal); role dibaca dari tabel profiles per user.id, bukan klaim JWT; cookie via authCookieOptions (httpOnly+secure production, 3 tes pass); throttle 3 lapis (10/5m per IP+username, 40/5m per IP, 60/15m per akun) dipotong sebelum query profil; pesan login identik untuk username/password salah [BACA-KODE] |
| F3-06 | Audit otorisasi & IDOR (server actions + API) | P0 | BELUM | - |
| F3-07 | Audit CSRF & CORS | P1 | DIPERIKSA-BERSIH | live: POST Server Action tanpa Origin/Action valid ditolak Next (404); cookie sameSite=lax; X-Frame-Options DENY + CSP frame-ancestors; API publik tanpa Access-Control-Allow-Origin wildcard (uji Origin asing → header CORS tidak diset) [EKSEKUSI] |
| F3-08 | Audit cookie flags | P1 | DIPERIKSA — temuan DIPERBAIKI: cookie httpOnly:false tanpa secure → FIXED-TERVERIFIKASI (PR #158, live di production sha-001b6a8) | authCookieOptions(): httpOnly:true, secure di production, sameSite lax, path /; dipakai proxy.ts, supabase/server.ts, dan setAll di proxy; patch PR #158 + 3 tes regresi pass (tests/supabase-cookie-options.test.ts) [TEST] |
| F3-09 | Audit security headers | P1 | DIPERIKSA-BERSIH | uji live curl -I produksi: CSP (default-src 'self', frame-ancestors none), HSTS max-age=63072000 includeSubDomains preload, X-Content-Type-Options nosniff, X-Frame-Options DENY, Permissions-Policy kamera/mikrofon/geolokasi tutup, Referrer-Policy strict-origin-when-cross-origin [EKSEKUSI] |
| F3-10 | Audit rate limiting | P1 | DIPERIKSA-BERSIH | rate-limit.ts: kredensial 3 lapis (10/5m per IP+username, 40/5m per IP, 60/15m per akun) anti-enumerasi; publik 600/menit per IP (snapshot/settings/inventory); mutasi sensitif per-aktor (password pelanggan 10/menit per staf, nomor HP per profil); refundRateLimit untuk kompensasi; tes auth-rate-limit mengunci perilaku [BACA-KODE+TEST] |
| F3-11 | Audit upload file | P1 | DIPERIKSA-BERSIH | uploadPhotoSchema: bucket whitelist enum, nama file 3-160 char, contentType enum jpeg/png/webp (SVG/script ditolak), maks 5MB; path = folder sesi + randomUUID + nama disanitasi; upsert:false; signed URL TTL; bucket RLS Supabase [BACA-KODE+TEST] |
| F3-12 | Audit SSRF & open redirect | P1 | DIPERIKSA-BERSIH | open redirect: resolveLoginDestination menolak nilai non-path, //host, backslash, origin luar; wajib di bawah /portal/ (tests/route-next-redirect). SSRF: tidak ada fetch server ke URL dari input user; getGoogleReviews ke endpoint tetap + key env; wa.me dibuka browser [BACA-KODE+TEST] |
| F3-13 | Audit dependency rentan | P0 | DIPERIKSA-BERSIH | `bun audit --audit-level=high` exit 0, 558 paket (2026-10-24); 1 moderate dev-only: esbuild<=0.24.2 via drizzle-kit (GHSA-67mh-4wv8-2f99, vektor dev server, dev-only, diterima sesuai kebijakan security.yml audit-level=high + dependabot weekly) [EKSEKUSI] |
| F3-14 | Audit pesan error bocor info internal | P2 | DIPERIKSA-BERSIH | semua catch di Server Action mengembalikan pesan generik ('Gagal ... Coba lagi'); pesan dari parsed.error adalah kalimat validasi Zod yang dirancang untuk pengguna; kode Postgres dipetakan friendlyDbError ke pesan bisnis; tidak ada e.stack/e.message database yang diteruskan ke klien [BACA-KODE] |

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
| F3-03 | Audit SQL/NoSQL/command injection | P0 | BELUM | - |
| F3-05 | Audit autentikasi & session/token | P0 | DIPERIKSA-BERSIH | proxy pakai getUser() (verifikasi ke server Auth, bukan decode lokal); role dibaca dari tabel profiles per user.id, bukan klaim JWT; cookie via authCookieOptions (httpOnly+secure production, 3 tes pass); throttle 3 lapis (10/5m per IP+username, 40/5m per IP, 60/15m per akun) dipotong sebelum query profil; pesan login identik untuk username/password salah [BACA-KODE] |
| F3-06 | Audit otorisasi & IDOR (server actions + API) | P0 | BELUM | - |
| F3-14 | Audit pesan error bocor info internal | P2 | DIPERIKSA-BERSIH | semua catch di Server Action mengembalikan pesan generik ('Gagal ... Coba lagi'); pesan dari parsed.error adalah kalimat validasi Zod yang dirancang untuk pengguna; kode Postgres dipetakan friendlyDbError ke pesan bisnis; tidak ada e.stack/e.message database yang diteruskan ke klien [BACA-KODE] |

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
