# Deployment dan Redundansi At Cell

Runbook operasional satu codebase At Cell di Coolify. Coolify adalah
satu-satunya host aplikasi production; Supabase menjadi sumber data, Auth, dan
Storage. Dokumen ini juga memuat akses panel Coolify, backup off-site, restore
target, dan pemeriksaan pasca-deploy.

## Arsitektur target

```text
DNS / TLS
   |
   +-- Coolify VPS: aplikasi Next.js
             |
             +-- Supabase PostgreSQL + Auth + Storage
             +-- Coolify restore target private, hanya untuk restore test
```

Database tidak boleh dibuat di dalam container aplikasi. Resource PostgreSQL di
Coolify hanya target restore test, bukan sumber data atau mirror aktif.

## Environment production

Set variabel berikut di Coolify Production. Secret hanya lewat dashboard atau
secret manager, tidak pernah commit ke repository.

```env
# Wajib di production
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
# Nama lama yang masih diterima sebagai cadangan dari SUPABASE_SECRET_KEY.
# Wajib diisi kalau project masih memakai kunci service_role.
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_COOKIE_DOMAIN=.atcell.my.id
DATABASE_URL=

# Opsional. Kosong mematikan fitur terkait.
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACE_ID=
NEXT_PUBLIC_SITE_URL=
SITE_URL=
SERVER_ACTIONS_ALLOWED_ORIGINS=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Batas koneksi dan query database.
STATEMENT_TIMEOUT_MS=8000
DB_POOL_MAX=12

# Pemantauan error. NEXT_PUBLIC_* wajib ada saat build image.
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_COMMIT_SHA=
VERCEL_GIT_COMMIT_SHA=

# Backup off-site. Tanpa passphrase atau tujuan upload, script gagal.
OFFSITE_PASSPHRASE=
OFFSITE_PASSPHRASE_FILE=
OFFSITE_RCLONE_REMOTE=
OFFSITE_PUT_URL=
OFFSITE_PUT_TOKEN=
OFFSITE_PUT_TOKEN_FILE=
OFFSITE_STAGING_DIR=
OFFSITE_KEEP_ENCRYPTED=

# Pratinjau. Production TIDAK boleh mengisinya.
ATCELL_ALLOW_WRITE=

# Verifikasi aplikasi Android. Kosongkan kalau belum ada APK.
ANDROID_APP_SHA256=
```

Wajib ada di production:

- `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` untuk
  browser.
- `SUPABASE_SECRET_KEY` untuk admin client. `SUPABASE_SERVICE_ROLE_KEY` adalah
  nama lama yang masih diterima sebagai cadangan dari `SUPABASE_SECRET_KEY`, dan
  wajib ikut diisi kalau project Supabase masih memakai kunci `service_role`.
  `src/lib/supabase/config.ts` membaca `SUPABASE_SECRET_KEY` dulu, lalu
  `SUPABASE_SERVICE_ROLE_KEY`. `requireRole()` dan health check menolak jalan
  kalau keduanya kosong.
- `DATABASE_URL` ke connection pooler Supabase production, bukan `localhost`
  VPS. Koneksi ini melewati RLS, jadi penegakan peran tetap di `requireRole()`
  tiap Server Action.
- `SUPABASE_COOKIE_DOMAIN` untuk sesi lintas subdomain.

Opsional, kosong berarti fitur tertentu mati:

- `GOOGLE_PLACES_API_KEY` untuk sync ulasan Google. Kosong mematikan seluruh
  bagian ulasan, bukan hanya auto-sync. Diagnosis selalu cek
  `curl https://atcell.my.id/api/reviews` dan baris `[reviews]` di `docker logs`.
- `GOOGLE_PLACE_ID` untuk memilih toko yang diulas; ada nilai bawaan.
- Tanpa `GOOGLE_PLACES_API_KEY`, ulasan memakai snapshot manual di
  `src/lib/ulasan-manual.ts` dengan batas umur 180 hari.
