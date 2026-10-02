# Pengeras VPS At Cell

Dokumen ini adalah runbook operasional untuk host production At Cell di Coolify.
Isinya catatan hasil audit read-only terhadap satu VPS, disusul langkah
perbaikan yang harus direview manusia sebelum dijalankan.

Tidak ada perintah di dokumen ini yang boleh dijalankan otomatis, dipaste
buta, atau dimasukkan ke cron tanpa dibaca dulu. Setiap perintah yang merusak
ditandai eksplisit. Tidak ada nilai secret di dokumen ini; semua variabel
disebut berdasarkan namanya saja.

Seskup dokumen ini hanya host VPS. Supabase, DNS, dan konfigurasi aplikasi di
dalam image tidak dibahas di sini. Untuk migrasi database dan urutan rilis, lihat
`docs/DEPLOYMENT-REDUNDANCY.md`. Untuk penggantian secret, lihat
`docs/SECRET-ROTATION.md`.

## Gambaran host

Fakta berikut berasal dari audit read-only pada satu waktu, dan beberapa bisa
berubah. Semua di bawah ini harus diverifikasi ulang sebelum dipakai sebagai
dasar keputusan.

| Komponen | Nilai |
|----------|-------|
| OS | Ubuntu 26.04.1 LTS, kernel 7.0.0-34 |
| Bentuk | KVM VM, 2 vCPU Intel Xeon Platinum 8255C |
| RAM | 1,9 GiB dengan 465 MiB swap |
| Disk | 39 GB, 37% terpakai |
| Supervisor aplikasi | Docker, bukan systemd dan bukan PM2 |
| Aplikasi | satu container `next start`, Next.js 16.3.5 di Node 22.23.3 |
| TLS dan reverse proxy | Traefik v3.6 di container `coolify-proxy`, port 80, 443, 443-udp |
| Firewall | `ufw` aktif, default deny incoming |
| Batas resource container | tidak ada sama sekali (`mem_limit 0`, `cpus 0.0`) |
| Sumber image aplikasi | dibangun di GitHub Actions, ditarik dari GHCR |
| Kode sumber di host | tidak ada, hanya `.env` dan `docker-compose.yaml` |

Host yang sama juga menjalankan control-plane Postgres, Redis, PHP, dan
BuildKit milik Coolify. Semua berebut memori yang sama dengan aplikasi, dan tidak
ada container yang punya batas.

## Urutan risiko

| Urutan | Isu | Kenapa di urutan ini |
|--------|-----|---------------------|
| 1 | Panel Coolify terbuka ke internet | Satu login memberi akses ke seluruh deployment, env production, dan kunci Supabase. Kerusakan instan dan tidak ada jejak. |
| 2 | Tidak ada batas resource, sudah 6 OOM kill | Melayani pelanggan, tapi dampaknya menumpuk dan sering baru terasa jauh kemudian. |
| 3 | Traefik access logging | Sudah aktif per 2026-10-01, lihat bagian 3. |
| 4 | Rutinitas operasional | Bukan celah keamanan, tapi satu-satunya cara agar isu di atas ketahuan sebelum jadi besar. |
| 5 | SSH dijatahi brute-force | Area serang paling aktif di host ini, dan sudah pernah menyebabkan outage nyata. Sudah ditangani per 2026-10-01, lihat bagian 5. |

---

## 1. Panel Coolify terbuka ke internet

### Apa yang sebenarnya terbuka

Dua port di bawah diizinkan masuk dari mana saja oleh `ufw`, dengan aturan
yang sama dicerminkan untuk IPv6.

| Port | Milik | Fungsi |
|------|-------|--------|
| `8000/tcp` | Coolify | Panel admin: env, deploy, log, terminal container, DNS, resource |
| `6001:6002/tcp` | Coolify (Soketi) | Realtime/WebSocket untuk notifikasi dan progress build |

Audit mengonfirmasi keduanya benar-benar terjangkau dari internet publik:
`http://<IP>:8000/` mengembalikan 302 ke halaman login Coolify, dan
`http://<IP>:6001/` mengembalikan 200.

Kenapa ini lebih serius daripada port 22 yang juga terbuka: SSH memberi akses
shell ke satu mesin, sedangkan panel Coolify memberi kendali atas *seluruh*
deployment di host itu. Dari panel tersebut operator, atau penyerang yang sudah
login, bisa:

- membaca `DATABASE_URL`, `SUPABASE_SECRET_KEY`, dan service-role key production
  dari environment aplikasi tanpa perlu password database;
- memicu deploy image apa pun, jadi image attacker-controlled bisa jalan dengan
  env production;
- membuka terminal di dalam container, yang secara praktis setara akses root di
  host;
- mengubah resource, volume, dan jaringan Coolify;
- memicu build, dan build di host ini adalah alasan OOM kill nomor satu.

Panel ini juga biasanya punya satu-satunya tombol untuk membaca dan menulis
`acme.json`, jadi memblokir akses panel tanpa langkah lain bukan langkah
mandiri.

### Mengapa UFW saja tidak cukup

Audit menemukan sesuatu yang penting: port `8080` dan `8443` ter-*bind* ke
`0.0.0.0` di dalam host, tapi dari luar timeout. Artinya ada **Tencent Cloud
security group** di luar host yang juga ikut memfilter, dan filter itu tidak
terlihat di `ufw`.

Dua konsekuensi:

1. Menghapus aturan `ufw` saja tidak menjamin `8000` dan `6001` tertutup. Aturan
   itu bisa tetap terbuka lewat jalur lain, atau rule lain di security group
   bisa tetap mengizinkan.
2. Sebaliknya, satu perubahan di security group yang tidak disengaja
   cukup untuk mengekspos API Traefik, yang saat ini justru tersembunyi
   oleh aturannya.

### Lapis ketiga: penjaga Docker

