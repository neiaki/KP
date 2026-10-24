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
