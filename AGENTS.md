<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# At Cell — Toko HP Serpong (Next.js + Mock Store)

Web toko handphone offline "At Cell" (Paku Jaya, Serpong Utara): etalase publik
ID/EN + portal operasional staf. **Belum ada backend**: seluruh data berasal dari
`src/lib/mock-data.ts` yang dimuat ke state via `src/lib/store.ts` dan
dipersist ke `localStorage`. Jangan mengasumsikan Supabase/API sudah tersambung
(PRD di `PRD_AtCell(1).md` adalah rencana, bukan kondisi saat ini).

## Perintah

- `npm run dev` — development (`http://localhost:3000/id`)
- `npm run build` — wajib lolos sebelum selesai kerja
- `npx tsc --noEmit` — wajib bersih (typecheck)
- `npm run lint` — masih ada error/warning warisan di portal, jangan tambah baru

## Struktur

- `src/app/[locale]/` — halaman publik: `page.tsx` (landing), `catalog/`,
  `tracking/` (lacak servis via `?ticket=`), `trade-in/`
- `src/app/portal/` — halaman internal staf (login demo, dashboard, pos,
  inventory, service, products, staff, settings, reports, account)
- `src/components/public/` — navbar, footer, product-card, brand-mark,
  theme-toggle (khusus area publik)
- `src/components/ui/` — button, badge, card, input gaya shadcn (milik bersama)
- `src/lib/` — `store.ts` (hook `useAtCellStore`), `mock-data.ts`,
  `translations.ts` (kamus ID/EN), `utils.ts` (`formatIDR`, `cn`)
- `src/context/store-context.tsx` — `StoreProvider` + `useStore()`
- `src/proxy.ts` — rewrite subdomain login + redirect `/` ke `/id`
- `public/products/` — foto resmi produk (lokal, sudah dioptimasi)
- `public/payments/qris.svg` — logo QRIS resmi

## Aturan data & logika

- Tambah produk/unit staf: hormati pola `store.ts` (ID via `Date.now()`,
  persist manual ke `localStorage` di setiap mutasi).
- Validasi IMEI: **tepat 15 digit angka** (`/^\d{15}$/`) + cek duplikat ke
  `inventoryUnits` — berlaku di registrasi inventaris, POS, dan trade-in.
- `executePosSale` menolak unit berstatus selain `available` (anti double-sell).
  Jangan melonggarkan tanpa persetujuan.
- Kode tiket servis `SRV-YYYYMMDD-XXXX` dibuat di `createServiceTicket`
  (anti-tabrakan). Alur status: `received → diagnosing → waiting_approval →
  in_progress → testing → completed → picked_up` (+ `cancelled`).
- Tipe baru di `src/types/index.ts`. Produk punya `official_images` (unit baru)
  dan `second_images` (unit second); `image_url` hanya fallback.
- Format uang selalu `formatIDR`. Jangan hardcode harga di komponen.

## Aturan UI/tema (wajib)

- Satu aksen: biru AtCell (`--color-accent`, light `#0B4ED8`). Hijau (`--color-wa`)
  **hanya** untuk aksi WhatsApp. Jangan tambah warna baru tanpa diminta.
- Token warna di `globals.css` menunjuk ke variabel runtime; mode gelap aktif
  lewat class `.dark` di `<html>` (bukan `prefers-color-scheme` saja).
  Jangan pakai `dark:` untuk membalik satu section saja.
- Radius: tombol/input 8px (`rounded-lg`), kartu 12px (`rounded-xl`),
  chip filter full-pill. Footer terang, bukan navy.
- Font: Plus Jakarta Sans (teks) + JetBrains Mono (IMEI/kode/harga nota)
  via `next/font`. Jangan tambah font tanpa diminta.
- Copy Bahasa Indonesia kasual, kalimat aktif. **Tanpa em-dash (`—`)** di teks
  visible mana pun. Tanpa label bernomor gaya `01/02/03` dan tanpa eyebrow
  (label kapital kecil) di setiap section.
- Foto produk jangan ditimpa badge; keterangan selalu di bawah foto.
- Logo brand HP & sosmed dari Simple Icons CDN; ikon lain dari `lucide-react`
  (satu keluarga ikon, jangan campur).
- Form: `<label>` terlihat di atas input (atau `sr-only` untuk kolom search),
  jangan jadikan placeholder sebagai label.
- `useSearchParams()` wajib di dalam `<Suspense>` (lihat `catalog/page.tsx`).
- Jangan pakai `<script>` mentah di layout; pakai `next/script`.
- Hormati `prefers-reduced-motion` untuk animasi apa pun.

## Batasan kerja

- Jangan install package baru, ubah route/slug, atau ubah label nav
  utama tanpa konfirmasi.
- Jangan sentuh `components/ui/` kecuali untuk token global yang disepakati.
- Halaman portal adalah alat internal: fungsionalitas dulu, jangan redesign
  visualnya tanpa diminta eksplisit.
