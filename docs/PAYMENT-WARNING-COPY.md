# Copy Peringatan Link Pembayaran

**Status: keputusan kebijakan sudah turun (lihat "Keputusan 2 Oktober 2026").
Copy di situs belum diubah apa pun; penggantian string tetap menunggu persetujuan
owner.**

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

## Keputusan 2 Oktober 2026

CodeRabbit pada PR #68 memberi catatan pada Opsi A di bawah: karena halaman
ketentuan menyatakan At Cell bertransaksi di toko **dan** lewat nomor resmi,
Opsi A seharusnya tetap menyebut nomor resmi sebagai kanal pembayaran yang sah.

Catatan itu ditolak. Kebijakan yang dipakai tetap **pembayaran hanya di konter**,
dan alasannya ada di kutipan harfiah di bawah. Yang perlu diperbaiki adalah
copy Opsi A yang selama ini bertentangan dengan dirinya sendiri: ia menyatakan
pembayaran resmi hanya di konter, satu kalimat berikutnya menyuruh pelanggan
mengonfirmasi transfer lewat nomor resmi.

### Bukti 1: halaman pembayaran sudah menyebut konter tanpa kecuali

Dari `src/app/(public)/[locale]/payment/payment-content.tsx`, apa adanya:

    All payments happen at the counter. No payment links, no online checkout.

    Semua pembayaran terjadi di konter. Tanpa link pembayaran, tanpa checkout online.

    Never transfer to personal accounts. The shop account is only ever stated at the counter.

    Jangan transfer ke rekening pribadi. Rekening toko hanya diinfokan di konter.

Keempat metode pembayaran juga bernama konter:

    Pay at the counter and take the unit home the same day.

    Transfer to the shop account stated at the counter, then show the proof.

    Scan the official shop QR at the counter from any banking app or e-wallet.

    EDC available at the counter for all major debit cards.

### Bukti 2: kalimat yang dikutip CodeRabbit di halaman ketentuan

Dari `src/app/(public)/[locale]/terms/terms-content.tsx`, baris 129 (ID) dan
70 (EN), kalimat lengkapnya:

    At Cell hanya bertransaksi di toko dan nomor resmi yang tercantum di situs ini.

    At Cell only transacts in store and on the official number listed on this site.

Kalimat itu tentang **bertransaksi**, yaitu tempat pelanggan memesan dan
menghubungi toko: booking, tanya stok, tanya kondisi. Kalimat itu tidak
menyebut pembayaran, dan membacanya sebagai "nomor resmi adalah kanal
pembayaran" bertentangan langsung dengan empat kutipan di Bukti 1, yang
menyatakan rekening toko hanya diinfokan di konter.

Nomor resmi tetap dipakai, hanya untuk **memverifikasi**, bukan untuk
membayar: itu yang membuat klausanya tidak bertentangan dengan
`terms-content.tsx`. Keduanya konsisten kalau dibaca apa adanya.

---

## Opsi A (disarankan): ganti copy, jangan hapus

Empat penggantian string. Teks di kiri adalah yang sekarang ada di kode,
disalin harfiah. (Copy publik belum diubah sampai owner menyetujui.)

### A1. `payment-content.tsx:142` (Indonesia)

Sekarang:

    At Cell tidak pernah mengirim link pembayaran lewat chat. Kalau ada yang
    meminta transfer mengatasnamakan kami, berhenti dan konfirmasi ke nomor
    resmi dulu.

Jadi:

    Siapa pun yang mengirim tautan pembayaran lewat chat, SMS, atau WhatsApp
    dengan mengatasnamakan At Cell bukan kami. At Cell tidak pernah mengirim
    tautan pembayaran dan tidak pernah meminta transfer lewat chat. Pembayaran
    hanya di konter dan rekening toko hanya diinfokan di konter. Kalau ragu,
    jangan transfer dulu: tanya di konter atau hubungi nomor resmi kami untuk
    memastikan.

### A2. `payment-content.tsx:141` (Inggris)

Sekarang:

    At Cell never sends payment links by chat. If someone asks for a transfer
    on our behalf, stop and confirm on the official number first.

Jadi:

    Whoever sends a payment link over chat, SMS, or WhatsApp while using the At
    Cell name is not us. At Cell never sends payment links and never asks for a
    transfer by chat. Payment happens at the counter only, and the shop account
    is only ever stated at the counter. If you are unsure, do not transfer
    anything yet: ask at the counter or contact our official number to verify.

### A3. `terms-content.tsx:130` (Indonesia)

Sekarang:

    Kami tidak pernah mengirim link pembayaran lewat chat dan tidak pernah
    meminta transfer ke rekening pribadi.

Jadi:

    Siapa pun yang mengirim tautan pembayaran lewat chat, SMS, atau WhatsApp,
    atau meminta transfer ke rekening pribadi dengan mengatasnamakan At Cell,
    adalah penipu. Pembayaran hanya dilakukan di konter. Kalau ragu, jangan
    transfer dulu: tanya di konter atau hubungi nomor resmi yang tercantum di
    situs ini untuk memastikan.

### A4. `terms-content.tsx:71` (Inggris)

Sekarang:

    We never send payment links by chat and never ask for transfers to personal
    accounts.

Jadi:

    Anyone who sends a payment link over chat, SMS, or WhatsApp, or asks for a
    transfer to a personal account while using the At Cell name, is a fraudster.
    Payment happens at the counter only. If you are unsure, do not transfer
    anything yet: ask at the counter or contact the official number listed on
    this site to verify.

Empat penggantian, empat baris. Tidak ada test yang mengunci string ini, jadi
tidak ada test yang perlu diperbarui.

Apa yang diperbaiki oleh quartet ini:

1. Subjek kalimat pertama dibalik dari toko ke penipu, jadi peringatannya
   menunjuk pelaku dan bukan menyatakan kemampuan toko.
2. Kalimat "Pembayaran hanya di konter" tidak lagi disusul instruksi yang
   mengarahkan pelanggan menyiapkan transfer lewat chat. Nomor resmi tetap
   disebut, tapi hanya sebagai tempat memverifikasi, sesuai Bukti 2.
3. Nomor resmi disebut di kedua bahasa dan di keempat string, jadi tidak ada
   lagi versi yang menjadikan nomor resmi sebagai jalan pembayaran.

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
2. Opsi A versi lama masih memuat instruksi yang sudah benar secara makna
   ("konfirmasi dulu") tetapi salah secara kanal: ia menyuruh menyiapkan
   transfer yang belum tentu bisa dibayar, padahal transfer hanya terjadi
   setelah rekening toko diinfokan di konter. Quartet baru memindahkan
   instruksi itu ke tempat yang benar, yaitu konfirmasi sebelum transfer,
   bukan transfer karena chat.

---

## Cara menyetujui

Balas di `docs/README.md` bagian "Keputusan produk (2 Oktober 2026)", bullet
Note D, salah satu dari:

    - Note D, ... Lanjutannya di PAYMENT-WARNING-COPY.md.
      Copy diubah sesuai PAYMENT-WARNING-COPY.md opsi A.   <-- atau: opsi B

Implementasinya lalu hanya mengganti empat string di dua berkas. Tidak ada
migration, tidak ada perubahan perilaku, tidak ada test baru.