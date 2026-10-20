# Handoff Review: At Cell, 20 Oktober 2026

Dokumen ini melanjutkan
[`review-handoff-2026-10-17.md`](review-handoff-2026-10-17.md). Ia mencatat
apa yang berubah, apa yang sudah dibuktikan, dan apa yang masih butuh
tindakan manusia. Semua angka di sini hasil pembacaan nyata terhadap
environment, bukan tebakan.

## Where things stand

| Hal | Nilai |
|---|---|
| Branch | `chore/atcell-hardening-2026-10-19` |
| Base | `0e25470` (`main` saat audit, sudah sama dengan `origin/main`) |
| Commit di branch | `ae659f1` (refactor portal, direbase) plus commit sesi ini |
| Pull request | Dibuka dan dibiarkan terbuka untuk review AI lain. Tidak di-merge sendiri. |
| Branch protection `main` | Aktif: wajib PR, wajib check `verify` dan `security`, `strict: true`, `enforce_admins: false` supaya owner tidak terkunci |
| PR terbuka lain | Tidak ada. Issue terbuka: tidak ada. |

## Yang diperbaiki

### 1. Token Telegram tidak lagi jadi argumen proses

`scripts/atcell-watchdog.sh` menaruh `TELEGRAM_BOT_TOKEN` di URL argumen
`curl`. Argumen proses terbaca lewat `/proc/<pid>/cmdline` dan bisa ikut
tercatat process monitor atau audit. Sekarang URL dibaca curl dari stdin lewat
`--config -`, jadi token hanya melewati pipe.

Tiga hal diuji, semuanya di `tests/watchdog-durability.test.ts`:

- Regresi `token Telegram tidak pernah menjadi argumen proses` ditulis lebih
  dulu dan gagal dengan pesan yang memuat token di argv.
- `token Telegram tidak ikut bocor ke log saat pengiriman gagal` memastikan
  pencatatan kegagalan tidak memuat token.
- Notifikasi yang gagal tidak lagi ditelan diam-diam. Versi lama tidak
  memakai `--fail`, jadi Telegram yang menjawab HTTP 4xx tetap terlihat sukses
  dan operator mengira alerting hidup sementara tidak ada yang masuk. Sekarang
  kegagalan dicatat lewat `catat warning`.

Script yang sama sudah dipasang di host production
(`/opt/atcell/scripts/atcell-watchdog.sh`, salinan lama disimpan berdampingan
sebagai `.bak-20261019`). Hash hasil install sama dengan hash berkas repo, dan
satu kali jalan dengan state sementara keluar 0 dengan `/api/health/ready`
200.

### 2. Backup objek Storage

`backup-postgres.sh` hanya menumpahkan `public`, `private`, dan `auth`, jadi
foto katalog, foto servis, dan foto trade-in tidak pernah ikut. Tiga skrip
baru menutup celah itu:

| Skrip | Fungsi |
|---|---|
| `scripts/backup-storage.sh` | Mengambil metadata skema `storage` (`pg_dump --schema=storage`), mengunduh byte tiap objek, menulis `manifest.json`, mengemas semuanya ke satu arsip terenkripsi AES-256-CBC PBKDF2 dengan sidecar `.sha256` |
| `scripts/restore-storage.sh` | Default-nya verifikasi tanpa jaringan: checksum sidecar, dekripsi, keamanan anggota tar, kecocokan daftar berkas dengan manifest, ukuran, dan SHA-256 tiap objek |
| `scripts/restore-storage-drill.sh` | Memilih arsip terbaru, memeriksa sidecar, menjalankan mode verifikasi. Tidak butuh URL, key, atau database |

Yang dijaga di desainnya:

- Tidak ada package baru. Hanya `curl`, `jq`, `tar`, `openssl`, `sha256sum`,
  dan `docker` untuk menjalankan `pg_dump` di dalam `postgres:17-alpine`.
- Passphrase dan key masuk lewat file atau environment, tidak pernah argv curl
  dan tidak pernah log.
- Arsip gagal tertutup. Tanpa passphrase, tanpa key, tanpa tujuan off-site,
  atau dengan metadata dump yang tidak memuat `storage.buckets` dan
  `storage.objects`, script keluar bukan-nol dan tidak meninggalkan arsip
  terbuka.
