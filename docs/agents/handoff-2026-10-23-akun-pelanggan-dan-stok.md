# Handoff: Akun Pelanggan dan Simulasi Katalog At Cell

Tanggal: 23 Oktober 2026
Repo: `/home/neki/Code/KP`
Target production: `https://atcell.my.id`

Dokumen ini adalah prompt kerja untuk agen berikutnya. Baca seluruhnya sebelum
menulis kode atau data. Jangan menganggap bagian "fakta" boleh dipercaya tanpa
diverifikasi ulang, tetapi bagian "keputusan yang harus dikonfirmasi" wajib
dibawa ke owner sebelum ada tulisan ke production.

> ## UPDATE 23 Oktober 2026
>
> Dokumen ini adalah rencana awal. Status terkini ada di blok ini; bagian 1-11
> di bawah disimpan sebagai catatan historis dan tidak boleh dipakai sebagai
> sumber status production.
>
> **Keputusan yang sudah diambil**
>
> - "5 HP per merek" berarti **5 model produk berbeda**, bukan 5 unit dari model
>   yang sama. Model tanpa unit tetap tampil sebagai "Belum ada unit".
> - Unit demo memakai `imei = NULL` dan `is_demo = true`. Tidak ada IMEI
>   karangan. Unit asli tetap wajib 15 digit.
> - Transaksi demo memakai `is_demo = true`, tidak masuk dashboard/laporan,
>   tetapi tetap terlihat di riwayat pelanggan demo.
> - Akun pelanggan tidak meminta email. Supabase Auth memakai email sintetis
>   internal `@pelanggan.atcell.my.id` yang tidak pernah tampil di UI pelanggan.
> - Login pelanggan memakai username, nomor HP, dan password.
> - Halaman `/portal/customers` hanya untuk admin dan sales.
> - Data demo boleh berada di production selama bertanda `is_demo`.
>
> **Sudah diterapkan dan dideploy ke production**
>
> - PR #129 (akun pelanggan, checkout POS, data demo) sudah merge ke `main`
>   pada commit `53856b4`. PR #130 menaikkan pin image ke `sha-53856b4` dan
>   merge sebagai `caee6f2`.
> - Coolify production sudah menjalankan image dengan label revisi
>   `53856b4bcf89e641d03b8fd4d2852daa05b7420e`. Container healthy dan
>   `/api/health/ready` menjawab 200 `ready`.
> - Aplikasi Coolify memakai `git_commit_sha` `caee6f2` (commit pin), bukan
>   HEAD branch. Endpoint deploy yang bekerja adalah
>   `POST /api/v1/deploy?uuid=mebqjoh2ne1y3vt6jqryvvu9`; bentuk
>   `/api/v1/deploy/applications/<uuid>` mengembalikan 404.
> - Skema `is_demo` dan IMEI NULL untuk unit demo sudah ada. Ledger production
>   mencatatnya sebagai `20261023111914` (`add_is_demo_flag`) dan
>   `20261023112316` (`demo_inventory_imei_nullable`). File migrasi di repo
>   memakai versi ledger itu supaya `db push` tidak menjalankannya ulang.
> - Tiga akun demo (`ega`, `febiyanto`, `hilmi`) sudah ada dengan role customer,
>   masing-masing punya riwayat pembelian demo. Kredensial ada di file lokal
>   ber-mode 0600 dan tidak masuk repo.
> - Katalog production berisi 25 produk aktif, 5 model per merek. Model baru
>   belum punya unit karena IMEI asli belum diberikan owner.
> - Kode sudah live: pembuatan akun oleh admin/sales, `/portal/customers`,
>   tautan `customer_id` di POS, penolakan unit demo di server, filter demo di
>   dashboard/inventory/laporan, dan filter riwayat per `customer_id`.
>
> **Verifikasi production (24 Oktober 2026)**
>
> - Health 200 `ready`; header CSP ada; HTML landing berubah dari image lama.
> - Login `ega` berhasil. `/portal/account` hanya menampilkan 2 faktur miliknya,
>   tidak menampilkan nama pelanggan demo lain, tidak memuat email sintetis,
>   dan sidebar menampilkan `@ega`.
> - `febiyanto` dan `hilmi` juga berhasil login; masing-masing melihat 1 faktur
>   demo (Galaxy A55 dan Redmi Note 13) dengan garansi 12 bulan dan IMEI kosong.
> - `ega` membuka `/portal/customers` lalu dipantulkan kembali ke
>   `/portal/account`; route staf tidak terbuka untuk customer.
> - 25 produk aktif, tepat 5 model per merek.
> - 14 unit: 7 `available` asli, 2 `sold` asli, 1 `in_service` asli, dan 4 unit
>   demo `sold` dengan `imei = NULL`. `v_public_inventory` berisi 7 baris dan
>   0 unit demo.
> - 4 transaksi demo, semuanya punya `customer_id`, terbagi 2/1/1 antar akun.
>
> **Yang masih terbuka**
>
> - Model katalog baru belum bisa dibeli karena belum ada unit/IMEI asli.
> - Lima belas model baru masih memakai label "Foto menyusul"; ganti saat foto
>   resmi tersedia.
> - Backup off-site dan DNS `coolify.atcell.my.id` masih menunggu owner; lihat
>   prioritas 5 di `docs/agents/roadmap.md`.
> - Badge "Demo" di riwayat pembelian belum ditambahkan. Data demo sudah
>   terpisah dan tidak bocor ke pelanggan lain.
> - `.env.demo-accounts.local` memakai nama `DEMO_EGA_*`; skrip seed menerima
>   nama itu dan nama `DEMO_CUSTOMER_*_EGA`.
>
> **Verifikasi lokal**
>
> - `tsc --noEmit` bersih.
> - `bun run lint` bersih.
> - `bun run test`: 821 tes, 807 lulus, 14 skip (butuh `DATABASE_URL`).
> - `bun run build`: lolos.
> - `git diff --check`: bersih.

