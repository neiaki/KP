# Status Pekerjaan At Cell

Terakhir diperbarui: 1 Oktober 2026
Base: `main` = `c133442`

Berkas ini adalah peta posisi kerja: apa yang sudah jadi, apa yang sedang
dikerjakan, dan apa yang masih menunggu keputusan manusia. Dipakai supaya
tidak ada pekerjaan yang dikira selesai padahal belum, atau dikerjakan dua
kali karena tidak ingat sudah pernah.

Cara memperbarui: satu baris per butir. Pindahkan butir ke bagian yang
sesuai setiap kali statusnya berubah, dan perbarui bagian "Bukti" dengan
sha commit atau nomor PR. Jangan menandai sesuatu selesai tanpa bukti.

---

## Ringkasan

| # | Tugas | Status | Bukti |
|---|---|---|---|
| 1 | Koreksi header migrasi A55 | selesai | `1f2d689` |
| 2 | Sembunyikan produk 6 dari katalog | selesai | `084bd35` |
| 3 | Izinkan `default_price` bernilai 0 | selesai, **test penjaga belum ada** | `084bd35` |
| 4 | Deploy `1f2d689` + `166a250` | selesai | `c133442` |
| 5 | Perbaikan CSP host ingest Sentry regional | selesai, **belum di-push** | `a0933a2` |
| 6 | Test penjaga validasi harga 0 | selesai | `a0933a2` |

---

## Yang sudah selesai

### 1. Koreksi header migrasi A55

Header `supabase/migrations/20260927202000_trim_crop_duplicate_a55_photos.sql`
sudah ditulis ulang ke hasil pengukuran, bukan tebakan. Isinya sekarang:

- `a55-3` potongan dari `a55-1` (NCC 0,912)
- `a55-4` juga potongan dari `a55-1`, dan nyaris salinan `a55-3` (NCC 0,9966)
- `a55-5` potongan dari `a55-2` (NCC 0,868), terhadap `a55-3` hanya 0,775
- Warna: `a55-1` iceblue, `a55-2` pink. Urutan galeri lama iceblue, pink,
  iceblue, iceblue, pink

**Catatan penting soal warna.** Dua instruksi yang saling bertentangan masuk
ke sesi ini: satu mengklaim label warna di file terbalik, satu lagi mengira
`a55-1` pink dan `a55-2` blue. Keduanya salah. Kedua gambar sudah dibuka dan
dilihat langsung: `a55-1` benar-benar render iceblue (bodi biru pucat),
`a55-2` pink. File migrasi sudah benar soal warna sejak awal. Jangan diubah ke
warna terbalik.

**Pengukuran independen 1 Oktober 2026, ZNCC.** Klaim di header diuji ulang
dengan normalized cross-correlation yang benar, diulang pada lima ukuran
jendela (20%, 25%, 30%, 35%, 40% sisi terpanjang template). Kesimpulannya
cocok dengan yang tertulis di header, di semua ukuran:

| Klaim di header | Hasil ZNCC | Margin antar render |
|---|---|---|
| `a55-3` dari `a55-1` | 0,753 sampai 0,905 ke `a55-1` | 0,178 sampai 0,248 di atas `a55-2` |
| `a55-4` dari `a55-1` | 0,745 sampai 0,888 ke `a55-1` | 0,187 sampai 0,225 di atas `a55-2` |
| `a55-4` nyaris salinan `a55-3` | 0,940 sampai 0,992 | 0,073 sampai 0,453 di atas `a55-5` |
| `a55-5` dari `a55-2` | 0,665 sampai 0,836 ke `a55-2` | 0,127 sampai 0,471 di atas `a55-1` |

Angka spesifik di header (0,912, 0,9966, 0,868, 0,775) sengaja tidak ditulis
ulang dengan angka ZNCC. Metodenya berbeda: header mengukur pada skala 1,35,
sedangkan ZNCC memakai resolusi asli tanpa penskalaan. Mengganti satu dengan
yang lain bukan perbaikan, karena angka header lalu tidak bisa direproduksi,
sedangkan angka ZNCC tidak mengukur apa yang dituduhkannya. Yang terbukti
adalah struktur induknya, dan itu yang pernah dikoreksi.