- `NEXT_PUBLIC_SITE_URL` atau `SITE_URL` untuk URL kanonik `sitemap.ts`.
- `SERVER_ACTIONS_ALLOWED_ORIGINS` untuk origin tambahan Server Actions,
  dipisah koma tanpa protocol dan path.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` hanya untuk project lama.
- `STATEMENT_TIMEOUT_MS` (bawaan 8000, maksimum 30000) dibaca
  `src/db/client.ts`. Nilai kosong atau bukan angka memakai bawaan.
- `DB_POOL_MAX` (bawaan 12, rentang 1 sampai 50). Lima terlalu kecil: satu
  render berat memakai lima sampai tujuh query, dan pernah membuat container
  unhealthy lalu 503 sekitar 90 detik.

Pemantauan error:

- `SENTRY_DSN` untuk server, dibaca `src/instrumentation.ts`. Kosong berarti SDK
  tidak diinisialisasi sama sekali.
- `NEXT_PUBLIC_SENTRY_DSN` untuk browser, dibaca
  `src/instrumentation-client.ts` dan kedua error boundary. DSN memang muncul
  di HTML; yang server-only adalah Sentry Auth Token.
- `NEXT_PUBLIC_COMMIT_SHA` dan `VERCEL_GIT_COMMIT_SHA` hanya untuk tag release.

`NEXT_PUBLIC_*` disalin ke bundle saat build, jadi Coolify yang hanya menyetel
environment runtime tidak akan mengirim DSN ke browser. `SENTRY_DSN` dibaca
runtime dan tidak punya batasan ini.

## Deployment pratinjau

Vercel dipakai untuk preview, dan preview memakai environment yang sama dengan
production. Tanpa gerbang, setiap Server Action mutasi di pratinjau mengubah
data toko sebenarnya.

`src/lib/deployment.ts` membaca `VERCEL_ENV` dan `COOLIFY_BRANCH`; semua aksi
mutasi ditolak di pratinjau sebelum `requireRole()` dan sebelum query.
`ATCELL_ALLOW_WRITE=YES` satu-satunya yang mengizinkan menulis di pratinjau.
Production dikenali dari `COOLIFY_BRANCH=main` atau `VERCEL_ENV=production`;
development lokal tanpa penanda platform tetap bisa menulis.

Penjaganya ada di `tests/write-gate.test.ts`. Yang masih harus dikerjakan owner:
arahkan preview ke project Supabase terpisah atau restore target
`atcell-restore-local`, lalu cabut `SUPABASE_SECRET_KEY` dan `DATABASE_URL`
production dari environment preview. Selama itu belum dikerjakan, pratinjau
masih bisa membaca data production, tetapi tidak bisa mengubahnya.

## Migrasi database

Jalankan seluruh migration di `supabase/migrations/` berurutan. Beberapa file
bergantung pada objek dari file sebelumnya.

| Berkas | Isi |
|---|---|
| `0001_atcell_schema.sql` | Tabel, enum, RLS, trigger, view, bucket Storage, grant Data API, seed `store_settings`. Aman di-replay: tidak memberi `EXECUTE` ke browser role |
| `0002_harden_atcell_schema.sql` | Helper private, grant minimum, trigger anti-double-sell, `security_invoker` pada view |
| `0003_lock_legacy_helpers.sql` | Menutup helper legacy di schema `public` dari Data API |
| `0004_align_schema_contract.sql` | FK, index performa, dan singleton `store_settings` |
| `0005_username_login.sql` | Login berbasis username, bukan email |
| `0006_store_social_urls.sql` | Akun media sosial toko |
| `0007_audit_trail.sql` | Audit mutasi sensitif dengan identitas pelaku |
| `20260926025406_index_public_foreign_keys.sql` | Index seluruh foreign key di schema `public` |
| `20260926103000_strengthen_ticket_codes.sql` | Format kode tiket 8 karakter base32 dan validasi transisi status |
| `20260927120000_auto_enable_rls_on_new_tables.sql` | RLS otomatis pada tabel baru |
| `20260927130000_product_image_registry.sql` | Tabel `product_images` sebagai sumber kebenaran path gambar |
| `20260927140000_store_owner_and_real_contact.sql` | Kolom `owner_name` dan kontak asli toko |
| `20260927150000_revoke_anon_write_on_product_images.sql` | Mencabut hak tulis `anon` pada `product_images`; sisanya hanya `SELECT` |
| `20260927160000_harden_storage_access.sql` | Bucket foto pelanggan jadi privat, `storage_public_read` hanya untuk katalog, batas ukuran dan MIME |
| `20260927170000_demo_ticket_for_tracking_example.sql` | Tiket contoh untuk halaman lacak |
| `20260927180000_nullable_inventory_unit_product.sql` | `inventory_units.product_id` nullable untuk trade-in; etalase hanya unit berkatalog |
| `20260927190000_close_browser_role_write_grants.sql` | Menutup hak tulis `authenticated` di `product_images` dan `storage.buckets`, mencabut `EXECUTE` `rls_auto_enable()`, revoke default privilege schema `public` |
| `20260927200000_remove_ocean_photo_from_reno11_gallery.sql` | Mengeluarkan foto laut dari galeri Oppo Reno 11; berkas tetap ada karena dipakai `global-not-found.tsx` |
| `20260927201000_clear_unparseable_product_image_url.sql` | Mengosongkan `products.image_url` yang bukan alamat foto, terutama `undefined/storage/...` |
| `20260927202000_trim_crop_duplicate_a55_photos.sql` | Memangkas tiga foto Galaxy A55 yang saling potongan |
| `20260930100000_catalogue_apple_iphone_15_pro.sql` | Baris katalog iPhone 15 Pro tanpa unit; panduan staf di `STAF.md` |
| `20260930101000_catalogue_samsung_galaxy_s24_ultra.sql` | Baris katalog S24 Ultra tanpa unit, foto tunggal |
| `20260930102000_catalogue_xiaomi_14.sql` | Baris katalog Xiaomi 14 tanpa unit, tiga foto berbeda |
| `20260930103000_catalogue_vivo_v30.sql` | Baris katalog Vivo V30 tanpa unit; banner promosi tidak dipakai |
| `20260930104000_catalogue_iphone_14_plus_for_tradein_unit_9.sql` | Baris katalog iPhone 14 Plus lalu menautkan unit 9. Satu-satunya tulisan ke `inventory_units` di perluasan katalog, hanya `product_id` |
| `20261001120000_hide_unidentified_product_6.sql` | Menonaktifkan produk id 6 yang merek dan modelnya bertentangan |
| `20261013000000_index_inventory_units_created.sql` | Index `(created_at desc)` untuk etalase publik; non-destruktif |
| `20261013120000_redact_store_contact.sql` | Mengganti kontak asli di `store_settings` dengan nilai sintetis |
| `20261015000000_service_ticket_picked_up_at.sql` | Kolom `picked_up_at` dan stamp trigger `completed -> picked_up` (FR-B-04) |
| `20261016081500_current_actor_id_search_path.sql` | Pin `search_path` helper `private.current_actor_id()`; non-destruktif |
| `20261023111914_add_is_demo_flag.sql` | Kolom `is_demo` di `inventory_units` dan `transactions`; unit demo tidak tampil di etalase |
| `20261023112316_demo_inventory_imei_nullable.sql` | Unit demo boleh IMEI `NULL`; unit non-demo tetap wajib 15 digit |
| `20261024110000_products_sales_update.sql` | Policy sales `UPDATE` produk untuk harga acuan dan foto lewat Server Action |
| `20261024120000_products_sales_column_guard.sql` | Trigger yang menolak sales mengubah kolom identitas katalog |

`0001` aman dijalankan ulang. Versi lama `0001` memberi `EXECUTE` pada
`public.get_my_role()` dan `public.is_staff()` ke `anon` dan `authenticated`,
lalu `0002`/`0003` mencabutnya. Kalau `0001` dijalankan lagi, helper
`SECURITY DEFINER` itu terbuka kembali sampai migrasi berikutnya. Grant itu
sekarang tidak ada di `0001`; status akhirnya dibuat `0002` dan dikunci `0003`.

Cek ACL tanpa mengubah apa pun:

```sql
select proname, proacl::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('get_my_role', 'is_staff');
```

Hasil benar hanya memuat `postgres` dan `service_role`.

`20260927150000` wajib: tanpa itu `product_images` tetap memberi `anon` hak
tulis warisan default privilege Supabase. `20260927160000` wajib: tanpa itu foto
servis dan trade-in bisa diambil siapa pun yang punya URL, karena bucket
`public` melayani `/object/public/` tanpa token dan tanpa cek RLS.

`20260927180000` memperbaiki tautan unit trade-in. Tanpa migrasi ini,
`executeSale` menautkan handset tukar ke baris katalog unit yang baru terjual,
sehingga tukar S9 dengan S24 tampil di etalase sebagai S24. Data lama tidak
diperbaiki otomatis; ikuti catatan di dalam berkasnya setelah dicek.

`20260927190000` menutup lapisan grant. `20260927150000` mencabut tulis `anon`,
tetapi `authenticated` masih memegang DELETE, INSERT, REFERENCES, TRIGGER,
TRUNCATE, dan UPDATE di `product_images`. Migrasi ini menurunkan keduanya ke
`SELECT`, mencabut `EXECUTE` `rls_auto_enable()` untuk `PUBLIC`, dan menjalankan
`alter default privileges in schema public` supaya tabel baru tidak mewarisi
`arwdDxtm`. Grant tulis `storage.buckets` diberikan `supabase_storage_admin`,
jadi `revoke` dari `postgres` hanya menghapus grant milik `postgres`; pengawal
yang bekerja tetap RLS dengan nol policy.

Cara menjalankan:

1. Buka SQL Editor Supabase, atau `psql "$SOURCE_DATABASE_URL"`.
2. Jalankan setiap berkas sesuai urutan tabel.
3. Catat di `supabase_migrations.schema_migrations` dengan nama berkas tanpa
   ekstensi.
4. Uji idempotensi di dalam `begin; ... rollback;` sebelum schema dibuka publik.

Jangan memakai `supabase db push` untuk database ini. Angka versi di ledger
untuk `0001` sampai `0007` berbeda dari nama berkasnya karena dulu diterapkan
dengan stempel waktu Supabase. CLI akan melihat ketidakcocokan, lalu menawarkan
menjalankan ulang berkas yang sudah diterapkan. Terapkan lewat SQL Editor atau
psql, lalu catat di ledger manual.

`supabase/RUN-ALL-PENDING.sql` menggabungkan seluruh migrasi menjadi satu berkas
urut, 34 bagian, untuk project kosong. Isi tiap bagian harus identik dengan
berkas aslinya; `tests/run-all-pending.test.ts` menjaga kecocokan isi dan
memastikan setiap berkas muncul tepat sekali. Jangan menjalankan kedua sumber
sekaligus. Jangan menjalankan `supabase/drizzle/0000_*.sql` sebagai migration
production karena tidak mencakup RLS, trigger, view, Storage, dan grant.

Setelah migration, pastikan schema `public` dan tabel yang diperlukan
di-expose lewat Data API. RLS tetap aktif; `anon` dan `authenticated` hanya
`SELECT`; mutasi bisnis lewat Server Action. `service_role` hanya secret server.
Migration dijalankan satu kali dari release terkontrol, tidak dari dua pipeline.

### Aktor di audit trail

`0007` mencatat aktor perubahan status unit dan tiket (NFR-07). Mekanismenya
bukan `auth.uid()`: `src/db/client.ts` memakai koneksi Postgres langsung sehingga
`auth.uid()` selalu NULL. Aktor dikirim lewat setting transaction-local
`atcell.actor_id`, diisi `setAuditActor()` dalam transaction yang sama dengan
`UPDATE`, lalu dibaca trigger lewat `private.current_actor_id()`. `is_local`
membuat nilainya hilang setelah transaction.

Konsekuensi yang harus diketahui operator:

- `actor_id` terisi hanya untuk perubahan lewat Server Action
  (`updateUnitStatus`, `updateTicket`).
- Perubahan lewat SQL Editor atau psql tercatat `NULL`. Itu penanda perubahan
  yang perlu ditinjau, bukan kegagalan pencatatan.

```sql
select created_at, actor_id, old_status, new_status
  from public.unit_status_audit
 where actor_id is null
 order by created_at desc;
