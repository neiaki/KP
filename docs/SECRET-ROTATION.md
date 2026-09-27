# Rotasi Secret

Dokumen ini adalah urutan kerja untuk mengganti secret yang sudah pernah
tampil di output terminal atau isi percakapan. Semua nilai secret di mesin ini
pernah tercetak di satu atau beberapa kesempatan, jadi harus dianggap bocor
meskipun hanya di satu mesin lokal. Biaya rotasi sekarang jauh lebih kecil
daripada risiko kunci yang tidak pernah diganti selamanya.

Dokumen ini sengaja tidak memuat nilai secret apa pun. Ambil nilai baru dari
dashboard masing-masing layanan, tempel langsung ke `~/.secrets`, dan jangan
pernah mencetaknya lagi.

## Aturan yang berlaku sepanjang proses

1. Kerjakan satu secret sampai selesai, termasuk verifikasinya, baru pindah
   ke secret berikutnya. Rotasi setengah jadi lebih berbahaya daripada tidak
   sama sekali, karena ada bagian sistem yang masih memakai kunci lama dan
   bagian lain yang sudah memakai kunci baru.
2. Pakai `sed -E 's|://([^:]+):[^@]*@|://\1:***@|'` untuk menyensor password
   dari output `psql` atau `curl`. Jangan pernah mencetak nilai penuh.
3. Sebelum mengganti, cek apakah secret itu dipakai lebih dari satu project.
   `~/.secrets` di-source oleh `~/.zshrc` dan `~/.bashrc`, jadi semua variabel
   di dalamnya diwarisi ke setiap terminal. Satu baris yang salah dapat
   mematikan empat project sekaligus.
4. Jangan commit apa pun selama proses ini. Semua nilai baru masuk ke
   `~/.secrets` atau secret manager Coolify, tidak pernah ke repository.
5. Setelah semua selesai, jalankan bagian verifikasi di akhir dokumen.

## Prioritas dan urutan

Kerjakan dari yang paling besar dampaknya ke yang paling kecil.

| Urutan | Secret | Dampak kalau bocor | Downtime |
|--------|--------|--------------------|----------|
| 1 | `COOLIFY_API_TOKEN` | Bisa mengubah dan membaca seluruh deployment produksi | Tidak ada |
| 2 | `GITHUB_TOKEN` dan `GITHUB_PERSONAL_ACCESS_TOKEN` | Bisa push ke repository dan membaca private repo | Tidak ada |
| 3 | `WIREGUARD_PRIVATE_KEY` | Bisa masuk ke jaringan privat seperti perangkat Anda sendiri | Ya, semua peer |
| 4 | Password database At Cell | Isi database toko, termasuk data pelanggan | Ya, aplikasi |
| 5 | `SUPABASE_SERVICE_ROLE_KEY` project Portfolio Web | Melewati seluruh RLS project tersebut | Tidak ada |
| 6 | `DB_PASSWORD` Postgres lokal | Hanya mesin ini, dan servernya sedang mati | Tidak ada |

## 1. COOLIFY_API_TOKEN

Token ini memberi akses penuh ke Coolify: melihat env production, memicu
deploy, membaca log, dan mengubah DNS. Kalau bocor, penyerang bisa membaca
`DATABASE_URL` production tanpa perlu password database.

1. Coolify, klik avatar kanan atas, lalu **API Tokens**.
2. Revoke token lama lebih dulu, supaya token baru tidak coexist dengan
   token lama yang masih bisa dipakai.
3. Create Token baru dengan masa berlaku pendek kalau Coolify mengizinkan.
   Token ini hanya dipakai untuk perintah CLI, bukan aplikasi.
