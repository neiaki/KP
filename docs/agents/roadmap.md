# Roadmap Perapihan Repo At Cell

Dokumen ini adalah daftar kerja untuk sesi berikutnya. Baca bersama
[`project-map.md`](project-map.md), `AGENTS.md`, dan status Git; jangan
menganggap perubahan lokal sudah masuk ke branch remote.

## Status terbaru

**Diperbarui:** 24 Oktober 2026
**Baseline kode:** `001b6a8` (`main`, merge PR #159; pin image yang memuat
patch cookie httpOnly + secure dan catatan gambar GSMArena)
**Baseline rilis:** `001b6a8` (`main`, merge PR #159; production menjalankan
image `sha-001b6a8` yang memuat patch cookie httpOnly + secure di production
(PR #158), health 200, dan 14 model katalog berfoto render GSMArena)
**Cabang kerja:** `main` bersih; tidak ada perubahan kode yang menunggu review.
**Perubahan roadmap ini:** akun pelanggan, checkout POS, data demo bertanda,
dan katalog lima model per merek sudah merge lewat PR #129. PR #130 menaikkan
pin ke `53856b4` dan production menjalankan image itu. PR #134 menambahkan
badge Demo dan tes sumber data tambahan, lalu merge sebagai `7d7f0d7`. PR #135
mem-pin image `sha-7d7f0d7`; production sudah dideploy dan menjalankan revisi
itu. Sesi 24 Oktober menambahkan PR #136 sampai #143 (fitur ganti kata sandi
pelanggan, rebranding logo, perbaikan security check, pembersihan VPS, dan
perbaikan filter merek katalog yang ditemukan saat testing production).

Rilis 24 Oktober 2026 (selesai):

- [x] Merge `chore/pin-image-7d7f0d7` (commit `49824a5`) ke `main` lewat PR
      #135, merge commit `105a61a`.
- [x] Deploy Coolify dengan `git_commit_sha` `105a61a`. Container baru memakai
      image `sha-7d7f0d7` (label revisi
      `7d7f0d7e3e809b28719aecc298def2959ac03a9a`), health `200`, dan CSP ada.
- [x] Login `ega` menunjukkan 2 badge `Demo` (satu per faktur), riwayat
      pembelian tetap tampil, email sintetis tidak bocor ke HTML, dan nama
      pelanggan demo lain tidak muncul. `/portal/customers` tetap menolak
      customer.
- [x] `bun run smoke:deployment -- https://atcell.my.id` lulus 6/6 pada
      24 Oktober 2026.
- [x] Ledger migrasi production 7/7 cocok setelah deploy.
- [x] Query production read-only tidak berubah: 25 produk aktif, 5 model per
      merek, 10 unit asli (7 `available`), 4 unit demo dengan `imei = NULL`,
      `v_public_inventory` 7 baris, 3 profil demo, dan 4 transaksi demo
      terbagi 2/1/1.

Sesi 24 Oktober 2026 (perbaikan kedua, belum di-commit): audit dua-aris atas
diff lokal menghasilkan perbaikan berikut, semuanya sudah diverifikasi
(`bunx tsc --noEmit`, `bun run lint`, 830 tes: 816 lulus / 14 dilewati / 0
gagal, `bun run build`, plus pemeriksaan browser dev server):

- [x] Admin dan sales bisa mengganti kata sandi pelanggan dari
      `/portal/customers`: Server Action `updateCustomerPassword` di
      `src/lib/actions/auth.ts` (gerbang tulis, peran admin/sales, kuota
      10x/menit per staf, target wajib profil customer sebelum menyentuh
      Auth), dispatcher `src/lib/store.ts` (mode demo no-op karena demo tidak
      menyimpan kata sandi), dan modal di halaman pelanggan yang menampilkan
      kata sandi baru sekali dengan tombol salin. Melihat kata sandi lama
      memang tidak mungkin: Supabase Auth hanya menyimpan hash.
- [x] Monogram teks "AT" diganti logo "Cellular Signal Tower & Apex" di SEMUA
      permukaan: navbar publik, header portal, demo role bar, sidebar portal,
      panel login (versi inverse berlatar biru), widget chat, ikon PWA
      (192/512/maskable), apple-touch-icon, favicon, dan gambar Open Graph.
      Geometri glyph bersumber dari `src/lib/brand-logo.tsx` yang dipanggil
      sebagai fungsi di route next/og karena satori hanya menerima intrinsic
      elements.
- [x] Aset brand dirapikan: gradient `#145CF5/#083EB8` (warna di luar token)
      diganti flat aksen `#0B4ED8`, `@import` Google Fonts dihapus dari
      `logo-full.svg` (tidak berfungsi di `<img>` dan melanggar aturan font),
      dan aset `logo-icon-inverse.svg` ditambahkan untuk latar aksen.
- [x] Folder eksplorasi `logo/` (lima opsi logo) dihapus dari disk; hanya
      opsi terpilih yang tersisa di `public/brand/`.
- [x] Perubahan di-commit dalam tiga commit (`ecff98a` fitur, `66e0a41`
      branding, `9847561` docs) dan di-push ke
      `docs/status-rilis-2026-10-24`.
- [x] VPS production dibersihkan lewat SSH (`vpsubuntu`): 3 image At Cell
      lama (~5.1GB, tag asli masih ada di GHCR), 4 image Coolify versi lama
      (~1.7GB), 449MB dangling image, 116MB journal lama (dis vacuum ke 7
      hari), dan 785MB sisa di `/home/ubuntu` (`build-seed` clone lama tanpa
      `.git` diarsipkan dulu ke
      `/data/backups/build-seed-arsip-2026-10-24.tar.gz` sebelum dihapus,
      `cloudflared.old.new` binary lama, build dir kosong). Disk turun 60%
      menjadi 46% (23G menjadi 17G). Produksi tetap sehat: health 200,
      backup harian dan standby-sync jalan, container log sudah berbatas
      10MB x 3 via daemon.json. Image rollback `caee6f22`, image
      `coolify-realtime`, dan `buildkit` sengaja dipertahankan.

Rilis 24 Oktober 2026 (perbaikan ketiga, ter-deploy):

- [x] PR #136 (fitur + branding), #137/#138 (security check untuk semua PR
      beserta penyesuaian kontrak tesnya), #139 (dokumentasi use case dan
      T-7), dan #140 (pin image `sha-002ff26`) di-merge ke `main`; merge
      commit pin `0f50449`.