```

Setiap migrasi baru wajib ditambah ke tabel di atas. `tests/deployment-runbook.test.ts`
memeriksa dua arah: berkas yang sudah di-commit tetapi belum disebut akan gagal,
dan nama di tabel yang tidak ada di disk juga gagal.

## Health check

- `GET /api/health/live` hanya memastikan proses Next.js hidup.
- `GET /api/health/ready` mengembalikan 200 hanya ketika Supabase public env,
  `DATABASE_URL`, koneksi database, schema wajib, dan service-role secret
  tersedia.
- Health endpoint tidak boleh mengembalikan connection string, password, atau
  pesan driver mentah.

Gunakan `/api/health/ready` sebagai target health check Coolify. Response 503
berarti not ready, bukan alasan memakai data mock.

## Header proxy dan rate limit

Batas login dan lacak resi memakai IP klien dari `src/lib/client-ip.ts`. Fungsi
itu membaca entri TERAKHIR `X-Forwarded-For`, bukan yang pertama. Traefik tidak
menimpa header itu, melainkan menambahkan IP asli di belakang nilai yang ada.
Dengan `forwardedHeaders.insecure = false` (bawaan sejak Traefik v2.10), header
dibersihkan dulu lalu diisi satu IP, jadi entri pertama dan terakhir sama-sama
benar.

Bedanya muncul kalau `insecure` dinyalakan atau ada proxy lain di depan Traefik.
Penyerang yang mengirim `X-Forwarded-For: 1.2.3.4` membuat aplikasi menerima
`1.2.3.4, ip-asli`. Dengan entri terakhir, semua percobaan menumpuk pada satu IP
dan batasnya berlaku.

Kalau struktur berubah:

1. Rate limit kehilangan nilai kalau IP tidak dipercaya. Pastikan tidak ada job
   internal yang memakai IP proxy bersama.
2. `X-Real-Ip` bukan cadangan aman; Traefik hanya menulisnya kalau kosong.
3. Kalau aplikasi bisa dijangkau langsung tanpa Traefik, permintaan tanpa header
   berakhir pada satu kunci tunggal.

## Rilis yang aman

1. Jalankan test, typecheck, lint, dan build di commit yang sama.
2. Pastikan migration canonical sudah tercatat dan diterapkan satu kali.
3. Tulis tag image di `Dockerfile.coolify` memakai `sha-<commit>` sesuai bagian
   tag image di bawah, lalu commit.
4. Deploy Coolify production dari branch `main`. Sebelum memicu deploy,
   pastikan `git_commit_sha` aplikasi Coolify menunjuk commit pin. API deploy
   membaca nilai itu, bukan HEAD branch. Setelah itu cek `/api/health/ready`,
   lalu pastikan header `content-security-policy` muncul di `/id`. Header itu
   hanya ada di image yang memuat `src/lib/csp.ts`, jadi penanda image baru
   benar-benar jalan. Cara lengkapnya di [`CSP.md`](CSP.md).
5. Jalankan smoke test public, login, role guard, IMEI, POS, service tracking,
   dan upload pada URL production.
6. Verifikasi RLS, trigger, view, Storage, advisor, dan backup.
7. Aktifkan domain final dan TLS hanya setelah deployment lulus.
8. Lakukan restore test terjadwal ke resource restore private.

### Verifikasi etalase di HTML

HTML area publik sudah berisi etalase dari snapshot server. `/api/health/ready`
yang 200 tidak membuktikan etalase terisi: health check hanya membuktikan
database terjangkau, sedangkan etalase membaca `v_public_inventory` dan tabel
produk.

```bash
curl -s https://atcell.my.id/id/catalog | sed -e 's/<[^>]*>//g' | tr -s ' ' | grep -oE "[0-9]+ unit, harga"
curl -s https://atcell.my.id/id/catalog | grep -c "Redmi Note 13"
```

Angka dan kata "unit" dipisah simpul komentar React, jadi bentuknya
`7<!-- --> <!-- -->unit, harga termasuk garansi toko`. Pola HTML mentah tidak
akan cocok; tag dibuang dulu lalu spasi dirapatkan.

Yang benar: hitungan bukan 0 dan nama model dari `v_public_inventory` muncul.
Kalau kosong, snapshot gagal dibaca; halaman menampilkan "Tidak ada yang cocok".
Pembacaan gagal menghasilkan tanpa seed, browser mencoba lagi lewat
`loadLiveData`, tetapi Google dan pratinjau WhatsApp hanya membaca HTML.

Urutan pemeriksaan saat hitungan 0:

1. `/api/health/ready` mengembalikan `databaseReachable: true` dan
   `databaseSchemaReady: true`.
2. `select count(*) from public.v_public_inventory;` lebih dari 0.
3. Log container memuat `Data publik sedang tidak dapat dimuat`.

#### Produk baru tidak muncul padahal etalase tidak kosong

Bukan cache: `getPublicSnapshot()` dipanggil ulang tiap permintaan dan tidak ada
`revalidate` atau `unstable_cache` di jalur itu. Penyebabnya, etalase dibangun
dari unit, bukan katalog. `v_public_inventory` hanya memuat unit dengan
`product_id` dan `status = 'available'`. Produk tanpa unit available tidak punya
kartu; unit `sold` atau `reserved` juga tidak muncul. Daftarkan unit fisik lewat
`/portal/inventory` dengan IMEI 15 digit.

```sql
select p.brand, p.model_name, v.unit_id, v.condition, v.selling_price
  from public.v_public_inventory v
  join public.products p on p.id = v.product_id
 where p.model_name ilike '%Galaxy S26%';
