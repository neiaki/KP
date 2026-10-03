# Dokumen Perencanaan dan Operasional At Cell

Kumpulan spesifikasi, kebutuhan, dan runbook deployment At Cell. Implementasi
saat ini memiliki dua mode: demo lokal berbasis mock/localStorage dan mode live
berbasis Supabase ketika environment production dikonfigurasi.

## Dokumen

| File | Isi | Status |
|------|-----|--------|
| `PRD-AtCell.md` | Product Requirements Document: overview, fitur inti, user flow, arsitektur Next.js + Supabase | Rencana jangka panjang |
| `UC-AtCell.md` | Spesifikasi use case per aktor (18 UC), plus diagram Mermaid lama yang disimpan sebagai arsip di dalam berkas itu sendiri | **Acuan alur** |
| `requirement.md` | SRS v1 awal: aktor Sales/Teknisi/Pelanggan, modul IMEI, servis, trade-in | Digantikan v2 |
| `requirement-2.0.md` | SRS v2 At Cell: tambah aktor Admin/Owner, FR-xxx/NFR-xxx, modul etalase publik multibahasa + dashboard | **Acuan kebutuhan** |
| `DEPLOYMENT-REDUNDANCY.md` | Runbook Coolify, Supabase, health check, backup, dan rollout | **Acuan operasional** |
| `VPS-HARDENING.md` | Catatan audit host production dan langkah pengerasannya, untuk direview manusia sebelum dijalankan | **Acuan operasional** |
| `SECRET-ROTATION.md` | Urutan mengganti secret yang pernah bocor, lengkap dengan verifikasi | **Acuan operasional** |
| `CSP.md` | Cara kerja Content-Security-Policy berbasis nonce, daftar directive yang dipakai, dan alasan setiap keputusan | **Acuan keamanan** |
| `ANDROID-APP.md` | Build, signing, dan verifikasi Digital Asset Links untuk aplikasi Android `my.id.atcell`, plus daftar pengeras Play Protect dan batasnya | **Acuan operasional** |
| `PUBLIKASI-MODEL-TANPA-STOK.md` | Cara staf menerbitkan model ke katalog tanpa unit dan tanpa IMEI, isi form yang benar, apa yang dilihat pelanggan, dan langkah saat unit pertama arrive | **Acuan operasional** |
| `PERLUASAN-KATALOG-AT-CELL.md` | Usulan perluasan katalog lima model beserta harga yang wajib dikonfirmasi owner, foto mana yang jujur dan mana yang dibuang, dan urutan menjalankan migrasinya | **Acuan operasional** |
| `TRADE-IN-LAPTOP.md` | Yang sudah ada di mesin taksir tukar tambah, empat penghalang untuk laptop, data yang harus disuplai toko, dan tiga keputusan pemilik sebelum ada kode ditulis | **Acuan keputusan** |
| `PAYMENT-WARNING-COPY.md` | Letak kalimat peringatan link pembayaran di halaman publik, risiko kalau dihapus, dan copy tulisan ulang yang bisa disetujui dalam satu langkah | **Acuan keputusan** |

## Catatan

- Dua mode aplikasi (mock lokal dan Supabase live) dijelaskan di
  [`../README.md`](../README.md) bagian Konfigurasi Supabase.
- `tests/deployment-runbook.test.ts` menjaga isi runbook deployment tetap sinkron
  dengan `supabase/migrations/`, dan `tests/docs-index.test.ts` menjaga tabel di
  file ini tetap memuat seluruh dokumen yang ada.
- `tests/csp-doc.test.ts` menjaga `CSP.md` tetap sinkron dengan
  `src/lib/csp.ts`, supaya penjaga kebijakan tidak bisa dibenarkan sebagai
  dokumentasi yang sudah basi.
- Tidak ada berkas gambar diagram di `docs/`. Diagram PlantUML dan render PNG
  serta SVG-nya dihapus pada 1 Oktober 2026, lalu berkas Mermaid `diagram.mmd`
  dihapus pada 2 Oktober 2026 karena isinya sudah tersalin inline di bagian 3
  `UC-AtCell.md`. Daftar use case di bagian 2 berkas itu yang jadi acuan.
- Akses panel Coolify dijelaskan di `COOLIFY-PANEL.md`, karena panel adalah
  kendali penuh atas env production dan jalurnya tidak bisa ditebak dari
  `ufw status` saja.

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
  ada aksi kode, hanya dicatat di sini. Lanjutan 2 Oktober 2026: tidak ada
  tombol home baru yang ditambahkan, jadi keputusan ini tetap berlaku. Yang
  diklarifikasi cuma marka merek di navbar, dan itu tetap tautan ke beranda.
  Alasannya ada di keputusan 2 Oktober 2026 di bawah.
- Harga kondisi laptop dan bottom shopping section: ditunda, testing jalan
  dulu dengan data existing. Lanjutannya ada di keputusan 2 Oktober 2026.
- Scroll trackpad portal: `<main>` portal dan sidebar desktop tidak lagi
  memutus rantai scroll (`overscroll-contain` dihapus). Dialog dan drawer
  mobile tetap menahan scroll. Dikunci
  `tests/portal-scroll-trap.test.ts`.

## Keputusan produk (2 Oktober 2026)

Empat catatan penguji yang ambigu ditelusuri ke kodenya. Tiga berakhir sebagai
dokumen keputusan yang menunggu owner, satu berakhir sebagai perbaikan kode.
Tidak ada perilaku bisnis yang diubah tanpa persetujuan owner.

- Note A, "kondisi laptop harga berubah (planing)": fitur, bukan bug.
  Satu-satunya mesin harga berbasis kondisi di aplikasi adalah kalkulator
  tukar tambah, dan modelnya dikunci iPhone 11 ke atas. Laptop tidak bisa
  masuk `inventory_units` maupun `trade_in_records` karena keduanya mewajibkan
  IMEI 15 digit. Tidak ada harga laptop yang dikarang. Lanjutannya di
  `TRADE-IN-LAPTOP.md`.
- Note B, "1. bagian belanja bawah": dua kandidat, kolom footer "Belanja"
  dan section "Kenapa belanja di At Cell". Tidak ada otoritas desain untuk
  memilih, karena kesepuluh varian mockup tidak punya footer sama sekali.
  Audit tautan dan lebar sel tidak menemukan cacat: keempat tautan kolom
  Belanja memakai awalan locale yang benar, filter kondisi terpakai dari URL,
  dan bento tidak meluber di 390 px. Tidak ada yang diubah.
- Note C, "button beranda di web samain dengan apk": tidak ada artefak
  aplikasi di repo. Android Trusted Web Activity yang dikirim PR #44 hanya
  pembungkus web, jadi tidak ada tombol home native yang bisa dicocokkan.
  Marka merek di navbar tetap tautan ke beranda, menyimpang dari 10 varian
  yang merendernya sebagai label biasa. Alasannya: di desktop tidak ada item
  Beranda di nav sama sekali, jadi menghapus tautannya akan menghapus
  satu-satunya jalan pulang dari header. Yang diperbaiki justru tautan di
  bilah header yang tidak menutup menu mobile.
- Note D, "notif at cell tidak pernah mengirim link pembayaran lewat chat
  hapus": ini potongan kalimat yang persis ada di `/payment` dan `/terms`.
  Keputusan 29 September 2026 di atas sudah menyatakan peringatan itu
  dipertahankan. Catatan ini membukanya kembali dengan alasan nada, bukan
  alasan keamanan. Copy publik tidak diubah sebelum owner memilih. Lanjutannya
  di `PAYMENT-WARNING-COPY.md`.