Ada lapis ketiga yang tidak disinggung bagian ini, dan yang justru jadi
penghalang sebenarnya. Berkas `/usr/local/sbin/docker-dnat-guard.sh` menjaga
`8080`, `6001`, dan `6002` di rantai `DOCKER-USER`.

Dua hal yang sering bikin|rujukan|salah arah di sini:

- **Aturan `ufw` pada port Docker tidak pernah bekerja.** Port `8000` dipublish
  ke container lewat DNAT di `nat/PREROUTING`, jadi paketnya dibelokkan dan
  diteruskan, bukan diserahkan secara lokal. Paket seperti itu tidak pernah
  sampai ke rantai `INPUT` tempat `ufw` bekerja. Aturan `ufw allow 8000`
  terlihat bersih di `ufw status` tapi tidak memblokir apa pun.
- **Penjaga hanya governs trafik `-i eth0`.** Loopback, jadi SSH tunnel dari
  operator, dan trafik antar container tidak ikut tertutup. Itu disengaja,
  supaya panel tetap bisa dicapai tanpa membuka port publik.

Kalau setelah semua langkah di dokumen ini panel tidak bisa diakses dari
IP owner, periksa `DOCKER-USER` lebih dulu, bukan `ufw`. Jalur akses yang sah
dan langkah pemulihannya ada di [`COOLIFY-PANEL.md`](COOLIFY-PANEL.md).

Jadi host ini punya dua lapis filter yang tidak saling tahu statusnya. Kalau
hanya satu yang dirapikan, keadaan sebenarnya tetap tidak diketahui siapa pun.

### Menemukan nilai yang harus diisi sebelum pembatasan

Nilai IP ini harus ditemukan, bukan ditebak. Jalankan **dari komputer operator**,
bukan dari VPS, karena yang diizinkan adalah IP egress operator:

```bash
# Jalankan di mesin operator, bukan di VPS.
curl -sS https://api.ipify.org; echo
```

Kalau operator memakai IP dinamis dari ISP seluler, atau sering berpindah, lihat
bagian trade-off di bawah sebelum memutuskan.

Untuk melihat aturan yang benar-benar ada sekarang:

```bash
# Membaca saja, tidak mengubah apa pun.
sudo ufw status numbered
```

### Urutan yang benar: security group dulu, baru UFW

**Urutannya tidak boleh dibalik.** Alasannya:

Kalau aturan `ufw` untuk `8000` dan `6001` dihapus lebih dulu, dan ternyata
Anda sedang mengakses panel lewat IP yang tidak akan Anda izinkan nanti, Anda
kehilangan panel sebelum sempat membuktikan jalur baru Anda bekerja. Coolify
adalah satu-satunya tempat untuk melihat env production dan memicu deploy ulang, jadi
kehilangan panel bukan kehilangan satu halaman, tapi kehilangan kendali
atas aplikasi.

 Sebaliknya, kalau security group yang diubah lebih dulu, panel masih bisa
diakses selama UFW masih mengizinkan, sehingga ada dua jalur yang harus
berhasil sebelum Anda mematikan yang kedua. Urutan ini membuat kegagalan
ditemukan saat masih ada jalan keluar.

Perlu digarisbawahi: `ufw` tetap boleh diizinkan untuk `22/tcp` sepanjang
proses ini. Jangan pernah memutus SSH saat sedang mengunci panel.

### Langkah 1: batasi di Tencent Cloud security group

1. Buka konsol Tencent Cloud, lalu **Cloud Firewall** atau **Security Group**
   yang menempel pada instance VPS ini. Pastikan yang diedit adalah group
   yang benar, karena sering ada beberapa group dan hanya satu yang berlaku.
2. Cari aturan inbound yang mengizinkan `8000` dan `6001-6002` dari
   `0.0.0.0/0` dan, jika ada, dari `::/0`.
3. Ganti sumbernya menjadi `ADMIN_PUBLIC_IP/32`, dengan `ADMIN_PUBLIC_IP`
   diisi nilai yang dihasilkan perintah penemuan di atas. Untuk IPv6, pakai
   `/128` kalau memang ada.
4. **Jangan sentuh** aturan `22`, `80`, dan `443`. Menghapus `22` di sini
   berarti kehilangan akses SSH ke host, dan tidak ada perintah di dokumen ini
   yang bisa memulihkannya dari luar.
5. Simpan perubahan. Sebagian konsol menerapkan aturan dalam hitungan detik,
   sebagian perlu restart instance.

Periksa dulu apakah konsol Anda menyediakan ekspor aturan sebelum diedit, supaya
ada yang bisa dikembalikan kalau salah:

```bash
# Dijalankan dari konsol atau mesin operator, sesuai alat yang Anda pakai.
# Tujuannya menyalin daftar aturan sebelum diubah.
```

### Langkah 2: buktikan Anda belum terkunci, sebelum mematikan lapis kedua

Lakukan ini **sebelum** menyentuh `ufw`, dan jangan lewati:

1. Buka dua sesi SSH terpisah. Satu sesi dipakai untuk bekerja, satu lagi
   disimpan sebagai jaring pengaman. Kalau `tmux` atau `screen` tersedia,
   jalankan sesi kedua di dalamnya, karena sesi yangiputus bisa diputus juga
   oleh koneksi yang sama.
2. Dari mesin operator, buka panel Coolify di `https://<IP>:8000/` dan pastikan
   halaman login benar-benar muncul, bukan timeout.
3. Dari mesin operator, buka `https://<IP>:6001/` dan pastikan tidak timeout.
4. Pastikan health check aplikasi masih hijau dari luar:

   ```bash
   # Membaca saja.
   curl -sS -o /dev/null -w '%{http_code}\n' https://atcell.my.id/api/health/ready
   ```

Kalau salah satu dari tiga pemeriksaan di atas gagal, **berhenti di sini** dan
perbaiki security group dulu. Jangan lanjut ke langkah 3.

### Langkah 3: hapus aturan UFW

Perintah berikut **menghapus** dua aturan yang sedang mengizinkan siapa pun
mengakses panel. Setelah selesai, panel hanya bisa dijangkau dari IP yang sudah
diizinkan di security group.

