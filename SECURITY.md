# Kebijakan Keamanan

At Cell adalah toko di Paku Jaya, Serpong Utara. Repo ini memuat
kode aplikasi etalase beserta portal stafnya, dan repo ini publik,
jadi isi serta riwayat gitnya bisa dibaca siapa saja tanpa login.

## Melaporkan kerentanan

Jangan membuka issue publik untuk melaporkan kerentanan.

Pakai **Report a vulnerability** di tab Security repository ini.
GitHub membukanya sebagai private advisory, jadi isinya hanya
terlihat oleh pemilik repo. Opsi itu aktif di repo ini.

Kalau tombolnya tidak bisa dipakai, kirim lewat Issues dengan
judul berawalan `[privat]` dan isi detailnya seminimal mungkin.
Laporan seperti itu akan segera dihapus dari publik setelah dibaca.
Jalur ini cadangan, bukan jalur utama.

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

Laporan yang valid akan dicatat di commit yang terlihat, supaya
orang lain tidak mengulanginya. Kalau perbaikannya mengubah cara
deploy, perubahan itu juga dicatat di dokumentasi.

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
- `tests/product-scope.test.ts` menolak kata produk di luar fokus
  ponsel

GitHub secret scanning dan push protection juga aktif di repo ini.