---

> **Catatan historis:** angka profil/produk/unit dan status migrasi di bagian
> 1-11 adalah kondisi awal 23 Oktober, bukan kondisi production sekarang.
> Selalu cek ulang lewat query read-only.

## 1. Misi

Kamu mengambil alih tiga pekerjaan yang saling terkait:

1. Admin dan staf toko bisa membuatkan akun pelanggan (username + password).
   Pelanggan tidak mendaftar sendiri.
2. Buat tiga akun pelanggan simulasi dengan username persis `ega`,
   `febiyanto`, dan `hilmi`, masing-masing punya riwayat pembelian yang terlihat
   di portal pelanggan.
3. Katalog `atcell.my.id` menampilkan 5 model berbeda untuk setiap merek:
   Apple, Samsung, Xiaomi, Oppo, dan Vivo. Model yang belum punya unit tampil
   sebagai "Belum ada unit", bukan stok palsu.

Pekerjaan ini menyentuh kode, database production, dan kredensial. Karena itu
urutan kerjanya wajib: baca konteks, konfirmasi keputusan owner, implementasi
kode, tes, baru seeding. Jangan melakukan seeding lebih dulu.

---

## 2. Aturan keras

- Jangan commit, push, merge, atau deploy tanpa persetujuan eksplisit owner.
- Jangan menulis ke database production tanpa persetujuan eksplisit owner.
  Sebelum menulis, minta backup atau pastikan backup terbaru tersedia.
- Jangan mengarang IMEI di production. Aturan ini sudah tertulis di
  `docs/PUBLIKASI-MODEL-TANPA-STOK.md`: IMEI adalah identitas hardware asli,
  bukan angka untuk membuat katalog terlihat penuh.
- Jangan hardcode password, service role key, atau `DATABASE_URL` di repo.
  Gunakan env dan sampaikan kredensial ke owner lewat kanal privat.
- Jangan install package baru. `@supabase/supabase-js` dan `postgres` sudah ada.
- Jangan mengubah `src/components/ui/` secara manual.
- Jangan menambah warna, font, atau mengganti label navigasi utama tanpa
  persetujuan. Halaman portal adalah alat internal, fungsionalitas dulu.
- Jangan memakai `sudo`, jangan menghapus data existing, jangan menjalankan
  `DROP`, `TRUNCATE`, `DELETE` tanpa `WHERE`, atau reset migration.
- Jangan memakai em-dash di teks UI yang terlihat. Copy Bahasa Indonesia
  kasual, kalimat aktif.
- Semua form wajib punya `<label>` yang terlihat atau `sr-only`, bukan
  placeholder sebagai label.
- Jangan menampilkan password di log, screenshot, atau commit. Tampilkan sekali
  di UI setelah akun dibuat, lalu bersihkan dari state saat modal ditutup.

---

## 3. Baca dulu

Wajib:

- `AGENTS.md` di root repo.
- `docs/PRD-AtCell.md`.
- `docs/PUBLIKASI-MODEL-TANPA-STOK.md`, terutama larangan IMEI palsu.
- `docs/DEPLOYMENT-REDUNDANCY.md`, bagian deployment dan backup.
- `docs/agents/project-map.md`.
- `docs/agents/roadmap.md`.

Kode yang paling relevan:

- `src/lib/actions/auth.ts`: `signUpCustomer`, `inviteStaff`, login username,
  `listStaff`, `updateMyPhoneNumber`.
- `src/lib/actions/pos.ts`: `executeSale`.
- `src/lib/actions/portal.ts`: snapshot portal dan filter `customer_id`.
- `src/lib/actions/inventory.ts`: `registerUnits`.
- `src/lib/validations.ts`: `customerSignUpSchema`, `staffInviteSchema`,
  `usernameSchema`, `posSaleSchema`.
- `src/lib/store.ts` dan `src/lib/store-demo.ts`: pola mutasi live/demo.
- `src/lib/supabase/admin.ts`: `createAdminClient`.
- `src/app/(portal)/portal/staff/page.tsx`.
- `src/app/(portal)/portal/pos/page.tsx`.
- `src/app/(portal)/portal/account/page.tsx`.
- `src/lib/access.ts`.
- `supabase/migrations/0001_atcell_schema.sql`,
  `0002_harden_atcell_schema.sql`, `0005_username_login.sql`.

---

## 4. Fakta yang sudah diverifikasi

### 4.1 Repo dan deployment

- Branch production: `main`. PR #129 dan PR #130 sudah merge.
- `Dockerfile.coolify` menunjuk
  `ghcr.io/neiaki/kp:sha-53856b4bcf89e641d03b8fd4d2852daa05b7420e`.
- Coolify application `mebqjoh2ne1y3vt6jqryvvu9` sudah dideploy pada
  `caee6f2`, dan container production menjalankan image dengan label revisi
  `53856b4bcf89e641d03b8fd4d2852daa05b7420e`.
- Verifikasi 24 Oktober 2026: `/api/health/ready` 200 `ready`, header CSP ada,
  dan halaman publik serta portal pelanggan merespons.
- Kredensial production tidak disimpan di repo. File
  `.env.demo-accounts.local` berisi kredensial akun demo dan ber-mode 0600.
- `bun` tersedia di mesin kerja ini; gunakan `bun run ...` sesuai `AGENTS.md`.

### 4.2 Production Supabase