```bash
# DESTRUKTIF untuk akses panel dari luar IP yang diizinkan.
# Baca nomor aturan dari "ufw status numbered" sebelumnya, jangan menebak.
sudo ufw delete <NOMOR_ATURAN_8000>
sudo ufw delete <NOMOR_ATURAN_6001_6002>
```

`NOMOR_ATURAN` sengaja tidak diisi dengan angka. Nomor aturan berubah setiap
kali `ufw` dinormalisasi, jadi angka hasil audit lama bisa saja sudah
menunjuk aturan yang salah. Ambil ulang nomornya tepat sebelum menghapus.

Setelah menghapus, verifikasi bahwa tidak ada aturan `8000` atau `6001` yang
masih terbuka dari `0.0.0.0/0`:

```bash
# Membaca saja.
sudo ufw status numbered
```

### Langkah 4: konfirmasi akhir

1. Dari mesin operator dengan IP yang diizinkan, panel Coolify masih bisa
   dibuka.
2. Dari jaringan lain, misalnya HP dengan jaringan seluler, `8000` dan `6001`
   harus timeout, bukan 302 dan bukan 200.
3. `https://atcell.my.id/` dan `https://login.atcell.my.id/` masih terbuka
   publik. Kalau salah satunya ikut tertutup, security group keliruRules dan
   harus dikoreksi.
4. `/api/health/ready` masih 200.

### Rollback

Kalau panel tidak bisa dibuka padahal seharusnya masih boleh:

```bash
# Mengembalikan akses panel dari mana saja, seperti kondisi sebelum.
# Jalankan HANYA kalau Anda masih punya sesi SSH yang hidup.
sudo ufw allow 8000/tcp comment 'panel coolify, sementara'
sudo ufw allow 6001:6002/tcp comment 'panel coolify realtime, sementara'
```

Rollback di sisi security group dilakukan lewat konsol: kembalikan sumber
`0.0.0.0/0` pada dua aturan tadi, atau tambahkan aturan sementara untuk IP
operator. Setelah panel bisa dibuka lagi, ulangi langkah 2 dan cari tahu
mengapa jalur yang diizinkan tidak bekerja, biasanya IP operator ternyata
berubah atau tidak cocok dengan yang didaftarkan.

### Trade-off yang harus disadari sebelum memutuskan

Membatasi `8000` ke IP sendiri berarti **Anda kehilangan panel kalau IP itu
berubah**. Penyebab yang paling sering adalah IP dinamis dari ISP seluler,
pergantian lokasi, atau pergantian perangkat. Pemulihan hanya lewat SSH, dan
dari SSH Anda tidak punya dashboard.

Pilihan yang tersedia, dan semuanya keputusan manusia:

| Pilihan | Keuntungan | Kerugian |
|---------|------------|----------|
| Batasi ke satu IP statis | Paparan kontrol plane mendekati nol | Kehilangan panel setiap IP berubah |
| Batasi ke dua IP, misalnya rumah dan kantor | Ada jalur cadangan | Dua permukaan yang harus dijaga |
| Batasi ke WireGuard yang sudah ada | Tidak bergantung pada IP publik | Coolify harus dijangkau lewat tunnel, bukan browser biasa |
| Tidak membatasi, perkuat akun saja | Tidak ada risiko terkunci | Panel tetap terbuka untuk semua orang di internet |

Kalau `SECRET-ROTATION.md` menyebut `COOLIFY_API_TOKEN` sebagai secret dengan
dampak terbesar, itu konsisten dengan kenyataan di atas: panel dan token itu
adalah dua jalan ke yang sama.

---

## 2. Tidak ada batas resource di host 1,9 GiB

### Keadaan sekarang

Audit menemukan `mem_limit 0`, `memswap_limit 0`, dan `cpus 0.0` pada container
aplikasi. Artinya Docker tidak pernah memberi tahu kernel "hapus proses ini kalau
kelamaan hafal". Kernel bebas membiarkan proses mana pun tumbuh sampai
seluruh host kehabisan memori, lalu memilih sendiri siapa yang dibunuh.

Enam OOM kill dalam 24 jam ke terakhir, termasuk satu `npm install` saat build
dan satu `next-server`. Bukti diambil dari `journalctl -k`, karena `dmesg`
dibatasi pada host ini.

### Batas resource bukan workaround OOM

Ini perlu ditegaskan karena mudah disalahpahami. Batas resource **bukan**
perbaikan OOM kill; ia hanya mengubah cara OOM kill terjadi.

- **Tanpa batas:** kernel kehabisan memori, lalu ia kill proses yang paling
  besar atau paling aktif. Proses yang mati bisa container aplikasi, bisa
  BuildKit, bisa Coolify, bisa apa saja. Tidak ada yang memberi tahu siapa
  penyebabnya, dan `RestartCount` pada container bisa tetap `0` karena
  kernel yang mematikan, bukan Docker.
- **Dengan batas:** kernel tidak pernah harus memilih. Docker yang menjalankan
  aplikasi memanggil OOM killer pada container itu sendiri, mencatat
  `OOMKilled=true` di status container, dan kelihatan jelas dari mana.

Jadi nilai tambah batas resource adalah atribusi, bukan pencegahan. Batas yang
terlalu kecil justru *membuat* kill lebih sering, hanya jadi terlihat.

### Mengukur dulu, baru menentukan angka

Angka di bawah adalah titik awal yang masuk akal, **bukan** hasil pengukuran.
Nilai yang benar hanya bisa diketahui dari pemakaian nyata host ini, dan angka
yang dipakai di server lain tidak berlaku di sini.

Ukur pemakaian memori aplikasi dalam kondisi nyata, termasuk saat etalase
dimuat dan saat ada yang memakai portal. Dua cara:

