# Perlu Keputusan / Tindakan Owner

## 1. API Coolify 401 — TERPECAHKAN 25 Okt 2026, tidak perlu tindakan owner

Akar: bearer terkontaminasi output psql dua baris (id + tag `INSERT 0 1`).
Bukti: token segar + ekstraksi bersih (`psql -t -A -q` + `head -1`) →
GET /api/v1/version **200**; POST deploy **200** (queue finished, container
ac21aea healthy); tap target produksi diukur ulang 5 → 1 (sisa skip link
keyboard-only, dikecualikan WCAG 2.5.8). Uji "token lama 401" laporan asal
tidak valid (plain secret mustahil direkonstruksi). Pola bearer bersih
wajib dicatat di LOOP_LOG.

### Laporan asli (arsip, sudah tidak berlaku)

### ~~API Coolify 4.5.0 menolak semua request (401) — prosedur deploy via API macet~~

Ditemukan 25 Oktober 2026 saat deploy pin sha-b5147fa (PR #168):

- `POST /api/v1/deploy` dengan token sementara buatan psql → 401 Unauthenticated
  (dua format percobaan: `tokenable_type='User'` dan `'App\Models\User'`,
  abilities `["deploy","read","write"]`, expires 1 jam).
- Token owner yang LAMA dan masih berlaku (id=4, abilities lengkap, belum
  kedaluwarsa) → 401 juga di `GET /api/v1/applications`.
- Endpoint yang seharusnya publik (`GET /api/v1/version`) → 401 juga,
  dari dalam container coolify sekalipun.
- Tidak ada jelek auth di laravel.log; middleware ApiIpAllowed mengembalikan
  403 (bukan 401) jadi bukan itu sumbernya; guard standar `web` + Sanctum.

Deploy tetap berhasil lewat jalur lain: `application_settings.is_auto_deploy_enabled = t`
menyalakan auto-deploy webhook GitHub, jadi merge PR pin memicu deployment
queue 111 (commit 811aa388) dan selesai normal.

Opsi yang bisa dicoba owner:
1. Buka UI Coolify → Settings → API: pastikan "API enabled" aktif, lalu buat
   token baru dari UI dan uji `curl` dengan token itu. Kalau token UI baru
   bisa, berarti pembuatan token lewat psql tidak lagi kompatibel di 4.5.0
   (dokumen `docs/LOOP_LOG.md` dan runbook deploy perlu diperbarui polanya).
2. Kalau token UI baru juga 401: kemungkinan regresi upgrade Coolify 4.5.0 —
   cek ulang `instance_settings.is_api_enabled` dan log `docker logs coolify`
   saat menembak API.
3. Alternatif sementara: lanjut pakai pola merge-PR + auto-deploy webhook
   (yang terbukti jalan), plus `UPDATE applications SET git_commit_sha` di
   coolify-db supaya metadata tetap akurat.

## 2. ~~Komponen bersama Notice/Modal/Textarea untuk portal (F5)~~ — SELESAI 25 Okt 2026 (PR #174)

NoticeBanner + ModalShell kini ada di components/portal/ dan dipakai halaman
customers & listing. Sisa pekerjaan sukarela (bukan keputusan owner): migrasi
halaman portal lain (products/inventory/pos/staff/service) satu per satu,
dan Textarea bersama bila kelak disepakati masuk components/ui/.

Backlog F5: halaman portal customers & listing menduplikasi pola Notice,
Modal, dan Textarea. Perapihan yang benar menyentuh `components/ui/` yang
sesuai AGENTS.md butuh persetujuan owner sebelum dikerjakan.

## 3. Banner BackendStatus menyebabkan CLS besar saat error (desain perlu keputusan)

Diukur 25 Okt 2026 [REPRODUKSI Lighthouse + browser]: banner error
(`src/components/backend-status.tsx`, 65px) disisipkan di puncak `<body>`
PASCA-hidrasi saat fetch snapshot publik gagal; seluruh halaman bergeser
(CLS terukur 0.733-0.878; tanpa banner 0.079-0.000). Kegagalan snapshot
publik terjadi antara lain saat kuota rate-limit 600/menit per IP habis.

Opsi: (a) banner jadi overlay `fixed` (tidak menggeser konten), (b) slot
tinggi tetap yang kosong saat sehat, (c) status pindah ke live-chat
widget. Rekomendasi: (a) — paling murah dan tidak mengubah layout sehat.

## 4. Exclusion angka lab Lighthouse (STANDARDS B) dengan alasan teknis

Target lab yang tidak tercapai di production build lokal (median 3 run,
mobile, slow-4G + 4x CPU throttling): Performance /id 69 dan /en 74
(target 90), LCP /id 4.86s /en 4.73s /catalog 2.62s /trade-in 2.68s
(target 2.5s), TBT 232-458ms (target 200ms).

Alasan teknis: (1) pengukuran jaringan nyata TANPA throttling di
produksi menunjukkan LCP < 1.3s (hero selesai 793ms, domInteractive
953ms) dan CLS 0 — target lab menghukum arsitektur yang sehat di
pengguna sesungguhnya; (2) JS 603KB gz berisi Sentry yang WAJIB aktif di
produksi (DSN live) sehingga lazy-load hanya menguntungkan dev;
(3) hero image sudah `priority` (preload+fetchpriority). Menembus TBT
200ms lab butuh pemangkasan arsitektur JS (Sentry defer/edge) = keputusan
produk. Angka yang LULUS di lab: A11y 100 semua, BP 96-100, SEO 100,
CLS 0-0.079 semua, Perf /id/tracking 93, LCP tracking 2.11s.

### Tambahan butir 3 (25 Okt 2026): shift footer intermiten di /id/trade-in

Dua run Lighthouse penuh berturut-turut: trade-in CLS 0.878-1.000 pada
2/3 run (footer bergeser 0.800, sources kosong di laporan), run yang sama
bisa bersih 0.079. Bukan banner BackendStatus (lokal tanpa env; banner
mustahil dirender) dan bukan gambar (tidak ada img awal). Akar
TIDAK-TERVERIFIKASI — perlu penyelidikan dengan trace layar per-frame.
Opsi alat: rekaman video Lighthouse atau Chrome DevTools performance
panel di halaman trade-in.

## 5. Tracking: noindex halaman hasil lacak vs SEO landing page

Konflik desain yang ditemukan 25 Oktober 2026 saat audit bagian E:

- Halaman `/id/tracking` dan `/en/tracking` adalah landing page yang
  menargetkan pencarian "lacak servis HP". Kalau seluruh halaman diberi
  noindex, kata kunci itu kehilangan satu-satunya halaman publik yang
  relevan.
- Tetapi URL hasil pencarian membawa `?ticket=SRV-...`. Kode tiket adalah
  identitas servis milik satu pelanggan; URL yang dibagikan atau ditemukan
  crawler tidak boleh muncul di hasil pencarian.

Keputusan yang sudah diterapkan: landing page tanpa query tetap indexable,
sedangkan URL dengan `?ticket=` memakai `robots: { index: false, follow: true }`
dan canonical tetap menunjuk URL bersih. Implementasi ada di
`buildTrackingMetadata()` (`src/app/sitemap.ts`), dipakai
`src/app/(public)/[locale]/tracking/page.tsx`, dan dikunci
`tests/seo-surface.test.ts`.

Tindakan owner: tidak ada, kecuali owner lebih memilih noindex total untuk
seluruh halaman tracking. Kalau itu dipilih, hilangkan `buildTrackingMetadata`
dan pakai `buildRouteMetadata` dengan robots noindex permanen, lalu update
tes yang sama.

## 6. Dua kebijakan produk yang tersirat dari kode, perlu konfirmasi owner

Audit F menemukan dua klaim PRD lama yang tidak cocok dengan kode. Dokumen
sudah diselaraskan ke perilaku yang berjalan, tanpa mengubah kode. Owner
perlu mengonfirmasi apakah perilaku itu memang yang diinginkan.

- **Sales mengubah harga acuan dan foto etalase.** Kode mengizinkan
  `updateProductListing` untuk `admin` dan `sales`, policy
  `products_sales_update`, dan trigger `products_sales_column_guard`
  membatasi sales ke `default_price` dan `official_images`. PRD lama
  menyebut master produk eksklusif Admin. Kalau owner ingin admin-only,
  perlu perubahan kode dan migrasi baru; jangan hanya mengubah dokumen.
- **Tracking publik tidak menampilkan biaya, foto, atau keluhan.** Server
  Action `trackTicketPublic` hanya mengembalikan status, model, akhir
  IMEI, garansi, dan waktu. PRD lama menyebut total biaya. Kalau owner
  ingin biaya terlihat publik, itu perubahan perilaku dan keputusan
  privasi baru, bukan sekadar perbaikan dokumen.

## 7. Server Action mempercayai `X-Forwarded-Host` (verifikasi proxy, bukan celah browser)

Ditemukan 25 Oktober 2026 saat red-team ulang bagian B. Next.js membandingkan
`Origin` Server Action dengan `X-Forwarded-Host` lebih dulu, baru `Host`.
Probe lokal dengan action ID asli:

- `Origin: https://evil.example` tanpa `X-Forwarded-Host` → action dibatalkan,
  HTTP 500, body hanya digest, tanpa mutasi.
- `Origin: https://evil.example` + `X-Forwarded-Host: evil.example` → action
  dieksekusi (respons `backendOffline` di mode tanpa env).

Ini **bukan CSRF browser**: `X-Forwarded-Host` adalah header non-simple, jadi
`fetch` lintas origin memicu preflight dan server tidak mengirim
`Access-Control-Allow-Origin`; form HTML juga tidak bisa menyetel header itu.
Risikonya hanya muncul kalau reverse proxy meneruskan `X-Forwarded-Host` dari
klien tanpa menimpanya. Tindakan owner: pastikan Coolify/Traefik menimpa
`X-Forwarded-Host` dengan host asli (atau set `SERVER_ACTIONS_ALLOWED_ORIGINS`
sesuai domain final). Tidak ada perubahan kode tanpa persetujuan owner.

## 8. Verifikasi DB-level belum dijalankan (perbaikan test siap; DATABASE_URL UNSET)

Gerbang 25 Oktober 2026 berjalan tanpa `DATABASE_URL`, jadi 14 test yang
membutuhkan database di-skip. Yang sudah diverifikasi: logika murni, migrasi
statis, RLS/grant lewat pembacaan migrasi, dan test migrasi tanpa koneksi.
Yang belum: SELECT/INSERT nyata sebagai anon/authenticated, policy RLS pada
data hidup, dan transaksi POS. Tindakan owner: jalankan
`DATABASE_URL=<staging> npm test` di database lokal/staging sebelum deploy.
Jangan memakai database produksi untuk pengujian ini.

Pembaruan 25 Oktober 2026: lapis 2 `tests/pos-concurrent-sale.test.ts`
diperbaiki agar bisa berjalan di CI. Seed sekarang membuat baris `auth.users`
lebih dulu (FK `profiles.id` ON DELETE CASCADE), lalu menaikkan peran profil
menjadi admin; env Supabase stub diisi sebelum `executeSale` diimpor supaya
`requireRole` tidak menolak sebelum perlombaan. Cleanup menghapus `auth.users`
sehingga profil ikut terhapus. Verifikasi lokal masih belum bisa karena tidak
ada server PostgreSQL dan `DATABASE_URL` belum diisi. Jalankan di database
sekali pakai, bukan production:

```bash
DATABASE_URL=postgres://... node --experimental-strip-types \
  --test tests/pos-concurrent-sale.test.ts
```

CI `database-tests` akan menjalankan file ini otomatis saat PR dibuat karena
file memakai `process.env.DATABASE_URL`.

## 9. Usulan migrasi integritas DB: butuh keputusan owner dan verifikasi staging

`docs/db-integrity-proposals.md` membandingkan aturan yang dijaga Server Action
dengan yang dijaga PostgreSQL. Usulan SQL ada di
`docs/migrations-proposed/20261025090000_db_integrity.sql` dan **belum
dijalankan**. File itu sengaja tidak diletakkan di `supabase/migrations/` agar
tidak dianggap sudah disetujui oleh test ledger/runbook.

Keputusan owner yang dibutuhkan:

- Setujui atau tolak bagian A-L: unique item transaksi, guard harga/status
  item, penandaan sold otomatis, larangan edit unit sold, check
  `final_payment`, check `total_fee`, total transaksi sama dengan item,
  role teknisi, guard biaya/status tiket untuk sales, `sales_id` aktor,
  serta minimal satu admin.
- Bagian M (`selling_price >= purchase_cost`) adalah kebijakan harga.
  Rekomendasi: setujui untuk mencegah jual di bawah modal, kecuali toko
  sengaja memakai loss leader. Harga impas tetap diizinkan.
- Temuan terpisah yang belum diputuskan: sales masih bisa mengubah
  `costBreakdown`, `technicianNotes`, `warrantyDays`, dan `technicianId`;
  belum ada audit harga/stok; `registerUnits` belum memeriksa harga di bawah
  modal; RPC lama `process_trade_in_sale` belum memeriksa `is_demo`.
- Verifikasi DB belum bisa dilakukan di sesi ini: `DATABASE_URL` tidak
  tersedia dan MISI melarang docker/psql/push. Setelah disetujui, pindahkan
  SQL ke `supabase/migrations/` dengan timestamp baru, perbarui
  `RUN-ALL-PENDING.sql`, ledger, dan runbook, lalu jalankan di database
  lokal/staging. Jangan memakai production untuk pengujian.
- Test fixture `tests/pos-concurrent-sale.test.ts` sudah diperbaiki, tetapi
  jalur DB-nya belum dijalankan ulang. Jalankan
  `DATABASE_URL=<staging> node --experimental-strip-types --test tests/pos-concurrent-sale.test.ts`
  di database sekali pakai.

## 10. Klaim PRD yang belum sepenuhnya ada di UI

Dua klaim di `docs/PRD-AtCell.md` §3.2 belum sesuai kenyataan halaman portal:

- **Grafik omzet harian/bulanan.** Dashboard
  (`src/app/(portal)/portal/dashboard/page.tsx:26-46`) hanya menampilkan
  kartu total omzet, jumlah transaksi, tiket aktif, dan stok rendah; tidak ada
  grafik deret waktu. Keputusan owner: bangun grafiknya, atau ubah PRD menjadi
  ringkasan total.
- **Laporan performa teknisi berisi rata-rata waktu pengerjaan per teknisi.**
  Halaman laporan (`src/app/(portal)/portal/reports/page.tsx:11-40`) menghitung
  total unit selesai, unit dikerjakan, omzet jasa, dan omzet meja servis secara
  global; rincian tiket tidak dikelompokkan per `technician_id` dan tidak
  menghitung durasi rata-rata. Keputusan owner: tambah agregasi per teknisi,
  atau selaraskan PRD/FR-D-03 dengan laporan global yang ada.

Tidak ada perubahan perilaku pada sesi ini; dokumen PRD tetap menjadi
requirement sampai owner memutuskan.

## 11. NFR-07 baru menjamin aktor pada jalur Server Action

`docs/requirement-2.0.md` NFR-07 meminta setiap mutasi status unit dan tiket
servis mencatat identitas pengguna. Trigger audit
(`supabase/migrations/0007_audit_trail.sql:111-136`) membaca
`private.current_actor_id()`, dan Server Action mengisinya lewat
`setAuditActor` (`src/lib/actions/_helpers.ts:27-29`). Namun policy RLS masih
mengizinkan staf menulis langsung ke `inventory_units` dan `service_tickets`
(`supabase/migrations/0002_harden_atcell_schema.sql:407-415,473-477`), sehingga
tulis langsung lewat PostgREST dapat menghasilkan baris audit dengan
`actor_id` NULL. Keputusan owner: perketat RLS/trigger agar aktor wajib, atau
ubah NFR-07 menjadi "mutasi lewat Server Action". Usulan SQL terkait ada di
`docs/migrations-proposed/20261025090000_db_integrity.sql` dan belum
dijalankan.
