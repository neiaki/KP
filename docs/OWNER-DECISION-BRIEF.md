# Brief Keputusan Owner: Dashboard, Laporan Teknisi, dan Aktor Audit

Status: **usulan, belum disetujui**. Dokumen ini tidak mengubah kode, schema,
atau perilaku aplikasi. Tujuannya memberi owner pilihan yang jelas sebelum
pekerjaan berikutnya dimulai.

Sumber temuan: `docs/NEEDS_HUMAN.md` butir 10 dan 11, hasil audit Goal 5 LOOP
v3. Bukti pendukung ada di `docs/LOOP_LOG.md` bagian Goal 5.

## 1. Ringkasan keputusan

| ID | Keputusan | Opsi | Rekomendasi | Perkiraan usaha |
|---|---|---|---|---|
| D1 | Grafik omzet di dashboard | bangun grafik / ubah PRD / tunda | Bangun grafik 30 hari tanpa library baru, atau ubah PRD kalau owner tidak butuh tren | 0,5-1 hari [ASUMSI] |
| D2 | Laporan per teknisi | tambah `completed_at` + agregasi / hitung dari audit / ubah FR-D-03 | Tambah `completed_at` + agregasi per teknisi | 1-2 hari + migrasi [ASUMSI] |
| D3 | Aktor audit pada tulis langsung | fallback `auth.uid()` / cabut tulis langsung / ubah NFR-07 | Fallback `auth.uid()` + test regresi | 1-2 jam + migrasi [ASUMSI] |
| D4 | Urutan migrasi | satu batch besar / batch kecil terpisah | Pisahkan D3 dan D2 dari aturan bisnis A-L | 0,5 hari koordinasi [ASUMSI] |

## 2. D1: Grafik omzet harian/bulanan

### Kenyataan saat ini

Dashboard menampilkan kartu total omzet, jumlah transaksi, tiket aktif, dan
stok rendah. Tidak ada grafik deret waktu.

- `docs/PRD-AtCell.md:30` meminta grafik omzet harian/bulanan.
- `src/app/(portal)/portal/dashboard/page.tsx:32-56` hanya menghitung total
  dan daftar stok rendah.
- `src/app/(portal)/portal/dashboard/page.tsx:102-177` merender kartu angka,
  bukan grafik.

### Opsi

**D1-A. Grafik ringkas 30 hari tanpa library baru.**
Agregasi `transactions.final_payment` per hari, kecuali `is_demo`, lalu render
SVG atau batang CSS sederhana. Tidak menambah dependensi. Perlu satu fungsi
agregasi murni yang bisa diuji tanpa browser, empty state, dan label tanggal
zona Asia/Jakarta.

- Kelebihan: menjawab kebutuhan PRD, kecil, tidak menambah bundle besar.
- Kekurangan: bukan grafik interaktif; perlu keputusan rentang 7/30/90 hari.
- Bukti yang harus ditambah: unit test agregasi, test render empty state,
  screenshot mobile 320px.

**D1-B. Ubah PRD menjadi ringkasan total.**
Hapus kata "grafik" dan jelaskan bahwa dashboard menampilkan total all-time.
Tidak ada perubahan kode.

- Kelebihan: paling murah dan jujur pada perilaku sekarang.
- Kekurangan: owner kehilangan indikator tren penjualan.

**D1-C. Tunda.**
Tetap catat di `NEEDS_HUMAN` sampai ada kebutuhan operasional yang jelas.

### Rekomendasi

Pilih **D1-A** kalau owner memakai dashboard untuk melihat tren mingguan atau
bulanan. Kalau tidak, pilih **D1-B** supaya dokumen tidak menjanjikan fitur yang
tidak dipakai. Jangan menambah library chart baru hanya untuk satu grafik.

## 3. D2: Laporan performa per teknisi

### Kenyataan saat ini

Halaman laporan menghitung total unit selesai, unit dikerjakan, omzet jasa, dan
omzet meja servis secara global. Rincian tiket tidak dikelompokkan per
`technician_id` dan tidak menghitung durasi rata-rata.

- `docs/PRD-AtCell.md:35` meminta jumlah tiket selesai dan rata-rata waktu
  pengerjaan per teknisi.
- `docs/requirement-2.0.md:65` (FR-D-03) meminta performa penyelesaian tiket
  per teknisi.
- `src/app/(portal)/portal/reports/page.tsx:11-40` hanya menghitung agregat
  global.
- `src/db/schema.ts:294` sudah punya `technician_id`, tetapi
  `src/db/schema.ts:286-330` tidak punya `completed_at`.
- `updated_at` berubah pada setiap edit, jadi tidak bisa dipakai sebagai waktu
  selesai yang jujur.

### Opsi

**D2-A. Tambah `completed_at` dan agregasi per teknisi.**
Migrasi menambah kolom `completed_at timestamptz` di `service_tickets`, diisi
saat status masuk `completed` (bukan `picked_up`, karena pengambilan bisa
tertunda berhari-hari). Backfill dari baris pertama
`service_ticket_audit` yang menuju `completed`. Laporan menampilkan per
teknisi: tiket selesai, rata-rata durasi dari `created_at` ke `completed_at`,
dan omzet jasa. Tiket tanpa teknisi masuk kelompok "Belum ditugaskan".

- Kelebihan: angka stabil, query sederhana, berguna untuk SLA.
- Kekurangan: butuh migrasi, backfill, dan keputusan status `cancelled`.
- Bukti yang harus ditambah: test trigger `completed_at`, test backfill,
  test agregasi, dan test tiket tanpa teknisi.

**D2-B. Hitung dari `service_ticket_audit` tanpa kolom baru.**
Cari transisi pertama ke `completed` per tiket, lalu hitung durasi. Tidak ada
migrasi, tetapi query lebih berat dan bergantung pada kelengkapan audit lama.

