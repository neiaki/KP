# Pengeras VPS At Cell

Runbook operasional host production At Cell di Coolify. Isinya hasil audit
read-only, langkah perbaikan yang harus direview manusia, dan rutinitas
pemeliharaan. Tidak ada perintah yang boleh dipaste buta atau dimasukkan ke cron
tanpa dibaca. Perintah merusak ditandai eksplisit. Tidak ada nilai secret di
dokumen ini.

Dokumen ini hanya membahas host VPS. Untuk migrasi, rilis, dan panel, lihat
`DEPLOYMENT-REDUNDANCY.md`. Untuk penggantian secret, lihat `SECRET-ROTATION.md`.

## Gambaran host

Fakta dari audit read-only pada satu waktu; verifikasi ulang sebelum dipakai
sebagai dasar keputusan.

| Komponen | Nilai |
|---|---|
| OS | Ubuntu 26.04.1 LTS, kernel 7.0.0-34 |
| Bentuk | KVM VM, 2 vCPU Intel Xeon Platinum 8255C |
| RAM | 1,9 GiB dengan 465 MiB swap |
| Disk | 39 GB, 37% terpakai |
| Supervisor aplikasi | Docker, bukan systemd atau PM2 |
| Aplikasi | satu container `next start`, Next.js 16.3.5 di Node 22.23.3 |
| TLS dan reverse proxy | Traefik v3.6 di container `coolify-proxy`, port 80, 443, 443-udp |
| Firewall | `ufw` aktif, default deny incoming |
| Batas resource container | tidak ada (`mem_limit 0`, `cpus 0.0`) |
| Sumber image aplikasi | GitHub Actions, ditarik dari GHCR |
| Kode sumber di host | tidak ada, hanya `.env` dan `docker-compose.yaml` |

Host yang sama juga menjalankan control-plane Postgres, Redis, PHP, dan BuildKit
milik Coolify. Semua berebut memori yang sama, tanpa batas container.

## Urutan risiko

| Urutan | Isu | Kenapa |
|---|---|---|
| 1 | Panel Coolify terbuka ke internet | Satu login memberi seluruh deployment, env production, dan kunci Supabase |
| 2 | Tidak ada batas resource, sudah 6 OOM kill | Dampaknya menumpuk dan baru terasa jauh kemudian |
| 3 | Traefik access logging | Sudah aktif per 2026-10-01 |
| 4 | Rutinitas operasional | Satu-satunya cara agar isu di atas ketahuan sebelum membesar |
| 5 | SSH dijatahi brute-force | Area serang paling aktif, pernah menyebabkan outage; ditangani 2026-10-01 |

## 1. Panel Coolify terbuka ke internet

### Yang sebenarnya terbuka

| Port | Milik | Fungsi |
|---|---|---|
| `8000/tcp` | Coolify | Panel admin: env, deploy, log, terminal, DNS, resource |
| `6001:6002/tcp` | Coolify (Soketi) | Realtime/WebSocket notifikasi dan progress build |

Keduanya terjangkau dari internet publik: `http://<IP>:8000/` mengembalikan 302
ke login Coolify, `http://<IP>:6001/` mengembalikan 200.

Panel lebih serius daripada port 22: SSH memberi shell ke satu mesin, panel
memberi kendali seluruh deployment. Dari panel, penyerang bisa membaca
`DATABASE_URL`, `SUPABASE_SECRET_KEY`, dan service-role key; memicu deploy image
apa pun; membuka terminal container (praktis root di host); mengubah resource,
volume, dan jaringan; serta memicu build yang menjadi penyebab OOM kill terbesar.
Panel juga punya tombol baca/tulis `acme.json`, jadi memblokir akses panel bukan
langkah mandiri.

### UFW saja tidak cukup