- [x] Cacat CI ditemukan dan diperbaiki: trigger `pull_request` di
      `security.yml` punya filter path sehingga check "security" yang wajib
      tidak pernah dilaporkan untuk PR biasa dan merge terblokir; kini
      security check berjalan di semua PR tanpa dispatch manual. Cacat yang
      sama pernah dihilangkan dari database-tests pada 20 Oktober.
- [x] Deploy Coolify: `git_commit_sha` aplikasi diperbarui ke `0f50449` lalu
      deployment dipicu lewat API Coolify
      (deployment `ttp9ac425hxzvoxs8ccxzaxb`, finished). Container menjalankan
      image `sha-0f50449`, health `200`, header CSP ada, logo baru tampil di
      HTML, dan `bun run smoke:deployment -- https://atcell.my.id` lulus 6/6.
      Token API Coolify sementara yang dipakai untuk deploy sudah dicabut dan
      file-nya dihapus.
- [x] Tes `backup-storage.test.ts` ("metadata via docker") terbukti flaky di
      runner GitHub Actions: gagal sekali pada build pertama dan lulus pada
      re-run yang sama tanpa perubahan kode (stderr verifikasi arsip ditelan
      `2>/dev/null` di `backup-storage.sh`, sehingga penyebab aslinya tidak
      terlihat). Bukan regresi dari perubahan ini; kalau muncul lagi, re-run
      dulu, lalu selidiki dengan mengubah skrip agar menampilkan stderr.

Rilis 24 Oktober 2026 (perbaikan keempat, ter-deploy):

- [x] Testing production menyeluruh (read-only) menemukan satu bug nyata:
      `/id/catalog?brand=apple` huruf kecil diabaikan diam-diam (27 kartu semua
      merek) karena pencocokan case-sensitive, sementara `?brand=Apple`
      bekerja (5 kartu Apple). Diperbaiki lewat PR #142 dengan helper
      `brandFromUrl` di `src/lib/shop.ts` plus tes regresi perilaku; merge
      commit `2f231dc`, dipin lewat PR #143 (`54b653e`), dideploy, dan
      diverifikasi di production: `?brand=apple` kini menyaring (0 kartu
      merek lain), health 200, smoke 6/6 (tracking sempat fail sekali karena
      jaringan runner; dua re-run PASS).
- [x] Temuan data untuk owner/staf (bukan kode): katalog memuat model dengan
      nama ganda "Xiaomi Xiaomi 14T 12/256GB" karena model menyimpan prefix
      merek. Perbaikannya lewat `/portal/products` (edit nama model), bukan
      lewat kode.

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
- [x] Badge `Demo` di riwayat pembelian dan helper `loadAdditionalSource`
      ditambahkan lewat PR #134 (`5690b96`, merge `7d7f0d7`), lalu live di
      production lewat deploy pin PR #135 (`105a61a`).
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
- [x] `npm run test`: 811 lulus, 14 dilewati, 0 gagal dari 825 tes
      (dijalankan 24 Oktober 2026 di `7d7f0d7`).
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

- [x] Pertimbangkan memisahkan pembacaan query Supabase dari
  `getPortalSnapshot`, setelah jalur mapping saat ini tervalidasi. Ditinjau
  24 Oktober 2026: pemisahan belum dibutuhkan; jalur mapping sudah punya tes
  perilaku dan belum ada sumber data kedua yang menuntut seam baru.
- [x] Tes label unit trade-in ada di `tests/unit-label-nota.test.ts`.
- [x] Pembatasan hasil query customer ada di `tests/portal-snapshot.test.ts`;
  query transaksi dan tiket juga dibatasi `customer_id` di `portal.ts`.
