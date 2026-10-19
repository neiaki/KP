# Roadmap Perapihan Repo At Cell

Dokumen ini adalah daftar kerja untuk sesi berikutnya. Baca bersama
[`project-map.md`](project-map.md), `AGENTS.md`, dan status Git; jangan
menganggap perubahan lokal sudah masuk ke branch remote.

## Status terbaru

**Diperbarui:** 17 Oktober 2026  
**Baseline:** `45e532c` (`main`, `origin/main` saat audit)  
**Perubahan roadmap ini:** kode dan dokumentasi perapihan sesi ini masih lokal,
belum di-commit atau di-push.

Selesai pada sesi ini:

- [x] Satukan normalisasi tiket melalui adapter Drizzle dan Supabase di
  `src/lib/actions/_ticket-mappers.ts`; kontrak mapper diuji di
  `tests/service-ticket-mapper.test.ts`.
- [x] Pisahkan perakitan snapshot dari query portal ke
  `src/lib/actions/_portal-snapshot.ts`. Tes memastikan snapshot customer
  menyembunyikan `purchase_cost`, membatasi profil ke akun sendiri, dan staf
  tetap mendapat data internal yang diizinkan.
- [x] Pindahkan konversi angka/tanggal murni ke
  `src/lib/actions/_value-mappers.ts` agar dapat dipakai tanpa memuat helper
  autentikasi Next.js.
- [x] Pindahkan prepend tiket dan klasifikasi path portal ke
  `src/lib/service-ticket-list.ts`; tes daftar tiket kini menguji helper nyata.
- [x] Tambahkan pemeriksaan tautan relatif Markdown di repo ke
  `tests/docs-index.test.ts`.
- [x] Tambahkan `"type": "module"` setelah memeriksa dukungan `next.config.ts`
  pada Next.js lokal dan konfigurasi Drizzle. Build Next.js dan `drizzle-kit
  check` lulus, dan warning `MODULE_TYPELESS_PACKAGE_JSON` tidak muncul di suite
  penuh.
- [x] Gambar arsitektur README ditampilkan sebelum diagram Mermaid agar tetap
  terlihat pada pembaca yang tidak merender Mermaid.
- [x] Tambahkan peta proyek AI di `docs/agents/project-map.md`.

## Pekerjaan berikutnya

### Prioritas 1: validasi perubahan lokal (selesai)

- [x] `bunx tsc --noEmit` lulus.
- [x] `bun run lint` lulus tanpa warning.
- [x] `bun run test`: 751 lulus, 14 dilewati, 0 gagal; peringatan
  `MODULE_TYPELESS_PACKAGE_JSON` tidak muncul setelah deklarasi ESM.
- [x] `bun run build` lulus; `next.config.ts` berjalan dalam mode ESM.
- [x] `bunx drizzle-kit check` lulus dan memuat `drizzle.config.ts` dalam mode
  ESM.
- [x] `git diff --check` bersih; hasil lengkap dicatat di handoff. Full suite
  dijalankan di luar sandbox karena beberapa test memerlukan child process dan
  listener localhost.

### Prioritas 2: lanjutkan pemecahan snapshot secara bertahap

- [ ] Pertimbangkan memisahkan pembacaan query Supabase dari
  `getPortalSnapshot`, setelah jalur mapping saat ini tervalidasi.
- [ ] Tambahkan tes untuk label unit trade-in, kegagalan sumber data tambahan,
  dan pembatasan hasil query customer. Jangan mengubah policy/RLS tanpa bukti
  perilaku sekarang dan tes sebelum perubahan.
- [ ] Pertahankan prinsip bahwa query customer dibatasi di sisi server; jangan
  hanya menyaring hasil setelah data staf terbaca.

### Prioritas 3: kurangi tes yang sensitif terhadap bentuk source

- [ ] Tinjau sisa assertion source di
  `tests/service-ticket-list-invalidation.test.ts` dan
  `tests/locale-switch-refetch.test.ts`.
- [ ] Ganti hanya assertion yang dapat dipindah ke helper/perilaku teramati;
  pertahankan pemeriksaan source bila memang mengunci wiring atau kebijakan
  repository yang belum punya seam runtime.

### Prioritas 4: pemeriksaan manual yang memerlukan environment

- [ ] Jalankan `bun run smoke:deployment -- <staging-url>` hanya pada staging
  yang diizinkan; jangan memakai URL production untuk eksperimen.
- [ ] Periksa README dan gambar arsitektur pada aplikasi GitHub mobile setelah
  perubahan dokumentasi dipublikasikan.
- [ ] Cek GitHub PR terbaru lewat `gh` dari terminal yang punya akses jaringan;
  hasil audit 17 Oktober 2026 menunjukkan tidak ada PR terbuka, tetapi hasil
  itu hanya snapshot waktu tersebut.

## Langkah awal agen berikutnya

1. Jalankan `git status --short --branch` dan tinjau semua diff lokal sebelum
   mengedit.
2. Baca `AGENTS.md` dan `docs/agents/project-map.md`.
3. Jalankan pemeriksaan prioritas 1; jika gagal, perbaiki penyebabnya dan
   perbarui bagian status di roadmap serta
   `review-handoff-2026-10-17.md`.
4. Kerjakan satu item berikutnya pada satu waktu dan pertahankan kontrak
   akses customer/staf.