```

Baris yang keluar berarti produk tampil; hasil kosong berarti unitnya belum
terdaftar sebagai `available`.

## Tag image di Dockerfile.coolify

`Dockerfile.coolify` menarik image yang sudah dibangun GitHub Actions. Tag wajib
`sha-<commit>`; `latest` tidak boleh dipakai. Coolify menjalankan
`docker build --no-cache` tanpa `--pull`; `--no-cache` hanya membersihkan cache
lapisan, bukan base image. Dengan `latest`, Docker memakai salinan lokal di VPS
dan tidak bertanya ke registry. Deploy hijau, health check hijau, tetapi image
lama yang jalan.

Penandanya hanya respons: `/robots.txt` dilayani sebagai HTML, footer warna lama,
nomor telepon kosong, ukuran HTML landing tidak berubah.
`tests/deploy-image-pin.test.ts` menjaga tag tetap `sha`, commit-nya ada, dan
formatnya sama dengan `docker-publish.yml`.

Ada satu commit keterlambatan: tag ditulis di commit sekarang, sedangkan image
commit itu baru ada setelah dipush. Deploy commit P menjalankan image commit
sebelumnya. Untuk menjalankan image Q, tulis `sha-Q`, commit, lalu deploy lagi.
Deploy API Coolify juga memakai `git_commit_sha` tersimpan, bukan HEAD branch.

Cara paling langsung memeriksa image yang benar-benar melayani:

```bash
docker ps --filter "label=com.docker.compose.project=<project>" -q | head -1 | \
  xargs -I{} docker inspect --format \
  '{{ index .Config.Labels "org.opencontainers.image.revision" }}' {}