4. Ganti nilainya di `~/.secrets` pada baris `COOLIFY_API_TOKEN`.
5. Verifikasi:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
     "$COOLIFY_BASE_URL/api/v1/version"
   ```

   `200` berarti token baru berfungsi. `401` atau `403` berarti masih salah.
   Isi `COOLIFY_BASE_URL` dengan domain instance Coolify Anda kalau variabel
   itu belum ada di `~/.secrets`.

## 2. GITHUB_TOKEN dan GITHUB_PERSONAL_ACCESS_TOKEN

Ada dua variabel GitHub di `~/.secrets`, dan hanya satu yang benar-benar
dipakai. Cek dulu yang mana yang aktif, lalu revoke yang tidak dipakai.

1. GitHub, **Settings**, lalu **Developer settings**, lalu
   **Personal access tokens**.
2. Revoke semua token di bagian fine-grained satu per satu.
3. Revoke juga token di bagian classic yang tidak dipakai lagi.
4. Buat token baru dengan scope paling sempit yang masih cukup. Kalau hanya
   untuk `git push` ke repository sendiri, scopes `repo` dan `read:user`
   sudah cukup, tanpa `workflow` kalau tidak memakai GitHub Actions.
5. Ganti di `~/.secrets`. Kalau `GITHUB_TOKEN` tidak dipakai proses apa pun,
   hapus saja barisnya supaya tidak menggoda dipakai lagi.
6. Verifikasi:

   ```bash
   gh auth status
   git -C /home/neki/Code/KP ls-remote --exit-code origin >/dev/null && echo "akses push ok"
   ```

## 3. WIREGUARD_PRIVATE_KEY

Private key yang bocor berarti siapa pun yang memilikinya bisa membuat
klien WireGuard yang bergabung ke jaringan privat Anda, termasuk jaringan
rumah. Dampaknya nyata, bukan teoritis.

1. Login ke VPS. Jangan dump private key lama ke terminal.
2. Buat keypair baru di server:

   ```bash
   umask 077
   wg genkey > /etc/wireguard/private.key
   wg pubkey < /etc/wireguard/private.key > /etc/wireguard/public.key
   ```

3. Catat public key baru. Public key bukan rahasia, jadi boleh dicetak:

   ```bash
   cat /etc/wireguard/public.key
   ```

4. Ganti baris `PrivateKey` di `/etc/wireguard/wg0.conf` dengan isi
   `/etc/wireguard/private.key`, lalu restart service WireGuard.
5. Untuk setiap peer yang memakai kunci server lama, buat private key baru di
   sisi peer, lalu perbarui PublicKey milik peer tersebut di `wg0.conf`.
   Mengganti kunci server membuat semua peer lama langsung terputus, jadi
   siapkan seluruh konfigurasi peer sebelum restart.
6. Setelah semua peer berhasil handshake dengan kunci baru, keluarkan public
   key lama dari `wg0.conf`.
7. Ganti nilainya di `~/.secrets` pada baris `WIREGUARD_PRIVATE_KEY`.
8. Verifikasi:

   ```bash
   wg show wg0 latest-handshakes
   ```

   Nilai unix timestamp yang berubah menandakan peer berhasil handshake
   dengan kunci baru. Perintah ini butuh hak root di VPS, jadi jalankan
   sebagai user yang biasa Anda pakai untuk mengelola server.

## 4. Password database At Cell

Ini rotasi yang paling berdampak ke aplikasi. Password-nya ada di empat
tempat, dan semuanya harus sinkron. Kalau satu terlupa, aplikasi tidak bisa
mengakses database.

Letak nilai yang harus diperbarui:

1. `DATABASE_URL` di `/home/neki/Code/KP/.env`
2. `ATCELL_DATABASE_URL` di `~/.secrets`
3. `SUPABASE_DATABASE_PASSWORD` di `~/.secrets`
4. `DATABASE_URL` di Coolify, environment production

`ATCELL_DATABASE_URL` sengaja tidak di-export, jadi hanya variabel shell dan
tidak dibaca aplikasi. Tetap harus diperbarui karena dipakai perintah manual.

Langkah:

1. Siapkan langkah 2 sampai 4 lebih dulu. Password lama langsung tidak
   berlaku setelah di-reset, termasuk untuk koneksi pooler yang sedang
   terbuka, jadi aplikasi akan error begitu koneksi berikutnya dibuat.
2. Supabase, **Project Settings**, lalu **Database**, bagian password, lalu
   **Reset**.
3. Ganti password di `DATABASE_URL` pada `/home/neki/Code/KP/.env`.
   Pertahankan bentuk pooler, yaitu port `6543` dan user berawalan `postgres.`
4. Ganti di Coolify pada environment production, lalu redeploy.
5. Ganti di `~/.secrets` pada `ATCELL_DATABASE_URL` dan
   `SUPABASE_DATABASE_PASSWORD`.
6. Restart dev server lokal, karena `DATABASE_URL` dibaca sekali saat start.
7. Verifikasi:

   ```bash
   cd /home/neki/Code/KP
   set -a; . ./.env; set +a
   psql "$DATABASE_URL" -X -q -A -t -c "select count(*) from public.products;"
   curl -s http://localhost:3000/api/health/ready
   ```

   `databaseReachable: true` dan `status: ready` berarti selesai. Cek juga
   halaman katalog publik, karena di situ kegagalan koneksi paling terlihat
   oleh pengunjung.

## 5. SUPABASE_SERVICE_ROLE_KEY project Portfolio Web

Variabel ini milik project Supabase yang terpisah dari At Cell. Buka blok
`# Supabase - Portfolio Web` di `~/.secrets` untuk memastikan project mana
yang dimaksud.

1. Supabase, pilih project Portfolio Web, lalu **Project Settings**, lalu
   **API Keys**.
2. Buat kunci secret baru. Project lama menamai kunci ini `service_role`,
   sedangkan project baru menamainya `secret`.
3. Ganti di `~/.secrets`, lalu update aplikasi yang memakainya. Kalau project
   tersebut tidak sedang aktif, cukup ganti di `~/.secrets` tanpa deploy.