Project URL: `https://qiumowgrzaseqlnpwueb.supabase.co`

Kondisi saat handoff:

- 7 baris `profiles`:
  - `admin` (admin), `sales` (sales), `teknisi` (technician),
    `admin1` (technician), `anisa` (customer), `febieki562` (customer),
    `tamu` (customer).
- 11 baris `products`, 10 aktif, 1 nonaktif (`Xiaomi iphone 16`).
- 10 baris `inventory_units`, 7 berstatus `available`.
- 2 baris `transactions`, 2 baris `transaction_items`.
  - Transaksi pertama terhubung ke `customer_id` Anisa.
  - Transaksi kedua walk-in, `customer_id` null.
- Belum ada username `ega`, `febiyanto`, atau `hilmi`.

Produk aktif dan unit tersedia:

| Merek | Produk aktif | Unit available sekarang | Kekurangan ke target 5 |
|---|---|---:|---:|
| Apple | 3 | 1 | 4 |
| Samsung | 2 | 2 | 3 |
| Xiaomi | 2 | 2 | 3 |
| Oppo | 1 | 1 | 4 |
| Vivo | 2 | 1 | 4 |
| Total | 10 | 7 | 18 |

Catatan: tabel di atas adalah kondisi saat handoff. Target yang dipakai sekarang
bukan 5 unit available, melainkan 5 model produk berbeda per merek. Kekurangan
model: Apple +2, Samsung +3, Xiaomi +3, Oppo +4, Vivo +3 (total 15 produk baru).
Produk baru boleh tanpa unit, tetapi kontennya harus disetujui owner.

Rincian produk aktif:

- Apple: iPhone 13 128GB (0 available, 2 total), iPhone 14 Plus (1 available,
  1 total), iPhone 15 Pro 128GB (0 available, 0 total).
- Samsung: Galaxy A55 5G 8/256GB (2 available, 2 total), Galaxy S24 Ultra
  256GB (0 available, 0 total).
- Xiaomi: Redmi Note 13 8/256GB (2 available, 2 total), Xiaomi 14 12/512GB
  (0 available, 0 total).
- Oppo: Reno 11 5G 12/256GB (1 available, 1 total).
- Vivo: Y36 8/256GB (1 available, 1 total), V30 5G 8/256GB (0 available,
  0 total).

Untuk mencapai total 5 unit available per merek, perlu tambahan 18 unit:
Apple +4, Samsung +3, Xiaomi +3, Oppo +4, Vivo +4.

### 4.3 Gap penting di kode

1. `signUpCustomer` sudah ada, tetapi tidak dipakai UI. Fungsi ini memakai
   `supabase.auth.signUp` dari client anon dan bisa mengirim email konfirmasi.
   Jangan pakai jalur ini untuk pembuatan akun oleh staf.
2. `inviteStaff` sudah memakai pola yang benar:
   `createAdminClient().auth.admin.createUser({ email_confirm: true, ... })`,
   lalu update `profiles`. Pola ini yang harus ditiru untuk pelanggan.
3. `addStaff` di `src/lib/store.ts` menolak role `customer`. Jadi jangan
   memaksakan `addStaff` untuk pelanggan; buat fungsi terpisah.
4. `posSaleSchema` belum punya `customerId`, dan `executeSale` belum menulis
   `transactions.customer_id`. Akibatnya transaksi POS saat ini hanya menyimpan
   nama/telepon, bukan tautan ke akun pelanggan. Tanpa perbaikan ini, akun
   `ega`, `febiyanto`, dan `hilmi` tidak akan melihat riwayat pembelian di
   `/portal/account`.
5. `/portal/staff` hanya bisa diakses role `admin` menurut
   `canAccessPortalPath`. Role `sales` tidak bisa membuka halaman itu. Jadi
   form pembuatan pelanggan untuk sales tidak bisa ditaruh hanya di halaman
   staff.
6. Halaman `/portal/account` sudah memfilter transaksi berdasarkan
   `customer_id` di mode live. Jadi setelah `customer_id` terisi, riwayat
   pembelian akan muncul tanpa perubahan besar di halaman akun.
7. Katalog publik menampilkan satu kartu per unit fisik yang `available`.
   Lima unit dari model yang sama akan tampil sebagai lima kartu dengan model
   yang sama. Ini penting untuk keputusan "5 HP" di bawah.

---

## 5. Keputusan yang wajib dikonfirmasi ke owner

Jangan menulis data production sebelum enam hal ini jelas. Bawa daftar ini ke
owner dan catat jawabannya di PR atau komentar issue.

### K1. Arti "5 HP tersedia per merek"

**KEPUTUSAN 24 Okt 2026: B.** Lima model berbeda per merek. Model tanpa unit
tetap tampil di katalog sebagai "Belum ada unit".

Pilihan:

- **A. 5 unit fisik available per merek.** Ini yang paling cocok dengan
  katalog saat ini karena katalog menghitung unit. Konsekuensinya, Oppo akan
  menampilkan 5 unit Reno 11 yang sama, kecuali ada model Oppo lain.
- **B. 5 model produk berbeda per merek.** Ini terlihat lebih masuk akal di
  etalase, tetapi butuh 15 produk baru (Apple +2, Samsung +3, Xiaomi +3,
  Oppo +4, Vivo +3) lengkap dengan foto resmi, spesifikasi, dan harga. Setiap
  model juga butuh minimal satu unit agar berstatus "tersedia", bukan
  "Belum ada unit".

Rekomendasi: mulai dengan A jika owner hanya ingin etalase terlihat terisi.
Jika owner ingin katalog yang kredibel, pilih B dan siapkan kontennya.

### K2. Sumber IMEI untuk unit baru

