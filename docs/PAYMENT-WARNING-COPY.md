# Copy Peringatan Link Pembayaran

**Status: perlu persetujuan pemilik. String di lokasi publik TIDAK diubah.**

Catatan penguji yang jadi pemicu: "notif at cell tidak pernah mengirim link
pembayaran lewat chat hapus".

Catatan itu berisi potongan kalimat yang persis ada di situs, jadi ini bukan
laporan bug. Yang dipersoalkan adalah nada: kalimatnya terbaca seperti At Cell
menolak mengirim link pembayaran, bukan seperti peringatan anti-penipuan.

## 1. Di mana string ini muncul

Empat tempat, dua pesan berbeda:

| # | Lokasi | Konteks | Bahasa |
|---|---|---|---|
| 1 | `src/app/(public)/[locale]/payment/payment-content.tsx:142` | Kotak peringatan kuning dengan ikon perisai, di bawah "Aturan pembayaran" | Indonesia |
| 2 | `src/app/(public)/[locale]/payment/payment-content.tsx:141` | Kotak yang sama | Inggris |
| 3 | `src/app/(public)/[locale]/terms/terms-content.tsx:130` | Bagian "Penipuan" | Indonesia |
| 4 | `src/app/(public)/[locale]/terms/terms-content.tsx:71` | Bagian "Fraud" | Inggris |

Teksnya sekarang, persis:

    At Cell tidak pernah mengirim link pembayaran lewat chat. Kalau ada yang
    meminta transfer mengatasnamakan kami, berhenti dan konfirmasi ke nomor
    resmi dulu.

    At Cell never sends payment links by chat. If someone asks for a transfer
    on our behalf, stop and confirm on the official number first.

Ada satu kalimat lain di halaman pembayaran yang menyebut hal serupa tapi
tanpa kata "tidak pernah" (`payment-content.tsx:86`): "Semua pembayaran terjadi
di konter. Tanpa link pembayaran, tanpa checkout online."

## 2. Kenapa kalimatnya terbaca seperti penolakan

Masalahnya ada pada kata "tidak pernah" dan pada subjeknya.

- "Tidak pernah" lebih kuat daripada "tidak". "Kami tidak mengirim link
  pembayaran" menyatakan kebijakan. "Kami tidak pernah mengirim link
  pembayaran" terdengar seperti kemampuan atau kemauan yang hilang, dan
  pelanggan bisa salah baca sebagai "toko ini tidak bisa kirim pembayaran".
- Subjeknya adalah "At Cell", bukan penipunya. Peringatan anti-penipuan
  seharusnya menunjuk pelaku, bukan toko.
- Kalimat kedua sudah membawa perlindungan sebenarnya: "Kalau ada yang
  meminta transfer mengatasnamakan kami, berhenti dan konfirmasi ke nomor
  resmi dulu." Di situ instruksinya dan di situ aksi yang diminta pelanggan.

Jadi bagian yang bermasalah adalah kalimat pertama. Kalimat kedua tidak perlu
berubah.

## 3. Kalau dihapus seluruhnya, apa yang hilang

Hapus kotak peringatan di `/[locale]/payment` dan klausul "Penipuan" di
`/[locale]/terms` berarti:

1. **Posisi anti-penipuan toko hilang dari halaman yang paling mungkin dibaca
   orang yang sudah percaya.** Halaman pembayaran adalah tempat orang mencari
   instruksi transfer. Tanpa peringatan di sana, tidak ada satu pun tempat di
   situs yang mengatakan jangan transfer ke rekening pribadi.
2. **Syarat dan ketentuan kehilangan klausul yang secara eksplisit menyebut
   rekening pribadi.**
3. Kalau produk atau kanal pembayaran berbasis tautan pernah ditambahkan
   belakangan, tidak ada teks yang membedakan kanal resmi At Cell dari
   pesan penipu.

Jadi rekomendasi di sini bukan menghapus, melainkan menulis ulang.

## 4. Copy yang disarankan

