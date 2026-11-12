# Dokumen At Cell

Indeks tunggal untuk seluruh dokumen repo. Mulai dari sini kalau mencari
spesifikasi produk, acuan teknis, atau runbook operasional.

## Produk dan kebutuhan

| File | Isi |
|---|---|
| `PRD-AtCell.md` | Product Requirements Document: visi, fitur inti, user flow, dan arsitektur Next.js + Supabase |
| `requirement.md` | SRS v1: aktor Sales/Teknisi/Pelanggan, modul IMEI, servis, dan trade-in. Dipertahankan sebagai arsip, bukan acuan aktif |
| `requirement-2.0.md` | SRS aktif: aktor Admin/Owner/Sales/Teknisi/Pelanggan, FR/NFR, etalase multibahasa, dan dashboard |
| `USE-CASE-AtCell.md` | Kemampuan per aktor dari membuka web sampai seluruh menu portal, tanpa kode bernomor |

## Teknis dan operasional

| File | Isi |
|---|---|
| `DEPLOYMENT-REDUNDANCY.md` | Deployment Coolify, migrasi Supabase, DNS, health check, akses panel, backup, restore, dan rollback |
| `DB-INTEGRITY.md` | Usulan aturan integritas database dan runbook verifikasi di CI, Supabase lokal, atau PostgreSQL sekali pakai |
| `VPS-HARDENING.md` | Audit host production, pengerasan firewall dan SSH, batas resource, access log Traefik, dan rutinitas bulanan |
| `SECRET-ROTATION.md` | Urutan mengganti secret yang pernah bocor beserta verifikasinya |
| `CSP.md` | Content-Security-Policy berbasis nonce: directive, alasan, dan cara mengujinya |
| `ANDROID-APP.md` | Build, signing, dan Digital Asset Links aplikasi Android `my.id.atcell` |
| `STAF.md` | Panduan staf: publikasi model tanpa unit dan uji alur ber-kredensial |
| `STATUS.md` | Status repo, backlog terbuka, keputusan owner, dan urutan kerja yang disarankan |

## Untuk agen

| File | Isi |
|---|---|
| `agents/project-map.md` | Peta modul, alur data, sumber kebenaran, dan seam refactor |
| `agents/issue-tracker.md` | Konfigurasi GitHub Issues lewat `gh` CLI |
| `agents/triage-labels.md` | Pemetaan lima peran triage ke label GitHub repo |

## Catatan

- Dua mode aplikasi dijelaskan di [`../README.md`](../README.md) bagian
  Konfigurasi Supabase.
- `tests/docs-index.test.ts` menjaga indeks ini tetap memuat seluruh dokumen
  di `docs/` dan menolak tautan relatif yang menggantung.
- `tests/deployment-runbook.test.ts` menjaga daftar migration di
  `DEPLOYMENT-REDUNDANCY.md` tetap sinkron dengan `supabase/migrations/`.
- `tests/db-verification-runbook.test.ts` menjaga `DB-INTEGRITY.md` tetap
  memakai `VERIFY_DATABASE_URL` dan memuat semua query verifikasi 5.x.
- `tests/csp-doc.test.ts` menjaga `CSP.md` tetap sinkron dengan
  `src/lib/csp.ts`.
- Diagram UML sudah dihapus dari repo. Kemampuan per aktor tetap menjadi acuan
  di `USE-CASE-AtCell.md`.
- Draf editorial lokal di `docs/Diagram/` sengaja di-gitignore dan tidak
  termasuk dokumentasi repo. Jangan menautkan draf itu dari dokumen tracked.