**KEPUTUSAN 24 Okt 2026: unit demo tidak punya IMEI (`NULL`) dan ditandai
`is_demo`.** IMEI karangan tetap dilarang. Unit asli baru tetap butuh IMEI asli
dari owner.

Repo melarang mengarang IMEI. Ada dua jalur:

- **A. Owner memberikan 18 IMEI asli** dari unit yang benar-benar ada di toko,
  plus harga modal dan harga jual per unit. Ini jalur yang benar untuk
  production.
- **B. Simulasi di staging atau database demo**, bukan production. Buat project
  Supabase terpisah atau gunakan mode demo, lalu isi unit fiktif di sana.
- **C. Owner memberi izin tertulis untuk unit demo di production.** Jika ini
  dipilih, unit demo wajib punya penanda yang jelas dan tidak boleh ikut
  laporan penjualan. Jangan menyamarkan unit demo sebagai stok asli.

Rekomendasi: A untuk production, B untuk tampilan simulasi. Jangan C tanpa
penanda dan izin tertulis.

### K3. Transaksi simulasi untuk tiga akun

**KEPUTUSAN 24 Okt 2026: B.** Production dengan `is_demo`, dikecualikan dari
dashboard/laporan/POS, tetap terlihat di riwayat pelanggan. Seeding belum
dijalankan karena kredensial production tidak tersedia.

Transaksi palsu di production akan ikut terhitung di laporan penjualan,
dashboard, dan margin. Pilihan:

- **A. Simulasi di staging/demo**, production tetap bersih. Rekomendasi utama.
- **B. Production dengan flag `is_demo`.** Tambah kolom penanda di
  `transactions` dan `inventory_units`, lalu kecualikan dari laporan, dashboard,
  dan POS. Ini pekerjaan tambahan, tetapi aman.
- **C. Production tanpa penanda.** Hanya jika owner sadar laporan akan
  tercemar dan menyetujuinya. Tidak direkomendasikan.

### K4. Kredensial tiga akun

**KEPUTUSAN 24 Okt 2026: email tidak diminta dari staf atau pelanggan.** Action
menurunkan email sintetis internal dari username, dan email itu tidak pernah
dikirim ke browser pelanggan. Nomor HP tetap wajib untuk login pelanggan baru.

Owner harus menentukan:

- Email untuk masing-masing akun. Login memakai username, tetapi Supabase Auth
  tetap butuh email. Contoh yang jelas demo:
  `ega@demo.atcell.my.id`, `febiyanto@demo.atcell.my.id`,
  `hilmi@demo.atcell.my.id`. Jangan pakai email orang lain.
- Nomor telepon. Jangan memakai nomor pelanggan asli tanpa izin. Contoh
  placeholder: `081200000001`, `081200000002`, `081200000003`, tetapi tetap
  minta izin owner.
- Password. Generate acak minimal 16 karakter per akun, simpan di password
  manager, dan sampaikan ke owner lewat kanal privat. Jangan tulis di repo,
  issue, PR, atau screenshot.

### K5. Siapa yang boleh membuat akun pelanggan

**KEPUTUSAN 24 Okt 2026: halaman `/portal/customers` disetujui.** Hanya admin
dan sales. Sales juga tetap bisa membuat akun dari POS.

Rekomendasi:

- Admin: lewat bagian "Akun Pelanggan" di `/portal/staff`.
- Sales: lewat tombol "Buat akun pelanggan" di `/portal/pos`, karena sales
  tidak boleh membuka halaman manajemen staf.
- Technician dan customer: tidak boleh.

Jika owner ingin satu halaman khusus `/portal/customers`, itu berarti menambah
route dan item navigasi. Jangan lakukan tanpa persetujuan karena aturan repo
melarang mengubah route/slug dan label nav utama tanpa konfirmasi.

### K6. Apakah data simulasi boleh masuk production

**KEPUTUSAN 24 Okt 2026: ya, dengan `is_demo`, tanpa IMEI palsu, dan hanya
setelah owner memberi izin tulis.** Kode dan skrip sudah siap; eksekusinya
menunggu kredensial dan penerapan migrasi.

Ini rangkuman K2 dan K3. Jika jawabannya tidak, pekerjaan production hanya
sampai fitur akun pelanggan dan tiga akun. Katalog 5 model per merek dan
riwayat pembelian dikerjakan di staging. Jika jawabannya ya, minta daftar model,
harga, foto resmi, dan IMEI asli untuk unit baru, plus izin tertulis untuk
transaksi demo.

---

## 6. Rencana implementasi

### Fase 0: recon dan baseline

1. Buat branch baru dari `origin/main` atau lanjutkan branch yang sudah ada
   setelah owner menentukan. Jangan menumpuk perubahan di branch PR #128 tanpa
   koordinasi.
2. Jalankan baseline:
   - `node_modules/.bin/tsc --noEmit`
   - `npm run lint`
   - `npm run test`
   - `npm run build`
3. Baca ulang file di bagian 3.
4. Kirim daftar K1 sampai K6 ke owner. Berhenti sebelum menulis data.

### Fase 1: fitur akun pelanggan

Tujuan: admin dan sales bisa membuat akun pelanggan dengan username/password,
dan pelanggan bisa login memakai username itu.

#### 1.1 Validasi

Di `src/lib/validations.ts`:

```ts
export const customerCreateSchema = customerSignUpSchema
  .omit({ email: true })
  .extend({ username: usernameSchema });
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
```

`customerSignUpSchema` memuat `fullName`, `email`, `password`, dan
`phoneNumber`; schema pembuatan oleh staf membuang `email`. Jangan membuat aturan
password baru yang berbeda dari `passwordSchema`. Nomor telepon divalidasi dari
jumlah digit, bukan panjang karakter mentah.