Prinsipnya sama di dua tempat: **subyeknya orang yang mengirim pesan, bukan At
Cell; kebijakan toko dinyatakan positif; instruksi ke pelanggan tetap ada.**

### 4.1 Kotak peringatan di `/[locale]/payment`

Ganti `payment-content.tsx:142` (Indonesia) dengan:

> Siapa pun yang mengirim tautan pembayaran lewat chat, SMS, atau WhatsApp
> dengan mengatasnamakan At Cell bukan kami. Pembayaran resmi hanya di konter.
> Kalau ragu, konfirmasi dulu ke nomor resmi kami sebelum transfer.

Ganti `payment-content.tsx:141` (Inggris) dengan:

> Whoever sends a payment link over chat, SMS, or WhatsApp while using the At
> Cell name is not us. Official payment happens at the counter only. If you are
> unsure, confirm on our official number before transferring anything.

Yang berubah: subyek jadi pelaku, "tidak pernah" hilang, dan kalimat positif
"Pembayaran resmi hanya di konter" masuk. Kalimat kedua yang lama
("berhenti dan konfirmasi ke nomor resmi dulu") sudah tercakup oleh kalimat
baru dan tidak perlu berdiri sendiri.

### 4.2 Klausul "Penipuan" di `/[locale]/terms`

Di kontrak, kata yang mengikat lebih penting daripada nadanya, jadi klausul ini
boleh tetap tegas. Yang diubah hanya susunan kalimatnya.

Ganti `terms-content.tsx:130` dengan:

> Siapa pun yang mengirim tautan pembayaran atau meminta transfer ke rekening
> pribadi dengan mengatasnamakan At Cell adalah penipu. Pembayaran resmi hanya
> dilakukan di konter. Konfirmasi ke nomor resmi yang tercantum di situs ini
> sebelum Anda transfer kepada siapa pun.

Ganti `terms-content.tsx:71` dengan:

> Anyone who sends a payment link or asks for a transfer to a personal account
> while using the At Cell name is a fraudster. Official payment happens at the
> counter only. Confirm on the official number listed on this site before you
> transfer anything to anyone.

Kalimat kedua klausa lama ("tidak pernah meminta transfer ke rekening pribadi")
dipertahankan secara makna: "adalah penipu" mengatakannya lebih tegas, dan
ditambah aturan konfirmasi.

### 4.3 Kalimat di `payment-content.tsx:86`

Kalimat "Semua pembayaran terjadi di konter. Tanpa link pembayaran, tanpa
checkout online." tidak perlu diubah. Ia sudah menyatakan kebijakan secara
positif dan justru memperkuat kotak peringatan yang ditulis ulang.

## 5. Cara menyetujui dalam satu langkah

Kalau pemilik setuju dengan copy di 4.1 dan 4.2, perubahan kodenya hanya
empat baris di dua berkas:

| Berkas | Baris | Aksi |
|---|---|---|
| `src/app/(public)/[locale]/payment/payment-content.tsx` | 141 | ganti string Inggris di kotak peringatan |
| `src/app/(public)/[locale]/payment/payment-content.tsx` | 142 | ganti string Indonesia di kotak peringatan |
| `src/app/(public)/[locale]/terms/terms-content.tsx` | 71 | ganti klausa Inggris "Fraud" |
| `src/app/(public)/[locale]/terms/terms-content.tsx` | 130 | ganti klausa Indonesia "Penipuan" |

Tidak ada test yang mengunci string ini, jadi tidak ada test yang perlu
diperbarui. Yang perlu dicek setelahnya hanya bahwa kedua halaman tetap
merender dan tidak ada teks yang terpotong.

Kalau pemilik lebih suka menghapus saja, hapus kotak peringatan di
`payment-content.tsx:137-144` dan biarkan klausul di `terms-content.tsx`
tetap ada. Itu menjaga posisi anti-penipuan di satu tempat saja, tapi kehilangan
peringatan di halaman yang paling sering dibuka.

## 6. Status

Belum ada perubahan pada copy publik untuk catatan ini. Keempat string masih
persis seperti di atas sampai pemilik memilih salah satu opsi di bagian 5.
