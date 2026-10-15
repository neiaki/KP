# Diagram UML At Cell

Folder ini menampung diagram UML (Unified Modeling Language) At Cell.
Satu diagram satu berkas sumber PlantUML. Render PNG dan SVG di-commit
di folder yang sama dengan sumbernya karena GitHub tidak me-render
`.puml`. `sequence-diagram-atcell.md` di folder ini merangkum lima
sequence diagram plus alasan tiap keputusan yang digambar.

## Tata folder

- `pengunjung/`, `pelanggan/`, `sales/`, `teknisi/`, `admin/`:
  paket diagram per aktor. Tiap folder aktor memuat use case,
  sequence, dan activity aktor tersebut plus render PNG dan SVG.
  Folder `sales/` juga memuat dua activity proses kasir dan
  registrasi IMEI, folder `teknisi/` memuat activity proses servis.
- `bersama/`: diagram lintas aktor (dua state machine, class,
  object, component, concept, dan skema database) plus rendernya.
- `sequence-diagram-atcell.md`: rangkuman lima sequence per aktor.
- `style-atcell.iuml`: sumber kanonik gaya enterprise.

## Aturan isi

- Satu diagram satu sumber PlantUML, dinamai sesuai prosesnya.
- Setiap sumber `.puml` wajib disertai render `.png` dan `.svg`
  dengan stem yang sama, supaya tidak ada gambar menggantung.
- Gaya enterprise bersama dikelola di `style-atcell.iuml` sebagai sumber
  kanonik, lalu disalin inline ke tiap `.puml` agar mandiri di server
  publik (server tidak bisa membaca include lokal). Ubah gaya di file
  kanonik lalu salin ulang agar seragam, jangan edit tempelan per berkas.
- Pesan diagram memakai bahasa domain, bukan nama fungsi atau method.
  Judul menamai prosesnya, bukan fasenya.
- Jalur gagal digambar bila perilakunya beda (IMEI invalid, stok berubah
  saat checkout, tiket tidak ketemu, RLS menolak, admin terakhir).
- Perubahan alur wajib satu paket: prose, sumber diagram, baris indeks
  ini, dan render yang di-commit. Render basi dihapus di perubahan yang
  sama, bukan dibiarkan menyesatkan.
- Jangan menautkan berkas yang sudah dihapus. Catatan historis boleh
  menyebut nama berkas lama, tapi tautan Markdown harus menunjuk
  berkas yang ada.

## Perintah render

Satu perintah me-render semuanya (butuh `plantuml` dan Java).
Sumber dan render tinggal sekamar, jadi tidak perlu `--output-dir`:

```sh
plantuml -checkonly docs/diagram-uml/*.puml docs/diagram-uml/*/*.puml
plantuml -tpng docs/diagram-uml/bersama/*.puml
plantuml -tsvg docs/diagram-uml/bersama/*.puml
for d in pengunjung pelanggan sales teknisi admin; do
  plantuml -tpng docs/diagram-uml/$d/*.puml
  plantuml -tsvg docs/diagram-uml/$d/*.puml
done
```

Penulis me-render sebelum mengirim perubahan. Kegagalan sintaks
tidak terlihat tanpa render, jadi cek di atas adalah compile step.
Catatan: `--output-dir` wajib absolut (pakai `$PWD/` seperti di atas).
Path relatif diam-diam ditulis relatif terhadap folder sumber
dan menghasilkan duplikat nyasar.

Penulis me-render sebelum mengirim perubahan. Kegagalan sintaks
tidak terlihat tanpa render, jadi cek di atas adalah compile step.

## Indeks diagram

