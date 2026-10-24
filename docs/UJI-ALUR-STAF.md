# Skenario Uji Alur Ber-Kredensial Staf

Runbook uji end-to-end untuk alur portal yang butuh akun staf: login per role,
undang staf, registrasi IMEI, kasir POS, workflow tiket servis sampai serah
terima, dan lintasan akses lintas peran. Skenarionya digali dari source code
(`src/lib/access.ts`, `src/lib/validations.ts`, `src/lib/actions/*`), bukan dari
tebakan, jadi kriteria lolosnya menyebut pesan error dan aturan yang memang
ada di kode.

Prinsip eksekusinya:

- **[MUTASI]** menambah/mengubah data production; **[BACA]** tanpa perubahan
  data; **[NEGATIF]** memastikan sesuatu ditolak (tidak ada side effect).
- Semua data uji memakai penanda yang mudah dikenali: IMEI berawalan `99`,
  nama pelanggan `Uji …`, profil `uji-tech`, supaya bisa dipisahkan dari data
  asli toko dan mudah dibersihkan.
- Rate limit login dihormati: percobaan sandi salah tidak diulang-ulang.
- Sentry dipantau setelah sesi uji (`search_errors` 24 jam) untuk memastikan
  tidak ada error 500 baru yang lahir dari alur uji.
- Yang tidak bisa disentuh dari sisi agent: pembuatan password akun asli
  (milik owner) dan `SUPABASE_SERVICE_ROLE_KEY` yang hanya ada di runtime
  production, bukan di mesin lokal.

## Akun yang dibutuhkan

| Kebutuhan | Keterangan |
| --- | --- |
| 1 akun admin | Minimal. Skenario T-0 membuat akun uji lain (kredensial yang kita tahu) lewat `/portal/staff`, sekaligus menguji alur undang staf. |
| Opsional: akun asli sales / technician / customer | Kalau mau menguji tanpa akun hasil undangan. |

## Status eksekusi

| Tanggal | Yang diuji | Hasil |
| --- | --- | --- |
| 16 Okt 2026 | Guard portal tanpa sesi: semua path `/portal/*` → 307 ke `/id/login?next=…` (smoke production 6/6) | PASS |
| 17 Okt 2026 | Form login production (`isLiveBackend`): hanya username + kata sandi — chip akun demo hanya muncul di mode lokal; percobaan sandi salah sekali → alert "Username atau kata sandi salah.", tetap di halaman login | PASS |
| 24 Okt 2026 | T-7 mode demo via browser: login admin → `/portal/customers` → Ubah Kata Sandi → generate → simpan → notice sukses dan kartu sekali-tampil dengan tombol salin | PASS |
| Menunggu | T-0 sampai T-6 dan T-7 di mode live, butuh akun admin (atau kredensial akun asli) dari owner | — |

## T-0 — Fondasi: login per role dan undang staf [MUTASI]

1. Buka `/id/login` → isi username `admin` + kata sandi → submit.
   Lolos jika: land di `/portal/dashboard`, cookie sesi terpasang, nama profil
   tampil (`defaultPortalPath` memetakan admin ke dashboard).
2. Uji empat username satu per satu, arah default per role:
   `admin → /portal/dashboard`, `sales → /portal/pos`,
   `teknisi (technician) → /portal/service`, `anisa (customer) → /portal/account`.
3. [NEGATIF] Kata sandi salah satu kali: alert "Username atau kata sandi
   salah." tampil (sudah dibuktikan 17 Okt); jangan diulang-ulang, ada rate
   limit per IP.
4. Admin buka `/portal/staff` → tambah staf → role `technician`, nama
   `Uji Teknisi`, username `uji-tech`, email `uji-tech+<tanggal>@contoh.id`,
   kata sandi kuat, nomor HP valid.
   Kalau gagal dengan pesan "SUPABASE_SERVICE_ROLE_KEY belum diisi, tidak bisa
   mengundang user" → itu temuan env production: catat, jangan dipaksa ulang.
5. Logout → login dengan akun `uji-tech` hasil undangan → land di
   `/portal/service`.

## T-1 — Inventaris: registrasi batch IMEI (sales atau admin) [MUTASI]

1. `/portal/inventory` → pilih produk katalog yang benar-benar jualan (mis.
   Samsung Galaxy S24 Ultra) → kondisi `second` → harga beli/jual uji.
2. Daftarkan batch **2 IMEI**: `990000000000101`, `990000000000102`. Validasi
   memaksa tepat 15 digit angka dan minimal 1 IMEI per batch; registrasi selalu
   pakai IMEI — tidak ada jalur tambah stok tanpa IMEI di portal.
3. Lolos jika: kedua unit tampil dengan status `available`, tidak ada baris
   ganda.
