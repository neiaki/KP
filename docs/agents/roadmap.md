# Roadmap Perapihan Repo At Cell

Dokumen ini adalah daftar kerja untuk sesi berikutnya. Baca bersama
[`project-map.md`](project-map.md), `AGENTS.md`, dan status Git; jangan
menganggap perubahan lokal sudah masuk ke branch remote.

## Status terbaru

**Diperbarui:** 24 Oktober 2026
**Baseline:** `caee6f2` (`main`, commit pin image setelah PR #130)
**Cabang kerja:** `main` bersih; tidak ada PR terbuka.
**Perubahan roadmap ini:** akun pelanggan, checkout POS, data demo bertanda,
dan katalog lima model per merek sudah merge lewat PR #129. Pin image
`Dockerfile.coolify` sudah dinaikkan lewat PR #130 dan production sudah
menjalankan image revisi `53856b4`.

Selesai pada sesi 24 Oktober 2026:

- [x] Admin dan sales bisa membuat akun pelanggan dari `/portal/customers` dan
      POS, tanpa meminta email pelanggan.
- [x] Login pelanggan memakai username, nomor HP, dan password; email sintetis
      `@pelanggan.atcell.my.id` tetap internal.
- [x] POS menyimpan `customer_id` dan menerima pelanggan lama yang nomor HP-nya
      masih kosong.
- [x] Unit dan transaksi demo memakai `is_demo = true`; unit demo memakai
      `imei = NULL` dan tidak muncul di etalase publik, stok, dashboard, atau
      laporan.
- [x] Riwayat pelanggan difilter per `customer_id`, dengan fallback nomor/nama
      untuk data demo lama, sehingga tidak ada kebocoran antar pelanggan.
- [x] Migrasi `20261023111914_add_is_demo_flag.sql` dan
      `20261023112316_demo_inventory_imei_nullable.sql` tercatat di runbook dan
      ledger production.
- [x] Deploy production diverifikasi: health 200, CSP ada, login `ega` hanya
      melihat 2 faktur miliknya, dan route `/portal/customers` tertutup untuk
      customer.

Selesai pada sesi 20 Oktober 2026:

- [x] Tutup paparan publik panel Coolify secara persisten di host production.
      Sumbernya bukan berkas Traefik yang bisa dihapus, melainkan nilai
      `instance_settings.fqdn` di database Coolify. Nilainya dipindah ke
      `https://coolify.atcell.my.id`, domain yang memang sudah direncanakan di
      repo dan belum punya DNS, lalu Traefik diregenerasi dan hostname lama
      `coolify.<ip>.sslip.io` tidak lagi menampilkan halaman login.
- [x] Hilangkan `TELEGRAM_BOT_TOKEN` dari argumen proses di
      `scripts/atcell-watchdog.sh`. URL berisi token sekarang dibaca curl dari
      stdin lewat `--config -`, sehingga token tidak pernah masuk argv yang
      terbaca lewat `/proc/<pid>/cmdline`. Regresinya ditutup tes
      `token Telegram tidak pernah menjadi argumen proses`.
- [x] Bangun backup objek Storage yang menutup celah yang tidak disentuh
      `backup-postgres.sh`: `scripts/backup-storage.sh` (arsip terenkripsi
      berisi metadata skema `storage`, manifest, dan byte objek),
      `scripts/restore-storage.sh` (verifikasi tanpa jaringan sebagai default,
      upload hanya ke target yang diizinkan), dan
      `scripts/restore-storage-drill.sh` (drill terisolasi tanpa jaringan).
- [x] Naikkan pin image di `Dockerfile.coolify` ke `sha-0e25470` supaya
      production tidak tertinggal 7 commit, termasuk perbaikan `search_path`
      helper aktor audit yang masuk lewat PR #122.
- [x] Masukkan seluruh variabel `STORAGE_` dan `STORAGE_RESTORE_` ke
      `.env.example` supaya runbook dan environment tidak berbeda.
- [x] Tutup jalur perubahan data dari deployment pratinjau. Deployment pratinjau
      Vercel terbukti memakai database production beserta service role key,
      jadi setiap Server Action mutasi yang dijalankan di sana akan mengubah
      data toko yang sebenarnya. `src/lib/deployment.ts` membaca penanda
      platform (`VERCEL_ENV`, `COOLIFY_BRANCH`) dan menolak mutasi di
      pratinjau; `tests/write-gate.test.ts` memindai source dan mewajibkan
      setiap aksi mutasi memanggil gerbang itu.
- [x] Jadikan `database-tests` required check di branch protection `main`.
      Sebelumnya hanya `verify` dan `security`, jadi PR yang merusakkan test
      database masih bisa merge. Filter path di workflow dihapus lebih dulu,
      karena required check yang tidak pernah dilaporkan akan memblokir merge
      selamanya.

Selesai pada sesi 17 Oktober 2026:

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
- [x] `bun run test`: 777 lulus, 14 dilewati, 0 gagal dari 791 tes.
- [x] `bun run build` lulus; `next.config.ts` berjalan dalam mode ESM.
- [x] `bunx drizzle-kit check` lulus dan memuat `drizzle.config.ts` dalam mode
  ESM.
- [x] `git diff --check` bersih; hasil lengkap dicatat di handoff. Full suite
  dijalankan di luar sandbox karena beberapa test memerlukan child process dan
  listener localhost.
- [x] `node_modules` disinkronkan ulang dengan lockfile hasil merge dependabot
  (`next` 16.4.2, `ai` 7.0.142, `eslint-config-next` 16.4.2). Tanpa ini
  typecheck tetap hijau tetapi menguji versi yang berbeda dari yang di-deploy.

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

- [x] Jalankan `bun run smoke:deployment -- https://atcell.my.id` sebagai
  pemeriksaan read-only setelah deploy. Hasil 24 Oktober 2026: 6/6 PASS
  (`live`, `ready`, `public-home`, `public-catalog`, `public-tracking`,
  `portal-login`). Jangan memakai production untuk eksperimen yang mengubah
  data; skrip ini hanya membaca.
- [ ] Periksa README dan gambar arsitektur pada aplikasi GitHub mobile setelah
  perubahan dokumentasi dipublikasikan.
- [x] Cek GitHub PR terbaru lewat `gh` dari terminal yang punya akses jaringan.
  Hasil 24 Oktober 2026: tidak ada PR terbuka setelah PR #132 merge.

### Prioritas 5: langkah yang hanya bisa dikerjakan owner

Off-site masih tidak jalan, dan itu bukan kode yang salah: `backup-offsite.sh`
dan `backup-storage.sh` sama-sama keluar bukan-nol dengan pesan jelas karena
`/root/.atcell-offsite.env` tidak ada, `rclone` tidak terpasang, dan
`rclone.conf` tidak ada. Perilaku itu memang yang dikehendaki: cadangan yang
diam-diam tidak jalan lebih berbahaya daripada tidak ada.

Langkah lengkap ada di [`docs/OFFSITE-BACKUP-SETUP.md`](../OFFSITE-BACKUP-SETUP.md),
dari passphrase sampai pembuktian restore. Ringkasnya:

- [ ] Buat passphrase enkripsi dan simpan di file 0600
  (`/root/.atcell-offsite.env`, variabel `OFFSITE_PASSPHRASE_FILE`).
- [ ] Siapkan tujuan upload: pasang `rclone` lalu `rclone config`, atau
  sediakan endpoint HTTP PUT yang menerima bearer token
  (`OFFSITE_RCLONE_REMOTE` atau `OFFSITE_PUT_URL`).
- [ ] Setelah salah satu terpenuhi, jalankan `atcell-offsite` satu kali
  manual dan pastikan file `.enc` benar-benar ada di sisi jauh.
- [ ] Isi `STORAGE_*` di environment aplikasi, lalu jalankan
  `restore:storage-drill` satu kali untuk membuktikan arsip bisa dibuka.
- [ ] Baru setelah tujuan off-site ada, jadwalkan `backup-storage.sh` di cron
  harian. Menjadwalkannya sekarang hanya menambah satu job yang gagal setiap
  malam tanpa ada yang bisa memperbaikinya.
- [ ] Buat DNS untuk `coolify.atcell.my.id`. Selama belum ada, panel Coolify
  hanya bisa dijangkau lewat SSH tunnel, itu memang perilaku yang dimaksud.
- [ ] Arahkan deployment pratinjau Vercel ke project Supabase terpisah, lalu
  cabut `DATABASE_URL` dan `SUPABASE_SECRET_KEY` production dari environment
  preview. Gerbang tulis di repo sudah menutup jalur perubahan data, tapi
  pratinjau masih bisa MEMBACA data production sampai langkah ini selesai.
  Detailnya di `docs/DEPLOYMENT-REDUNDANCY.md` bagian "Deployment pratinjau".

### Prioritas 6: data bisnis yang masih di bawah target

Angka berikut hasil pembacaan langsung ke database production pada 24 Oktober
2026, jadi bukan data tebakan:

- [ ] Katalog sudah berisi 25 produk aktif, tepat 5 model per merek, tetapi
  stok tersedia masih 7 unit asli. Dari 14 baris `inventory_units`, 10 adalah
  unit asli (7 `available`, 2 `sold`, 1 `in_service`) dan 4 adalah unit demo
  bertanda `is_demo` yang tidak boleh dihitung sebagai stok jual.
- [ ] Sebagian besar model katalog baru belum punya unit karena IMEI asli belum
  diberikan owner. Jangan mengarang IMEI; tambahkan unit lewat registrasi
  inventaris setelah IMEI asli tersedia.
- [ ] Etalase publik (`v_public_inventory`) hanya memuat 7 baris dari 25 model.
  Kalau target katalog lebih lebar, unitnya yang harus ditambah, bukan baris
  katalognya.
- [ ] Lima belas model baru masih memakai label "Foto menyusul"; ganti saat foto
  resmi tersedia.

## Langkah awal agen berikutnya

1. Jalankan `git status --short --branch` dan tinjau semua diff lokal sebelum
   mengedit.
2. Baca `AGENTS.md` dan `docs/agents/project-map.md`.
3. Jalankan pemeriksaan prioritas 1; jika gagal, perbaiki penyebabnya dan
   perbarui bagian status di roadmap serta
   `review-handoff-2026-10-20.md`.
4. Kerjakan satu item berikutnya pada satu waktu dan pertahankan kontrak
   akses customer/staf.