Skrip pengukurannya sengaja tidak disimpan di repo. Dua alasan: `sharp` hanya
bisa di-resolve dari dalam repo sehingga berkasnya menggantung di working tree
setiap kali pengukuran diulang, dan nilai ZNCC selalu bergantung pada ukuran
jendela yang dipilih, jadi hasilnya hanya bermakna bersama ukuran jendelanya.
Itu harus dituliskan di setiap pengukuran, bukan dititipkan ke berkas sekali
lalu dianggap berlaku untuk selama-lamanya.

Hanya komentar yang berubah. Pernyataan SQL tidak boleh disentuh, dan tidak
perlu: `a55-3`, `a55-4`, `a55-5` memang tetap dipangkas, hasilnya sama.

Teks penjelas di `src/lib/mock-data.ts` dan `tests/etalase-image-source.test.ts`
sudah disesuaikan. Array gambarnya tidak diubah.

### 2. Sembunyikan produk 6

Migrasi `20261001120000_hide_unidentified_product_6.sql` sudah ada dan sudah
terdaftar di tiga tempat yang diwajibkan:

- `supabase/migrations-ledger.snapshot:53`
- `supabase/RUN-ALL-PENDING.sql:41` dan `:3261`
- `docs/DEPLOYMENT-REDUNDANCY.md`

Hanya menyentuh `products.is_active` untuk `id = 6`. Brand, `model_name`,
`default_price`, unit `id = 10`, dan jejak audit tidak disentuh. Alasannya
sudah ditulis di header migrasi: merek dan model adalah keputusan merchandising
yang hanya bisa dijawab orang yang memegang unit fisiknya, dan menebak berarti
mengarang identitas barang.

Produknya dibiarkan bisa dikembalikan lewat portal, jadi keputusan " Perlihat
lagi setelah identitasnya jelas" tidak butuh SQL.

### 3. Izinkan `default_price` bernilai 0

Validasi di `src/app/(portal)/portal/products/page.tsx:89`:

```ts
if (!Number.isFinite(defaultPrice) || defaultPrice < 0) {
```

Nol lolos, negatif dan non-angka tetap ditolak. Yang berubah hanya validasi,
data `products.id = 11` tetap 0.

### 4. Deploy

Rantai dua tahap sudah dijalankan dua kali dan berhasil:

| Deploy | Commit di pin | Sumber |
|---|---|---|
| `tgvuwn0mipao0btlkpsr7ul8` | `1f2d689` | PR #50 + PR #51 |
| `wzq7p5tbgxbqo8xndyl37kjc` | `166a250` | PR #52 + PR #53 |

`Dockerfile.coolify:34` sekarang menunjuk
`ghcr.io/neiaki/kp:sha-166a250d24ea44306c39ab970c16160b01578e86`.

Auto-deploy GitHub sudah hidup: hook `690319788` aktif untuk event `push`,
tiga delivery terakhir status 200, dan setiap push ke `main` memang
memicu deploy Coolify sendiri tanpa dipicu manual. Endpoint manual-webhook
tetap ada sebagai jalur cadangan.

---

## Sedang dikerjakan

### 5. Perbaikan CSP host ingest Sentry regional

**Status: sudah di-commit sebagai `a0933a2`, belum di-push, belum di-deploy.**

DSN Sentry At Cell ternyata regional: hostnya
`o4511269966905344.ingest.us.sentry.io`. Sebelumnya `connect-src` hanya
mengizinkan `https://*.ingest.sentry.io`, dan wildcard `*.` di CSP hanya
menutup satu label di depan, jadi host dengan label `us` di antaranya **tidak**
tercakakup. Akibatnya browser membuang setiap envelope tanpa pesan.

Artinya sebelum perbaikan ini, Sentry server-side berjalan tapi browser-side
mati diam-diam. Itu sebabnya dashboard Sentry kosong.

Berkas yang berubah:

- `src/lib/csp.ts` - `ASAL_INGEST_SENTRY` jadi tiga host: non-regional, `us`, `de`
- `tests/csp-sentry-connect-src.test.ts` - dua DSN regional baru, satu test
  khusus yang memverifikasi host regional tertutup, dan satu host
  `...sentry.io.evil.example` ke daftar yang harus tertutup

Bukti sudah getaway: `tsc` 0, test 608/594 lolos/0 gagal, lint 0 error, build
sukses. Patch juga sengaja dibatalkan sekali untuk membuktikan test barunya
memang menangkap bug, hasilnya 3 test gagal.

