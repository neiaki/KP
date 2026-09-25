# Dokumen Perencanaan dan Operasional At Cell

Kumpulan spesifikasi, kebutuhan, dan runbook deployment At Cell. Implementasi
saat ini memiliki dua mode: demo lokal berbasis mock/localStorage dan mode live
berbasis Supabase ketika environment production dikonfigurasi.

| File | Isi | Status |
|------|-----|--------|
| `PRD-AtCell.md` | Product Requirements Document: overview, fitur inti, user flow, arsitektur Next.js + Supabase | Rencana jangka panjang |
| `requirement.md` | SRS v1 awal: aktor Sales/Teknisi/Pelanggan, modul IMEI, servis, trade-in | Digantikan v2 |
| `requirement-2.0.md` | SRS v2 At Cell: tambah aktor Admin/Owner, FR-xxx/NFR-xxx, modul etalase publik multibahasa + dashboard | **Acuan aktif** |
| `DEPLOYMENT-REDUNDANCY.md` | Runbook Coolify + Vercel, Supabase, health check, backup, dan rollout | **Acuan operasional** |

Catatan: `design-taste-frontend/` di root repo adalah eksplorasi mockup lokal
(10 varian HTML, gitignored) dan bukan bagian dari dokumen ini.
