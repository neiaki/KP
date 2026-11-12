<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# At Cell — Toko HP Serpong

Web toko handphone "At Cell" (Paku Jaya, Serpong Utara): etalase publik ID/EN
plus portal operasional staf. Stack: Next.js 16.4.2 App Router, React 19,
TypeScript strict, Tailwind CSS v4, Drizzle ORM, Supabase Auth/Postgres/Storage.

Dua mode berjalan berdampingan:

- **Live**: `NEXT_PUBLIC_SUPABASE_URL` terisi atau `NODE_ENV=production`.
  Data lewat Server Action, Drizzle, Supabase, RLS, dan Auth.
- **Demo lokal**: tanpa env Supabase memakai `src/lib/mock-data.ts` dan
  `localStorage`. Jangan menganggap Supabase tersambung hanya karena dependency
  tersedia; cek env dan `/api/health/ready`.

PRD di `docs/PRD-AtCell.md`; runbook deployment di
`docs/DEPLOYMENT-REDUNDANCY.md`. Peta modul dan sumber kebenaran per area ada di
`docs/agents/project-map.md`; backlog multi-sesi di `docs/STATUS.md`.

## Perintah

- `bun run dev` — Turbopack, `http://localhost:3000/id`
- `bun run build` — `next build --webpack`; wajib lolos. Jangan mengganti ke
  Turbopack tanpa alasan dan pengukuran.
- `bunx tsc --noEmit` — wajib bersih (typecheck)
- `bun run lint` — ESLint; wajib bersih, jangan menambah warning/error baru
- `bun run test` — Node 22 `node --experimental-strip-types --test tests/*.test.ts`
- Satu test: `node --experimental-strip-types --test tests/<nama>.test.ts`
- `bun run start` — menjalankan hasil build lokal
- `bun run smoke:render` — render halaman publik terhadap build lokal
- `bun run smoke:deployment -- <url>` — cek health deployment

Urutan gates CI: `test` → `tsc` → `lint` → `build` (lihat
`.github/workflows/ci.yml`). Test database opt-in lewat `DATABASE_URL`; tanpa
itu suite terkait skip, bukan gagal. Jangan menganggap `bun run test` lokal
setara dengan `database-tests.yml`.

## Struktur

- `src/app/(public)/[locale]/` — landing, `catalog/`, `tracking/` (`?ticket=`),
  `trade-in/`, `about/`, `contact/`, `customer-service/`, `login/`, `payment/`,
  `shipping/`, `terms/`, `warranty/`
- `src/app/(portal)/portal/` — dashboard, pos, inventory, service, products,
  listing, customers, staff, settings, reports, account
- `src/app/api/` — `health/live`, `health/ready`, `reviews`
- `src/lib/actions/` — Server Action per domain. `_helpers.ts` berisi
  `requireRole`, `requireWriteAccess`, dan aktor audit; file helper tanpa
  `"use server"` tidak boleh diekspos sebagai action.
- `src/db/` — `schema.ts` (cermin Drizzle) dan `client.ts` (koneksi `postgres`
  langsung ke `DATABASE_URL`)
- `src/proxy.ts` — nonce CSP, refresh sesi Supabase, guard `/portal`, rewrite
  subdomain `login.`/`portal.`, redirect `/` ke `/id`
- `src/lib/store.ts` — hook `useAtCellStore` + `liveBackendEnabled`;
  `src/context/store-context.tsx` menyediakan `StoreProvider`
- `src/app/fonts/` + `src/components/root-shell.tsx` — font lokal via
  `next/font/local`; dua root layout memakai `RootProviders`
- `supabase/migrations/` — migration SQL canonical, diterapkan berurutan
  menurut nama file. `supabase/drizzle-generated/` hanya artefak referensi.
- `scripts/` — backup, restore, smoke, watchdog; `Dockerfile.coolify` hanya
  menarik image GHCR, build sebenarnya di GitHub Actions.

## Aturan data & logika

- **Koneksi Drizzle melewati RLS.** RLS adalah lapisan pertahanan, bukan guard
  utama Server Action. Setiap action mutasi wajib memanggil
  `requireWriteAccess()` lebih dulu, lalu `requireRole([...])`, baru query.
  Jangan pernah menerima peran, harga, atau status otorisasi dari client.
- Mode live ditentukan `liveBackendEnabled` di `src/lib/store.ts`. Jangan
  membaca env Supabase terpisah di komponen; dua pembacaan bisa menyimpang dan
  membuat UI demo memanggil action live.
- IMEI wajib **tepat 15 digit angka** (`/^\d{15}$/`) dan dicek duplikat ke
  `inventoryUnits`; berlaku di registrasi inventaris, POS, dan trade-in.
- `executePosSale` mengambil harga dari baris `inventory_units`, mengunci unit
  dengan `FOR UPDATE`, dan menolak status selain `available`. Jangan
  melonggarkan tanpa persetujuan (anti double-sell dan anti price tampering).
- Kode tiket servis `SRV-YYYYMMDD-XXXXXXXX` (8 karakter base32 tanpa `I`, `L`,
  `O`, `U`) dibuat `createServiceTicket` untuk demo atau trigger
  `generate_ticket_code()` untuk live. Alur status: `received → diagnosing →
  waiting_approval → in_progress → testing → completed → picked_up`
  (+ `cancelled`).
