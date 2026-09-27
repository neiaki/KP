# Content-Security-Policy At Cell

Dokumen ini menjelaskan cara kerja Content-Security-Policy (CSP) di At Cell dan
alasan di balik setiap keputusan yang diambil. Tujuannya sederhana: test yang
menjaga kebijakan ini tidak boleh dipotong begitu saja, dan siapa pun
yang mau menambah asal baru tahu harus menyentuh berkas mana.

Kebijakan ini melindungi dua hal: skrip yang tidak ditulis di repo ini tidak
boleh jalan, dan browser tidak boleh mengirim data ke alamat yang tidak
seharusnyanya.

## Ringkasan

| Yang | Di mana |
|-----|---------|
| Satu-satunya tempat kebijakan dibentuk | [`src/lib/csp.ts`](../src/lib/csp.ts) |
| Satu-satunya tempat header dipasang | [`src/proxy.ts`](../src/proxy.ts) |
| Syarat agar nonce cocok | [`src/app/(portal)/layout.tsx`](../src/app/(portal)/layout.tsx) |
| Test penjaga | [`tests/csp.test.ts`](../tests/csp.test.ts) dan [`tests/csp-doc.test.ts`](../tests/csp-doc.test.ts) |

## Alur per permintaan

1. `src/proxy.ts` membuat satu nonce per permintaan lewat `createNonce()`.
2. Nonce dipasang ke dua tempat sekaligus:
   - header respons `Content-Security-Policy`,
   - header request `x-nonce`.
3. `src/lib/csp.ts` menyusun nilai header dari nonce tadi, mode pengembangan,
   dan host Storage dari env.
4. Halaman yang dirender per permintaan membaca `x-nonce`, lalu Next.js
   menempelkan nonce itu ke setiap tag `<script>` yang dia hasilkan.
5. `src/proxy.ts` memasang kembali header respons yang sama, sehingga browser
   hanya menerima skrip yang noncenya cocok.

Langkah 2 punya dua bagian karena hanya satu dari keduanya cukup untuk merusak
halaman. Kalau nonce dipasang di respons saja, HTML yang sampai ke browser tidak
pernah punya nonce, sehingga **seluruh** skrip hydration ditolak dan yang tampil
hanya HTML tanpa interaksi. Kalau dipasang di respons dan request barulah, kedua
sisi benar.

Tujuh jalur keluar dari `proxy` (continue, rewrite, redirect, dan respons 403
atau 503 buatan sendiri) semuanya lewat helper `withCsp()`, jadi tidak ada jalur
yang diam-diam tanpa kebijakan. `tests/csp.test.ts` menjaga jalur continue dan
rewrite secara langsung.

## Dua mode kebijakan

`buildContentSecurityPolicy` punya dua mode, dipilih oleh ada tidaknya nonce.

| Mode | Kapan | `script-src` |
|------|-------|--------------|
| Nonce | Halaman dirender per permintaan | `'self'`, `'nonce-...'`, `'strict-dynamic'` |
| Longgar | Nonce kosong, misalnya respons yang dibuat sendiri tanpa render | `'self'`, `'unsafe-inline'` |

Alasan mode longgar ada: halaman yang gagal tampil lebih buruk daripada halaman
yang tampil dengan perlindungan separuh. Batasnya jelas, yaitu hanya berlaku
ketika tidak ada halaman yang sempat dirender, bukan sebagai pengganti nonce
untuk halaman dinamis.

`'strict-dynamic'` membuat browser mempercayai skrip yang dimuat skrip
ber-nonce, sehingga daftar host skrip tidak perlu dipercaya dan tidak perlu
menebak asal lain.

## Syarat nonce cocok: halaman wajib dinamis

Nonce hidup sebentar di dalam satu permintaan. Halaman yang diprerender saat
build sudah punya skripnya jadi HTML waktu build, sehingga nonce per permintaan
tidak akan pernah cocok dan seluruh skrip hydration ditolak. Dua area punya
situasi berbeda:

- Area publik sudah dirender per permintaan sejak layout-nya memanggil
  `getPublicSnapshot()`, jadi nonce gratis dan tidak perlu ada yang diubah.
- Area portal sebelumnya diprerender, jadi sekarang dipaksa dirender per
  permintaan dengan `export const dynamic = "force-dynamic"` di
  [`src/app/(portal)/layout.tsx`](../src/app/(portal)/layout.tsx).

Baris itu tidak boleh dihapus. `tests/csp.test.ts` membacanya langsung dari
berkas dan menggagalkan test kalau hilang, karena hilangnya tidak menimbulkan
error tipe maupun error build, hanya portal kosong di browser.

Letak baris itu bukan di `src/app/(portal)/portal/layout.tsx` yang berisi
sidebar. Route segment config hanya dibaca dari berkas server, sedangkan layout
portal adalah komponen klien, jadi pengaturannya harus di root layout route
group.

## Daftar directive dan alasannya

