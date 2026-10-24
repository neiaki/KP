# Standar Best Practice

Diterapkan hanya yang relevan dengan stack proyek ini (Next.js 16 App
Router + React 19 + Tailwind 4 + Supabase/Drizzle, test `node --test`).
Setiap butir yang diterapkan wajib punya bukti (perintah + hasil) di
`docs/LOOP_LOG.md`. Butir tidak relevan ditandai N/A disertai alasan.

## A. Pengujian & kualitas kode (jaring pengaman, dikerjakan PERTAMA)

- Lint: 0 error dan 0 warning. Type-check strict (TypeScript): 0 error,
  tanpa `any` baru.
- Semua logika kritis (auth, validasi, kalkulasi, akses data) punya test.
  Assertion bermakna; satu test = satu perilaku; tidak ada test yang
  skip/only/kosong.
- Maksimal 3 alur kritis pengguna punya integration/e2e test, JIKA
  tooling sudah terpasang.
- Tidak ada dead code, console.log sisa debug, kode ter-comment, atau
  TODO tanpa ID backlog.
- Fungsi/komponen kecil dan satu tanggung jawab; tidak ada blok duplikat
  >10 baris.
- Konfigurasi dari environment variable, divalidasi saat startup (gagal
  cepat jika kurang).
- Error handling konsisten: tidak ada catch kosong, pesan untuk pengguna
  ramah, detail dilog.

## B. Performa (ukur pada production build lokal, mobile emulation)

- LCP <= 2.5 s, CLS <= 0.1, TBT <= 200 ms (TBT = proxy lab kasar untuk
  INP).
- Gambar: format modern (WebP/AVIF), width/height eksplisit, lazy-load di
  bawah fold, preload gambar LCP, ukuran sesuai tampilan (srcset/sizes).
- Font: font-display: swap, subset, preload yang kritis, maksimal 2
  keluarga.
- JS/CSS: code-splitting per rute, buang kode tak terpakai, defer/async
  untuk script non-kritis.
- Cache header untuk aset ber-hash, kompresi gzip/brotli.
- Data: tanpa N+1, pagination untuk daftar panjang, index untuk query
  yang sering.

## C. Aksesibilitas (WCAG 2.2 AA)

- HTML semantik (header/nav/main/footer, heading berurutan, satu h1),
  atribut lang.
- Semua input berlabel; error form terhubung ke inputnya; gambar bermakna
  punya alt.
- Kontras teks >= 4.5:1 (teks besar 3:1). Fokus terlihat; semua fungsi
  bisa lewat keyboard; tidak ada keyboard trap; target sentuh cukup
  besar.
- ARIA hanya jika HTML semantik tidak cukup. Hormati prefers-reduced-motion.

## D. SEO & metadata

- title & meta description unik per halaman; canonical; Open
  Graph/Twitter card; sitemap.xml & robots.txt; JSON-LD yang relevan; URL
  bersih; 404 mengembalikan status 404.

## E. Keamanan lanjutan (pelengkap Fase 3)

- CSP ketat (bertahap), SRI untuk script/style eksternal, lockfile
  ter-commit, tanpa advisory high/critical, .env.example tanpa nilai
  asli, tanpa data sensitif di log, validasi skema di batas server.

## F. Kesiapan produksi & UX

- README: setup, run, test, build, deploy, variabel lingkungan. CHANGELOG
  ringkas.
- Buat berkas workflow CI (lint+test+build+audit) TANPA menjalankan atau
  mem-push-nya.
- Health-check dan logging terstruktur (jika ada backend); halaman 404/500
  ramah.
- Responsif 320-1440 px tanpa scroll horizontal; state loading/empty/
  error; validasi form inline.
- Teks UI dan pesan error konsisten dan jelas.

## G. Dilarang tanpa persetujuan (tulis di docs/NEEDS_HUMAN.md)

Ganti framework, redesign total, fitur baru, dependency besar, perubahan
skema DB/API publik.