4. [NEGATIF] Daftarkan ulang IMEI yang sama → ditolak dengan pesan ramah
   (kode DB 23505 sudah dipetakan: "Ada IMEI yang sudah terdaftar di
   inventaris. Periksa lagi batch-nya.").
5. [NEGATIF] IMEI 14 atau 16 digit → ditolak ("Nomor IMEI wajib tepat 15 digit
   angka.").

## T-2 — POS end-to-end dan laporan (sales, laporan dilihat admin) [MUTASI]

1. `/portal/pos` → pilih unit `990000000000101` → nama pelanggan
   `Uji Pelanggan` → telepon `081000000001` (12 digit, valid untuk
   `phoneSchema`: 9–16 digit) → metode `cash` → garansi default 3 bulan →
   selesaikan transaksi.
2. Lolos jika: transaksi tersimpan, nota tampil, unit tadi berubah `sold`.
3. Cek database (read-only): transaksi terakhir punya `unit_id` unit tadi dan
   `payment_method='cash'`; `inventory_units` terkait `sold`.
4. Admin buka `/portal/reports`: total hari ini naik sesuai transaksi, tren
   harian menampilkan titik hari ini.
5. [NEGATIF] Checkout tanpa memilih unit → ditolak ("Pilih unit fisik (IMEI)
   dulu."); memasukkan unit yang sudah `sold` → ditolak oleh gate status unit.

## T-3 — Meja servis: alur status sesuai REPAIR_FLOW (technician) [MUTASI]

Urutan resmi (`src/lib/validations.ts`): `received → diagnosing →
waiting_approval → in_progress → testing → completed → picked_up`;
`cancelled` boleh dari tahap mana pun sebelum `completed`; `picked_up` dan
`cancelled` adalah status akhir tanpa transisi keluar.

1. Sales/Admin buat tiket di `/portal/service/new`: nama pelanggan
   `Uji Pelanggan 2`, telepon valid, perangkat `Uji Samsung A34`, IMEI
   `990000000000102`, keluhan `uji alur status` → status awal `received`.
   Catat kode resi yang terbit (kode dibuat trigger DB, bukan aplikasi).
2. [BACA] Tracking publik: `/id/tracking` dengan tiket demo
   `SRV-20260927-C0FAZ8Y9` → detail dan riwayat tampil; kode tidak dikenal →
   "Tiket tidak ditemukan. Periksa lagi kode resinya."
3. [NEGATIF] Sales mencoba transisi status pengerjaan → ditolak: "Peran sales
   hanya boleh mencatat tiket masuk, bukan biaya/status pengerjaan."
4. [NEGATIF] Transisi ilegal `received → completed` dan `completed → testing`
   → ditolak.
5. Teknisi jalankan rantai: `diagnosing → waiting_approval → in_progress`
   (isi biaya sparepart + jasa; `total_fee` wajib otomatis = jumlahnya) →
   `testing`.
6. Teknisi unggah 1 foto kondisi ke bucket `service-photos` (satu-satunya
   bucket unggah untuk servis): pratinjau memakai signed URL, database hanya
   menyimpan path.
7. Teknisi `testing → completed`, lalu `completed → picked_up`.
8. Lolos jika: `picked_up_at` terisi tepat satu kali (jaring pengaman trigger
   DB dari FR-B-04); langkah `picked_up → diagnosing` ditolak; tabel audit
   berisi aktor tiap transisi (`private.current_actor_id` dengan pin
   `search_path` dari migrasi bagian 30 ikut teruji di dunia nyata).

## T-4 — Lintasan akses lintas role [BACA + NEGATIF]

1. Login sebagai `uji-tech` (technician) → tempel manual satu per satu:
   `/portal/dashboard`, `/portal/pos`, `/portal/inventory`,
   `/portal/products`, `/portal/settings`, `/portal/staff`,
   `/portal/reports`.
   Lolos jika semuanya **redirect** ke `/portal/service` (default role), bukan
   404/500.
2. Login customer → URL di atas semuanya → `/portal/account`; hanya
   `/portal/account` yang boleh dibuka.
3. [NEGATIF] Curl tanpa sesi ke server action admin → ditolak oleh guard
   `requireRole`; cookie sesi role rendah tidak membuka akses admin.

## T-5 — Pengaturan admin tampil di halaman publik [MUTASI, opsional]

1. `/portal/settings` (admin): ubah jam operasional atau nomor WA → simpan.
2. `/id/kontak`: nilai baru tampil; tautan sosial (Instagram/WhatsApp/TikTok)
   sesuai.
3. Kembalikan nilai lama setelah uji, atau biarkan sebagai penyetelan nyata.

## T-6 — Kebersihan pasca-uji (opsional, dieksekusi owner lewat psql)

1. Identifikasi rentetan data uji: IMEI `99…`, transaksi hari uji, tiket
   perangkat `Uji …`, profil `uji-tech`.
2. Bila diminta, siapkan SQL pembersihan untuk direview manusia terlebih
   dahulu: tiket servis hanya bisa berstatus `cancelled`, unit IMEI uji bisa
   dihapus bila belum terjual, urutan FK diperhatikan.

## T-7 — Ganti kata sandi pelanggan (admin atau sales) [MUTASI]

1. Login admin (atau sales) → buka `/portal/customers` → tombol Ubah Kata
   Sandi di kartu pelanggan.
2. Modal berisi identitas pelanggan (nama, username, nomor HP) dan kolom kata
   sandi baru dengan tombol Lihat dan generate acak.
   Lolos jika: modal menyebut kata sandi lama hanya tersimpan sebagai hash,
   dan tombol generate mengisi minimal 8 karakter.
3. Simpan. Lolos jika: notice "Kata sandi pelanggan berhasil diganti." tampil
   dan kartu hasil menampilkan kata sandi baru sekali dengan tombol Salin;
   setelah kartu ditutup, kata sandi tidak muncul lagi di mana pun.
4. [NEGATIF] Panggilan `updateCustomerPassword` dengan id profil staf harus
   ditolak dengan pesan "Hanya kata sandi pelanggan yang bisa diubah dari
   halaman ini."; teknisi dan pelanggan ditolak karena peran.
5. Di mode live: pelanggan login dengan kata sandi baru melalui username,
   nomor HP, dan kata sandi. Di mode demo alur berhenti di langkah 3 karena
   demo tidak menyimpan kata sandi.

## Catatan eksekusi

- Estimasi T-0 sampai T-4: 30–45 menit; T-5/T-6 opsional.
- Semua langkah dicatat lulus/tidak beserta buktinya: status HTTP, isi
  database (read-only), dan screenshot bila perlu.
- Temuan yang butuh keputusan owner (mis. service key, env production) dicatat
  terpisah, bukan dipecahkan diam-diam.