- Tipe domain di `src/types/index.ts`. Produk punya `official_images` (unit
  baru) dan `second_images` (unit second); `image_url` hanya fallback. Format
  uang selalu `formatIDR`; jangan hardcode harga di komponen.
- `dbBatch` memakai deadline per langkah 10 detik, sementara
  `statement_timeout` PostgreSQL default 8 detik. Keterlambatan pembatalan
  query adalah masalah ketersediaan, bukan pelanggaran batas kepercayaan. Baca
  `src/db/client.ts` sebelum mengubah timeout, pool, atau urutan batch.
- Rate limit in-memory (`src/lib/rate-limit.ts`) hidup per proses dan
  mengasumsikan satu container. Kalau replika ditambah, pindahkan ke limiter
  bersama (Traefik/Redis); jangan menaikkan `MAX_BUCKETS` tanpa memahami
  eviction.
- Auth: login memakai username (bukan email); pelanggan dengan nomor valid
  juga dicocokkan nomornya. Signup mandiri hanya membuat peran `customer`
  (dipaksa trigger `handle_new_user`); staf dibuat lewat invite Admin. Client
  `service_role` hanya boleh diimpor dari modul server yang sempit.
- Storage: `product-images` publik; `service-photos` dan `trade-in-photos`
  privat dengan signed URL 600 detik. `signPhotoPaths` hanya menandatangani
  path yang terpakai di data atau folder staf pemanggil. Bucket baru wajib
  punya policy dan migration.
- Schema production dimulai dari migration SQL canonical. Jangan mengedit
  migration yang sudah diterapkan; buat file bertimestamp baru. `drizzle-kit
  generate` hanya untuk artefak referensi, jangan dijalankan ke production.

## UI/tema (wajib)

- Satu aksen: biru AtCell (`--color-accent`, light `#0B4ED8`). Hijau
  (`--color-wa`) **hanya** untuk aksi WhatsApp. Jangan tambah warna baru tanpa
  diminta.
- Token warna di `globals.css` menunjuk variabel runtime; mode gelap aktif
  lewat class `.dark` di `<html>` (bukan `prefers-color-scheme` saja). Jangan
  pakai `dark:` untuk membalik satu section saja.
- Radius: tombol/input 8px (`rounded-lg`), kartu 12px (`rounded-xl`), chip
  filter full-pill. Footer terang, bukan navy.
- Font: Plus Jakarta Sans (teks) + JetBrains Mono (IMEI/kode/harga nota) dari
  `src/app/fonts/` via `next/font/local`. Jangan kembali ke
  `next/font/google` atau menambah font tanpa diminta.
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
- `src/components/ui/` milik pola shadcn. Jangan edit manual; bungkus dengan
  komponen fitur di `src/components/<fitur>/`.
- Hormati `prefers-reduced-motion` untuk animasi apa pun.

## Deployment dan gotcha

- Build production terjadi di GitHub Actions dan di-push ke GHCR. Coolify
  memakai `Dockerfile.coolify`, yang **hanya** menarik
  `ghcr.io/neiaki/kp:sha-<commit>`; jangan memakai `latest`. Pin harus menunjuk
  commit yang benar-benar ada; satu commit lag memang disengaja.
- Preview Vercel memakai environment yang sama dengan production. Gerbang tulis
  `src/lib/deployment.ts` menolak mutasi dari preview; jangan di-bypass.
- Secret hanya di platform (Coolify/Vercel), tidak di repo. `.env*` wajib
  ignored; jangan hardcode credential atau URL environment-specific.
- `/api/health/ready` memeriksa Supabase, `DATABASE_URL`, schema, dan service
  role. Jangan menambahkan detail env atau pesan driver ke respons health.
- Service worker menyimpan `/_next/static` dengan cache-first. Registrar
  sengaja tidak mendaftarkannya di development dan mencabut registrasi lama;
  kalau melihat hydration mismatch setelah edit komponen, unregister service
  worker / clear site data sekali, lalu reload.
- `next dev` menulis ulang blok aturan Next.js di atas. Jangan menghapusnya
  dari diff; commit bersama perubahan lain agar tree bersih.

## Batasan kerja

- Jangan install package baru, ubah route/slug, atau ubah label nav utama
  tanpa konfirmasi.
- Jangan hapus atau rename file/folder yang sudah ada tanpa konfirmasi.
- Jangan commit atau push ke Git tanpa konfirmasi eksplisit.
- Jangan jalankan perintah destruktif database atau restore backup tanpa
  konfirmasi (`DROP`, `TRUNCATE`, `DELETE` tanpa `WHERE`, `migrate reset`,
  `pg_restore --clean`).
- Halaman portal adalah alat internal: fungsionalitas dulu, jangan redesign
  visualnya tanpa permintaan eksplisit.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Project map

When orienting to an unfamiliar module or tracing data flow, read
`docs/agents/project-map.md`. It maps the main interfaces and implementations,
points to sources of truth, and records refactor seams without repeating the
rules above.

For multi-session backlog and current work status, read
`docs/STATUS.md` before starting an item.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.
