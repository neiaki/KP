# Handoff Review dan Perapihan Repo KP

> **Snapshot historis 17 Oktober 2026.** Status "belum di-commit" dan baseline
> di bawah berlaku saat dokumen ditulis, bukan kondisi repo sekarang. Untuk
> handoff terbaru, lihat `review-handoff-2026-10-20.md` dan
> `handoff-2026-10-23-akun-pelanggan-dan-stok.md`.

**Diperbarui:** 17 Oktober 2026  
**Repo:** `/home/neki/Code/KP`  
**Baseline:** `45e532c` (`main`, `origin/main` saat audit)  
**Status:** perubahan lokal sesi audit dan perapihan belum di-commit atau di-push.

## Yang sudah dikerjakan

- Memindahkan gambar arsitektur di `README.md` ke atas diagram Mermaid agar
  fallback tampil pada pembaca GitHub yang belum merender Mermaid.
- Menambahkan peta proyek untuk AI di `docs/agents/project-map.md` dan
  menghubungkannya dari `AGENTS.md`.
- Menyatukan pemetaan tiket Drizzle dan Supabase dengan adapter eksplisit di
  `src/lib/actions/_ticket-mappers.ts`.
- Memisahkan perakitan snapshot ke `src/lib/actions/_portal-snapshot.ts`.
  Aturan customer tetap: hanya profil sendiri dan biaya pembelian unit tidak
  dikirim; query dan guard masih berada di Server Action.
- Memisahkan konversi angka/tanggal murni ke
  `src/lib/actions/_value-mappers.ts`.
- Memindahkan prepend tiket serta klasifikasi path portal ke helper murni
  `src/lib/service-ticket-list.ts` agar perilakunya dapat diuji langsung.
- Menambahkan tes perilaku mapper dan snapshot di
  `tests/service-ticket-mapper.test.ts` dan `tests/portal-snapshot.test.ts`.
- Memperluas `tests/docs-index.test.ts` untuk mengecek target tautan relatif
  Markdown. Cakupan ini mengecek keberadaan file/folder, bukan anchor heading.
- Menambahkan roadmap agen di `docs/agents/roadmap.md`.
- Menambahkan `"type": "module"` setelah memeriksa panduan Next.js lokal dan
  konfigurasi Drizzle; jalankan build/test penuh sebelum mempertahankan
  perubahan metadata ini.

## Langkah pertama sesi lanjutan

1. Baca `AGENTS.md`, `docs/agents/project-map.md`, dan
   `docs/agents/roadmap.md`.
2. Periksa `git status --short --branch` serta diff lokal sebelum menyentuh
   berkas. Pertahankan semua perubahan yang sudah ada.
3. Jalankan pemeriksaan lengkap yang masih tertunda di roadmap dan perbarui
   hasil di sana serta di handoff ini.
4. Ambil satu backlog berikutnya dari roadmap; jangan melakukan perubahan
   production atau mengirim pesan eksternal tanpa instruksi eksplisit.

## Backlog yang masih terbuka

- Pisahkan query/pengayaan data dari `getPortalSnapshot` secara bertahap,
  dengan tes untuk label unit trade-in, kegagalan sumber data tambahan, dan
  filtering hasil customer di sisi server.
- Kurangi assertion source yang rapuh di tes invalidasi daftar tiket dan
  refetch bahasa hanya jika ada seam perilaku yang jelas.
- Jalankan pemeriksaan smoke hanya terhadap staging yang diizinkan, lalu cek
  tampilan README/Gambar arsitektur di GitHub mobile setelah perubahan
  dipublikasikan.
- Periksa daftar PR terbaru dari terminal yang punya koneksi GitHub. Saat audit
  17 Oktober 2026, `gh auth status` menunjukkan akun `neiaki`, `gh api /user`
  berhasil, dan `gh pr list -R neiaki/KP --state open` tidak mengembalikan PR.
  Sandbox Codex sendiri tidak dapat menghubungi API GitHub; hasil tersebut
  adalah snapshot waktu audit.

## Verifikasi sebelumnya

Sebelum perubahan sesi ini, pemeriksaan penuh di environment yang dapat
menjalankan child process lulus: 745 tes lulus, 14 dilewati, dan build
production berhasil. Di sandbox terbatas, beberapa test gagal karena
`spawnSync git EPERM`, dan build tidak dapat membaca stdout child process.

## Verifikasi sesi ini

Isi tabel ini setelah menjalankan pemeriksaan final. Jangan menganggap
pemeriksaan subset sebagai pengganti build dan suite penuh.

| Perintah | Hasil |
|---|---|
| `bunx tsc --noEmit` | Lulus, TypeScript tidak menemukan error |
| `bun run lint` | Lulus tanpa error atau warning |
| `bun run test` | Lulus: 751 tes lulus, 14 dilewati, 0 gagal; warning `MODULE_TYPELESS_PACKAGE_JSON` tidak muncul |
| `bun run build` | Lulus; Next.js 16.4.1 memuat `next.config.ts`, compile, typecheck, render halaman, dan build traces berhasil |
| `bunx drizzle-kit check` | Lulus; Drizzle Kit memuat `drizzle.config.ts` dan melaporkan konfigurasi baik |
| `git diff --check` | Lulus, tidak ada whitespace error |