Port `8080` dan `8443` ter-bind ke `0.0.0.0` di dalam host, tetapi timeout dari
luar. Artinya ada Tencent Cloud security group yang juga memfilter dan tidak
terlihat di `ufw`. Menghapus aturan `ufw` saja tidak menjamin `8000`/`6001`
tertutup; sebaliknya, satu perubahan security group bisa mengekspos API Traefik.

Lapis ketiga adalah `/usr/local/sbin/docker-dnat-guard.sh`, yang menjaga `8080`,
`6001`, dan `6002` di rantai `DOCKER-USER`.

- Aturan `ufw` pada port Docker tidak pernah bekerja. Port 8000 dipublish lewat
  DNAT di `nat/PREROUTING`, jadi paket tidak sampai ke rantai `INPUT`.
- Penjaga hanya mengatur `-i eth0`. Loopback dan trafik antar container tidak
  tertutup, supaya SSH tunnel tetap bisa dipakai.

Kalau panel tidak bisa diakses dari IP owner, periksa `DOCKER-USER` lebih dulu,
bukan `ufw`. Jalur akses sah dan pemulihannya ada di
[`DEPLOYMENT-REDUNDANCY.md`](DEPLOYMENT-REDUNDANCY.md#akses-panel-coolify).

### Nilai yang harus ditemukan sebelum pembatasan

Jalankan dari komputer operator, bukan VPS, karena yang diizinkan adalah IP
egress operator:

```bash
curl -sS https://api.ipify.org; echo
sudo ufw status numbered
```

Kalau IP dinamis dari ISP seluler atau sering berpindah, baca trade-off di bawah
sebelum memutuskan.

### Urutan: security group dulu, baru UFW

Jangan dibalik. Kalau `ufw` dihapus lebih dulu dan ternyata IP panel tidak akan
diizinkan, panel hilang sebelum jalur baru terbukti. Coolify satu-satunya tempat
melihat env production dan memicu deploy ulang. Kalau security group diubah
lebih dulu, masih ada dua jalur sampai `ufw` dimatikan, sehingga kegagalan
ditemukan saat masih ada jalan keluar. `22/tcp` tetap diizinkan selama proses.

Langkah 1, batasi di Tencent Cloud security group:

1. Buka **Cloud Firewall** atau **Security Group** yang menempel pada instance.
   Pastikan group yang benar; sering ada beberapa group.
2. Cari inbound yang mengizinkan `8000` dan `6001-6002` dari `0.0.0.0/0` dan
   `::/0`.
3. Ganti sumber ke `ADMIN_PUBLIC_IP/32` (IPv6 `/128` bila ada).
4. Jangan sentuh aturan `22`, `80`, dan `443`.
5. Simpan. Sebagian konsol menerapkan dalam hitungan detik, sebagian perlu
   restart instance.

Ekspor aturan dulu kalau konsol menyediakan, supaya ada yang bisa dikembalikan.

Langkah 2, buktikan belum terkunci sebelum mematikan lapis kedua:

1. Buka dua sesi SSH terpisah; simpan satu sebagai jaring pengaman, idealnya di
   `tmux` atau `screen`.
2. Dari mesin operator, buka `http://<IP>:8000/` dan pastikan halaman login
   muncul. Panel tidak memakai TLS; utamakan SSH tunnel.
3. Buka `http://<IP>:6001/` dan pastikan tidak timeout.
4. Pastikan health check masih hijau:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://atcell.my.id/api/health/ready
```

Kalau salah satu gagal, berhenti dan perbaiki security group.

Langkah 3, hapus aturan UFW. Perintah ini **destruktif** untuk akses panel dari
luar IP yang diizinkan. Baca nomor aturan tepat sebelum menghapus, jangan menebak:

```bash
sudo ufw delete <NOMOR_ATURAN_8000>
sudo ufw delete <NOMOR_ATURAN_6001_6002>
sudo ufw status numbered
```

Langkah 4, konfirmasi akhir:

1. Dari IP yang diizinkan, panel masih bisa dibuka.
2. Dari jaringan lain, `8000` dan `6001` timeout, bukan 302/200.
3. `https://atcell.my.id/` dan `https://login.atcell.my.id/` tetap terbuka.
4. `/api/health/ready` masih 200.

Rollback, hanya kalau masih punya sesi SSH hidup:

```bash
sudo ufw allow 8000/tcp comment 'panel coolify, sementara'
sudo ufw allow 6001:6002/tcp comment 'panel coolify realtime, sementara'
```

Di security group, kembalikan sumber `0.0.0.0/0` atau tambahkan aturan sementara
untuk IP operator.

### Trade-off yang harus disadari

Membatasi ke IP sendiri berarti kehilangan panel setiap IP berubah. Pemulihan
hanya lewat SSH, dan dari SSH tidak ada dashboard.

| Pilihan | Keuntungan | Kerugian |
|---|---|---|
| Batasi ke satu IP statis | Paparan kontrol plane mendekati nol | Kehilangan panel setiap IP berubah |
| Batasi ke dua IP | Ada jalur cadangan | Dua permukaan yang dijaga |
| Batasi ke WireGuard | Tidak bergantung IP publik | Coolify hanya lewat tunnel |
| Tidak membatasi, perkuat akun | Tidak ada risiko terkunci | Panel tetap terbuka untuk semua |

`COOLIFY_API_TOKEN` diperlakukan sebagai secret berdampak terbesar karena panel
dan token adalah dua jalan ke hal yang sama.

### Dua hal lain yang tidak terlihat dari luar

**Hostname panel dari `sslip.io`.** Coolify menyusun hostname panel sendiri dari
IP publik, hasilnya `coolify.<IP-publik>.sslip.io`. `sslip.io` menerjemahkan IP
di subdomain, jadi nama itu langsung bekerja tanpa didaftarkan. Akibatnya IP
publik host terpublikasi di bawah domain yang tidak dimiliki siapa pun. Traefik
juga meminta sertifikat Let's Encrypt sah untuk hostname itu, sehingga browser
tidak memperingatkan. Sebelum diperbaiki, panel menjawab publik dengan 302 ke
login memakai TLS valid, dan access log mencatat permintaan dari puluhan IP luar.
Sertifikat `acme-probe.<IP>.sslip.io` juga ada di `acme.json`; router `catchall`
memakai `certResolver: letsencrypt`, jadi hostname asing mana pun bisa memicu
penerbitan sertifikat.

**Deploy otomatis lewat GitHub App mustahil di host ini.** Tabel `github_apps`
hanya punya satu baris placeholder kosong: `organization`, `app_id`,
`installation_id`, dan `client_id` kosong; `client_secret`, `webhook_secret`,
dan `private_key_id` NULL. Tanpa identitas GitHub App, tidak ada `git push` yang
bisa memicu deploy. Menutup hostname panel tidak menghilangkan kemampuan apa pun;
menghidupkan GitHub App hanya memindahkan langkah deploy manual, tidak menambah
kemampuan lain. Selama panel terjangkau siapa pun, ia tetap memberi env
production, deploy image, dan terminal container.

### Endpoint deploy yang dipakai

Semua deploy melewati endpoint bertanda tangan Coolify dari dalam VPS:

```text
POST $COOLIFY_BASE_URL/api/v1/deploy?uuid=<uuid-aplikasi>
Authorization: Bearer $COOLIFY_API_TOKEN
```

Endpoint membaca `git_commit_sha` tersimpan, bukan HEAD branch. Sebelum deploy,
arahkan field itu ke commit pin lewat `PATCH /api/v1/applications/<uuid>`.
`SECRET-ROTATION.md` memakai bentuk yang sama untuk `/api/v1/version`. Token tidak
pernah ditulis di repo; ada di `~/.secrets` mesin operator dan dibuat lewat
halaman **API Tokens**.

Setelah hostname `sslip.io` ditutup, alamat panel tidak sama untuk semua
pemanggil:

| Pemanggil | Variabel | Alamat | Token di |
|---|---|---|---|
| VPS ke panel | `COOLIFY_BASE_URL` | loopback atau jaringan Docker | env proses deploy VPS |
| Operator | `COOLIFY_PANEL_URL` | hostname sendiri atau tunnel | `~/.secrets` operator |

Alamat jaringan Docker tidak bisa dipakai `curl` operator, dan panel tidak bisa
dijangkau lewat IP publik dari luar. Token juga tidak bisa dipakai bersama:
`COOLIFY_API_TOKEN` untuk VPS dimuat dari env proses deploy, bukan dari
`~/.secrets` operator.

### Yang diubah di host

Router hostname `sslip.io` dihapus dari
`/data/coolify/proxy/dynamic/coolify.yaml`. Berkas dicadangkan ke
`/data/coolify/proxy/backups/` dengan akhiran `.pre-sslip-lockdown`.

Router toko tidak pernah ada di berkas itu: `atcell.my.id`, `login.atcell.my.id`,
dan `www.atcell.my.id` datang dari label `traefik.*` container aplikasi lewat
provider `docker`. Karena itu `/api/health/ready`, `/id`, `/id/catalog`,
`/manifest.webmanifest`, `/sw.js`, dan `/.well-known/assetlinks.json` tetap
menjawab sama.

Sertifikat di `acme.json` sengaja tidak dihapus. Traefik memuat sertifikat ACME
terpisah dari router HTTP. Yang benar: **rute panel tidak lagi cocok, sementara
sertifikatnya masih tersimpan dan mungkin masih disajikan.** Jangan menulis
"sertifikat sudah tidak aktif".

Verifikasi setelah reload:

```bash
grep -c sslip /data/coolify/proxy/dynamic/coolify.yaml
docker exec <container-traefik> \
  grep -n 'Host(`' /data/coolify/proxy/dynamic/coolify.yaml | head -20
openssl s_client -connect <IP-VPS>:443 \
  -servername coolify.<IP>.sslip.io </dev/null 2>&1 \
  | grep -E 'subject=|issuer=|Verification'
docker exec <container-traefik> \
  grep -o '[a-z.]*atcell.my.id' /data/coolify/proxy/acme.json | sort -u
```

Kalau handshake tetap mengembalikan sertifikat, itu fakta yang dicatat, bukan
kegagalan. Kalau sertifikat toko tidak muncul, kembalikan `coolify.yaml` dari
cadangan. Jangan mengedit `acme.json`; router yang kembali akan meminta ulang
sertifikat dari `catchall`.

Penghapusan router bukan perbaikan permanen. `coolify.yaml` digenerate ulang
dari `instance_settings`, yang masih berisi `sslip.io`. Perbaikan permanen:

1. Buat record DNS di zona `atcell.my.id`:

   | Nama | Tipe | Nilai | TTL |
   |---|---|---|---|
   | `coolify` | `A` | IP publik host, sama dengan A record `atcell.my.id` | 300-3600 |

   `coolify.atcell.my.id` belum ada dan tidak bisa dibuat dari repo ini.

2. Ganti instance domain Coolify ke `https://coolify.atcell.my.id` lewat
   **Settings**, lalu arahkan `COOLIFY_BASE_URL`/`COOLIFY_PANEL_URL` ke hostname
   itu. Setelah ini penghapusan router menjadi permanen.

3. Daftarkan GitHub App kalau ingin `git push` ke `main` memicu deploy.

Sampai langkah 1 dan 2 selesai, wildcard `sslip.io` tetap ada di internet dan
tetap mengembalikan IP host; yang berubah hanya bahwa hostname itu tidak lagi
menyajikan panel.

## 2. Tidak ada batas resource di host 1,9 GiB

Container aplikasi punya `mem_limit 0`, `memswap_limit 0`, dan `cpus 0.0`.
Kernel bebas membiarkan proses mana pun tumbuh sampai host kehabisan memori,
lalu memilih sendiri siapa yang dibunuh. Ada enam OOM kill dalam 24 jam terakhir,
termasuk satu `npm install` saat build dan satu `next-server`. Bukti dari
`journalctl -k`, karena `dmesg` dibatasi.

Batas resource bukan perbaikan OOM; ia mengubah cara OOM terjadi:

- Tanpa batas: kernel membunuh proses terbesar/teraktif, bisa aplikasi, BuildKit,
  atau Coolify. `RestartCount` bisa tetap 0 karena kernel yang mematikan.
- Dengan batas: Docker memanggil OOM killer pada container itu, mencatat
  `OOMKilled=true`, dan atribusinya jelas.

Batas yang terlalu kecil justru membuat kill lebih sering, hanya jadi terlihat.

Ukur dulu, jangan menebak:

```bash
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' -a
docker exec CONTAINER_ID sh -lc 'grep VmRSS /proc/1/status'
```

Catat angka puncak, bukan rata-rata. Titik awal yang masuk akal setelah
pengukuran:

| Setting | Titik awal | Penalaran |
|---|---|---|
| `mem_limit` | `768m` | Menyisakan ruang untuk Postgres, Redis, dan Coolify; Next.js idle biasanya di bawah 512 MiB |
| `cpus` | `1.0` | Host 2 vCPU dipakai bersama; 1 vCPU untuk control plane |

Kalau puncak sudah melewati 768 MiB, naikkan batas, jangan memotong aplikasi.
Nilai terlalu rendah lebih berbahaya daripada tanpa nilai.

Tulis batas di resource limits Coolify (paling stabil karena ikut di-set ulang
saat deploy), bukan terutama di `deploy.resources.limits` compose yang sebagian
ditimpa Coolify. Verifikasi yang benar-benar berlaku:

```bash
docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}}' CONTAINER_ID
```

Nilai `0` berarti batas belum berlaku. Pastikan `memswap_limit` tetap `0`; swap
hanya 465 MiB, dan swap pada container membuat proses bertahan lebih lama dalam
keadaan tidak sehat.

Build harus terjadi di GitHub Actions lalu ditarik dari GHCR. Tiga pemeriksaan:

```bash
ps -eo pid,etimes,rss,args | grep -Ei 'next build|buildkit|docker build' | grep -v grep
docker buildx ls
docker image ls --format '{{.Repository}}\t{{.CreatedSince}}' | head -20
```

Kalau ada build di host, matikan BuildKit yang tidak dipakai lewat dashboard
Coolify, bukan `docker buildx prune` manual.

## 3. Traefik access logging

Aktif sejak 2026-10-01 dan terbukti menulis.

| Setting | Nilai | Kenapa |
|---|---|---|
| Log path | `/var/log/traefik/access.log` | Bind mount `ro`, operator bisa `tail` tanpa `sudo` |
| Format | `json` | `ClientHost` dan `RequestHost` tanpa parse teks |
| Ukuran baris | sekitar 809 byte | Dasar hitung disk |
| Rotasi | harian, `rotate 7`, `maxsize 100M`, kompres | Batas keras |
| Isi | method, path, host, status, IP, ukuran, waktu | Tidak ada body dan header; `grep -iE 'authorization\|cookie'` nol |

```bash
sudo wc -l /var/log/traefik/access.log
sudo jq -r .OriginStatus /var/log/traefik/access.log | sort | uniq -c | sort -rn
sudo jq -r .RouterName /var/log/traefik/access.log | sort | uniq -c | sort -rn
```

Access log adalah konfigurasi statis, jadi flag harus hidup di command container
dari `/data/coolify/proxy/docker-compose.yml`. Kalau Coolify menulis ulang file
itu, `--accesslog` hilang tanpa error. Perbaikan:

```bash
sudo docker compose -f /data/coolify/proxy/docker-compose.yml up -d
```

Cadangan compose ada di `/data/coolify/proxy/backups/`.

Sebelum logging aktif tidak ada request log sama sekali: tidak ada distribusi
status code, jejak forensik, atau data pembeda bot dan pelanggan. App log hanya
sekitar 41 baris dengan 8 error "Server Reference ID did not match the expected
format", kemungkinan probing endpoint Server Action. Ini bukan celah data, tapi
kehilangan kemampuan membuktikan apa yang terjadi.

Traefik v3 mengaktifkan access log lewat flag command container. Jangan
meregenerasi container proxy tanpa validasi, dan jangan memvalidasi daftar flag
yang ditulis tangan. `--accesslog.redactheaders`, `--accesslog.bufferSize`, dan
`--providers.file.executable` tidak valid di v3.6. Outage 10-10-2026 terjadi
karena hasil `check-config` tidak dipakai sebagai gerbang dan daftar flag yang
divalidasi berbeda dari yang dipasang.

Validasi yang benar mengambil flag dari compose dan menjadikan hasilnya syarat:

```bash
sudo python3 - <<'PY'
import re
src = open('/data/coolify/proxy/docker-compose.yml').read()
block = re.search(r'command:\n((?:\s+-\s.*\n)+)', src).group(1)
flags = re.findall(r"-\s*'([^']+)'", block)
open('/tmp/traefik-flags.txt','w').write('\0'.join(flags))
print(len(flags), 'flags extracted')
PY

docker run --rm -v /data/coolify/proxy:/traefik traefik:v3.6 \
  xargs -0 -a /tmp/traefik-flags.txt check-config
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "VALIDASI GAGAL, PROXY TIDAK DI-TOUCH"
  exit 1
fi
sudo docker compose -f /data/coolify/proxy/docker-compose.yml up -d
```

Lihat konfigurasi yang dipakai:

```bash
docker inspect --format '{{json .Config.Cmd}}' coolify-proxy
tail -n 3 /var/log/traefik/access.log
```

Opsi `traefik.yml` + `--configFile` tidak dipakai karena flag itu tetap menempel
di command container, jadi tidak kebal regenerasi.

Rotasi terpasang di `/etc/logrotate.d/traefik`, `rotate 7`, `maxsize 100M`.
`daily` saja tidak membatasi ukuran; satu hari trafik bisa menulis miliaran byte.
`copytruncate` dipilih karena Traefik memegang file descriptor terus-menerus.

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

Disk 39 GB dengan 37% terpakai masih longgar; sekitar 930 MB bisa direklamasi
dari image lama dan build cache.

## 4. Rutinitas operasional

Jalankan sebulan sekali atau setelah deploy besar. Semua perintah membaca saja.

| Nomor | Yang dicek | Tanda bahaya |
|---|---|---|
| 1 | Sertifikat TLS | Sisa di bawah 21 hari |
| 2 | Kapasitas disk | Di atas 80% |
| 3 | Inode | Di atas 80% |
| 4 | OOM kill | Ada kill dalam 7 hari |
| 5 | Health aplikasi | Status selain ready |
| 6 | Memori dan swap | Swap naik terus |

Sertifikat apex, login, dan www kedaluwarsa di hari yang sama:

```bash
for d in atcell.my.id login.atcell.my.id www.atcell.my.id; do
  printf '%s: ' "$d"
  echo | openssl s_client -servername "$d" -connect "$d:443" 2>/dev/null \
    | openssl x509 -noout -enddate
done
```

```bash
df -h / /var/lib/docker
docker system df
df -i / /var/lib/docker
sudo journalctl -k --since "7 days ago" | grep -iE 'out of memory|oom-kill|killed process'
sudo journalctl -k --since "7 days ago" | grep -ciE 'oom-kill'
curl -sS https://atcell.my.id/api/health/ready
free -h
docker stats --no-stream
```

Inode penuh menghasilkan "no space left on device" padahal `df` longgar. Jangan
langsung menaikkan `mem_limit` saat OOM naik; bandingkan nama proses pada
`Killed process`. `docker system prune -a` menghapus image lama yang mungkin
dibutuhkan untuk rollback cepat.

`/api/health/ready` mengembalikan lima boolean:

| Boolean | Arti kalau false |
|---|---|
| `supabaseConfigured` | Env Supabase public tidak lengkap |
| `databaseConfigured` | `DATABASE_URL` kosong |
| `databaseReachable` | Koneksi Supabase gagal; cek jaringan dan allowlist |
| `databaseSchemaReady` | Migrasi wajib belum diterapkan |
| `serviceRoleConfigured` | Kunci service role kosong; `requireRole()` menolak tulis |

Status 503 berarti belum siap, bukan izin memakai data mock. Swap 465 MiB adalah
jaring pengaman, bukan tempat kerja; swap yang naik terus berarti host tertekan.

Catatan lain:

- `Caddyfile` mati di `/data/coolify/proxy/dynamic/` hanya sisa konfigurasi,
  tidak berpengaruh pada serving.
- `RestartCount` yang naik berulang tanpa deploy adalah tanda container tidak
  sehat.
- Tabel `environment_variables` Coolify tidak menyimpan production dua kali.
  Per 2026-10-01 ada 14 baris untuk 7 kunci: tujuh `is_preview=false` dan tujuh
  `is_preview=true`. `byte_identical_duplicate_groups` nol. Jangan menghapus
  baris; baris `false` hilang berarti production kehilangan env, baris `true`
  hilang berarti preview kehilangan env.

## 5. SSH dijatahi brute-force

Ditangani per 2026-10-01. Audit dua jam pertama mencatat 202 baris `Failed
password` atau `Invalid user`, dan `fail2ban` belum terpasang. `sshd` berjalan
dengan `MaxStartups 10:30:100` dan `PerSourceMaxStartups none`. Nilai `none`
berbahaya: satu scanner dengan banyak koneksi paralel bisa menghabiskan jendela
unautentikasi, lalu koneksi operator di-drop acak. Di host ini pernah menyebabkan
outage nyata.

Perubahan ada di `/etc/ssh/sshd_config.d/60-bruteforce-resilience.conf`:

| Setting | Nilai | Penalaran |
|---|---|---|
| `PerSourceMaxStartups` | `3` | Satu sumber maksimal 3 koneksi; sepuluh scanner hanya mencapai 30 slot |
| `MaxStartups` | `50:30:100` | Acak-drop mulai 50, tolak semua di 100; jauh di atas 10 agar burst tidak mengunci operator |

Nama `60-` dipakai karena `Include` ada di baris 24 `sshd_config`, sebelum badan
file; OpenSSH memakai nilai pertama untuk satu keyword.

`fail2ban` memakai jail `sshd`, jail time 1 jam, find time 10 menit, maxretry 5,
`backend = systemd`, ban `nftables-multiport`. Ban pertama jatuh dalam beberapa
menit setelah jail hidup.

IP egress operator ada di `ignoreip` sebelum fail2ban dinyalakan:

```bash
sudo fail2ban-client get sshd ignoreip
```

`ignoreip` dievaluasi sebelum ban, jadi operator punya jaminan keras tidak
di-ban. Jangan pernah menjalankan `fail2ban-client` pertama kali tanpa
`ignoreip`; pemulihannya butuh konsol provider.

Dua jebakan:

1. `jail.conf` memuat `jail.d/*.conf`; file `.local` tidak dibaca dan fail2ban
   tidak mengeluh. Setelah memasang, pastikan `ignoreip` benar-benar terisi.
2. Reload, jangan restart `sshd`. `systemctl reload ssh` mempertahankan sesi
   berjalan sebagai lifeline.

Verifikasi:

```bash
sudo sshd -T | grep -iE 'maxstartups|persourcemaxstartups'
sudo sshd -t && sudo systemctl reload ssh
systemctl is-active fail2ban
sudo fail2ban-client status sshd
ssh ubuntu@<IP> 'hostname'
```

Kalau `sshd -t` gagal, jangan reload. Hapus drop-in, validasi ulang, perbaiki di
luar jam sibuk.

## Belum ditangani dan masih terbuka

Bagian ini sengaja tidak berisi rekomendasi karena butuh keputusan manusia.

### 1. Apakah panel Coolify perlu dibatasi sama sekali

Belum diputuskan. Panel terbuka memberi akses ke kunci production, tetapi
membatasi ke IP sendiri berarti kehilangan panel setiap IP berubah, dan
pemulihan hanya lewat SSH. Yang dibutuhkan sebelum memutuskan: apakah
`COOLIFY_API_TOKEN` dan akses panel dipakai rutin dari lebih dari satu lokasi,
dan apakah sudah ada jalur alternatif seperti WireGuard yang aktif. Tanpa
jawaban itu, perintah bagian 1 sebaiknya tidak dijalankan.

### 2. Apa yang sebenarnya diizinkan Tencent Cloud security group

Belum terverifikasi; ini celah pengetahuan paling serius. Yang diketahui hanya
`8080` dan `8443` ter-bind ke `0.0.0.0` tetapi timeout dari luar, sehingga ada
filter off-host. Yang tidak diketahui: daftar lengkap aturan inbound dan
outbound, apakah ada group lain, dan apakah port Traefik API termasuk di dalamnya.
Perintah penemuan ada di bagian 1, tetapi hasilnya hanya sah kalau dibaca di
konsol Tencent Cloud. Sampai itu dilakukan, perubahan `ufw` bukan pertahanan
lengkap.

### 3. Apakah restore test rantai backup pernah dijalankan

Tidak ada bukti. `DEPLOYMENT-REDUNDANCY.md` mendeskripsikan target dan urutan,
tetapi itu rencana, bukan bukti eksekusi. Yang dibutuhkan: tanggal restore test
terakhir, target, dan hasil verifikasi skema wajib setelah `pg_restore`. Kalau
tidak ada, anggap rantai backup belum terbukti dan jadwalkan restore test sebelum
mempercayai backup untuk perubahan data yang merusak.

### 4. Aplikasi Coolify kedua yang mati tetapi masih listens webhook

Ada dua baris di tabel `applications`. Yang kedua,
`k-p:main-m4kmotlkecfl9hhudiwismzp`, berstatus `exited`, tanpa container, nol
environment variable, dan tidak pernah punya job deploy. FQDN-nya masih
`sslip.io` yang memuat IP publik host.

`is_auto_deploy_enabled` kedua baris `true`, dan keduanya dari repo dan branch
yang sama. Coolify meneruskan satu event push ke setiap aplikasi yang cocok, jadi
selama baris kedua ada, satu `git push` ke `main` bisa memicu build di host 1,9
GiB ini, dan build adalah penyebab OOM kill terbesar. Aplikasi itu akan gagal
start karena nol env, tetapi build-nya sudah mengambil RAM.

Coolify tidak punya "archive"; yang ada `deleted_at` (soft delete). Dua opsi,
urut paling reversibel:

1. Set `is_auto_deploy_enabled` ke `false` pada baris itu. Satu flag, bisa
   dibalik, langsung menutup jalur.
2. Soft delete lewat dashboard.

Hard delete jangan dipakai sebelum opsi 1 dicoba, karena baris itu satu-satunya
catatan bahwa pernah ada aplikasi kedua. Sebelum memutuskan, pastikan apakah
aplikasi kedua pernah sengaja dibuat dan untuk apa.

---

Dokumen ini dimulai dari audit read-only. Sebagian perintah sudah dijalankan dan
ditandai tanggal. Semua angka runtime berasal dari satu waktu pengukuran dan
harus diverifikasi ulang sebelum dijadikan dasar keputusan.