`connect-src` hasil build:
`'self' https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io`

**Langkah berikutnya: push, buka PR, lalu deploy.** Tanpa itu, Sentry browser
tetap mati, karena produksi masih menjalankan versi CSP yang salah.

---

## Selesai di sesi 1 Oktober 2026

### 6. Test penjaga validasi harga 0

**Sudah.** Aturannya diekstrak ke `hargaAcuanLayak` di
`src/lib/validations.ts:110` supaya bisa diuji, lalu dipakai form di
`src/app/(portal)/portal/products/page.tsx:95`. Penjagaannya tadinya inline di
dalam komponen React, jadi tidak ada satu pun test yang bisa mengunci `< 0`.
Satu karakter yang berubah menjadi `<= 0` akan lolos tanpa ada yang
memberitahu.

Empat test baru di `tests/harga-acuan.test.ts`:

1. Nol tetap sah, termasuk lewat `productSchema`, karena hanya lolos di form
   saja tidak cukup: kalau skema ikut menolak, produk tanpa harga tidak bisa
   disimpan dari mana pun
2. Negatif dan nilai bukan number finite ditolak, termasuk bentuk string yang
   mungkin masuk dari JSON, bukan cuma number bertipe
3. Form benar-benar memanggil `hargaAcuanLayak`, dan penjagaan inline yang
   dulu ada dilarang muncul lagi supaya tidak ada dua sumber kebenaran
4. Sisi baca etalase tetap menyembunyikan baris harga saat nol, jadi `0` bisa
   ditulis tanpa pernah tampil sebagai "Rp0" ke pembeli

Bukti test menangkap regresi, bukan cuma hijau di atas kertas:
`hargaAcuanLayak` sengaja diubah jadi `> 0` lalu test 1 gagal. Form sengaja
disuntik `defaultPrice <= 0` lalu test 3 gagal. Keduanya dipulihkan, 4 dari 4
hijau.

Test lama di `tests/validation-symmetry.test.ts:289` yang mengunci pola inline
ikut diperbarui: sekarang hanya memeriksa pemanggilan. Menguji aturan dengan
pencocokan teks tidak bisa membuktikan aturan itu benar, hanya bisa membuktikan
teksnya masih ada.

---

## Menunggu keputusan manusia

Lima hal ini tidak bisa dikerjakan siapa pun tanpa data fisik atau dari pemilik toko. Semuanya sengaja tidak dikarang.

### Butuh data fisik

| Butir | Kenapa mustahil tanpa data |
|---|---|
| 18 IMEI asli | IMEI adalah identitas perangkat nyata. Memalsukannya berarti situs mengiklankan ponsel yang tidak ada, dan jejak audit serta kartu garansi mencatat perangkat yang salah. Butuh 5 unit tersedia per merek |
| Identitas asli produk 6 | Butuh handset-nya di konter. Brand `Xiaomi` dan model `iphone 16` saling bertentangan |
| Harga acuan produk 11 | Angka 0 berarti "belum dikonfirmasi", bukan harga. Butuh keputusan toko |
| Foto iPhone 14 Plus | Butuh foto asli barang yang dijual |

### Perlu konfirmasi

**Empat harga tayang publik sebagai "Harga katalog".** Semuanya dari
`src/lib/mock-data.ts`, yaitu data demo, bukan harga toko:

| Produk | Harga tayang |
|---|---|
| iPhone 15 Pro | Rp18.499.000 |
| Samsung S24 Ultra | Rp21.999.000 |
| Xiaomi 14 | Rp11.999.000 |
| Vivo V30 | Rp5.999.000 |

Keempatnya berlabel "Belum ada unit" dan tidak bisa dibeli, jadi tidak ada janji
palsu ke pelanggan. Tapi angkanya terlihat publik, dan hanya pemilik toko yang
bisa memastikan kebenarannya.

---

## Perlu keputusan teknis

| Butir | Status |
|---|---|
| Peta warna A55 | Sudah selesai, tidak perlu tindakan |
| Batas memori container Coolify | Menunggu pengukuran di bawah trafik nyata |
| `product_images` untuk 4 produk katalog baru | Belum ada baris-nya |
| `oppo-reno11-1.png` resolusi rendah | Perlu diganti foto resolusi tinggi |
| `vivo-y36-1.jpg` | Belum diverifikasi benar-benar depicting Vivo Y36 |
| Galeri S24 Ultra near-duplicate dan foto Galaxy Note | Belum diputuskan |