```

Label `org.opencontainers.image.revision` berisi commit sumber build. Bentuk lama
yang meng-inspect tag `ghcr.io/neiaki/kp:sha-<commit>` bisa menjawab
`no such object` karena Buildx menyimpan image di container builder, bukan
daemon. Label dibaca dari container yang melayani trafik. Kalau yang muncul
bukan commit yang diharapkan, deploy hijau tidak berarti apa-apa.

Bukti lebih kuat adalah membandingkan `{{.RootFS.Layers}}` container berjalan
dengan `rootfs.diff_ids` config blob tag `sha-<commit>` di GHCR. Label bisa salah
tempel; rootfs tidak.

### Dua container aplikasi sesaat setelah deploy

Sesudah deploy, sempat ada dua container project compose yang sama dengan tag
berbeda. Itu bukan dua versi yang melayani trafik; compose menyelesaikan
perpindahan dan container lama tertinggal sebagai container yang tidak lagi ada
di file compose. Health check tetap hijau karena dijawab container baru, dan
setelah transien `docker ps` kembali satu baris.

```bash
docker ps -a --filter "label=com.docker.compose.project=<project>" \
  --format '{{.Names}} | {{.Status}} | {{.Image}}'
```

Hasil benar tepat satu baris `Up ... (healthy)`. Lebih dari satu baris sesaat
setelah deploy adalah transien. Satu baris `Exited` atau `Restarting` adalah
masalah berbeda. Jangan menambahkan `--remove-orphans` untuk membersihkannya;
flag itu bisa menghapus layanan lain dalam project.

### Verifikasi lokal memakai database yang sama

Kalau `DATABASE_URL` lokal menunjuk pooler Supabase yang sama dengan production,
jalankan hanya satu proses Next.js. Tiap proses menahan sampai `max` koneksi di
`src/db/client.ts`; `next dev` di repo utama bersamaan `next start` di worktree
dan beberapa curl bisa menumpuk di belakang `statement_timeout` 8000 milidetik
atau lebih tinggi kalau `STATEMENT_TIMEOUT_MS` dinaikkan.

Gejalanya halaman publik menggantung sementara `/robots.txt` dan
`/api/health/live` tetap cepat. Itu rebutan lokal, bukan bug kode. Hentikan
proses Next.js lain, kirim satu permintaan, lalu periksa waktunya. Halaman publik
sehat menjawab 0,1 sampai 3 detik.

## Akses panel Coolify

Panel Coolify adalah kendali penuh host: environment, deploy, log, terminal
container, DNS, dan resource. Panel harus tetap tertutup dari internet; alasan
pengerasannya ada di `VPS-HARDENING.md`.

| Jalur | Perlu apa | Pakai kapan |
|---|---|---|
| SSH tunnel | Kredensial SSH | Harian. Tidak mengubah firewall. |
| Pengecualian port 8000 | IP publik owner | Darurat bila tunnel tidak bisa dipakai. |

SSH tunnel, jalur utama:

```bash
ssh -L 8000:127.0.0.1:8000 vpsubuntu
```

Buka `http://127.0.0.1:8000/login` di peramban komputer operator. Tunnel
meneruskan lewat SSH, tidak menyentuh port publik. Jalur ini tidak ikut ditutup
`/usr/local/sbin/docker-dnat-guard.sh` karena skrip itu hanya mengatur trafik
`-i eth0`; loopback dari tunnel lolos. Tutup tunnel dengan `Ctrl+C`.

Pengecualian port 8000 memakai HTTP polos, jadi password dan cookie sesi melintas
tanpa enkripsi. Satu login cukup untuk mengambil seluruh environment production;
pakai hanya dalam darurat dan jangan dari jaringan yang tidak dipercaya. Rule
penjaga Docker untuk satu IP:

```text
-A DOCKER-USER -s "$ADMIN_IP"/32 -i eth0 -p tcp \
   -m conntrack --ctorigdstport 8000 \
   -m comment --comment atcell-panel-exception -j RETURN
```

Rule ini ada sebelum aturan penolakan. Port `8080`, `6001`, dan `6002` tetap
tertutup. Nilai IP owner hanya ada di variabel `ADMIN_IP` di skrip penjaga host,
tidak pernah di repo. Kalau IP berubah, edit `ADMIN_IP` lalu jalankan
`sudo /usr/local/sbin/docker-dnat-guard.sh`; skripnya idempoten.

`--ctorigdstport` diperlukan karena port host 8000 dipublish ke container 8080.
Docker melakukan DNAT di `nat/PREROUTING`, dan `DOCKER-USER` berjalan sesudahnya,
jadi port paket sudah terbaca 8080. `ufw` tidak bisa dipakai: paket published
port Docker dibelokkan, tidak sampai ke rantai `INPUT`.

Kalau panel tidak bisa diakses:

| Gejala | Artinya | Langkah |
|---|---|---|
| Timeout dari luar | Pengecualian tidak cocok IP sekarang | Cek IP, bandingkan `ADMIN_IP` |
| Timeout dari dalam VPS | Publikasi IP tidak hairpin | Uji dari luar |
| Timeout dari mana pun | Aturan hilang setelah reboot | Jalankan ulang skrip, cek service |
| 403 atau logout terus | Sesi kedaluwarsa | Login ulang |

Panel tidak memakai TLS. Kalau butuh URL permanen, jalurnya memberi hostname
dengan TLS lewat `coolify-proxy` (Traefik), bukan membuka port.

## DNS dan session

Domain dikelola MyDomaiNesia. Ubah record hanya setelah deployment dan health
check siap. Tambahkan `atcell.my.id` dan `login.atcell.my.id` sebagai domain
aplikasi Coolify.

| Host | Type | Target |
|---|---|---|
| `@` | A | IP public VPS Coolify |
| `login` | CNAME | `atcell.my.id` |

- Kedua host harus memakai sertifikat TLS valid.
- Tambahkan URL production dan login ke redirect Supabase Auth.
- Set `SUPABASE_COOKIE_DOMAIN=.atcell.my.id` untuk sesi lintas subdomain.
- Jangan membuat record standby ke provider yang tidak dipakai.

## Backup dan rollback

- Aktifkan backup/PITR sesuai paket Supabase dan export database berkala.
- Backup objek Storage terpisah dari backup database.
- Simpan hash/commit deployment dan satu dump sebelum migration.
- Rollback aplikasi tidak membatalkan migration database. Rollback migration
  harus ditinjau dan tidak boleh menghapus data transaksi.

### Restore target lokal di Coolify

