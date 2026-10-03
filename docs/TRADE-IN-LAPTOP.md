# Taksir Tukar Tambah Laptop

**Status: menunggu keputusan owner. Tidak ada harga laptop yang dikarang, dan
tidak ada kode yang diubah untuk catatan ini.**

Catatan penguji: "kondisi laptop harga berubah (planing)".

## Ringkasan

Tukar tambah sudah punya satu mesin harga yang benar-benar memakai kondisi:
layar, bodi, baterai, biometrik, kamera, dus. Mesin itu menghasilkan angka
sekaligus label Grade A/B/C. Yang belum ada hanya laptop.

Dua alasan, keduanya tidak bisa diselesaikan di lapisan UI:

1. **Daftar modelnya iPhone saja.** Dropdown dibangun dari `IPHONE_LINEUP`
   (`trade-in-content.tsx:247-262`), dan POS memakai daftar rata yang sama
   (`portal/pos/page.tsx:416`).
2. **Laptop tidak punya IMEI, dan IMEI 15 digit itu wajib di database.**
   `inventory_units.imei` dan `trade_in_records.imei` sama-sama `notNull`
   dengan check `^\d{15}$` (`db/schema.ts:201` dan `:275`). Tidak ada tabel
   yang bisa menerima satu unit laptop tukar tambah hari ini.

Artinya ini permintaan fitur, bukan bug. Yang dibutuhkan bukan kode lebih dulu,
melainkan tiga jawaban di bawah.

## Yang perlu dijawab owner

### Pertanyaan 1: Data apa yang bisa disuplai toko?

Tidak ada harga yang boleh ditulis sebelum ini dijawab.

| # | Data | Bentuk yang dipakai kode sekarang |
|---|---|---|
| 1 | Daftar model laptop yang diterima | Persis seperti `IPHONE_LINEUP`: dikelompokkan per seri, tiap model punya satu angka dasar |
| 2 | Angka dasar rupiah per model | Angka dasar taksiran sebelum cek fisik di konter, bukan harga jual |
| 3 | Pilihan storage per seri | Sekarang hanya GB ponsel. Laptop perlu minimal 256 GB, 512 GB, 1 TB, 2 TB |
| 4 | Rubrik kondisi laptop | Daftar pemeriksaan dan seberapa besar tiap masalah menurunkan taksiran |
| 5 | Markup unit masuk | Sekarang `Math.round(nilai * 1.25)` (`actions/pos.ts:117`). Untuk iPhone masuk akal, untuk laptop penyusutan berbeda |

Lampiran A memuat template yang bisa langsung diisi.

### Pertanyaan 2: Di mana unit laptop hasil tukar tambah dicatat?

| Opsi | Yang dibutuhkan | Konsekuensi |
|---|---|---|
| A. Tidak dicatat, hanya ditaksir | Tidak ada perubahan skema. Kalkulator dan POS menampilkan angka, hasil inspeksi tetap di WhatsApp dan nota | Tidak ada riwayat dan tidak bisa diaudit. Tidak membuka celah apa pun. **Rekomendasi untuk mulai** |
| B. Nomor seri laptop menggantikan IMEI | Melonggarkan check 15 digit pada dua tabel, menambah kolom identitas perangkat | Butuh migrasi. `imei` jadi identitas yang tidak seragam, dan `v_public_inventory` men-exposed `right(u.imei, 4)`. Risiko paling besar |
| C. Tabel terpisah untuk barang tanpa IMEI | Tabel baru dengan relasi ke `transactions` | Butuh migrasi, tapi jalur HP tidak tersentuh sama sekali. **Pilihan aman kalau nanti butuh riwayat** |

### Pertanyaan 3: Cakupan rilis pertama

- [ ] **Taksir saja.** Memakai Opsi A dari Pertanyaan 2. Kalkulator publik dan
  POS menerima laptop, menampilkan angka, tidak ada yang masuk database.
- [ ] **Taksir plus simpan.** Memakai Opsi C dari Pertanyaan 2, dan
  migrasinya ditulis lebih dulu.

---

## Lampiran A: template data yang harus diisi

Salin tabel ini, isi, lalu simpan jawabannya ke owner. Kosongkan baris yang
memang tidak berlaku.

| Seri | Model | Storage | Angka dasar (Rp) |
|---|---|---|---|
| | | | |
| | | | |

Rubrik kondisi: untuk tiap pemeriksaan, tulis opsi dan penurunannya. Contoh
bentuk isian, angkanya masih kosong dan harus diisi toko:

| Pemeriksaan | Opsi | Penurunan taksiran |
|---|---|---|
| Layar | mulus / lecet halus / retak | / % / % |
| Keyboard | utuh / satu tombol mati / tidak bisa dipakai | / % / % |
| Engsel | kokoh / goyang | / % |
| Baterai | siklus dan kesehatan | / % |
| SSD dan port | waras / ada yang bermasalah | / % |
| Chassis | bersih / lecet / penyok | / % |

Markup unit masuk untuk laptop: kali __ (sekarang iPhone 1,25).

## Yang tidak boleh terjadi

- **Jangan mengarang angka.** Angka karangan yang salah lebih berbahaya
  daripada tidak ada angka, karena pembaca tidak tahu itu karangan.
- **Jangan memakai fallback 3.500.000 untuk laptop.** Angka itu milik
  iPhone 11 (`trade-in-models.ts:111`) dan tidak akan ditandai sebagai salah.
- **Jangan melonggarkan check IMEI tanpa keputusan eksplisit.** Check itu yang
  menjaga etalase publik dan nota tetap konsisten.

## Cara menyetujui

Balas di `docs/README.md` bagian "Keputusan produk (2 Oktober 2026)", bullet
Note A, salah satu dari:

    - Note A, ... Lanjutannya di TRADE-IN-LAPTOP.md.
      Disetujui: taksir saja, Opsi A. Data laptop menyusul.   <-- atau Opsi C

Implementasi berikutnya butuh isi Lampiran A. Tanpa itu, tidak ada angka yang
boleh ditulis ke repositori.

## Related

- Catatan yang menunda pekerjaan ini: `README.md` bagian "Keputusan produk".
- Kebutuhan asal: FR-C-01 dan FR-C-02 di `requirement-2.0.md`, yang mengatur
  penilaian kondisi untuk tukar tambah HP dan tidak menyebut laptop sama sekali.