```bash
# Membaca saja. Sample RSS container aplikasi, 60 sampel, satu per detik.
# Jalankan saat server normal, lalu ulangi saat trafik paling tinggi.
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' -a

# Memakai angka RSS proses Node di dalam container.
# Ganti CONTAINER_ID dengan hasil "docker ps".
docker exec CONTAINER_ID sh -lc 'grep VmRSS /proc/1/status'
```

Catat angka puncak, bukan angka rata-rata. Kalau kedua angka itu jauh berbeda,
ambil yang lebih tinggi sebagai dasar.

### Titik awal yang disarankan

Setelah pengukuran, nilai berikut adalah titik awal yang masuk akal untuk host
sebesar ini, dengan penalaran masing-masing:

| Setting | Titik awal | Penalaran |
|---------|-----------|-----------|
| `mem_limit` | `768m` | Host 1,9 GiB harus masih menyisakan ruang untuk Postgres, Redis, dan Coolify. Aplikasi Next.js pada 1 container umumnya berada di bawah 512 MiB saat idle, tapi cache produksi dan halaman berat bisa menaikkan itu. 768 MiB memberi ruang untuk lonjakan tanpa menyisakan terlalu sedikit untuk control plane. |
| `cpus` | `1.0` | Host punya 2 vCPU dan dipakai bersama. Memberi 1 vCPU ke aplikasi membiarkan 1 vCPU untuk control plane, dan membuat antrean pada saat build tidak langsung terasa sebagai lambat seluruh host. |

Dua hal yang wajib gesagt soal angka ini:

1. **Kalau hasil pengukuran menunjukkan pemakaian puncak sudah melewati 768 MiB,
   naikkan batasnya, jangan memotong aplikasi.** Batas yang terlalu kecil akan
   mengubah OOM kill yang sporadis menjadi OOM kill yang terjadwal.
2. **Nilai yang terlalu rendah lebih berbahaya daripada tidak ada nilai.** Tanpa
   batas, kernel membunuh saat host benar-benar habis, yang relatif jarang.
   Dengan batas yang terlalu rendah, Docker membunuh aplikasi saat host masih
   punya memori lega.

### Di mana batas itu ditulis

Ada dua tempat, dan pilihannya tergantung bagaimana Coolify memicu deploy:

- **Resource limits di Coolify** (resource aplikasi → limits). Ini cara yang
  paling stabil karena dikelola Coolify dan ikut di-set ulang saat deploy.
- **`deploy.resources.limits` di compose.** Coolify menimpa sebagian opsi
  compose, jadi hasilnya bisa berbeda dari yang ditulis.

Cara memastikan hasil yang benar-benar berlaku: jangan lihat konfigurasi, tapi lihat
apa yang dibaca Docker:

```bash
# Membaca saja. Tampilkan batas yang benar-benar terpakai, bukan yang ditulis.
docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}' CONTAINER_ID
```

Nilai `Memory` dan `NanoCpus` yang muncul di sana adalah kebenaran. Kalau
bernilai `0`, batasnya memang belum berlaku.

Pastikan juga `memswap_limit` masih `0`. Kalau swap diaktifkan pada container
di host yang hanya punya 465 MiB swap, proses bisa bertahan lebih lama dalam
keadaan tidak sehat, dan kill terjadi lebih lambat serta lebih sulit
didiagnosis.

### Membastikan build tidak terjadi di host ini

Build harus terjadi di GitHub Actions lalu ditarik dari GHCR. Kalau tidak, satu
build saja bisa menghabiskan RAM host, dan itulah yang terlihat pada OOM kill
`npm install`.

Tiga pemeriksaan, semuanya membaca saja:

```bash
# 1. Apakah ada proses build yang sedang berjalan?
#    buildx, buildkit, atau "next build" adalah petunjuk utama.
ps -eo pid,etimes,rss,args | grep -Ei 'next build|buildkit|docker build' | grep -v grep

# 2. Builder BuildKit yang sedang aktif.
docker buildx ls

# 3. Jejak image yang dibangun lokal dalam 24 jam terakhir.
#    Dibandingkan dengan image yang ditarik dari registry, keduanya beda Created.
docker image ls --format '{{.Repository}}\t{{.CreatedSince}}' | head -20
```

Kalau `ps` menemukan proses build, atau `docker buildx ls` menunjukkan builder
default yang aktif dan pernah dipakai, build sedang terjadi di host. Mematikan
BuildKit yang tidak dipakai lewat dashboard Coolify, bukan dengan
`docker buildx prune` manual, karena dashboard yang bisa memulihkannya kalau
salah pilih.

---

## 3. Traefik access logging

### Kondisi setelah 2026-10-01: sudah aktif

Sudah diaktifkan dan sudah terbukti menulis. Yang berlaku sekarang:

| Setting | Nilai | Kenapa |
|---------|-------|--------|
| Log path di host | `/var/log/traefik/access.log` | Bind mount `ro` dari compose proxy, jadi operator bisa `tail` tanpa `sudo` |
| Format | `json` | `ClientHost` dan `RequestHost` terbaca tanpa parse teks |
| Ukuran per baris | sekitar 809 byte, terukur | Dasar hitung biaya disk |
| Rotasi | harian, `rotate 7`, `maxsize 100M`, kompres | Batas keras, bukan hopes-and-prayers |
| Isi log | method, path, host, status, IP, ukuran, waktu | **Tidak** ada body request dan **tidak** ada header; sudah diverifikasi dengan `grep -iE 'authorization\|cookie'` yang mengembalikan nol |

Perintah verifikasi, semuanya hanya baca:

```bash
# Menghitung pertumbuhan log.
sudo wc -l /var/log/traefik/access.log

# Distribusi status code, sumber utama untuk adjudicating item ini.
sudo jq -r .OriginStatus /var/log/traefik/access.log | sort | uniq -c | sort -rn

# Router mana yang melayani trafik.
sudo jq -r .RouterName /var/log/traefik/access.log | sort | uniq -c | sort -rn
```

### Batasan yang harus diketahui: file compose proxy bisa ditimpa Coolify