| Diagram | Sumber | Render | Status | Jangkar kode |
|---|---|---|---|---|
| Pengunjung membuka web dan memakai layanan publik | `pengunjung/sequence-pengunjung.puml` | `pengunjung/` `.png` `.svg` | OK | `src/app/(public)/[locale]`, `src/lib/shop.ts` |
| Pelanggan masuk dan melihat faktur miliknya | `pelanggan/sequence-pelanggan.puml` | `pelanggan/` `.png` `.svg` | OK | `src/app/(portal)/portal/account`, `src/lib/actions/service.ts` |
| Sales masuk lalu jual, daftar unit, dan buat tiket | `sales/sequence-sales.puml` | `sales/` `.png` `.svg` | OK | `src/app/(portal)/portal/pos`, `src/app/(portal)/portal/inventory`, `src/lib/store-demo.ts` |
| Teknisi masuk lalu kerjakan tiket servis | `teknisi/sequence-teknisi.puml` | `teknisi/` `.png` `.svg` | OK | `src/app/(portal)/portal/service`, `src/lib/validations.ts` |
| Admin masuk lalu kelola toko dan pantau bisnis | `admin/sequence-admin.puml` | `admin/` `.png` `.svg` | OK | `src/app/(portal)/portal/dashboard`, `src/app/(portal)/portal/products`, `src/app/(portal)/portal/staff`, `src/app/(portal)/portal/settings`, `src/app/(portal)/portal/reports` |
| Pakai layanan publik tanpa login | `pengunjung/activity-pengunjung.puml` | `pengunjung/` `.png` `.svg` | OK | `src/app/(public)/[locale]`, `src/lib/shop.ts` |
| Lihat faktur dan garansi milik sendiri | `pelanggan/activity-pelanggan.puml` | `pelanggan/` `.png` `.svg` | OK | `src/app/(portal)/portal/account` |
| Kasir, inventaris, dan tiket servis | `sales/activity-sales.puml` | `sales/` `.png` `.svg` | OK | `src/app/(portal)/portal/pos`, `src/app/(portal)/portal/inventory` |
| Meja servis dari masuk sampai serah terima | `teknisi/activity-teknisi.puml` | `teknisi/` `.png` `.svg` | OK | `src/app/(portal)/portal/service`, `isAllowedTransition` di `src/lib/validations.ts` |
| Kelola toko dan pantau bisnis | `admin/activity-admin.puml` | `admin/` `.png` `.svg` | OK | `src/app/(portal)/portal/dashboard`, `src/app/(portal)/portal/products`, `src/app/(portal)/portal/staff`, `src/app/(portal)/portal/settings`, `src/app/(portal)/portal/reports` |
| Penjualan kasir dengan tukar tambah opsional | `sales/activity-penjualan-kasir.puml` | `sales/` `.png` `.svg` | OK | `src/app/(portal)/portal/pos`, `src/lib/store-demo.ts` |
| Kerjakan tiket servis sampai selesai | `teknisi/activity-servis-tiket.puml` | `teknisi/` `.png` `.svg` | OK | `src/app/(portal)/portal/service`, `isAllowedTransition` di `src/lib/validations.ts` |
| Daftarkan unit batch IMEI | `sales/activity-registrasi-imei.puml` | `sales/` `.png` `.svg` | OK | `src/app/(portal)/portal/inventory`, `demoUpdateUnitStatus` di `src/lib/store-demo.ts` |
| Status tiket servis dan perpindahannya | `bersama/state-tiket-servis.puml` | `bersama/` `.png` `.svg` | OK | `REPAIR_FLOW` di `src/lib/validations.ts` |
| Status unit inventaris dan perpindahannya | `bersama/state-status-unit.puml` | `bersama/` `.png` `.svg` | OK | `demoUpdateUnitStatus` di `src/lib/store-demo.ts`, pemicu `trg_prevent_sold_reactivation` di migrasi |
| Objek bisnis At Cell dan relasinya | `bersama/concept-domain.puml` | `bersama/` `.png` `.svg` | OK | Skema `products`, `inventory_units`, `transactions`, `transaction_items`, `trade_in_records`, `service_tickets`, `store_settings`, `profiles` di `src/db/schema.ts` dan migrasi |
| Apa yang bisa dilakukan Pengunjung | `pengunjung/usecase-pengunjung.puml` | `pengunjung/` `.png` `.svg` | OK | Kemampuan Pengunjung di `docs/UC-AtCell.md` |
| Apa yang bisa dilakukan Pelanggan | `pelanggan/usecase-pelanggan.puml` | `pelanggan/` `.png` `.svg` | OK | Kemampuan Pelanggan di `docs/UC-AtCell.md` |
| Apa yang bisa dilakukan Sales | `sales/usecase-sales.puml` | `sales/` `.png` `.svg` | OK | Kemampuan Sales di `docs/UC-AtCell.md` |
| Apa yang bisa dilakukan Teknisi | `teknisi/usecase-teknisi.puml` | `teknisi/` `.png` `.svg` | OK | Kemampuan Teknisi di `docs/UC-AtCell.md` |
| Apa yang bisa dilakukan Admin | `admin/usecase-admin.puml` | `admin/` `.png` `.svg` | OK | Kemampuan Admin di `docs/UC-AtCell.md` |
| Use case sisi publik (Pengunjung dan Pelanggan) | `bersama/usecase-sisi-publik.puml` | `bersama/` `.png` `.svg` | OK | Gabungan `pengunjung/usecase-pengunjung.puml` dan `pelanggan/usecase-pelanggan.puml` |
| Use case sisi portal staf (Sales, Teknisi, Admin) | `bersama/usecase-sisi-portal.puml` | `bersama/` `.png` `.svg` | OK | Gabungan `sales/usecase-sales.puml`, `teknisi/usecase-teknisi.puml`, dan `admin/usecase-admin.puml` |
| Kelas domain At Cell | `bersama/class-domain.puml` | `bersama/` `.png` `.svg` | OK | Interface di `src/types/index.ts`, operasi mengikuti fungsi store dan Server Actions |
| Potret satu penjualan dengan tukar tambah | `bersama/object-contoh-jual.puml` | `bersama/` `.png` `.svg` | OK | Nilai contoh ilustrasi, struktur mengikuti `src/types/index.ts` |
| Modul besar At Cell dan ketergantungannya | `bersama/component-arsitektur.puml` | `bersama/` `.png` `.svg` | OK | Struktur `src/app`, `src/proxy.ts`, `src/lib/actions`, Supabase |
| Skema database At Cell | `bersama/er-database.puml` | `bersama/` `.png` `.svg` | OK | `supabase/migrations/0001_atcell_schema.sql`, `0007_audit_trail.sql`, `20260927130000_product_image_registry.sql`, `src/db/schema.ts` |

Render tertunda: tidak ada.