#### 1.2 Server Action

Di `src/lib/actions/auth.ts`, tambahkan:

```ts
export async function createCustomerAccount(input: {
  fullName: string;
  username: string;
  password: string;
  phoneNumber: string;
}): Promise<ActionResult<{ userId: string }>>
```

Alur:

1. `requireWriteAccess()`.
2. `requireRole(["admin", "sales"])`.
3. Validasi dengan `customerCreateSchema`.
4. Cek `isSupabaseAdminConfigured()`. Jika service role tidak ada, kembalikan
   error yang jelas, jangan mencoba jalur anon.
5. `createAdminClient()`.
6. Turunkan email sintetis `${username}@pelanggan.atcell.my.id`. Ini hanya
   identitas Supabase Auth dan tidak boleh muncul di UI.
7. `admin.auth.admin.createUser` dengan:
   - email sintetis
   - `password`
   - `email_confirm: true`
   - `user_metadata: { full_name, phone_number, username }`
8. Jika create user gagal:
   - Email/username duplikat: "Username sudah dipakai. Coba username lain."
   - Error lain: pesan umum, jangan bocorkan detail internal.
9. Update baris `profiles` milik user baru:
   - `full_name`
   - `phone_number`
   - `role: "customer"`
   - `username`
   - `email` sintetis
10. Jika update profil gagal, hapus user Auth yang baru dibuat dengan
    `admin.auth.admin.deleteUser(data.user.id)` agar tidak ada akun Auth tanpa
    profil. Kembalikan error. Kode `23505` juga dipetakan ke username duplikat.
11. `revalidatePath("/portal/staff")`, `revalidatePath("/portal/customers")`,
    dan `revalidatePath("/portal/pos")`.
12. Kembalikan `{ userId }`.

Catatan:

- Trigger `handle_new_user` sudah membuat profil awal. Action ini mengoreksi
  role/username/email setelahnya.
- Jangan memakai `signUpCustomer` untuk jalur ini.
- Jangan mengirim password ke log atau pesan error.
- Jika username bentrok, tangani error unique constraint dan kembalikan pesan
  "Username sudah dipakai." Setelah itu hapus user Auth yang baru dibuat.

#### 1.3 Store

Di `src/lib/store.ts`, tambahkan `addCustomer`:

```ts
const addCustomer = async (
  name: string,
  phone: string,
  password: string,
  username: string
): Promise<Profile | undefined> => {
  if (liveBackendEnabled) {
    const result = await createCustomerAccountAction({
      fullName: name,
      phoneNumber: phone,
      password,
      username,
    });
    if (!result.ok) throw new Error(result.error);
    await refresh();
    return undefined;
  }

  const demo = await loadDemoModule();
  return demo.demoAddCustomer(name, phone, password, username, setProfiles);
};
```

Tambahkan `addCustomer` ke objek return store.

Di `src/lib/store-demo.ts`, `demoAddCustomer` menerima nama, telepon, password
(tidak disimpan), username, dan setter profil. Profil demo tidak menyimpan
email. ID memakai `prof-cust-${Date.now()}` dan persist ke `localStorage` lewat
`STORAGE_KEYS.PROFILES`.

#### 1.4 UI

Buat komponen bersama, misalnya
`src/components/portal/customer-account-form.tsx`:

- Field: nama lengkap, username, nomor telepon, password. Tidak ada email.
- Tombol tampil/sembunyikan password.
- Tombol generate password acak di sisi client memakai `generatePassword()` di
  `src/lib/password.ts` (crypto, bukan Math.random), 16 karakter.
- Panggil `addCustomer` dari store.
- Setelah sukses, tampilkan panel sekali lihat berisi username, nomor HP, dan
  password yang baru dibuat, dengan tombol salin. Jelaskan bahwa password tidak
  bisa dilihat lagi. Panel tidak boleh langsung tertutup.
- Jangan menyimpan password ke `localStorage` atau state global.
- Gunakan `Card`, `Input`, `Button`, `Badge` yang sudah ada.
- Label terlihat di atas input. Jangan memakai placeholder sebagai label.

Tempatkan di dua lokasi:

1. `/portal/staff` (admin):
   - Tambahkan bagian "Akun Pelanggan" di bawah daftar staf.
   - `customerList = profiles.filter((p) => p.role === "customer")`.
   - Tombol "Tambah Akun Pelanggan" membuka modal/form.
   - Tampilkan nama, username, telepon, tanggal dibuat, dan jumlah transaksi
     (`transactions.filter((t) => t.customer_id === p.id).length`).
   - Jangan mengubah kartu staf yang sudah ada.

2. `/portal/pos` (admin dan sales):
   - Tambahkan pemilih "Pelanggan terdaftar" di atas kolom walk-in.
   - Opsi default "Walk-in / tanpa akun".
   - Saat pelanggan dipilih, isi nama dan telepon dari profil. Kunci input
     telepon hanya jika profil punya nomor. Pelanggan lama dengan nomor kosong
     harus bisa diisi kasir saat checkout, dengan catatan bahwa profil tidak
     ikut diubah.
   - Sediakan tombol "Lepas tautan" untuk kembali ke walk-in.
   - Tombol "Buat akun pelanggan" membuka form yang sama.
   - Setelah akun dibuat, refresh daftar pelanggan.

Halaman `/portal/customers` sudah disetujui dan sudah ada. `canAccessPortalPath`
mengizinkan admin dan sales; technician dan customer ditolak. Item sidebar juga
sudah ditambahkan. `/portal/staff` tetap hanya untuk admin.