- Kelebihan: tidak mengubah schema.
- Kekurangan: lebih rapuh, sulit diuji tanpa database, dan audit lama mungkin
  tidak lengkap.

**D2-C. Ubah FR-D-03 dan PRD menjadi laporan global.**
Dokumen diselaraskan ke perilaku sekarang. Tidak ada perubahan kode.

- Kelebihan: cepat dan jujur.
- Kekurangan: owner tidak mendapat perbandingan antar teknisi.

### Rekomendasi

Pilih **D2-A** kalau laporan per teknisi benar-benar dipakai untuk menilai beban
kerja atau SLA. Kalau tidak, pilih **D2-C**. Hindari **D2-B** kecuali owner
menolak migrasi schema sama sekali.

## 4. D3: Aktor audit pada tulis langsung

### Kenyataan saat ini

Trigger audit menulis `actor_id` dari `private.current_actor_id()`. Fungsi itu
hanya membaca setting transaction-local `atcell.actor_id`.

- `supabase/migrations/0007_audit_trail.sql:72-93` membaca
  `current_setting('atcell.actor_id', true)` dan mengembalikan NULL kalau
  kosong.
- `src/lib/actions/_helpers.ts:27-29` mengisi setting itu dari Server Action.
- `supabase/migrations/0002_harden_atcell_schema.sql:407-415` mengizinkan
  `admin`/`sales` update `inventory_units` langsung.
- `supabase/migrations/0002_harden_atcell_schema.sql:473-477` mengizinkan
  semua staf update `service_tickets` langsung.

Akibatnya, tulis langsung lewat PostgREST tetap tercatat di audit, tetapi
`actor_id` bisa NULL. NFR-07 di `docs/requirement-2.0.md:75` meminta identitas
pengguna, jadi klaim itu belum berlaku untuk semua jalur.

### Opsi

**D3-A. Fallback ke `auth.uid()` di `private.current_actor_id()`.**
Ubah fungsi agar memakai `atcell.actor_id` lebih dulu, lalu `auth.uid()` kalau
setting kosong. Server Action tetap menang; tulis langsung dari sesi pengguna
mendapat aktor yang benar. Tulis langsung lewat `service_role` atau `psql`
tetap NULL dan harus dianggap jalur operasional tepercaya.

- Kelebihan: kecil, tidak mencabut akses yang ada, menutup celah audit utama.
- Kekurangan: tetap butuh migrasi dan test database; tidak membatasi kolom apa
  yang boleh diubah sales.
- Bukti yang harus ditambah: test update langsung sebagai `authenticated`
  menghasilkan `actor_id` terisi; test Server Action tetap memakai aktor
  eksplisit; test `service_role` tetap NULL.

**D3-B. Cabut update langsung, paksa lewat Server Action.**
Hapus policy update `inventory_units`/`service_tickets` untuk `authenticated`,
atau batasi ke RPC khusus. Semua perubahan harus lewat Server Action.

- Kelebihan: batas tulis paling kuat; aktor selalu eksplisit.
- Kekurangan: bisa memutus PostgREST/realtime atau klien lain; perlu perubahan
  aplikasi dan pengujian lebih luas.

**D3-C. Ubah NFR-07 menjadi "mutasi lewat Server Action".**
Dokumen diselaraskan ke jalur yang sudah dijamin. Tidak ada perubahan kode.

- Kelebihan: cepat.
- Kekurangan: celah audit pada tulis langsung tetap ada.

### Rekomendasi

Pilih **D3-A** sebagai langkah pertama, lalu pertimbangkan **D3-B** hanya kalau
owner ingin menutup semua tulis langsung. Jangan pilih **D3-C** tanpa sadar
bahwa tulis langsung tetap bisa meninggalkan `actor_id` NULL. Aturan bisnis
lain di `docs/migrations-proposed/20261025090000_db_integrity.sql` bagian A-L
tetap perlu keputusan terpisah.

## 5. D4: Urutan penerapan yang disarankan

1. Owner memutuskan D1, D2, D3, dan bagian M.
2. Kalau D3 disetujui, terapkan migrasi aktor audit lebih dulu. Ini perubahan
   kecil dan memudahkan audit untuk semua pekerjaan berikutnya.
3. Kalau D2 disetujui, terapkan `completed_at` dan backfill. Verifikasi di
   database sekali pakai sebelum production.
4. Terapkan aturan bisnis A-L dari `docs/migrations-proposed/` secara terpisah.
   Jangan gabungkan dengan D2/D3 supaya rollback tetap sederhana.
5. Bagian M (`selling_price >= purchase_cost`) hanya kalau owner melarang
   loss leader.
6. Setelah setiap migrasi, jalankan `docs/DB-VERIFICATION-RUNBOOK.md` dan
   catat hasilnya di `docs/LOOP_LOG.md`.

## 6. Checklist keputusan owner

- [ ] D1: pilih A (grafik), B (ubah PRD), atau C (tunda).
- [ ] D2: pilih A (`completed_at` + laporan), B (audit), atau C (ubah FR).
- [ ] D3: pilih A (fallback `auth.uid()`), B (cabut tulis langsung), atau C
      (ubah NFR).
- [ ] D4: setujui urutan D3, D2, lalu A-L.
- [ ] Bagian M: setujui atau tolak aturan harga jual di atas modal.
- [ ] Tentukan siapa yang menjalankan verifikasi staging dan kapan.

## 7. Batas dokumen ini

- Tidak ada migrasi yang dibuat atau dijalankan.
- Tidak ada dependensi baru.
- Tidak ada perubahan perilaku, UI, atau schema.
- Semua perkiraan usaha ditandai `[ASUMSI]` dan harus dikoreksi owner.
