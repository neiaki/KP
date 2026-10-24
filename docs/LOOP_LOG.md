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
| F3-03 | Audit SQL/NoSQL/command injection | P0 | BELUM | - |
| F3-04 | Audit path traversal | P1 | BELUM | - |
| F3-05 | Audit autentikasi & session/token | P0 | BELUM | - |
| F3-06 | Audit otorisasi & IDOR (server actions + API) | P0 | BELUM | - |
| F3-07 | Audit CSRF & CORS | P1 | BELUM | - |
| F3-08 | Audit cookie flags | P1 | BELUM | - |
| F3-09 | Audit security headers | P1 | BELUM | - |
| F3-10 | Audit rate limiting | P1 | BELUM | - |
| F3-11 | Audit upload file | P1 | BELUM | - |
| F3-12 | Audit SSRF & open redirect | P1 | BELUM | - |
| F3-13 | Audit dependency rentan | P0 | DIPERIKSA-BERSIH | `bun audit --audit-level=high` exit 0, 558 paket (2026-10-24); 1 moderate dev-only: esbuild<=0.24.2 via drizzle-kit (GHSA-67mh-4wv8-2f99, vektor dev server, dev-only, diterima sesuai kebijakan security.yml audit-level=high + dependabot weekly) [EKSEKUSI] |
| F3-14 | Audit pesan error bocor info internal | P2 | BELUM | - |

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
| F3-05 | Audit autentikasi & session/token | P0 | BELUM | - |
| F3-06 | Audit otorisasi & IDOR (server actions + API) | P0 | BELUM | - |
| F3-14 | Audit pesan error bocor info internal | P2 | BELUM | - |

Catatan iterasi 3: LOOP_LOG.md dipulihkan dari riwayat 820f669 (dihapus PR #153
karena merusak tes docs-index; kini didaftarkan di docs/README.md supaya keduanya
lulus). Branch di-rebase ke main (862228b) yang memuat merge #158 cookie.
