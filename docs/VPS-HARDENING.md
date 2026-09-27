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
| 3 | Traefik access logging mati | Tidak merusak apa pun hari ini, tapi membuat insiden berikutnya mustahil ditelusuri. |
| 4 | Rutinitas operasional | Bukan celah keamanan, tapi satu-satunya cara agar tiga isu di atas ketahuan sebelum jadi besar. |

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

## 3. Traefik access logging mati

### Apa yang hilang

Access logging Traefik sedang nonaktif, dan tidak ada request log di mana pun
di host. Akibatnya:

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

### Mengaktifkannya cara Traefik

Traefik v3 mengaktifkan access log lewat konfigurasi **statis**, yaitu flag
pada command container atau `traefik.yml`, bukan lewat label per-router.

Lihat dulu konfigurasi yang sedang dipakai:

```bash
# Membaca saja. Menampilkan command Traefik yang sebenarnya dijalankan Coolify.
docker inspect --format '{{json .Config.Cmd}}' coolify-proxy
```

Berdasarkan hasil perintah itu, pilih salah satu:

1. ** Lewat flag pada command container.** Tambahkan `--accesslog=true`,
   `--accesslog.filepath=/var/log/traefik/access.log`, dan
   `--accesslog.format=json` pada command Traefik. Cara ini yang paling
   mudah, tapi hanya berlaku selama Coolify tidak meregenerasi container proxy.
2. **Lewat `traefik.yml`**, yaitu letakkan konfigurasi statis di file, lalu arahkan
   Traefik ke sana dengan `--configFile`). Lebih tahan terhadap regenerasi
   Coolify, tapi perlu tahu di mana Coolify menyimpan file tersebut.

Format `json` dipilih supaya log bisa dibaca dengan `jq` saat dicari, dan
supaya `ClientHost` dan `RequestHost` tidak perlu diparse dari teks. Bandingkan
dengan format `common` yang lebih murah dan memuat field yang sama dalam bentuk
teks.

Coolify menyediakan tempat untuk mengubah command container proxy di
dashboardnya. Nama menu berbeda antar versi, jadi cari bagian container proxy
atau **Traefik** di environment production, dan pastikan tidak mengubah
upstream aplikasi saat menyentuh konfigurasi yang sama.

Setelah aktif, pastikan benar-benar menulis:

```bash
# Membaca saja.
docker exec coolify-proxy sh -lc 'ls -l /var/log/traefik/' 
docker exec coolify-proxy sh -lc 'tail -n 3 /var/log/traefik/access.log'
```

Kalau file tidak muncul, periksa bahwa flag benar-benar masuk ke command
container, bukan hanya ke file konfigurasi yang tidak dibaca.

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

Rekomendasi rotasi, setelah ukuran harian terukur:

- rotasi harian, karena pola trafik toko berubah antara pagi dan malam;
- simpan 7 sampai 14 hari, cukup untuk menyelidiki insiden minggu lalu tanpa
  menyimpan data pelanggan lebih lama dari yang perlu;
- kompres file yang sudah dirotasi, dan hapus yang sudah terkompresi lebih tua
  dari 30 hari;
- salin ke luar host kalauinvestigasi insider menjadi kekhawatiran, karena log
  di host yang sama bisa ikut hilang bersama mesinnya.

Contoh unit `logrotate`, **hanya sebagai kerangka**. Sesuaikan path dan nilainya
setelah pengukuran, dan pastikan unit ini tidak ikut memutar log aplikasi yang
sudah dikelola Coolify:

```text
/var/log/traefik/access.log {
    daily
    rotate 14
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

---

## Belum ditangani dan masih terbuka

Bagian ini sengaja tidak berisi rekomendasi, karena ketiganya butuh keputusan
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

---

Dokumen ini dibuat dari audit read-only. Tidak ada perintah di dalamnya yang
sudah dijalankan oleh penulisnya. Semua angka runtime di atas berasal dari satu
waktu pengukuran dan harus diverifikasi ulang sebelum dijadikan dasar
keputusan.