Resource ini hanya target restore test, bukan mirror aktif atau sumber data.
VPS hanya 2 vCPU dan 2 GB RAM, jadi spesifikasi awal: 1 vCPU, RAM maksimum 512
MB, disk 10 GB, PostgreSQL private tanpa public port, `max_connections` dan
`shared_buffers` dibatasi, restore `pg_restore --jobs=1`.

Resource ini tidak boleh menjadi alasan mengganti Supabase production. Coolify,
aplikasi, dan restore database berada di failure domain yang sama. Dump asli
tetap disalin ke object storage off-site terenkripsi.

Pembuatan resource: project At Cell → environment production → **New Resource →
PostgreSQL**, nama `atcell-restore-local`, image PostgreSQL sama atau lebih baru
dari major Supabase, destination/network sama, batas CPU 1, RAM 512 MB, volume 10
GB, public port mati, credential di Coolify secret manager.

Urutan backup yang aman:

1. Dump logis Supabase format custom, mencakup schema `public`, `private`, dan
   `auth`. Auth ikut karena `public.profiles` mereferensi `auth.users(id)`.
2. Script memeriksa isi dump. Kalau `auth.users` tidak ada, dump tetap ditulis
   tetapi script keluar 70 dan cron mencatat `GAGAL`.
3. Hitung checksum, enkripsi, kirim off-site (`bun run backup:offsite`, cron
   harian).
4. Cadangkan objek Storage dengan `bun run backup:storage`.
5. Salin dump ke restore target saat jadwal restore test.
6. Jalankan `scripts/restore-target-bootstrap.sql`.
7. Jalankan `pg_restore --jobs=1`. Dump modern mengganti tabel `auth.users` stub
   dengan isi dump, sehingga akun staf ikut pulih.
8. Cek tabel wajib, RLS, trigger, view, dan jumlah akun auth asli.
9. Hapus data restore test atau hentikan service agar RAM kembali.

### Backup objek Storage

`scripts/backup-storage.sh` menutup celah yang tidak disentuh backup database:
foto katalog, servis, dan trade-in hanya hidup di bucket Storage, sementara dump
hanya menyimpan path. Arsip `atcell-storage-<timestamp>.tar.enc` berisi
`metadata.sql` (`pg_dump --schema=storage`), `manifest.json`, dan byte objek.

Arsip dienkripsi AES-256-CBC PBKDF2 100.000 iterasi dengan sidecar `.sha256`.
Script menolak berhasil bila tidak ada objek (`STORAGE_ALLOW_EMPTY=1` untuk kasus
sengaja), metadata tidak memuat `storage.buckets`/`storage.objects`, atau nama
objek memuat traversal. Salinan terenkripsi wajib dikirim lewat
`STORAGE_OFFSITE_PUT_URL` atau `STORAGE_OFFSITE_RCLONE_REMOTE`; tanpa tujuan
script keluar bukan-nol. Passphrase dan key hanya lewat file atau environment.

`scripts/restore-storage.sh` memverifikasi arsip tanpa jaringan: checksum,
dekripsi, keamanan tar, kecocokan manifest, ukuran, dan SHA-256 tiap objek.
Upload hanya bila `ALLOW_STORAGE_RESTORE=YES` dan `STORAGE_RESTORE_URL` serta
`STORAGE_RESTORE_DATABASE_URL` diisi. Restore additive: tidak ada `delete`.

Guard restore Storage:

- Target dengan host sama dengan `source_host` ditolak kecuali
  `STORAGE_RESTORE_ALLOW_SAME_HOST=YES`.
- Host selain localhost harus ada di `STORAGE_RESTORE_ALLOWED_HOSTS`.
- Bucket yang sudah ada ditolak kecuali
  `STORAGE_RESTORE_ALLOW_EXISTING_BUCKETS=YES`.

`bun run restore:storage-drill` memilih arsip terbaru, memeriksa sidecar, dan
menjalankan mode verifikasi tanpa URL, key, atau database.

### Menyalakan backup off-site

Backup harian hanya hidup di VPS yang sama dengan aplikasi; kegagalan VPS
menghilangkan semuanya. Script gagal-terbuka: selama passphrase dan tujuan upload
belum diisi, cron mencatat `GAGAL` dan tidak ada byte yang terkirim.

Keadaan awal: `/root/.atcell-offsite.env` belum ada, `rclone` belum terpasang,
cron `/etc/cron.d/atcell-offsite` jalan 02.47 waktu host (Asia/Shanghai, 01.47
WIB), setengah jam setelah backup 02.17.

Langkah:

1. Buat passphrase root-only:

```bash
sudo install -o root -g root -m 600 /dev/null /root/.atcell-offsite.passphrase
sudo bash -c 'openssl rand -base64 48 > /root/.atcell-offsite.passphrase'
```

Passphrase hilang berarti arsip off-site tidak bisa dibuka.

2. Pilih tujuan upload. Opsi A rclone (disarankan): pasang rclone, lalu
   `sudo rclone config` sebagai root karena cron berjalan sebagai root. Opsi B
   HTTP PUT: isi `OFFSITE_PUT_URL` (URL dasar tanpa nama berkas) dan
   `OFFSITE_PUT_TOKEN` atau `OFFSITE_PUT_TOKEN_FILE`.

3. Isi `/root/.atcell-offsite.env` mode 0600:

```bash
OFFSITE_PASSPHRASE_FILE=/root/.atcell-offsite.passphrase
OFFSITE_RCLONE_REMOTE=r2:atcell-backup
# atau
OFFSITE_PUT_URL=https://example-endpoint/backups
OFFSITE_PUT_TOKEN_FILE=/root/.atcell-offsite.token
```

4. Jalankan manual `sudo /usr/local/bin/atcell-offsite`; output harus tanpa
   `GAGAL`. Periksa `sudo tail -n 20 /var/log/atcell-offsite.log`.

5. Buktikan berkas ada di sisi jauh. Exit 0 saja bukan bukti:

```bash
sudo ls -lht /data/backups/atcell/.offsite/ | head
sudo rclone ls r2:atcell-backup
sudo sha256sum /data/backups/atcell/.offsite/atcell-*.dump.enc | head
sudo rclone cat r2:atcell-backup/atcell-<nama>.dump.enc.sha256
```