Access log adalah konfigurasi **statis** Traefik, jadi tidak bisa ditulis di
`/data/coolify/proxy/dynamic/`. Flag-nya harus hidup di command container, dan
command container berasal dari `/data/coolify/proxy/docker-compose.yml`.

Kalau Coolify pernah menulis ulang file itu dari template-nya sendiri, flag
`--accesslog` hilang dan logging mati lagi tanpa error yang kelihatan. Kalau
itu terjadi, perbaikannya satu perintah:

```bash
# Hanya kalau /var/log/traefik/access.log tidak lagi bertambah.
sudo docker compose -f /data/coolify/proxy/docker-compose.yml up -d
```

Cadangan compose sebelum perubahan ada di `/data/coolify/proxy/backups/`.

### Apa yang hilang sebelum 2026-10-01

Sebelum logging aktif, dan tidak ada request log di mana pun di host. Akibatnya:

- tidak ada distribusi status code, sehingga tidak ada cara tahu apakah
  `/admin`, `/staff`, atau URL lain yang dulu menjadi soft 404 masih dibaca
  crawler;
- tidak ada jejak untuk forensik setelah insiden, termasuk saat ada
  percobaan login berulang;
- tidak ada data untuk membedakan traffic bot dari traffic pelanggan;
- app log sendiri hanya sekitar 41 baris dengan 8 error, semuanya pola
  "Server Reference ID did not match the expected format" dalam dua rentetan
  empat, yang paling mungkin adalah probing eksternal endpoint Server Action.
  Pola itu tidak bisa ditelusuri lebih jauh tanpa request log.

Ini bukan celah yang mengekspos data. Ini kehilangan kemampuan untuk membuktikan
apa yang terjadi.

### Cara mengaktifkannya, dan apa yang benar-benar dipakai

Traefik v3 mengaktifkan access log lewat konfigurasi **statis**, yaitu flag
pada command container, bukan lewat label per-router dan bukan lewat file di
`/dynamic/`. Yang dipakai di host ini adalah opsi 1, flag pada command
container, karena itu satu-satunya tempat yang tidak butuh perubahan pada image
Coolify. Alasannya sudah ditulis di bagian atas bagian ini.

Yang penting dan tidak ada di runbook lama: **jangan pernah meregenerasi
container proxy tanpa memvalidasi flag-nya lebih dulu, dan jangan pernah
memvalidasi daftar flag yang ditulis tangan.** Traefik menolak opsi yang tidak
dikenal dengan `failed to decode configuration from flags`, dan karena
`restart: unless-stopped` ada di compose, container itu masuk crash-loop dan
proxy hilang sama sekali. `--accesslog.redactheaders` dan
`--accesslog.bufferSize` ternyata **tidak** valid di Traefik v3.6, dan
`--providers.file.executable` juga tidak valid.

Outage 10-10-2026 yang singkat itu **bukan** karena metode validasinya salah.
Metodenya sudah benar dan sudah dipakai, `check-config` sudah gagal dengan
menyebut `redactheaders`, tapi dua hal tetap keliru:

1. Hasil validasi **tidak dipakai sebagai gerbang**. `docker compose up -d`
   jalan tanpa syarat, padahal `rc=1` sudah tercetak di baris sebelumnya.
2. Daftar flag yang divalidasi **ditulis tangan dan terpisah** dari daftar
   flag yang benar-benar dipasang. Keduanya sudah berbeda sebelum pengujian,
   jadi hijau di sana tidak membuktikan compose yang dipasang ikut teruji.

Karena itu validasinya harus dua hal sekaligus: ambil daftar flag dari file
compose itu sendiri, dan jadikan hasilnya syarat. Ganti seluruh blok
`command:` dengan hasil ekstraksi:

```bash
# Flag diambil dari file compose yang nyata, bukan diketik ulang.
sudo python3 - <<'PY'
import re, sys
src = open('/data/coolify/proxy/docker-compose.yml').read()
block = re.search(r'command:\n((?:\s+-\s.*\n)+)', src).group(1)
flags = re.findall(r"-\s*'([^']+)'", block)
open('/tmp/traefik-flags.txt','w').write('\0'.join(flags))
print(len(flags), 'flags extracted')
PY

# Validasi di container sekali jalan. Container production tidak tersentuh.
docker run --rm -v /data/coolify/proxy:/traefik traefik:v3.6 \
  xargs -0 -a /tmp/traefik-flags.txt check-config
RC=$?

# GERBANG. Tanpa baris ini validasi cuma saran, dan outage tetap mungkin.
if [ "$RC" -ne 0 ]; then
  echo "VALIDASI GAGAL, PROXY TIDAK DI-TOUCH"
  exit 1
fi

sudo docker compose -f /data/coolify/proxy/docker-compose.yml up -d
```

Kalau blok di atas dipakai, daftar flag yang diuji dan yang dipasang dijamin
sama, dan proxy tidak mungkin dibangun dari konfigurasi yang belum lolos cek.

Lihat dulu konfigurasi yang sedang dipakai:

```bash
# Membaca saja. Menampilkan command Traefik yang sebenarnya dijalankan Coolify.
docker inspect --format '{{json .Config.Cmd}}' coolify-proxy
```

Opsi kedua yang pernah dicoba di runbook lama, yaitu menaruh konfigurasi
statis di `traefik.yml` dan mengarahkannya dengan `--configFile`, tidak
dipakai di sini. Alasannya: flag `--configFile` itu sendiri tetap harus
menempel di command container, jadi tidak ada yang benar-benar kebal
regenerasi Coolify. Yang menambah lapisan masalah saja.

Format `json` dipilih supaya log bisa dibaca dengan `jq` saat dicari, dan
supaya `ClientHost` dan `RequestHost` tidak perlu diparse dari teks.

Setelah aktif, pastikan benar-benar menulis:

```bash
# Membaca saja.
tail -n 3 /var/log/traefik/access.log
```