4. Verifikasi dengan menguji kunci baru, bukan menguji kunci lama:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "$SUPABASE_URL/rest/v1/"
   ```

   `200` berarti berfungsi. `401` berarti kunci ditolak.

## 6. DB_PASSWORD Postgres lokal

Postgres lokal sedang mati, tidak ada listener di port 5432, dan tidak ada
project aktif yang memakainya. Enam variabel `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, dan `LOCAL_PG_URL` semuanya milik instance lokal
yang sama itu.

Dua pilihan, ambil yang lebih mudah:

- Benar-benar tidak dipakai: hapus semua enam baris dari `~/.secrets`.
  Tidak ada yang bisa rusak karena tidak ada yang mengacunya.
- Kalau nanti memang mau dipakai lagi: start Postgres, lalu jalankan
  `ALTER USER` dengan password baru.

## Verifikasi akhir

Setelah semua selesai, jalankan pemeriksaan berikut. Tidak satu pun perintah
ini mencetak nilai secret.

```bash
# 1. Tidak ada secret di riwayat repository.
#    Pola sed di bawah sengaja menangani dua bentuk sekaligus: dengan dan
#    tanpa prefiks "export ".
cd /home/neki/Code/KP
for v in WIREGUARD_PRIVATE_KEY COOLIFY_API_TOKEN DB_PASSWORD \
         SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL; do
  nilai=$(sed -n "s/^export $v=//p; s/^$v=//p" ~/.secrets)
  [ -n "$nilai" ] || continue
  if git log --all -S "$nilai" --oneline -- . | grep -q .; then
    echo "BOCOR DI RIWAYAT: $v"
  else
    echo "aman: $v"
  fi
done

# 2. Tidak ada connection string dengan password di riwayat.
git log --all -p -G 'postgresql://[a-zA-Z0-9_]+:[^@{ ]+@' --oneline | head

# 3. Tidak ada secret di source yang sedang berjalan.
grep -rnE "eyJ[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}" src/ scripts/ | head

# 4. Berkas secret hanya bisa dibaca pemiliknya.
stat -c '%a %n' ~/.secrets

# 5. Health aplikasi masih hijau.
curl -s http://localhost:3000/api/health/ready

# 6. Tidak ada secret global yang menimpa .env proyek.
bash -lc 'if [ -n "${DATABASE_URL:-}" ]; then echo "MASIH ADA"; else echo "aman"; fi'

# 7. Daftar secret yang masih di-export, jadi diwarisi ke semua proses anak.
grep -nE '^export ' ~/.secrets | sed 's/=.*/=<nilai disembunyikan>/'
```

Keluarannya harus: tidak ada baris `BOCOR DI RIWAYAT`, kata `aman` untuk tiap
variabel, `600`, `"status":"ready"`, `aman`, lalu daftar export yang isinya
cuma variabel yang memang perlu diwarisi aplikasi.

## Secret yang sekarang diwarisi ke semua proses

`~/.secrets` di-source oleh `~/.zshrc` dan `~/.bashrc`. Setiap baris `export`
di dalamnya menjadi milik semua proses anak, termasuk setiap proses Node.js,
setiap perintah git, dan setiap build. Private key WireGuard yang ter-export
berarti setiap alat di mesin ini punya salinan kunci jaringan Anda di
memori, dan tidak ada yang menyadarinya.

Periksa daftar itu dengan perintah langkah 7 di atas. Untuk secret yang hanya
dipakai manual, hapus prefiks `export`, seperti yang sudah dilakukan untuk
`ATCELL_DATABASE_URL` dan `COOLIFY_API_TOKEN`. Untuk secret yang memang dipakai
aplikasi, pindahkan nilainya ke `.env` proyek, dan biarkan baris di
`~/.secrets` sebagai cadangan tanpa `export`.

## Kalau ini diulang

Penyebab utama semua ini adalah `~/.secrets` di-source oleh dua file rc, lalu
semua variabelnya diwarisi ke setiap proses anak. Framework seperti Next.js,
Drizzle, Prisma, dan Hono membaca `process.env` dengan prioritas di atas
`.env` proyek, sehingga nilai global selalu menang.

Aturan untuk secret baru:

1. Pakai nama per proyek, bukan nama generik. `LOCAL_PG_URL` boleh,
   `DATABASE_URL` global tidak. Bandingkan `ATCELL_DATABASE_URL` yang sudah
   memakai pola ini.
2. Jangan export variabel yang hanya dipakai manual.
   `ATCELL_DATABASE_URL` sengaja tidak di-export supaya tidak diwarisi ke
   aplikasi.
3. Kalau nilainya memang dipakai aplikasi, tulis di `.env` proyek, bukan di
   `~/.secrets`.
4. Kalau nilainya hanya dipakai perintah manual, biarkan tidak di-export.
