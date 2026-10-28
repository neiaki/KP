# Peta Proyek untuk Agen

Pakai dokumen ini saat mulai mengerjakan area yang belum dikenal atau saat
menelusuri alur data lintas modul. `AGENTS.md` tetap menjadi aturan kerja dan
invarian produk yang mengikat; dokumen ini membantu menemukan implementasi dan
sumber kebenaran dengan cepat.

## Sumber kebenaran

| Pertanyaan | Sumber utama |
|---|---|
| Cara membangun, menguji, dan batasan perubahan | `package.json`, `AGENTS.md` |
| Kebutuhan produk | `docs/PRD-AtCell.md` dan `docs/requirement-2.0.md` |
| Perilaku operasional production | `docs/DEPLOYMENT-REDUNDANCY.md` |
| Schema production | `supabase/migrations/` dalam urutan nama berkas |
| Akses database dari kode | `src/db/schema.ts`, `src/db/client.ts`, `src/types/database.ts` |
| Tipe domain aplikasi | `src/types/index.ts` |
| Validasi input bersama | `src/lib/validations.ts` |
| Bahasa ID/EN | `src/lib/translations.ts` |
| Kontrak tampilan katalog | `src/lib/shop.ts`, lalu halaman di `src/app/(public)/[locale]/` |

Perubahan schema production dimulai dari migration SQL canonical. Artefak di
`supabase/drizzle/` hanya referensi schema; runbook menjelaskan cara menerapkan
migration dan memperbarui ledger. Setelah migration berubah, cocokkan juga
runbook dan test yang menjaga urutannya.

## Peta modul

| Area | Jalur masuk | Implementasi yang perlu dibaca |
|---|---|---|
| Etalase ID/EN | `src/app/(public)/[locale]/` | `src/lib/shop.ts`, `src/lib/translations.ts`, `src/lib/public-seed.ts` |
| Portal staf | `src/app/(portal)/portal/` | `src/context/store-context.tsx`, `src/lib/store.ts` |
| Mode demo dan data lokal | halaman portal | `src/lib/store-demo.ts`, `src/lib/mock-data.ts` |
| Operasi bisnis di server | form atau halaman portal | `src/lib/actions/` per domain, dengan helper di `_helpers.ts`, `_value-mappers.ts`, dan `_mappers.ts` |
| Identitas dan otorisasi | `src/proxy.ts`, layout portal | `src/lib/access.ts`, `src/lib/actions/auth.ts`, klien Supabase di `src/lib/supabase/` |
| Ikon dan aset brand | navbar, portal layout, login, ikon PWA, OG image | `src/lib/brand-logo.tsx` (sumber tunggal geometri logo), `public/brand/` |
| Database | Server Actions | `src/db/schema.ts`, `src/db/client.ts`, migration di `supabase/migrations/` |
| Health dan integrasi HTTP | `src/app/api/` | `src/lib/health.ts`, `scripts/smoke-deployment.mjs` |
| Backup dan pemulihan | `scripts/` | `docs/DEPLOYMENT-REDUNDANCY.md`, lalu test terkait di `tests/` |

## Alur data yang perlu dijaga

- Mode demo menggunakan mock data dan `localStorage`; mode live memakai
  Supabase/Drizzle di server. Periksa `liveBackendEnabled` di
  `src/lib/store.ts` sebelum mengubah pemilihan mode.
- Perubahan operasional dari portal melewati Server Action di
  `src/lib/actions/`. Ikuti alur dari pemanggil halaman ke action, validasi,
  pemeriksaan peran, baca/tulis database, lalu pemetaan hasil ke tipe domain.
- Beberapa area membaca sumber data berbeda untuk snapshot dan mutasi. Jaga
  aturan akses serta pemetaan field pada setiap jalur; jangan menyamakan bentuk
  row database dengan tipe domain tanpa adapter yang eksplisit.
- Data pelanggan, tiket servis, stok unit, dan transaksi menyentuh aturan akses
  atau integritas bisnis. Sebelum mengubahnya, baca aturan terkait di
  `AGENTS.md`, kebutuhan di dokumen produk, dan test yang mencakup jalur itu.

## Seam perapihan dan status

Catatan berikut adalah kandidat untuk dieksplorasi, bukan instruksi refactor
otomatis. Pertahankan perilaku dan akses data saat memperbaiki locality.
Saat mengusulkan desain, jelaskan module, interface, implementation, depth
(deep atau shallow), seam, adapter, leverage, dan locality yang berubah.

1. **Selesai:** row tiket Drizzle dan Supabase kini memakai adapter terpisah
   menuju pemetaan domain bersama di `src/lib/actions/_ticket-mappers.ts`.
   Kontrak hasil dipertahankan di `tests/service-ticket-mapper.test.ts`.
2. **Selesai sebagian:** `getPortalSnapshot` masih memegang guard, query, dan
   pengambilan data tambahan; perakitan hasil sudah dipindah ke
   `src/lib/actions/_portal-snapshot.ts`. Test menjaga perbedaan akses data
   customer dan staf. Kandidat lanjutan adalah memisahkan query tanpa
   memindahkan atau melemahkan policy akses customer.
3. **Selesai sebagian:** `prependServiceTicket` dan klasifikasi path ada di
   `src/lib/service-ticket-list.ts`, sehingga perilakunya dapat dites tanpa
   membaca implementasi React store. Beberapa tes masih mengunci wiring source;
   pertahankan yang menjaga sambungan penting, dan ganti lainnya hanya jika ada
   seam runtime yang lebih baik.
4. `tests/docs-index.test.ts` kini mengecek target tautan relatif Markdown
   untuk dokumen repo, selain indeks dan gambar.

## Cara menelusuri perubahan

1. Baca `AGENTS.md` dan file pemanggil pada area yang diminta.
2. Ikuti satu alur utuh dari interface halaman/action ke adapter, database,
   dan pemetaan hasil. Cari test domain terkait sebelum mengubah implementasi.
3. Jika menyentuh Next.js, baca panduan lokal yang relevan di
   `node_modules/next/dist/docs/`, sesuai aturan di `AGENTS.md`.
4. Jalankan skrip yang sudah ada di `package.json`. Untuk perubahan kode,
   penuhi pemeriksaan yang diwajibkan `AGENTS.md`; tambahkan verifikasi alur
   yang terdampak bila perubahan menyentuh akses, transaksi, migration, atau
   deployment.
5. Setelah perubahan, periksa `git diff` dan `git status` agar hanya perubahan
   yang dimaksud ikut tersisa. Jangan menganggap environment production
   tersedia tanpa mengecek konfigurasi dan health endpoint.

Untuk status backlog lintas sesi, lihat `docs/agents/roadmap.md`. Handoff kerja
aktif ada di `docs/agents/handoff-2026-10-23-akun-pelanggan-dan-stok.md`;
handoff audit terakhir ada di `docs/agents/review-handoff-2026-10-20.md`.