Untuk HTTP PUT, unduh satu berkas dan bandingkan dengan sidecar `.sha256`.

6. `OFFSITE_KEEP_ENCRYPTED` (bawaan 3) mengatur salinan lokal. Yang terkirim ke
   luar tidak dihapus script, jadi rotasi di tujuan juga penting.

7. Untuk backup Storage, buat wrapper `/usr/local/bin/atcell-storage-backup`
   pola `atcell-offsite`: baca env 0600, ambil `DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, dan `SUPABASE_SECRET_KEY` dari container aplikasi
   saat runtime, lalu panggil `backup-storage.sh`. Isi
   `/root/.atcell-storage.env` dengan `STORAGE_PASSPHRASE_FILE`,
   `STORAGE_OFFSITE_RCLONE_REMOTE`, dan `BUCKETS`. Jadwalkan setelah off-site
   dump terbukti terkirim, lalu jalankan manual dan
   `restore-storage-drill.sh`.

8. Buktikan restore. Backup yang belum dipulihkan belum disebut cadangan. Unduh
   arsip ke mesin lain, dekripsi, dan periksa daftar isi:

```bash
openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 \
  -in atcell-<timestamp>.dump.enc -pass file:/root/.atcell-offsite.passphrase \
  -out atcell-<timestamp>.dump
pg_restore --list atcell-<timestamp>.dump | grep -c "TABLE DATA auth users"
```

Angka harus lebih dari nol. Dump tanpa `auth.users` berarti tidak ada orang yang
bisa login setelah restore.

Kalau gagal:

| Pesan | Arti | Perbaikan |
|---|---|---|
| `OFFSITE belum dikonfigurasi: tidak ada passphrase` | File passphrase kosong atau tidak terbaca | Cek nama dan izin 0600 |
| `tidak ada tujuan upload` | Remote dan PUT URL kosong | Isi salah satu |
| `rclone tidak terpasang` | Opsi A dipilih | Pasang dan konfigurasi rclone |
| `OFFSITE_PUT_URL diisi tapi token kosong` | Opsi B tanpa token | Isi token atau file token |
| `checksum sisi jauh beda` | Berkas tujuan berbeda | Jangan percaya salinan itu |

Yang tidak boleh dilakukan: menaruh passphrase/token di `/etc/cron.d`, memakai
`OFFSITE_PASSPHRASE` bila bisa file, menyalakan cron Storage sebelum off-site dump
terbukti, atau menghapus arsip lokal tanpa pernah mencoba restore.

### Akun yang hanya ada di target hilang saat restore

`scripts/restore-postgres.sh` memakai `pg_restore --clean --single-transaction`,
jadi target diisi ulang dari dump, bukan digabung. Akun Auth, profil, transaksi,
dan unit yang ada di target tetapi tidak ada di dump akan terhapus, termasuk akun
yang dibuat beberapa menit sebelum restore. Ini sifat `--clean`, bukan bug.

Konsekuensi:

1. Restore mengembalikan database ke saat dump diambil. Penjualan dan perubahan
   stok setelah jam backup hilang dari target.
2. Akun staf yang dibuat setelah backup terakhir tidak ikut pulih; daftarkan
   ulang setelah restore.
3. Sebelum restore sungguhan, jalankan `bun run restore:drill` dan baca output.

`backup-postgres.sh` memeriksa isi dump dan `restore-postgres.sh` memverifikasi
akun Auth asli setelah restore. Dump tanpa akun asli adalah kegagalan.

Contoh:

```bash
SOURCE_DATABASE_URL="..." BACKUP_DIR="/path/backup" bun run backup:postgres
psql "$RESTORE_DATABASE_URL" -f scripts/restore-target-bootstrap.sql
ALLOW_RESTORE=YES RESTORE_DRY_RUN=1 RESTORE_DATABASE_URL="..." \
  DUMP_FILE="/path/backup/atcell-....dump" bun run restore:postgres
ALLOW_RESTORE=YES RESTORE_ALLOWED_HOSTS="atcell-restore-local" \
  RESTORE_DATABASE_URL="..." DUMP_FILE="/path/backup/atcell-....dump" \
  bun run restore:postgres
