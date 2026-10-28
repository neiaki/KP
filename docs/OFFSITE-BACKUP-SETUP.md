# Menyalakan Backup Off-site At Cell

Backup harian At Cell hanya hidup di VPS yang sama dengan aplikasinya. Jadi
kegagalan VPS berarti seluruh cadangan hilang bersamaan dengan tempat
aplikasinya. Dokumen ini adalah langkah konkret untuk menyalakan salinan
off-host, dari keadaan sekarang sampai terverifikasi.

Tidak ada kode yang perlu diubah. Yang dibutuhkan adalah kredensial dan tujuan
upload, keduanya milik owner. Script repo sudah gagal-terbuka, jadi selama
langkah ini belum selesai, cron mencatat `GAGAL` setiap malam dan tidak ada
yang terkirim. Itu memang perilaku yang dikehendaki: cadangan yang diam-diam
tidak jalan lebih berbahaya daripada tidak ada, karena ia menciptakan rasa aman
yang palsu.

## Keadaan sekarang

| Hal | Nilai |
|---|---|
| `/root/.atcell-offsite.env` | tidak ada |
| `rclone` | tidak terpasang |
| `/root/.config/rclone/rclone.conf` | tidak ada |
| Cron | `/etc/cron.d/atcell-offsite`, setiap hari 02.47 waktu host |
| Wrapper | `/usr/local/bin/atcell-offsite` |
| Script repo | `/opt/atcell/scripts/backup-offsite.sh` |
| Dump lokal | `/data/backups/atcell/atcell-<timestamp>.dump` + `.sha256` |
| Log | `/var/log/atcell-offsite.log` |

Host berjalan di Asia/Shanghai (+08). 02.47 di sana setara 01.47 WIB, setengah
jam setelah backup harian 02.17, supaya dump terbaru sudah ada dan sudah
di-checksum.

## Langkah 1: passphrase enkripsi

Passphrase ini yang melindungi isi dump. Dipakai script repo lewat
`OFFSITE_PASSPHRASE_FILE`, jadi nilainya tidak pernah masuk argumen proses
(lihat `/proc/<pid>/cmdline`) dan tidak ikut terbawa ke environment anak.

```bash
sudo install -o root -g root -m 600 /dev/null /root/.atcell-offsite.passphrase
sudo bash -c 'openssl rand -base64 48 > /root/.atcell-offsite.passphrase'
```

Buat passphrase sendiri kalau lebih suka, tapi harus panjang dan acak.
Passphrase hilang berarti seluruh arsip off-site tidak bisa dibuka lagi.

## Langkah 2: pilih tujuan upload

### Opsi A: rclone (disarankan)

Pemasangan rclone:

```bash
sudo bash -c 'curl -fsSL https://rclone.org/install.sh | bash'
```

Lalu buat remote. `rclone config` bersifat interaktif, jadi jalankan lewat SSH
sendiri. Untuk Cloudflare R2, contoh:

```bash
rclone config
# name> r2
# Storage> s3
# provider> Cloudflare
# access_key_id> ...
# secret_access_key> ...
# endpoint> https://<account-id>.r2.cloudflarestorage.com
```

Remote hanya hidup di `~/.config/rclone/rclone.conf` milik user yang
menjalankan `rclone config`. Karena cron berjalan sebagai root, jalankan
sebagai root:

```bash
sudo rclone config
```

### Opsi B: HTTP PUT

Untuk endpoint yang menerima `PUT` dengan bearer token. Contoh endpoint
seperti S3-compatible HTTP gateway atau object storage dengan REST API
tersedia. Yang dibutuhkan:

- `OFFSITE_PUT_URL`: URL dasar, tanpa nama berkas. Script menempelkan
  `/<nama-berkas>` sendiri.
- `OFFSITE_PUT_TOKEN`: token bearer, atau `OFFSITE_PUT_TOKEN_FILE` yang
  menunjuk ke file 0600.

## Langkah 3: isi env file

`/root/.atcell-offsite.env` dibaca wrapper `/usr/local/bin/atcell-offsite`
dengan `set -a; . "$ENV_FILE"; set +a`, jadi isinya format shell biasa.