- [x] Tes kegagalan sumber data tambahan ada di
  `tests/additional-source.test.ts`. Helper `loadAdditionalSource` sekarang
  menangani hasil sukses, error terstruktur, dan loader yang melempar error.
  Query inti tetap memakai `Promise.all` dan sengaja menggagalkan seluruh
  snapshot kalau salah satu query inti gagal, karena snapshot tanpa data inti
  tidak boleh ditampilkan sebagian. Ditinjau 24 Oktober 2026.
- [x] Pertahankan prinsip bahwa query customer dibatasi di sisi server; jangan
  hanya menyaring hasil setelah data staf terbaca. Dikunci oleh tes snapshot
  customer yang memeriksa profil, transaksi, dan email sintetis.

### Prioritas 3: kurangi tes yang sensitif terhadap bentuk source

- [x] Tinjau sisa assertion source di
  `tests/service-ticket-list-invalidation.test.ts` dan
  `tests/locale-switch-refetch.test.ts`. Ditinjau 24 Oktober 2026: assertion
  dipertahankan karena `src/lib/store.ts` menarik `next/navigation` dan React,
  jadi tidak bisa diimpor runner Node; source assertion adalah satu-satunya
  penjaga wiring yang tersedia.
- [x] Ganti hanya assertion yang dapat dipindah ke helper/perilaku teramati;
  pertahankan pemeriksaan source bila memang mengunci wiring atau kebijakan
  repository yang belum punya seam runtime. Tidak ada assertion yang diganti
  pada tinjauan ini; alasannya tercatat di komentar kedua berkas tes.

### Prioritas 4: pemeriksaan manual yang memerlukan environment

- [x] Jalankan `bun run smoke:deployment -- https://atcell.my.id` sebagai
  pemeriksaan read-only setelah deploy. Hasil 24 Oktober 2026: 6/6 PASS
  (`live`, `ready`, `public-home`, `public-catalog`, `public-tracking`,
  `portal-login`). Jangan memakai production untuk eksperimen yang mengubah
  data; skrip ini hanya membaca.
- [x] Periksa README dan gambar arsitektur pada GitHub web dengan viewport
  mobile 390x844. Hasil 24 Oktober 2026: gambar `arsitektur-alur.png` terlihat
  dan berada di atas blok Mermaid. Aplikasi GitHub native tidak bisa dijalankan
  dari environment ini, jadi pengecekan native tetap opsional untuk owner.
- [x] Cek GitHub PR terbaru lewat API publik dari terminal yang punya akses
  jaringan. Hasil 24 Oktober 2026: PR #135 sudah merge ke `main` dan tidak ada
  PR terbuka yang menunggu review.

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

Rilis 24 Oktober 2026 (perbaikan kelima, ter-deploy):

- [x] Etalase & Harga (`/portal/listing`) untuk admin dan sales: memperbarui
      harga acuan dan URL foto resmi tiap model katalog, termasuk model yang
      belum menerima unit. Action `updateProductListing` hanya menulis dua
      kolom itu; identitas katalog tetap Master Produk (admin). Policy RLS
      `products_sales_update` untuk UPDATE sales diterapkan ke database
      production dan tercatat di ledger + snapshot CI (PR #147, #148; pelajaran:
      migration baru wajib diterapkan ke database dan snapshot ledger
      diperbarui sebelum merge supaya database-tests tidak merah).
- [x] Halaman utama membatasi kartu "Belum ada unit" jadi satu per merek
      (total lima) lewat helper `limitOnePerBrand`; daftar lengkap tetap ada
      di halaman katalog (PR #150, #151). Terverifikasi live: landing memuat
      tepat 5 badge, smoke 6/6.

Rilis 24 Oktober 2026 (perbaikan keenam, data production):

- [x] 14 model katalog kini memakai render resmi dari GSMArena yang relevan
      per model, sesuai permintaan pemilik: iPhone 14 Plus/15/16, Oppo
      A79/Find X8/Reno 12, Samsung A35/Z Flip5, Vivo V40/X100/Y28, Xiaomi
      14T/POCO X6 Pro/Redmi Note 13 Pro 5G. Setiap gambar diverifikasi visual
      cocok dengan modelnya sebelum dipasang; kandidat salah model (S24 Ultra
      untuk produk Galaxy S24, Vivo Y28 generasi 2014) dibuang.
- [x] Dua model tetap tanpa foto karena bigpic GSMArena tidak tersedia untuk
      slug-nya: Oppo Reno 12 Pro 5G dan Samsung Galaxy S24. Keduanya menampilkan
      fallback logo merek; owner bisa menambahkan foto resminya lewat Master
      Produk atau Etalase & Harga kapan pun, fallback otomatis tergantikan.
- [x] Enam file yang menimpa nama file lama diganti suffix `-gsm` supaya cache
      CDN Storage tidak menyajikan render lama; kueri baca produksi
      memverifikasi file yang dilayani adalah render GSMArena.
- [x] Bug data ditemukan dan diperbaiki saat penautan: percobaan pertama
      menulis `official_images` berisi string kosong `{""}` karena variabel env
      tidak ter-export ke container psql, membuat semua kartu kembali ke
      fallback. Perbaikannya menulis ulang 12 baris dengan URL lengkap dan
      terverifikasi via kueri baca.