Kalau file tidak bertambah, periksa dua hal: flag benar-benar masuk ke command
container, dan `docker ps --filter name=coolify-proxy` tidak sedang
`Restarting`.

### Ukur dulu, lalu putuskan rotasi

Aktifkan logging, biarkan berjalan sehari pada trafik normal, lalu ukur. Angka
kapasitas disk di bawah bukan tebakan yang layak dipercaya.

```bash
# Membaca saja, satu hari setelah logging aktif.
docker exec coolify-proxy sh -lc 'du -h /var/log/traefik/access.log'
```

Disk 39 GB dengan 37% terpakai masih longgar, dan sekitar 930 MB bisa
direklamasi dari image lama plus build cache. Jadi rotasi bukan kondisi
darurat, tapi logging tanpa rotasi adalah bom waktu yang tidak terlihat,
karena file log tidak pernah muncul di `du` direktori home.

Rekomendasi rotasi, dan apa yang dipakai di host ini:

- rotasi harian, karena pola trafik toko berubah antara pagi dan malam;
- simpan 7 sampai 14 hari, cukup untuk menyelidiki insiden minggu lalu tanpa
  menyimpan data pelanggan lebih lama dari yang perlu;
- kompres file yang sudah dirotasi, dan hapus yang sudah terkompresi lebih tua
  dari 30 hari;
- salin ke luar host kalau investigasi insider menjadi kekhawatiran, karena log
  di host yang sama bisa ikut hilang bersama mesinnya.

Yang benar-benar terpasang ada di `/etc/logrotate.d/traefik`, dengan `rotate 7`
dan `maxsize 100M`. `maxsize` sengaja ditambahkan di atas `daily`: `daily`
sendiri tidak membatasi ukuran, jadi satu hari traffic alone bisa menulis
miliaran byte, dan di host 1,9 GiB itu tidak bisa diasumsikan aman.

Unit `logrotate` yang terpasang persis seperti ini, bukan contoh:

```text
/var/log/traefik/access.log {
    daily
    rotate 7
    maxsize 100M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

`copytruncate` dipilih karena Traefik memegang file descriptor secara terus
menerus, jadi `create` akan membuat Traefik menulis ke file yang sudah tidak
lagi dirotasi.

---

## 4. Rutinitas yang bisa didokumentasikan

Bagian ini untuk orang yang tidak memperdalam server. Semua perintahnya
membaca saja dan tidak mengubah apa pun. Jalankan sekali sebulan, atau setelah
deploy besar, dan simpan hasilnya.

### Pemeriksaan rutin

| Nomor | Yang dicek | Perintah | Tanda bahaya |
|-------|------------|----------|--------------|
| 1 | Sertifikat TLS | lihat di bawah | Sisa di bawah 21 hari |
| 2 | Kapasitas disk | lihat di bawah | Di atas 80% |
| 3 | Inode | lihat di bawah | Di atas 80% |
| 4 | OOM kill | lihat di bawah | Ada kill dalam 7 hari terakhir |
| 5 | Health aplikasi | lihat di bawah | Status selain ready |
| 6 | Memori dan swap | lihat di bawah | Swap naik terus |

### 1. Sisa masa berlaku sertifikat

Ada tiga sertifikat terpisah, yaitu apex, login, dan www. Semuanya kedaluwarsa
di hari yang sama, jadi satu pemeriksaan sudah cukup, tapi catat jumlah
perodayanya karena ACME auto-renewal bisa gagal diam-diam kalau port 80
tertutup.

```bash
# Membaca saja. Ganti setiap domain di bawah.
for d in atcell.my.id login.atcell.my.id www.atcell.my.id; do
  printf '%s: ' "$d"
  echo | openssl s_client -servername "$d" -connect "$d:443" 2>/dev/null \
    | openssl x509 -noout -enddate
done
```

Kalau `openssl s_client` tidak tersedia di host, jalankan dari mesin operator;
pemeriksaan ini tidak butuh akses root.

### 2. Kapasitas disk

```bash
# Membaca saja.
df -h / /var/lib/docker
docker system df
```

Sekitar 930 MB dapat direklamasi dari image yang tidak terpakai dan build
cache, dan itu tidak mendesak pada 37% terpakai. Bersihkan hanya kalau
disk benar-benar mulai penuh, dan perhatikan risikonya: `docker system prune -a`
menghapus image yang belum dipakai, termasuk image lama yang mungkin masih
dibutuhkan untuk rollback cepat.

### 3. Inode

Penuh pada inode menghasilkan error "no space left on device" padahal `df`
masih longgar, jadi harus dicek terpisah.

```bash
# Membaca saja.
df -i / /var/lib/docker
```

### 4. OOM kill

`dmesg` dibatasi pada host ini, jadi `journalctl -k` satu-satunya sumber yang
bisa dibaca. Dua perintah ini cukup untuk pemeriksaan bulanan.

```bash
# Membaca saja. Daftar OOM kill dalam 7 hari terakhir.
sudo journalctl -k --since "7 days ago" | grep -iE 'out of memory|oom-kill|killed process'