### Fase 2: tautkan transaksi POS ke akun pelanggan

Ini wajib agar riwayat pembelian muncul di akun pelanggan.

#### 2.1 Schema

Di `src/lib/validations.ts`, tambahkan ke `posSaleSchema`:

```ts
customerId: z.string().uuid("Pelanggan tidak valid.").optional().nullable(),
```

Nama dan telepon tetap wajib. Saat `customerId` dipilih, server akan memakai
data dari profil, bukan data kiriman client.

#### 2.2 Action

Di `src/lib/actions/pos.ts`:

1. Import `profiles` dari `src/db/schema.ts`.
2. Di dalam `db.transaction`, sebelum insert transaksi, jika `v.customerId`
   ada:
   - Ambil profil dengan `id = v.customerId` dan `role = "customer"`.
   - Jika tidak ditemukan, lempar error `CUSTOMER_NOT_FOUND`.
   - Gunakan `fullName` dan `phoneNumber` dari profil untuk
     `customerName`/`customerPhone`.
3. Tambahkan `customerId: customer?.id ?? null` ke values insert
   `transactions`.
4. Petakan `CUSTOMER_NOT_FOUND` menjadi pesan
   "Akun pelanggan tidak ditemukan. Pilih pelanggan lain."
5. Jangan mengizinkan `customerId` milik staf. Validasi role di server.

#### 2.3 Store

- Tambahkan `customerId?: string | null` ke `DemoPosSaleParams`.
- Di `src/lib/store.ts`, teruskan `customerId: params.customerId` ke
  `executeSaleAction`.
- Di `src/lib/store-demo.ts`, isi `customer_id: params.customerId ?? null` pada
  transaksi demo, bukan selalu `null`.

#### 2.4 UI POS

- Gunakan `profiles` dari store untuk daftar pelanggan.
- Pilih pelanggan mengisi nama/telepon.
- Kirim `customerId` ke `processSale`.
- Pastikan validasi form tidak memblokir checkout saat pelanggan dipilih.
- Jangan menampilkan email pelanggan di layar POS.

### Fase 3: tes dan verifikasi kode

Tambahkan tes yang sesuai pola repo:

- `customerCreateSchema` menerima data valid tanpa email dan menolak
  username/phone/password yang tidak valid.
- `phoneSchema` menolak tanda baca saja dan menghitung 9 sampai 15 digit.
- `normalizePhoneNumber` merapikan `+62 0...` menjadi `62...`.
- `posSaleSchema` menerima `customerId` UUID dan menolak string sembarang.
- `demoAddCustomer` menambah profil role customer dan menyimpannya.
- `demoExecutePosSale` menulis `customer_id` saat diberikan.
- Guard aksi: customer/technician tidak boleh membuat akun pelanggan.
- Jika ada tes server action dengan mock Supabase, pastikan update profil dan
  rollback user Auth diuji. Jika tidak ada pola mock yang memadai, cukup uji
  schema dan helper, lalu lakukan tes manual di staging.

Jalankan:

```bash
node_modules/.bin/tsc --noEmit
npm run lint
npm run test
npm run build
```

Jangan menambah warning baru. Jangan menghapus tes existing.

### Fase 4: seeding tiga akun pelanggan

Hanya setelah K4 dan K6 disetujui.

Buat skrip satu kali, misalnya `scripts/seed-demo-customers.mjs`. Skrip ini
boleh masuk repo, tetapi tidak boleh berisi kredensial asli.

Persyaratan skrip:

- Membaca env:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY`
  - `DEMO_CUSTOMER_PASSWORD_EGA`
  - `DEMO_CUSTOMER_PASSWORD_FEBIYANTO`
  - `DEMO_CUSTOMER_PASSWORD_HILMI`
  - opsional email/telepon per akun
- Menolak jalan jika `ALLOW_PRODUCTION_WRITE=1` tidak diset.
- Default `--dry-run`: hanya mencetak rencana, tidak menulis.
- Idempoten:
  - Cek `profiles.username` sebelum create.
  - Jika username sudah ada, lewati dan laporkan.
  - Jangan menimpa password akun existing.
- Membuat user dengan `admin.auth.admin.createUser` dan
  `email_confirm: true`.
- Setelah create, update `profiles`: role `customer`, username, email, nama,
  telepon.
- Jika update profil gagal, hapus user Auth yang baru dibuat.
- Jangan mencetak password ke stdout. Hanya cetak username, email, dan status.
- Akhiri dengan ringkasan: dibuat, dilewati, gagal.

Data yang diminta:

| Username | Nama lengkap | Email contoh | Telepon contoh |
|---|---|---|---|
| `ega` | Ega | `ega@demo.atcell.my.id` | `081200000001` |
| `febiyanto` | Febiyanto | `febiyanto@demo.atcell.my.id` | `081200000002` |
| `hilmi` | Hilmi | `hilmi@demo.atcell.my.id` | `081200000003` |

Email dan telepon adalah usulan, bukan keputusan final. Ganti sesuai K4.

Jangan membuat user Auth lewat SQL langsung. Password harus di-hash oleh
Supabase Auth Admin API. Jika service role key tidak tersedia, berhenti dan
minta owner menjalankan skrip atau memberikan akses sementara.

### Fase 5: seeding unit dan transaksi simulasi

Hanya setelah K1, K2, K3, dan K6 disetujui.

#### 5.1 Unit untuk katalog

**SUPERSEDED 24 Okt 2026.** Target bukan 5 unit available per merek, melainkan
5 model produk berbeda. Model tanpa unit tetap tampil sebagai "Belum ada unit".
Jangan membuat 18 unit baru atau mengarang IMEI. Skrip demo hanya membuat 3 unit
`is_demo = true` dengan `imei = NULL`, satu untuk tiap akun demo, dan unit itu
langsung berstatus `sold` untuk transaksi demo.

Target: 5 unit `available` per merek. Kondisi awal 7 unit. Perlu +18 unit
available.

Jika tiga transaksi simulasi memakai unit yang dijual, buat 21 unit baru:
18 tetap available, 3 menjadi sold untuk transaksi demo. Jangan menjual dari
18 unit available karena target 5 per merek akan turun.

Contoh alokasi unit baru untuk existing products:

| Merek | Model | Unit available baru | Unit sold demo |
|---|---|---:|---:|
| Apple | iPhone 15 Pro 128GB | 2 | 0 |
| Apple | iPhone 13 128GB | 1 | 1 |
| Apple | iPhone 14 Plus | 1 | 0 |
| Samsung | Galaxy S24 Ultra 256GB | 2 | 0 |
| Samsung | Galaxy A55 5G 8/256GB | 1 | 1 |
| Xiaomi | Xiaomi 14 12/512GB | 2 | 0 |
| Xiaomi | Redmi Note 13 8/256GB | 1 | 1 |
| Oppo | Reno 11 5G 12/256GB | 4 | 0 |
| Vivo | V30 5G 8/256GB | 3 | 0 |
| Vivo | Y36 8/256GB | 1 | 0 |

Total: 18 available baru + 3 sold demo = 21 unit. Setelah itu:
Apple 5, Samsung 5, Xiaomi 5, Oppo 5, Vivo 5 available.

Catatan:

- Alokasi ini hanya contoh. Sesuaikan dengan model yang owner setujui.
- Harga jual harus dari owner, bukan `default_price` yang ditebak. Harga modal
  juga dari owner. Jangan mengarang margin.
- Semua IMEI harus 15 digit dan unik. Gunakan daftar IMEI asli dari owner.
- Jangan memakai IMEI contoh yang sudah ada di migrasi atau dokumen.
- Jika owner memilih 5 model berbeda per merek, buat produk baru lebih dulu
  lewat alur `Master Produk`, lengkap dengan foto resmi dan spesifikasi. Jangan
  membuat produk asal-asalan.

#### 5.2 Transaksi simulasi

**SUPERSEDED 24 Okt 2026.** Implementasi aktual ada di
`scripts/seed-demo-customers.mjs`: satu unit demo dan satu transaksi
`is_demo = true` per akun, `sales_id: null`, `imei: NULL`, harga memakai
`products.default_price` (hanya untuk data demo yang dikecualikan dari laporan),
`purchase_cost: 0`, dan idempoten berdasarkan `customer_id + is_demo`. Jangan
memakai IMEI contoh atau mengubah transaksi Anisa.

Buat satu transaksi per akun demo, total tiga. Semua dalam satu transaksi SQL
atau satu skrip yang memakai service role.

Langkah per akun:

1. Ambil `profiles.id` berdasarkan username `ega`/`febiyanto`/`hilmi`.
2. Ambil satu unit demo berstatus `sold` yang disiapkan untuk akun itu.
3. Insert ke `transactions`:
   - `sales_id`: id profil `sales` atau `admin`.
   - `customer_id`: id profil demo.
   - `customer_name`: nama profil demo.
   - `customer_phone`: telepon profil demo.
   - `total_amount`: harga jual unit.
   - `final_payment`: harga jual unit.
   - `payment_method`: `qris` atau `cash`.
   - `invoice_number`: null, biarkan trigger mengisi.
   - `created_at`: tanggal sekarang. Jangan memalsukan tanggal transaksi.
4. Insert ke `transaction_items`:
   - `transaction_id`
   - `unit_id`
   - `unit_price`
   - `warranty_duration_months`: 12.
5. Update unit menjadi `sold` jika belum.
6. Set audit actor ke id admin di dalam transaksi SQL agar audit trail tidak
   mencatat null:
   `select set_config('atcell.actor_id', '<admin-uuid>', true);`
7. Commit.

Idempotensi:

- Sebelum insert, cek apakah sudah ada transaksi dengan `customer_id` dan
  `unit_id` yang sama. Jika ada, lewati.
- Jangan membuat transaksi ganda saat skrip dijalankan ulang.

Peringatan:

- Transaksi ini akan terlihat di `/portal/account` akun demo karena
  `customer_id` terisi.
- Transaksi ini juga akan terlihat di laporan dan dashboard. Jika owner memilih
  production, gunakan flag `is_demo` dan filter dari laporan, atau pastikan
  owner menyetujui laporan yang tercemar.
- Jangan menghapus transaksi existing. Jangan mengubah `customer_id` transaksi
  Anisa.

### Fase 6: verifikasi dan deploy

1. Verifikasi kode:
   - `tsc`, `lint`, `test`, `build`.
2. Verifikasi database:
   - Hitung unit available per merek.
   - Pastikan tiga profil demo ada dan role-nya `customer`.
   - Pastikan tiga transaksi demo punya `customer_id` dan item.
3. Verifikasi UI:
   - Login sebagai `ega`, `febiyanto`, `hilmi` di `/id/login`.
   - Buka `/portal/account`, pastikan nama dan riwayat pembelian muncul.
   - Buka `/portal/pos` sebagai `sales`, buat akun pelanggan baru, lalu
     lakukan satu penjualan ke akun itu. Pastikan riwayat muncul.
   - Buka `/portal/staff` sebagai `admin`, pastikan daftar pelanggan dan form
     berfungsi.
   - Buka katalog per merek, pastikan jumlah kartu sesuai.
4. Cek `/api/health/ready`.
5. Setelah owner menyetujui merge:
   - Merge PR.
   - Naikkan pin `Dockerfile.coolify` ke commit merge.
   - Deploy dan verifikasi ulang.
   - Jangan biarkan production tetap di pin lama.

---

## 7. Acceptance criteria

- [x] Admin bisa membuat akun pelanggan dari `/portal/customers`.
- [x] Sales bisa membuat akun pelanggan dari `/portal/customers` dan `/portal/pos`.
- [x] Technician dan customer ditolak di server action.
- [x] Username duplikat ditolak dengan pesan yang jelas.
- [x] Tidak ada user Auth yatim saat update profil gagal.
- [x] Pelanggan baru bisa login memakai username, nomor HP, dan password.
- [x] Pelanggan baru melihat namanya di `/portal/account`.
- [x] Transaksi POS yang ditautkan ke akun pelanggan muncul di riwayat
      pembelian pelanggan.
- [x] Tiga akun `ega`, `febiyanto`, `hilmi` ada, role `customer`, bisa login.
- [x] Masing-masing akun demo punya minimal satu transaksi dengan item dan
      masa garansi yang terlihat.
- [x] Setiap merek Apple, Samsung, Xiaomi, Oppo, Vivo punya 5 model berbeda di
      katalog; model tanpa unit berlabel "Belum ada unit", bukan stok palsu.
- [x] Tidak ada IMEI karangan di production tanpa izin tertulis.
- [x] Tidak ada password atau service role key di repo, log, atau PR.
- [x] `tsc`, `lint`, `test`, `build` bersih.
- [x] Tidak ada perubahan pada `components/ui/`, warna, font, atau label nav
      utama tanpa izin.
- [x] PR berisi bukti verifikasi browser dan hasil query, tanpa data sensitif.

---

## 8. Verifikasi yang bisa dijalankan

Baseline:

```bash
node_modules/.bin/tsc --noEmit
npm run lint
npm run test
npm run build
```

Hitung unit per merek:

```sql
select
  p.brand,
  count(*) filter (where u.status = 'available') as available,
  count(*) as total