```bash
sudo install -o root -g root -m 600 /dev/null /root/.atcell-offsite.env
sudo bash -c 'cat > /root/.atcell-offsite.env <<EOF
OFFSITE_PASSPHRASE_FILE=/root/.atcell-offsite.passphrase
OFFSITE_RCLONE_REMOTE=r2:atcell-backup
EOF'
```

Untuk Opsi B, ganti baris kedua dengan:

```
OFFSITE_PUT_URL=https://example-endpoint/backups
OFFSITE_PUT_TOKEN_FILE=/root/.atcell-offsite.token
```

Satu berkas env boleh memuat kedua tujuan sekaligus. Kalau salah satu gagal,
script tetap berhenti dengan pesan yang menyebut penyebabnya.

## Langkah 4: jalankan manual sekali

Jangan menunggu cron. Jalankan sendiri dan baca outputnya:

```bash
sudo /usr/local/bin/atcell-offsite
```

Keluarannya harus berakhir tanpa pesan `GAGAL`. Periksa log:

```bash
sudo tail -n 20 /var/log/atcell-offsite.log
```

## Langkah 5: buktikan berkasnya benar-benar ada di sisi jauh

Exit 0 saja belum bukti, karena script lama pernah keluar 0 tanpa mengirim
apa pun. Yang diperiksa adalah berkasnya:

```bash
# Nama berkas yang dikirim
sudo ls -lht /data/backups/atcell/.offsite/ | head

# Isi bucket tujuan, untuk Opsi A
sudo rclone ls r2:atcell-backup

# Checksum sisi jauh harus sama dengan sisi lokal
sudo sha256sum /data/backups/atcell/.offsite/atcell-*.dump.enc | head
sudo rclone cat r2:atcell-backup/atcell-<nama>.dump.enc.sha256
```

Untuk Opsi B, unduh satu berkas yang baru dikirim lalu bandingkan checksum-nya
dengan sidecar `.sha256` yang ikut terkirim.

## Langkah 6: pastikan rotasi jalan

`OFFSITE_KEEP_ENCRYPTED` menentukan berapa salinan terenkripsi yang disimpan
lokal. Bawaan 3. Yang terkirim ke luar tidak pernah dihapus dari sisi jauh
oleh script, jadi rotasi di sisi tujuan ikut penting.

Setelah langkah 1 sampai 5 selesai, aktifkan juga backup Storage. Scriptnya
sudah terpasang di `/opt/atcell/scripts/backup-storage.sh`, tapi belum punya
wrapper dan belum punya jadwal, dan butuh lebih banyak hal daripada off-site
dump.

Wrapper-nya mengikuti pola `atcell-offsite`: membaca berkas env 0600, mengambil
`DATABASE_URL` dari container aplikasi saat runtime, lalu memanggil script repo.
`/usr/local/bin/atcell-storage-backup`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT=/opt/atcell/scripts/backup-storage.sh
ENV_FILE=/root/.atcell-storage.env