# Hitung supaya mudah dibandingkan bulan ke bulan.
sudo journalctl -k --since "7 days ago" | grep -ciE 'oom-kill'
```

Kalau jumlahnya naik dari bulan sebelumnya, jangan langsung menaikkan
`mem_limit`. Bandingkan dulu nama proses yang tercatat pada baris
`Killed process`, karena itu yang membedakan kill pada aplikasi dari kill
pada build atau control plane.

### 5. Health endpoint

`/api/health/ready` mengembalikan lima boolean. Endpoint ini dipakai sebagai
Docker healthcheck, jadi statusnya selalu cerminan kondisi nyata, bukan
hasil cache.

```bash
# Membaca saja.
curl -sS https://atcell.my.id/api/health/ready
```

Cara membaca hasilnya:

| Boolean | Arti kalau false |
|---------|------------------|
| `supabaseConfigured` | Env Supabase public tidak lengkap, portal akan gagal |
| `databaseConfigured` | `DATABASE_URL` kosong, semua yang baca database gagal |
| `databaseReachable` | Koneksi ke Supabase tidak berhasil, cek jaringan dan IP allowlist |
| `databaseSchemaReady` | Migrasi wajib belum diterapkan, **jangan** andalkan fitur yang membacanya |
| `serviceRoleConfigured` | `SUPABASE_SECRET_KEY` atau service-role key kosong, `requireRole()` akan menolak semua aksi tulis |

Status `503` berarti belum siap dan harus dianggap sebagai tidak siap, bukan
sebagai izin memakai data mock. Response 200 dengan semua boolean true berarti
sehat; health check sudah 5 sampel berturut-turut keluar 0, jadi kondisi saat
audit itu sehat.

### 6. Memori dan swap

```bash
# Membaca saja.
free -h
docker stats --no-stream
```

Swap 465 MiB adalah jaring pengaman, bukan tempat kerja. Kalau `Swap` di
`free -h` naik terus selama beberapa pemeriksaan berturut-turut, host sedang
bertekanan dan container yang aktif perlu diperiksa, bukan di-restart.

### Catatan lain yang perlu diketahui operator

- Ada `Caddyfile` mati di `/data/coolify/proxy/dynamic/`, isinya
  `import /dynamic/*.caddy` tanpa file yang cocok, dan label `caddy_*` yang
  mengiklankan zstd yang diabaikan Traefik. Ini sisa konfigurasi, tidak
  berpengaruh pada serving, dan tidak perlu disentuh kecuali sebagai bagian
  dari pembersihan yang disengaja.
- Uptime 15,5 jam saat audit, dan `RestartCount=0` pada container aplikasi.
  Dua angka itu wajar setelah deploy, tapi `RestartCount` yang naik berulang
  tanpa deploy adalah tanda container yang tidak sehat.
- Tabel `environment_variables` Coolify **tidak** menyimpan setiap variabel
  production dua kali. Terbukti per 2026-10-01: 14 baris untuk 7 kunci, dan
  seluruhnya milik satu aplikasi. Pecahnya adalah `is_preview`, yaitu tujuh
  baris `false` untuk production dan tujuh baris `true` untuk preview.
  `byte_identical_duplicate_groups` bernilai nol, dan tidak ada satu pun grup
  dengan owner + kunci + `is_preview` yang sama lebih dari satu baris. Ada
  laporan sebelumnya yang menyebut ini duplikat; laporan itu salah. Jangan
  menghapus baris mana pun: baris `false` hilang berarti production kehilangan
  `DATABASE_URL` dan kunci Supabase, baris `true` hilang berarti preview
  kehilangan env-nya.

---

## 5. SSH dijatahi brute-force

Sudah ditangani per 2026-10-01. Ini urutan masuknya, karena hampir semua host
publik punya masalah ini dan hampir tidak ada yang menulis detailnya.

### Gejalanya

Audit dua jam pertama mencatat 202 baris `Failed password` atau
`Invalid user`, dan `fail2ban` sama sekali tidak terpasang. `sshd` berjalan
dengan `MaxStartups 10:30:100` dan `PerSourceMaxStartups none`.

`PerSourceMaxStartups none` adalah bagian yang sebenarnya berbahaya. Tanpa itu,
satu scanner dengan banyak koneksi paralel bisa menghabiskan seluruh
jendela unautentikasi sendiri, dan setiap koneksi operator yang masuk
selama itu akan di-drop secara acak. Di host ini sudah sampai ke outage
nyata sekali.

### Yang dipasang, dan pilihannya

Semua perubahan sshd ada di satu drop-in,
`/etc/ssh/sshd_config.d/60-bruteforce-resilience.conf`:

| Setting | Nilai | Penalaran |
|---------|-------|-----------|
| `PerSourceMaxStartups` | `3` | Satu sumber maksimal punya 3 koneksi di jendela unautentikasi. Cukup untuk manusia, dan membuat sepuluh scanner hanya bisa mencapai 30 slot, bukan seluruh jendela |
| `MaxStartups` | `50:30:100` | Mulai acak-drop di 50 koneksi unautentikasi, tolak semua di 100. Cukup jauh di atas 10 supaya burst scanner tidak mengunci operator, dan masih wajar untuk host 1,9 GiB |

Nama file drop-in sengaja `60-`, bukan `99-`, karena `Include
/etc/ssh/sshd_config.d/*.conf` ada di baris 24 `sshd_config`, yaitu **sebelum**
badan file itu, dan OpenSSH memakai nilai pertama yang dibaca untuk satu
keyword. Drop-in bernomor kecil menang atas file yang lebih besar.

`fail2ban` dipasang dengan jail `sshd`, jail time 1 jam, find time 10 menit,
maxretry 5, `backend = systemd`, ban lewat `nftables-multiport`. Ban pertama
jatuh dalam beberapa menit setelah jail hidup, tanpa tindakan manual.

### Yang melindungi operator, dan kenapa itu bukan kebetulan

IP egress operator ada di `ignoreip` **sebelum** fail2ban dinyalakan:

```bash
# Membaca saja. Kalau IP operator tidak muncul di sini, ban itu tidak aman.
sudo fail2ban-client get sshd ignoreip
```

`ignoreip` dievaluasi sebelum ban apa pun, jadi operator punya jaminan keras
untuk tidak pernah di-ban, bukan sekadar kemungkinan kecil.

Jangan pernah menjalankan `fail2ban-client` untuk pertama kalinya tanpa
menulis `ignoreip` lebih dulu. Jail yang aktif dengan `ignoreip` kosong akan
memban IP operator pada percobaan gagal pertama, dan pemulihannya butuh
konsol provider.

### Dua jebakan yang sudah memakan waktu sekali

1. **Ekstensi jail.** `jail.conf` memuat `jail.d/*.conf`. File `.local` di
   direktori yang sama **tidak** dibaca, dan fail2ban tidak complain apa pun
   soal itu. Jail tetap jalan, dengan default yang salah. Setelah memasang,
   selalu pastikan `ignoreip` benar-benar terisi di jail yang aktif.
2. **Reload, jangan restart sshd.** `systemctl reload ssh` mempertahankan
   sesi yang sedang berjalan, jadi sesi itu tetap lifeline kalau reload
   ternyata gagal.

### Verifikasi setelah perubahan

```bash
# Hanya membaca. Effective settings harus MaxStartups 50:30:100 dan
# PerSourceMaxStartups 3.
sudo sshd -T | grep -iE 'maxstartups|persourcemaxstartups'

# Validasi selalu mendahului reload.
sudo sshd -t && sudo systemctl reload ssh

# Jail hidup dan IP operator ada di ignoreip.
systemctl is-active fail2ban
sudo fail2ban-client status sshd

# Yang paling penting: buka sesi baru dari mesin operator setelah semua di atas.
ssh ubuntu@<IP> 'hostname'
```

Kalau `sudo sshd -t` gagal, **jangan** reload. Hapus drop-in, validasi ulang,
lalu perbaiki di luar jam sibuk.

---

## Belum ditangani dan masih terbuka

Bagian ini sengaja tidak berisi rekomendasi, karena isunya butuh keputusan
manusia, bukan keputusan teknis yang bisa diambil dari dokumen.

### 1. Apakah panel Coolify perlu dibatasi sama sekali

Belum diputuskan. Argumennya nyata di kedua arah. Panel terbuka ke seluruh
internet, dan itu memberi akses ke kunci production. Tapi membatasi ke IP
sendiri berarti kehilangan panel setiap IP berubah, dan pemulihan hanya lewat
SSH.

Yang dibutuhkan sebelum memutuskan: apakah `COOLIFY_API_TOKEN` dan akses panel
dipakai rutin dari lebih dari satu lokasi, dan apakah sudah ada jalur
alternatif seperti WireGuard yang sudah aktif. Tanpa jawaban itu, perintah di
bagian 1 sebaiknya tidak dijalankan.

### 2. Apa yang sebenarnya diizinkan Tencent Cloud security group

Belum terverifikasi dari audit, dan ini adalah celah pengetahuan yang
paling serius di dokumen ini. Yang diketahui hanya bahwa `8080` dan `8443`
terbinds ke `0.0.0.0` tapi timeout dari luar, sehingga ada filter off-host yang
aktif. Yang tidak diketahui: daftar lengkap aturan inbound dan outbound, apakah
ada group lain yang juga menempel, dan apakah port Traefik API sudah termasuk
di dalamnya.

Perintah penemuan ada di bagian 1, tetapi hasilnya hanya sah kalau dibaca
langsung di konsol Tencent Cloud. Sampai itu dilakukan, perubahan di `ufw`
tidak boleh dianggap sebagai pertahanan lengkap.

### 3. Apakah restore test rantai backup pernah dijalankan

Tidak ada bukti bahwa pernah. `docs/DEPLOYMENT-REDUNDANCY.md` sudah
mendeskripsikan target restore lokal dan urutannya, tapi dokumen itu adalah
rencana, bukan bukti eksekusi.

Yang dibutuhkan: tanggal restore test terakhir, target yang dipakai, dan
hasil verifikasi skema wajib setelah `pg_restore`. Kalau jawabannya tidak
ada, anggap rantai backup belum terbukti, dan jadwalkan restore test sebelum
mempercayai backup untuk perubahan data yang merusak.

### 4. Aplikasi Coolify kedua yang mati tapi masih listens webhook

Ada dua baris di tabel `applications`. Yang kedua, `k-p:main-m4kmotlkecfl9hhudiwismzp`,
berada di `exited`, tidak punya container, punya nol environment variable, dan
**tidak pernah** punya satu pun job deploy. FQDN-nya masih berupa
`sslip.io` yang memuat IP publik host.

Yang membuat ini bukan sekadar sampah: `is_auto_deploy_enabled` untuk kedua
baris bernilai `true`, dan keduanya naik dari repo dan branch yang sama.
Coolify meneruskan satu event push ke setiap aplikasi yang cocok, jadi selama
baris kedua masih ada, satu `git push` ke `main` adalah kandidat untuk memicu
build di host 1,9 GiB ini, dan build di host inilah penyebab OOM kill
terbesar di bagian 2. Aplikasi itu sendiri akan gagal start karena nol env,
tapi build-nya sudah terlanjur berjalan dan sudah mengambil RAM-nya.

Coolify tidak punya konsep "archive" untuk aplikasi. Yang ada hanya
`deleted_at`, yaitu soft delete: baris tetap ada di database bersama settings
dan env var-nya, tapi hilang dari dashboard dan tidak lagi dipakai untuk
deploy. Dua opsi, urut dari paling reversibel:

1. Set `is_auto_deploy_enabled` ke `false` pada baris tersebut. Satu flag,
   sepenuhnya bisa dibalik, dan langsung menutup jalur yang dijelaskan
   di atas.
2. Soft delete lewat dashboard, yang mengisi `deleted_at`.

Hard delete **jangan** dipakai sebelum opsi 1 dicoba, karena baris itu masih
satu-satunya catatan bahwa pernah ada aplikasi kedua di host ini.

Sebelum memutuskan, yang perlu dipastikan: apakah aplikasi kedua itu pernah
sengaja dibuat, dan untuk apa. Kalau tidak ada yang mengingat, opsi 1 sudah
cukup dan tidak ada yang hilang.

---

Dokumen ini dimulai dari audit read-only. Sebagian perintahnya sudah
dijalankan sejak itu, dan bagian yang sudah dikerjakan menandainya dengan
tanggal dan menyebut apa yang benar-benar terpasang. Semua angka runtime di
atas berasal dari satu waktu pengukuran dan harus diverifikasi ulang sebelum
dijadikan dasar keputusan.
