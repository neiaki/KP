# Copy Peringatan Link Pembayaran

**Status: menunggu persetujuan owner. Copy di situs belum diubah apa pun.**

Catatan penguji: "notif at cell tidak pernah mengirim link pembayaran lewat chat
hapus".

Catatan itu berisi potongan kalimat yang persis ada di situs, jadi ini bukan
bug, melainkan pertanyaan nada. Peringatan yang sekarang berbunyi seperti At
Cell tidak pernah mengirim link pembayaran, padahal maksudnya memperingatkan
pelanggan supaya tidak tertipu.

## Di mana string itu ada

| Berkas | Baris | Konteks |
|---|---|---|
| `src/app/(public)/[locale]/payment/payment-content.tsx` | 142 (ID) dan 141 (EN) | Kotak peringatan kuning di bawah "Aturan pembayaran" |
| `src/app/(public)/[locale]/terms/terms-content.tsx` | 130 (ID) dan 71 (EN) | Klausa "Penipuan" dan "Fraud" |

## Keputusan yang diminta

Pilih **A** (ganti copy, peringatan tetap ada) atau **B** (hapus peringatan dari
halaman pembayaran). Opsi A disarankan.

---

## Opsi A (disarankan): ganti copy, jangan hapus

Empat penggantian string. Teks di kiri adalah yang sekarang ada di kode.

### A1. `payment-content.tsx:142` (Indonesia)

Sekarang:

    At Cell tidak pernah mengirim link pembayaran lewat chat. Kalau ada yang
    meminta transfer mengatasnamakan kami, berhenti dan konfirmasi ke nomor
    resmi dulu.

Jadi:

    Siapa pun yang mengirim tautan pembayaran lewat chat, SMS, atau WhatsApp
    dengan mengatasnamakan At Cell bukan kami. Pembayaran resmi hanya di
    konter. Kalau ragu, konfirmasi dulu ke nomor resmi kami sebelum transfer.

### A2. `payment-content.tsx:141` (Inggris)

Sekarang:

    At Cell never sends payment links by chat. If someone asks for a transfer
    on our behalf, stop and confirm on the official number first.

Jadi:

    Whoever sends a payment link over chat, SMS, or WhatsApp while using the
    At Cell name is not us. Official payment happens at the counter only. If
    you are unsure, confirm on our official number before transferring anything.

### A3. `terms-content.tsx:130` (Indonesia)

Sekarang:

    Kami tidak pernah mengirim link pembayaran lewat chat dan tidak pernah
    meminta transfer ke rekening pribadi.

Jadi:

    Siapa pun yang mengirim tautan pembayaran atau meminta transfer ke rekening
    pribadi dengan mengatasnamakan At Cell adalah penipu. Pembayaran resmi
    hanya dilakukan di konter. Konfirmasi ke nomor resmi yang tercantum di
    situs ini sebelum Anda transfer kepada siapa pun.

### A4. `terms-content.tsx:71` (Inggris)

Sekarang:

    We never send payment links by chat and never ask for transfers to personal
    accounts.

Jadi:

    Anyone who sends a payment link or asks for a transfer to a personal
    account while using the At Cell name is a fraudster. Official payment
    happens at the counter only. Confirm on the official number listed on this
    site before you transfer anything to anyone.

Empat penggantian, empat baris. Tidak ada test yang mengunci string ini, jadi
tidak ada test yang perlu diperbarui.

---

## Opsi B: hapus peringatan dari halaman pembayaran

1. Hapus blok peringatan di `payment-content.tsx:137-144`, yaitu kotak kuning
   beserta ikonnya.
2. Klausa di `terms-content.tsx` tetap ada, atau terapkan A3 dan A4 supaya
   keduanya seragam.

Konsekuensinya: `/payment` tidak lagi memuat peringatan anti-penipuan, dan
`/terms` jadi satu-satunya tempat yang menyebutnya. Halaman pembayaran adalah
tempat orang mencari instruksi transfer, jadi di situlah peringatan paling
ber guna.

---

## Kenapa copy sekarang perlu diganti, bukan dibiarkan

1. "Tidak pernah" lebih kuat daripada "tidak", dan subjeknya adalah "At Cell".
   Pelanggan bisa membaca "toko ini tidak bisa mengirim pembayaran", bukan
   "hati-hati ada penipu". Peringatan anti-penipuan harus menunjuk pelakunya.
2. Kalimat kedua yang lama sudah membawa instruksi yang benar, yaitu
   "konfirmasi ke nomor resmi dulu". Copy di atas mempertahankan instruksi itu
   sambil membalik subjeknya dari toko ke penipu.

---

## Cara menyetujui

Balas di `docs/README.md` bagian "Keputusan produk (2 Oktober 2026)", bullet
Note D, salah satu dari:

    - Note D, ... Lanjutannya di PAYMENT-WARNING-COPY.md.
      Copy diubah sesuai PAYMENT-WARNING-COPY.md opsi A.   <-- atau: opsi B

Implementasinya lalu hanya mengganti empat string di dua berkas. Tidak ada
migration, tidak ada perubahan perilaku, tidak ada test baru.