- Bucket kosong bukan kegagalan. Yang menggagalkan hanya keadaan seluruh
  bucket kosong tanpa sengaja, karena itu arsip tanpa satu pun byte.
- Nama objek yang mencurigakan ditolak, termasuk traversal dan karakter
  kontrol, supaya prefix BFS tidak berputar tanpa akhir dan arsip tidak bisa
  keluar dari jalur aman saat restore.
- Restore bersifat additive. Tidak ada `delete`, dan objek di luar arsip
  dibiarkan.
- Guard target: host yang sama dengan sumber ditolak kecuali
  `STORAGE_RESTORE_ALLOW_SAME_HOST=YES`, host selain localhost harus
  terdaftar di `STORAGE_RESTORE_ALLOWED_HOSTS`, dan bucket yang sudah ada
  ditolak kecuali `STORAGE_RESTORE_ALLOW_EXISTING_BUCKETS=YES`.
- Upload hanya terjadi kalau `ALLOW_STORAGE_RESTORE=YES` dan
  `STORAGE_RESTORE_URL` serta `STORAGE_RESTORE_DATABASE_URL` diisi. Setelah
  upload, hash hasil unduhan dibandingkan dengan hash di manifest, karena
  HTTP 200 belum tentu berarti byte yang benar tersimpan.

Bukti jalan terhadap Storage production sungguhan, bukan hanya terhadap
server tiruan di test. Dijalankan di host production dengan passphrase dan
token tujuan sekali pakai:

- 38 objek terunduh dari bucket `product-images`, total 5.554.898 byte.
- Bucket `service-photos` dan `trade-in-photos` kosong. Itu memang konsisten
  dengan data: kedua tiket servis dan kedua trade-in punya `photo_urls` kosong,
  dan `storage.objects` hanya berisi 38 baris yang semuanya di
  `product-images`. Belum ada foto pelanggan yang masuk.
- Arsip terenkripsi 5.734.432 byte, dibaca balik dengan hash sama aslinya.
- Salinan hasil kirim cocok dengan arsip lokal, dan drill verifikasi lulus:
  38 objek, 3 bucket, checksum dan hash objek cocok.
- Passphrase salah tidak bisa membuka arsip.
- Arsip sekali pakai, passphrase sekali pakai, dan server PUT lokal semuanya
  dibuang setelah pembuktian. Konfigurasi off-site yang sebenarnya tetap
  langkah owner.

### 3. Pin image deployment

`Dockerfile.coolify` masih menunjuk `sha-07ad7f7`, yaitu 7 commit di belakang
`main`. Produksi karena itu tidak menjalankan perbaikan `search_path` helper
aktor audit yang masuk lewat PR #122. Pin dinaikkan ke `sha-0e25470`; tag itu
sudah ada di GHCR dan workflow Build Image sukses di commit tersebut.

### 4. Dokumentasi environment

Seluruh variabel `STORAGE_` dan `STORAGE_RESTORE_` sekarang ada di
`.env.example`. Sebelumnya runbook menyebut variabel lengkap ada di sana, padahal
belum ada satupun.

## Verifikasi

Semua dijalankan di `chore/atcell-hardening-2026-10-19` setelah rebase ke
`0e25470`:

| Pemeriksaan | Hasil |
|---|---|
| `bunx tsc --noEmit` | bersih |
| `bun run lint` | bersih, tanpa warning |
| `bun run test` | 791 tes: 777 lulus, 14 dilewati, 0 gagal |
| `bun run build` | sukses |
| `git diff --check` | bersih |
| `node_modules` | disinkronkan ulang dengan lockfile (`next` 16.4.2, `ai` 7.0.142, `eslint-config-next` 16.4.2) |

Catatan soal sinkronisasi ini: sebelum `bun install` ulang, `node_modules`
masih memegang `next` 16.4.1 sementara lockfile sudah 16.4.2. Typecheck tetap
hijau, jadi dia menguji versi yang berbeda dari yang akan di-deploy. Kalau
lokal dan CI terlihat berbeda tanpa sebab, cek ini duluan.

Di luar repo, pada host production:

- `https://atcell.my.id/api/health/ready` menjawab 200 dengan
  `{"status":"ready"}` dan seluruh cek `true`.
