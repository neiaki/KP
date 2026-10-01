# Dokumen Perencanaan dan Operasional At Cell

Kumpulan spesifikasi, kebutuhan, dan runbook deployment At Cell. Implementasi
saat ini memiliki dua mode: demo lokal berbasis mock/localStorage dan mode live
berbasis Supabase ketika environment production dikonfigurasi.

## Dokumen

| File | Isi | Status |
|------|-----|--------|
| `PRD-AtCell.md` | Product Requirements Document: overview, fitur inti, user flow, arsitektur Next.js + Supabase | Rencana jangka panjang |
| `UC-AtCell.md` | Spesifikasi 18 use case per aktor: prasyarat, alur utama, dan cabang alternatif. Diagram sudah dihapus, daftar use case di bagian 2 jadi acuan | **Acuan alur** |
| `requirement.md` | SRS v1 awal: aktor Sales/Teknisi/Pelanggan, modul IMEI, servis, trade-in | Digantikan v2 |
| `requirement-2.0.md` | SRS v2 At Cell: tambah aktor Admin/Owner, FR-xxx/NFR-xxx, modul etalase publik multibahasa + dashboard | **Acuan kebutuhan** |
| `DEPLOYMENT-REDUNDANCY.md` | Runbook Coolify, Supabase, health check, backup, dan rollout | **Acuan operasional** |
| `VPS-HARDENING.md` | Catatan audit host production dan langkah pengerasannya, untuk direview manusia sebelum dijalankan | **Acuan operasional** |
| `SECRET-ROTATION.md` | Urutan mengganti secret yang pernah bocor, lengkap dengan verifikasi | **Acuan operasional** |
| `CSP.md` | Cara kerja Content-Security-Policy berbasis nonce, daftar directive yang dipakai, dan alasan setiap keputusan | **Acuan keamanan** |
| `ANDROID-APP.md` | Build, signing, dan verifikasi Digital Asset Links untuk aplikasi Android `my.id.atcell`, plus daftar pengeras Play Protect dan batasnya | **Acuan operasional** |
| `PUBLIKASI-MODEL-TANPA-STOK.md` | Cara staf menerbitkan model ke katalog tanpa unit dan tanpa IMEI, isi form yang benar, apa yang dilihat pelanggan, dan langkah saat unit pertama arrive | **Acuan operasional** |
| `PERLUASAN-KATALOG-AT-CELL.md` | Usulan perluasan katalog lima model beserta harga yang wajib dikonfirmasi owner, foto mana yang jujur dan mana yang dibuang, dan urutan menjalankan migrasinya | **Acuan operasional** |
| `STATUS-PEKERJAAN-AT-CELL.md` | Peta posisi pekerjaan: apa yang selesai dengan buktinya, apa yang masih dikerjakan, apa yang menunggu keputusan manusia, dan batasan operasional SSH, migrasi, backup | **Acuan operasional** |

## Catatan

- Dua mode aplikasi (mock lokal dan Supabase live) dijelaskan di
  [`../README.md`](../README.md) bagian Konfigurasi Supabase.
- `tests/deployment-runbook.test.ts` menjaga isi runbook deployment tetap sinkron
  dengan `supabase/migrations/`, dan `tests/docs-index.test.ts` menjaga tabel di
  file ini tetap memuat seluruh dokumen yang ada.
- `tests/csp-doc.test.ts` menjaga `CSP.md` tetap sinkron dengan
  `src/lib/csp.ts`, supaya penjaga kebijakan tidak bisa dibenarkan sebagai
  dokumentasi yang sudah basi.

## Keputusan produk (29 Sep 2026)

- Etalase unit-driven: produk tanpa unit tetap tampil di bagian Baru masuk
  katalog (katalog dan beranda) dengan badge "Belum ada unit", bukan "Stok
  habis", karena model itu belum pernah punya unit dan bukan turun dari rak.
  Harga ditulis sebagai perkiraan saat unitnya masuk, bukan harga jual, dan
  baris harganya disembunyikan kalau `default_price` kosong atau nol. Tombol
  Minta dikabari membangun pesan lewat `buildNotifyMeHref` di
  `src/lib/catalogue-notify.ts`, yang menyebut model yang sedang dilihat.
  Helper `listProductsWithoutUnits` di `src/lib/shop.ts` dikunci
  `tests/etalase-empty-product.test.ts`, sedangkan copy publik dan panduan
  konsekuensi di portal dikunci `tests/catalogue-notify.test.ts` dan
  `tests/catalogue-no-unit-portal.test.ts`.
  Dokumen stafnya `PUBLIKASI-MODEL-TANPA-STOK.md`.
- Peringatan anti-scam di `/payment` dipertahankan. Copy ID/EN sudah kasual,
  aktif, dan tanpa em-dash, jadi tidak diubah.
- Home button dan APK: 10 varian di `design-taste-frontend/` memang tidak
  punya tombol home dan repo tidak menyimpan APK apa pun. Diputuskan tidak
  ada aksi kode, hanya dicatat di sini.
- Harga kondisi laptop dan bottom shopping section: ditunda, testing jalan
  dulu dengan data existing.
- Scroll trackpad portal: `<main>` portal dan sidebar desktop tidak lagi
  memutus rantai scroll (`overscroll-contain` dihapus). Dialog dan drawer
  mobile tetap menahan scroll. Dikunci
  `tests/portal-scroll-trap.test.ts`.