from public.products p
left join public.inventory_units u on u.product_id = p.id
where p.is_active
group by p.brand
order by p.brand;
```

Cek tiga akun:

```sql
select username, full_name, role
from public.profiles
where username in ('ega', 'febiyanto', 'hilmi')
order by username;
```

Cek transaksi demo:

```sql
select
  t.id,
  t.invoice_number,
  p.username,
  t.customer_name,
  t.total_amount,
  ti.unit_id,
  ti.warranty_duration_months
from public.transactions t
join public.profiles p on p.id = t.customer_id
join public.transaction_items ti on ti.transaction_id = t.id
where p.username in ('ega', 'febiyanto', 'hilmi')
order by t.id;
```

Jangan menjalankan query tulis di production tanpa izin. Query di atas hanya
contoh verifikasi read-only.

---

## 9. Yang tidak boleh dilakukan

- Jangan menyalin password ke `AGENTS.md`, README, issue, PR, atau komentar
  kode.
- Jangan memakai email pelanggan asli untuk akun demo.
- Jangan memakai nomor telepon pelanggan asli tanpa izin.
- Jangan mengubah transaksi atau profil Anisa, `tamu`, atau `febieki562`.
- Jangan mengaktifkan kembali produk `Xiaomi iphone 16` yang nonaktif.
- Jangan menambah unit di bawah produk nonaktif.
- Jangan memakai `default_price` sebagai harga jual unit tanpa persetujuan.
- Jangan mengisi `purchase_cost` dengan 0 hanya agar cepat, karena laporan
  margin akan salah.
- Jangan menghapus unit atau transaksi existing untuk "merapikan" data.
- Jangan memakai `execute_sql` untuk `DROP`, `TRUNCATE`, atau `DELETE` tanpa
  `WHERE`.
- Jangan menganggap PR #128 sudah production hanya karena PR-nya hijau.
- Jangan menyentuh `src/components/ui/`.
- Jangan menambah dependency.

---

## 10. Format laporan akhir

Saat menyerahkan hasil, tulis:

1. Ringkasan perubahan kode dan file yang diubah.
2. Hasil `tsc`, `lint`, `test`, `build`.
3. Hasil query production: jumlah unit per merek, tiga profil demo, tiga
   transaksi demo.
4. Bukti UI: screenshot halaman staff, POS, akun pelanggan, dan katalog per
   merek. Sensor email, telepon, dan password.
5. Daftar keputusan owner yang sudah dipenuhi dan yang masih terbuka.
6. Kredensial tiga akun: jangan tulis di laporan publik. Sampaikan lewat kanal
   privat dan catat bahwa sudah disampaikan.
7. Risiko yang tersisa, terutama jika transaksi demo masuk production dan ikut
   laporan.
8. PR URL dan status check. Jangan merge tanpa izin.

---

## 11. Ringkasan satu paragraf

Kerjakan fitur akun pelanggan lebih dulu: action `createCustomerAccount` untuk
admin/sales, form bersama di halaman staff dan POS, lalu tautkan POS ke
`customer_id` agar riwayat pembelian benar-benar muncul. Setelah kode lulus
tes, minta owner memutuskan arti "5 HP per merek", sumber IMEI, dan apakah data
simulasi boleh masuk production. Buat tiga akun demo lewat Supabase Auth Admin
API, bukan SQL. Untuk unit dan transaksi simulasi, utamakan staging; jika
production, gunakan IMEI asli dan penanda demo yang tidak mengotori laporan.
Terakhir, merge, naikkan pin `Dockerfile.coolify`, deploy, dan verifikasi
katalog serta akun pelanggan di `atcell.my.id`.