- Hostname Coolify lama menjawab 503, bukan halaman login.
- Panel lewat SSH tunnel menjawab 200 dengan `<title>Coolify</title>`.
- Drill restore database terakhir (18 Oktober 2026, 04.17 waktu host) lulus:
  6 pemeriksaan, 7 akun auth asli, container drill dibuang.

## Keadaan nyata data produksi

Pembacaan langsung ke database production, 20 Oktober 2026:

- 10 unit fisik, 10 IMEI unik. Status: 7 `available`, 2 `sold`, 1 `in_service`.
- Tersedia per merek: Apple 1, Oppo 1, Samsung 2, Vivo 1, Xiaomi 2.
- 10 produk katalog aktif. 5 di antaranya tidak punya satu pun unit tersedia,
  jadi etalase publik (`v_public_inventory`) hanya memuat 7 baris.
- 2 tiket servis: 1 `diagnosing`, 1 `testing`.
- 2 transaksi, total penerimaan 12.498.000.
- 7 profil: 1 admin, 1 sales, 2 technician, 3 customer.
- Bucket privat `service-photos` dan `trade-in-photos` belum berisi apa pun.
  Kedua tiket servis dan kedua trade-in punya `photo_urls` kosong, jadi belum
  ada foto pelanggan yang masuk ke storage.

Kesimpulan yang boleh dan tidak boleh diambil dari angka ini. Tidak ada satu
pun unit, IMEI, stok, atau transaksi yang boleh dibuat untuk memenuhi target.
Kalau target 5 unit per merek masih berlaku, yang perlu ditambah unitnya.

## Status rotasi secret

Diverifikasi mengikuti langkah di `docs/SECRET-ROTATION.md`:

| Pemeriksaan | Hasil |
|---|---|
| Secret bocor di riwayat repository | Aman untuk semua yang diuji |
| Connection string dengan password di riwayat | Temuan palsu: DSN tiruan di fixture tes, dan commit-nya ada di ref checkpoint lokal T3, bukan di `main` |
| Secret di source yang sedang jalan | Bersih |
| Izin berkas `~/.secrets` | 600 |
| Health aplikasi | `ready` |
| `WIREGUARD_PRIVATE_KEY` diwarisi ke semua proses | Tidak ada, sesuai runbook |

Tambahan dari host production: `SUPABASE_SECRET_KEY` dan
`SUPABASE_SERVICE_ROLE_KEY` di container aplikasi bernilai sama (sidik jari
identik), jadi tidak ada risiko kunci lama diam-diam masih dipakai.
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` juga sama dengan versi `ANON_KEY` yang
lama. Tidak ada variabel environment aplikasi yang masih berisi pola
placeholder.

## Yang masih jadi penghalang

Off-site belum jalan, dan penyebabnya konfigurasi, bukan kode. Yang terbukti:

- `/root/.atcell-offsite.env` tidak ada.
- `rclone` tidak terpasang dan `rclone.conf` tidak ada.
- Log `/var/log/atcell-offsite.log` shows `GAGAL: OFFSITE belum dikonfigurasi`
  pada dua malam terakhir, dan exit code-nya bukan-nol. Perilaku itu memang
  yang dikehendaki: cadangan yang diam-diam tidak jalan lebih berbahaya
  daripada tidak ada.

Langkah yang harus dikerjakan owner ada di `docs/agents/roadmap.md` bagian
"Prioritas 5". Ringkasnya: buat passphrase di file 0600, siapkan tujuan
upload (`rclone` atau HTTP PUT), jalankan satu kali manual dan pastikan file
`.enc` benar-benar ada di sisi jauh, baru jadwalkan cron Storage.

Script Storage sudah terpasang di host production, tapi sengaja belum
dijadwalkan. Menjadwalkannya sekarang hanya menambah satu job yang gagal
setiap malam tanpa ada yang bisa memperbaikinya.

## Untuk sesi berikutnya

1. `git status --short --branch`, lalu baca `AGENTS.md`,
   `docs/agents/project-map.md`, dan `docs/agents/roadmap.md`.
2. Jangan mengira perubahan di branch ini sudah ada di `main`. Branch-nya belum
   di-merge.
3. Kalau menjalankan `bun run test` di luar repo, pastikan `node_modules` sudah
   sesuai lockfile lebih dulu.
4. Pemeriksaan environment yang masih manual ada di roadmap bagian "Prioritas
   4" sampai "Prioritas 6".
