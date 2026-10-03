# Kebijakan Keamanan

At Cell adalah toko di Paku Jaya, Serpong Utara. Repo ini memuat
kode aplikasi etalase beserta portal stafnya.

Repo ini saat ini **publik**, jadi isi serta riwayat gitnya bisa dibaca
siapa saja tanpa login. Repo ini direncanakan diubah menjadi
private. Bagian di bawah menjelaskan kenapa privatisasi tidak
menghapus apa pun yang sudah bocor sebelumnya.


## Melaporkan kerentanan

Jangan membuka issue publik untuk melaporkan kerentanan.

Pakai **Report a vulnerability** di tab Security repository ini.
GitHub membukanya sebagai private advisory, jadi isinya hanya
terlihat oleh pemilik repo. Opsi itu aktif di repo ini.

Kalau tombolnya tidak bisa dipakai, tunggu sampai bisa dipakai
lagi lalu kirim lewat sana. Jangan membuka issue publik
untuk kerentanan, bahkan dengan judul `[privat]`: selama issue itu
ada, isinya sudah terlihat siapa saja, notifikasi sudah terkirim,
dan penghapusan belakangan tidak membatalkan yang sudah terlihat.

## Isi laporan yang membantu

- Lokasi berkas dan baris, atau route yang dipanggil
- Langkah reproduksi dari keadaan awal yang bersih
- Dampak nyata, bukan sekadar kemungkinan teoritis
- Data contoh yang memang tidak pernah dipakai di produksi,
  kalau bagian yang bermasalah butuh data nyata

Jangan sertakan kunci, token, atau data pelanggan sungguhan.
Kalau laporan memuat rahasia yang bocor, ganti dengan nilai
palsu yang bentuknya sama.

## Apa yang terjadi selanjutnya

Ini toko kecil yang dikelola sendiri, tanpa tim keamanan dan
tanpa program reward. Balasan diberikan di luar jam kerja, dan
tidak ada jaminan waktu perbaikan.

Laporan yang valid akan diberi kredit di commit yang terlihat, supaya
orang lain tidak mengulanginya. Kredit itu ditulis setelah perbaikannya
tiba, bukan saat laporan diterima: detail kerentanan yang belum
diperbaiki tidak pernah ditulis lebih dulu di tempat yang bisa dibaca
publik. Kalau perbaikannya mengubah cara deploy, perubahan itu juga
dicatat di dokumentasi.

## Di luar cakupan

- Kerentanan pada dependensi yang sudah dilaporkan ke basis data
  advisory dan tidak terjangkau jalur kodenya sendiri
- Temuan dari pemindaian otomatis tanpa langkah reproduksi
- Serangan pada server produksi yang butuh akses lebih dulu
- Perubahan pada `docs/` yang hanya bersifat kosmetik

## Yang sudah dijaga

Repo ini punya penjaga otomatis yang gagal kalau aturan dilanggar:

- `tests/no-secret-in-repo.test.ts` menolak IP publik, token
  kunci, dan URL yang menyisipkan kredensial
- `tests/no-sensitive-files.test.ts` menolak berkas sensitif
  berdasarkan **namanya**, bukan isinya: dump database, kunci
  release, sertifikat, env selain `.env.example`, dan log
- `tests/product-scope.test.ts` menolak kata produk di luar fokus
  ponsel

Dua guard pertama saling menutupi. Yang satu membaca isi file yang
sudah ter-track, jadi menangkap nilai yang salah tempel. Yang satu
lagi membaca nama file, jadi menangkap dump dan kunci yang isinya
tidak akan pernah aman dibaca.

GitHub secret scanning dan push protection juga aktif di repo ini.

## Privatisasi dan risikonya

Repo ini direncanakan diubah dari publik menjadi private. Itu benar secara
umum, tapi tidak menyelesaikan satu hal yang sudah terjadi, jadi risikonya
harus diketahui sebelum privatisasi dianggap selesai.

### Apa yang privatisasi tidak lakukan

**Menyembunyikan riwayat lama.** GitHub tidak pernah menghapus halaman
commit dan `.patch` untuk commit yang pernah ada di repo publik, dan
kedua-duanya sudah terindeks mesin pencari. Commit yang menghapus IP owner
dari dokumen, misalnya `36af9e9`, tidak membuat commit sebelumnya yang
memuat IP itu ikut terhapus. Mengambilnya butuh satu URL, tanpa
login, selama repo masih publik.
Setelah privatisasi, halaman lama yang terlanjur ter-cache masih terbuka
untuk siapa pun yang menyimpannya.

**Mencabut akses ke orang yang sudah menyalin.** Setiap orang yang sudah
`git clone`, atau yang punya fork, atau yang punya mirror di tempat lain,
tetap punya objeknya. Privatisasi hanya menutup pintu yang belum dibuka.

**Menghapus muatan.** Commit yang sudah ada tidak bisa diedit. Perbaikannya
selalu berupa commit baru, dan commit baru tidak mengubah apa yang ditulis
commit lama.

### Apa yang privatisasi lakukan

- Menutup akses baca dan tulis untuk orang yang belum punya akses
- Menghentikan notifikasi dan watch yang mengirim commit baru ke pihak ketiga
- Memperkecil permukaan untuk alat otomatis yang memindai repo publik

### Yang harus dilakukan terpisah, kalau IP tidak bisa diganti

Kalau IP VPS tidak bisa diganti, pengaruhnya nyata dan perlu diterima
secara sadar. Dua hal yang bisa dilakukan tanpa mengganti IP:

1. **Pastikan `ignoreip` fail2ban masih berisi IP egress operator.** Kalau IP
   diganti, nilai ini harus diperbarui di jail yang aktif, kalau tidak IP baru
   ikut kena ban sendiri.
2. **Perlakukan IP itu sebagai tidak rahasia dari sekarang.** Jangan
   menulisnya di dokumen, commit, screenshot, atau pesan. Penulisan IP di repo
   ini sudah bocor sekali, jadi penjaga yang memindai isi repo harus tetap
   ada walau repo sudah private: privatisasi bukan alasan berhenti menyimpan
   hal yang tidak perlu ditulis.

Penjaga yang sekarang: `tests/no-secret-in-repo.test.ts` untuk isi,
`tests/no-sensitive-files.test.ts` untuk nama berkas.

### Kalau nanti IP diganti

- Perbarui `ignoreip` fail2ban di host, lalu `systemctl reload fail2ban`
- Perbarui variabel `ADMIN_IP` di penjaga Docker
- Ubah FQDN Coolify kalau memakai pola `sslip.io`, karena IP itu ikut
  terkunci di nama host