```

Guard restore:

- `ALLOW_RESTORE=YES` syarat pertama, tetapi tidak cukup.
- Host target harus `localhost`, `127.0.0.1`, `::1`, atau disebut di
  `RESTORE_ALLOWED_HOSTS`. `atcell-restore-local` wajib disebut.
- Host produksi ditolak tanpa syarat: `*.supabase.co`, `*.supabase.com`, dan
  `*.atcell.my.id` berhenti dengan kode 3, termasuk bila ditulis ke
  `RESTORE_ALLOWED_HOSTS`.
- Tanpa `RESTORE_ASSUME_YES=1`, konfirmasi meminta nama database target diketik
  ulang. Prompt ke `/dev/tty`, bukan stdout.
- `RESTORE_DRY_RUN=1` menjalankan guard, mencetak target dan perintah, lalu
  berhenti tanpa koneksi.
- Script memakai `[[ ]]` dan `${var//...}`, jadi jalankan dengan `bash`.

`KEEP_DAYS` default 14. Dump lebih tua beserta `.sha256` dihapus, hanya pola
`atcell-*.dump`. `KEEP_DAYS=0` mematikan rotasi.

Script membaca daftar isi dump dulu. Kalau ada `auth.users`, stub tidak dibuat
dan akun staf ikut pulih. Kalau dump lama tidak memuat `auth.users`, stub dibuat
dengan alamat `restore-stub-<uuid>@invalid.local`; restore seperti itu ditolak
kode 5 karena tidak ada yang bisa login.

### Standby terisi di VPS

Resource `atcell-restore-local` berjalan dan diisi ulang terjadwal. Ini bukan
mirror aktif: aplikasi tidak pernah terhubung ke database ini, dan setiap sync
destruktif karena di-restore ulang dari dump.

| Komponen | Lokasi |
|---|---|
| Resource Coolify | `atcell-restore-local`, image `postgres:17-alpine` |
| Container | nama acak, network `coolify` saja, tanpa port host |
| Jadwal | `/etc/cron.d/atcell-standby-sync`, 03.17/09.17/15.17/21.17 |
| Wrapper | `/usr/local/bin/atcell-standby-sync`, mode 700, root |
| Log | `/var/log/atcell-standby-sync.log` |
| Dump perantara | `/data/backups/atcell-standby/`, `KEEP_DAYS=7` |

Alamat container dibaca dari Docker setiap kali jalan, jangan dikunci di dokumen
atau script. Pada 2 Okt 2026 alamat berpindah dari `10.0.1.4` ke `10.0.1.8`, lalu
`coolify-db` mengambil alamat lama; wrapper yang masih memakai alamat lama
mengirim password standby ke database platform. Wrapper kini mencatat
`Standby <container> di <ip>:5432` ke log.

Jalankan manual dengan cara yang sama seperti cron:

```bash
sudo /usr/local/bin/atcell-standby-sync
```

Alur: dump logis Supabase, bootstrap minimum, `pg_restore`. Wrapper tidak
menghapus schema `auth` bila target sudah punya akun asli. Wrapper meneruskan
`RESTORE_ALLOWED_HOSTS` dari alamat Docker dan `RESTORE_ASSUME_YES=1`. Verifikasi
akhir: `v_public_inventory` tidak kosong, tabel wajib ada, tidak ada profil tanpa
`auth.users`, dan minimal satu akun auth asli.

Batas failure domain: standby melindungi dari kerusakan data, migration salah,
atau `drop` tak sengaja, dan memperpendek RTO. Ia tidak melindungi dari kehilangan
VPS, akun Supabase yang dikompromikan, atau ransomware di host yang sama.
`scripts/backup-offsite.sh` menutup celah itu dengan salinan terenkripsi
off-host: checksum, `pg_restore --list`, pastikan memuat `auth.users`, enkripsi
AES-256-CBC PBKDF2, lalu kirim ke rclone atau HTTP PUT. Exit 0 berarti salinan
terkirim.

### Backup otomatis di VPS

`scripts/backup-postgres.sh` dijadwalkan cron:

| Komponen | Lokasi |
|---|---|
| Jadwal | `/etc/cron.d/atcell-backup`, 02.17 |
| Wrapper | `/usr/local/bin/atcell-backup` |
| Script repo | `/opt/atcell/scripts/backup-postgres.sh` |
| Hasil | `/data/backups/atcell/atcell-<timestamp>.dump` + `.sha256` |
| Log | `/var/log/atcell-backup.log` |

Container aplikasi tidak punya `pg_dump`, jadi wrapper menjalankannya di dalam
`postgres:17-alpine`. Versi 17 wajib karena Supabase 17.x. `DATABASE_URL` dibaca
runtime ke file sementara mode 0600 yang langsung dihapus.

Drill terjadwal `bun run restore:drill` mengambil dump terbaru, verifikasi
checksum, restore ke PostgreSQL 17 sekali pakai, memeriksa hasil, lalu membuang
container. Exit 0 berarti dump bisa dipulihkan dan punya akun auth asli.

| Komponen | Lokasi |
|---|---|
| Jadwal | `/etc/cron.d/atcell-restore-drill`, Minggu 04.17 |
| Wrapper | `/usr/local/bin/atcell-restore-drill` |
| Script repo | `/opt/atcell/scripts/restore-drill.sh` |
| Sumber dump | `/data/backups/atcell` |
| Log | `/var/log/atcell-restore-drill.log` |

Drill tidak menyentuh standby atau produksi: container sendiri,
`--network none`, tanpa port, tanpa password, dibuang lewat `trap`. Backup yang
belum pernah di-restore belum bisa disebut cadangan.

#### Rotasi log

Semua log memakai pola `su root adm`, `weekly`, `rotate 8`, `compress`,
`delaycompress`, `missingok`, `notifempty`, `copytruncate`.

| Log | Config |
|---|---|
| `/var/log/atcell-backup.log` | `/etc/logrotate.d/atcell-backup` |
| `/var/log/atcell-standby-sync.log` | `/etc/logrotate.d/atcell-standby-sync` |
| `/var/log/atcell-offsite.log` | `/etc/logrotate.d/atcell-offsite` |
| `/var/log/atcell-watchdog.log` | `/etc/logrotate.d/atcell-watchdog` |
| `/var/log/atcell-restore-drill.log` | `/etc/logrotate.d/atcell-restore-drill` |

Uji `logrotate -d /etc/logrotate.d/<nama>` sebelum dipasang.

#### Notifikasi kegagalan uptime

`scripts/atcell-watchdog.sh` dijalankan `/usr/local/bin/atcell-watchdog` lewat
`/etc/cron.d/atcell-watchdog` tiap lima menit. Script bersuara saat status
berubah, tetapi transisi dan pengulangan selama outage ditulis ke log, syslog
lewat `logger -t atcell-watchdog`, dan `/var/lib/atcell-watchdog/incident`.

Notifikasi keluar hanya lewat Telegram dan hanya kalau
`/root/.atcell-watchdog.env` berisi:

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Tanpa keduanya, pencatatan tetap jalan; hanya pesan ke telepon yang hilang.
`TELEGRAM_CHAT_ID` adalah id chat, bukan nama akun. Jangan tulis nilainya di repo.

Jangan menyimpan password, token, atau checksum dump sensitif di repository.
Secret hanya di Coolify secret manager.

## Testing wajib

```bash
bun run test
bunx tsc --noEmit
bun run lint
bun run build
bun run smoke:deployment -- <primary-url> [<fallback-url>]
```

Smoke test browser pada URL Coolify production:

- `/id` dan `/id/catalog` saat public snapshot tersedia.
- `/id/tracking` dengan kode valid dan invalid.
- login admin, sales, technician, customer.
- guard route sesuai role.
- registrasi IMEI, POS anti-double-sell, dan workflow tiket.
- RLS, Storage, advisor, bundle secret, dan security header.