| Directive | Nilai | Alasan |
|-----------|-------|--------|
| `default-src` | `'self'` | Cadangan untuk directive yang tidak disebut. |
| `base-uri` | `'self'` | Mencegah `<base>` dialihkan ke domain lain. |
| `object-src` | `'none'` | Tidak ada plugin di situs ini. |
| `frame-ancestors` | `'none'` | Mencegah situs lain membungkus halaman ini untuk clickjacking. |
| `form-action` | `'self'` | Form hanya mengirim ke server sendiri. |
| `script-src` | Lihat tabel mode di atas | Satu-satunya directive yang punya mode sendiri. |
| `script-src-attr` | `'none'` | Menolak handler inline pada atribut HTML. React 19 memakai `addEventListener`, jadi tidak ada kebutuhannya. |
| `style-src` | `'self'`, `'unsafe-inline'` | Nonce tidak pernah berlaku untuk atribut `style`, dan tiga berkas memakainya. |
| `img-src` | `'self'`, `data:`, `blob:`, Simple Icons, Unsplash, host Storage | Logo merek, foto mode mock, dan foto produk. |
| `font-src` | `'self'` | Font lewat `next/font` di-host sendiri, bukan dari CDN. |
| `connect-src` | `'self'` | Browser tidak pernah bicara langsung ke Supabase. |
| `frame-src` | `https://www.google.com` | Peta kontak di halaman kaki. |
| `media-src` | `'self'` | Tidak ada media dari luar. |
| `manifest-src` | `'self'` | Manifest dibuat sendiri. |
| `worker-src` | `'self'`, `blob:` | Service worker dan worker dari `blob:`. |

Host Storage diambil dari `NEXT_PUBLIC_SUPABASE_URL` lewat `hostStorage()`,
bukan ditulis mati. Kalau project Supabase diganti, semua host lama hilang dari
kebijakan dan foto produk ikut rusak, jadi test memeriksa kedua arah: env terisi
harus masuk, env kosong atau rusak tidak boleh dikarang.

## Yang sengaja tidak dipakai

- `upgrade-insecure-requests` dibuang. HSTS dengan preload di
  [`next.config.ts`](../next.config.ts) sudah lebih kuat, sedangkan directive ini
  menaikkan alamat `http` jadi `https` juga di localhost, sehingga `next start`
  lokal tidak bisa diuji. Ada test yang menjaga agar directive ini tidak
  diam-diam dikembalikan.
- `connect-src` tidak dibuka ke host Supabase. `createBrowserClient` di
  [`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts) tidak punya
  pemanggil, semua akses lewat server action. Kalau nanti ada pemanggil, host itu
  wajib ditambahkan beserta test-nya.
- Nonce untuk `style-src` tidak dicoba. Aturan CSP tidak menyediakan nonce untuk
  atribut `style`, jadi hasilnya hanya rasa aman semu.
- Daftar host skrip yang panjang tidak dipakai sebagai pengganti nonce. Setiap
  host skrip yang diizinkan jadi celah baru, sedangkan nonce menutup semua
  skrip yang tidak bawaan repo ini.

## Menambah asal baru

1. Tambah hostnya di [`src/lib/csp.ts`](../src/lib/csp.ts), ditulis utuh sebagai
   konstanta bernama, bukan hasil pola.
2. Tambah test di [`tests/csp.test.ts`](../tests/csp.test.ts) yang memaksa host
   itu ada di directive yang tepat.
3. Kalau host-nya berasal dari env, test juga harus memeriksa arah sebaliknya,
   yaitu env kosong tidak boleh membuat policy karangan.
4. Jalankan `npm test`, lalu `npx tsc --noEmit` dan `npm run lint`.

## Verifikasi manual

Cek header dari terminal:

```bash
curl -sI https://atcell.my.id/id | tr -d '\r' | grep -i 'content-security-policy'
```

Periksa di browser:

1. Buka DevTools, Console harus bersih tanpa pelanggaran CSP.
2. Di Network, filter skrip, lalu buka salah satu dan lihat atribut nonce-nya.
   Cara membaca yang benar adalah properti `script.nonce`, bukan
   `getAttribute("nonce")`, karena browser sengaja mengosongkan yang kedua.
3. Ubah ke mode gelap lewat tombol tema, navigasi client-side ke katalog, lalu
   pastikan tidak ada halaman yang kehilangan interaksi.

## Berkas terkait

- [`src/lib/csp.ts`](../src/lib/csp.ts): kebijakan dan pembuatan nonce.
- [`src/proxy.ts`](../src/proxy.ts): pemasangan header dan guard akses portal.
- [`src/app/(portal)/layout.tsx`](../src/app/(portal)/layout.tsx): syarat render
  per permintaan untuk area portal.
- [`src/lib/print-nota.ts`](../src/lib/print-nota.ts): cetak nota. Dokumen dari
  `window.open` mewarisi kebijakan ini, jadi isinya tidak boleh memakai
  `<script>` inline. `win.print()` dipanggil dari luar dokumen itu.
- [`tests/csp.test.ts`](../tests/csp.test.ts): penjaga perilaku kebijakan.
- [`tests/csp-doc.test.ts`](../tests/csp-doc.test.ts): penjaga isi dokumen ini
  supaya tetap sinkron dengan kode.
- Panduan resmi Next.js:
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