[ -x "$SCRIPT" ] || { echo "GAGAL: script hilang: $SCRIPT" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "GAGAL: env file hilang: $ENV_FILE" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

APP="$(docker ps --filter "name=mebqjoh2ne1y3vt6jqryvvu9" --format '{{.Names}}' | head -n1)"
[ -n "$APP" ] || { echo "GAGAL: container aplikasi tidak jalan" >&2; exit 1; }

# Kuncinya ditulis ulang dari DATABASE_URL menjadi SOURCE_DATABASE_URL karena
# itu nama yang dibaca script, dan pg_dump --schema=storage butuh DSN.
export SOURCE_DATABASE_URL="$(docker exec "$APP" printenv DATABASE_URL)"
export STORAGE_SUPABASE_URL="$(docker exec "$APP" printenv NEXT_PUBLIC_SUPABASE_URL)"
export STORAGE_API_KEY="$(docker exec "$APP" printenv SUPABASE_SECRET_KEY)"
export BACKUP_DIR=/data/backups/atcell

bash "$SCRIPT"
```

Simpan blok wrapper di atas sebagai `/usr/local/bin/atcell-storage-backup.new`,
lalu validasi dan pasang dengan hak root:

```bash
sudo bash -n /usr/local/bin/atcell-storage-backup.new
sudo install -o root -g root -m 755 /usr/local/bin/atcell-storage-backup.new /usr/local/bin/atcell-storage-backup
```

Isi `/root/.atcell-storage.env` (mode 0600, milik root):

```
STORAGE_PASSPHRASE_FILE=/root/.atcell-offsite.passphrase
STORAGE_OFFSITE_RCLONE_REMOTE=r2:atcell-backup
BUCKETS=product-images,service-photos,trade-in-photos
```

`STORAGE_SUPABASE_URL`, `STORAGE_API_KEY`, `SOURCE_DATABASE_URL`, dan
`BACKUP_DIR` tidak ditulis di env file karena wrapper mengambilnya dari
container aplikasi saat runtime. Kuncinya tidak pernah menyentuh berkas di
disk.

Lalu jadwalkan di `/etc/cron.d/atcell-storage-backup`, misalnya 03.17 waktu
host, satu jam setelah off-site dump. **Jangan jadwalkan sebelum langkah 1
sampai 5 benar-benar terbukti terkirim.** Job Storage juga gagal-terbuka, jadi
menjadwalkannya terlalu awal hanya menambah satu baris `GAGAL` setiap malam
tanpa ada yang bisa memperbaikinya.

Setelah jadwal aktif, buktikan sekali lagi dengan menjalankan manual:

```bash
sudo /usr/local/bin/atcell-storage-backup
```

Keluarannya harus menyebut jumlah objek dan bucket, lalu drill verifikasi harus
lulus:

```bash
sudo bash /opt/atcell/scripts/restore-storage-drill.sh
```

## Langkah 7: buktikan restore-nya

Backup yang belum pernah dipulihkan belum bisa disebut cadangan. Setelah
off-site aktif, ambil satu arsip dari sisi jauh, unduh ke mesin lain, lalu
dekripsi dan periksa isinya:

```bash
# Arkripsi adalah dump pg_dump format custom, dienkripsi jadi satu berkas .enc
openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 \
  -in atcell-<timestamp>.dump.enc -pass file:/root/.atcell-offsite.passphrase \
  -out atcell-<timestamp>.dump

# Isinya harus daftar isi dump yang bisa dibaca, termasuk auth.users
pg_restore --list atcell-<timestamp>.dump | grep -c "TABLE DATA auth users"
```

Angka yang keluar harus lebih besar dari nol. Dump tanpa `auth.users` berarti
restore target tempat tidak ada satu pun orang yang bisa login, dan itu tidak
bisa terlihat dari sisi restore.

## Kalau ada yang gagal

| Pesan | Arti | Yang harus dibenahi |
|---|---|---|
| `OFFSITE belum dikonfigurasi: tidak ada passphrase` | `OFFSITE_PASSPHRASE_FILE` kosong atau tidak terbaca | Cek nama file dan izin 0600-nya |
| `tidak ada tujuan upload` | `OFFSITE_RCLONE_REMOTE` dan `OFFSITE_PUT_URL` keduanya kosong | Isi salah satu di env file |
| `rclone tidak terpasang` | Opsi A dipilih tapi rclone belum ada | Pasang rclone, jalankan `sudo rclone config` |
| `OFFSITE_PUT_URL diisi tapi token kosong` | Opsi B dipilih tapi token tidak terbaca | Isi `OFFSITE_PUT_TOKEN` atau `OFFSITE_PUT_TOKEN_FILE` |
| `checksum sisi jauh beda` | Berkas yang diterima tidak sama dengan yang dikirim | Jangan percayai salinan itu; periksa jaringan dan tujuan upload |

## Yang tidak boleh dilakukan

- Jangan menaruh passphrase atau token langsung di `/etc/cron.d/`. Isinya
  terbaca setiap user di host.
- Jangan memakai `OFFSITE_PASSPHRASE` di env file kalau bisa pakai
  `OFFSITE_PASSPHRASE_FILE`. Nilai yang diekspor ikut terbawa ke semua proses
  anak.
- Jangan menyalakan cron Storage sebelum off-site dump benar-benar terbukti
  terkirim.
- Jangan menghapus arsip lokal karena yakin sudah ada di sisi jauh. Yang menentukan
  restore adalah restore yang sudah pernah dicoba.