---

## Pembersihan VPS 1 Oktober 2026

Read-only audit dulu, baru olah. Semua angka di bawah diukur dari hostnya,
bukan dari dashboard Coolify.

### Yang dibersihkan

| Yang | Sebelum | Sesudah |
|---|---|---|
| Image Docker At Cell lama (5 tag) | 7 tag | 2 tag |
| Build cache | 626,9 MB | 0 |
| Cache apt | 106 MB | 32 KB |
| Disk `/` | 18 GB terpakai (48%) | 16 GB terpakai (43%) |
| Swap terpakai | 917 MB | 738 MB |

Image yang **dipertahankan** sengaja: `c133442` yang sedang jalan, dan
`1f2d689` sebagai jalur rollback. `docker image prune -a` tidak boleh
dijalankan, karena ia akan menghapus keduanya tanpa ditanya.

### RAM: tidak bisa "dibersihkan", hanya bisa dikurangi

VPS punya 1,9 GB RAM dan menjalankan 9 container. Swap terpakai 917 MB (45%),
dan itu kondisi normal untuk host sekecil ini, bukan tanda bahwa masalah.
Tidak ada sampah RAM yang bisa di-collect: yang diproses tetap diproses.

Penyumbang swap terbesar ternyata bukan trafik produksi, melainkan
`opencode serve` milik alat kerja sendiri: 153,5 MB swap, lebih dari
`next-server` aplikasi At Cell (58,6 MB). Sudah dihapus sesuai permintaan,
dan binarynya 194 MB ikut dibuang. Tidak ada unit systemd, crontab, maupun
entri autostart yang menghidupkannya lagi, jadi tidak akan muncul diam-diam
setelah reboot.

### Yang sengaja tidak disentuh

- Backup `/data/backups`, hanya 4,8 MB dan semua masih dipakai
- `hids.log.bak` milik agen keamanan Tencent Cloud, 40 MB. File vendor
- Image Coolify, Postgres, Traefik, Redis, sentinel, buildkit
- Swap file itu sendiri, 2 GB. Kapasitas swap tidak dikecilkan karena
  host ini memang tidak punya RAM cadangan

Semua perubahan sudah diverifikasi tidak mengganggu produksi:
`/id`, `/id/catalog`, dan `/api/health/ready` tetap 200, ketiga container
tetap `healthy`.

## Catatan operasional

**SSH ke VPS.** Host pakai `MaxStartups 10:30:100` dengan `PerSourceMaxStartups`
sudah diset 3, dan terus-menerus dipindai dari luar. Percobaan ulang cepat pernah
benar-benar menyebabkan satu kali gangguan. Beri jeda minimal 30 detik antar
permintaan SSH. Begitu melihat `kex_exchange_identification`, berhenti dan
tunggu, jangan mencoba ulang dalam loop.

**Migrasi database.** Jangan pernah memakai `supabase db push`.
`docs/DEPLOYMENT-REDUNDANCY.md` melarangnya karena nomor version di ledger
tidak sama dengan nama file, sehingga `db push` menjalankan ulang migrasi yang
sudah diterapkan. Pakai `psql`, satu file satu transaksi, dengan
`--single-transaction -v ON_ERROR_STOP=1`.

**Backup.** Sebelum menulis ke produksi, backup dulu dan verifikasi sha256 plus
`pg_restore --list`. Backup terakhir yang terverifikasi:
`/home/neki/backups/atcell/atcell-20261001T024946Z.dump`

**Rahasia.** Jangan pernah mencetak secret, token, password, atau connection
string. Cukup sebut ada atau tidak ada.

**Pohon lokal yang menua.** Tiga branch lokal sudah tidak relevan karena
isinya sudah masuk `main`:

- `feat/unit-pricing-dan-inventory`
- `fix/android-gradle-repositories`
- `fix/assetlinks-dan-sw-cache`

Boleh dihapus, tapi tidak sortable. Membuang branch lokal yang sudah ter-merge
adalah operasi yang tidak bisa dibatalkan, jadi tunggu perintah eksplisit.