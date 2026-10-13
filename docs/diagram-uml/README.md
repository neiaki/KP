# Diagram UML At Cell

Folder ini menampung diagram UML (Unified Modeling Language) At Cell.
Satu diagram satu berkas sumber PlantUML. Render PNG dan SVG di-commit
bersama sumbernya karena GitHub tidak me-render `.puml`.
`sequence-diagram-atcell.md` di folder ini merangkum lima sequence
diagram plus alasan tiap keputusan yang digambar.

## Aturan isi

- Satu diagram satu sumber PlantUML, dinamai sesuai prosesnya.
- Setiap sumber `.puml` wajib disertai render `.png` dan `.svg`
  dengan stem yang sama, supaya tidak ada gambar menggantung.
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

Satu perintah me-render semuanya (butuh `plantuml` dan Java):

```sh
plantuml -checkonly docs/diagram-uml/*.puml
plantuml -tpng docs/diagram-uml/activity-*.puml docs/diagram-uml/state-*.puml docs/diagram-uml/concept-*.puml
plantuml -tsvg docs/diagram-uml/activity-*.puml docs/diagram-uml/state-*.puml docs/diagram-uml/concept-*.puml
plantuml -tpng --output-dir docs/diagram-uml/sequence docs/diagram-uml/sequence-*.puml
plantuml -tsvg --output-dir docs/diagram-uml/sequence docs/diagram-uml/sequence-*.puml
```

Penulis me-render sebelum mengirim perubahan. Kegagalan sintaks
tidak terlihat tanpa render, jadi cek di atas adalah compile step.

## Indeks diagram

| Diagram | Sumber | Render | Status | Jangkar kode |
|---|---|---|---|---|
| Pengunjung membuka web dan memakai layanan publik | `sequence-pengunjung.puml` | `sequence/` `.png` `.svg` | OK | `src/app/(public)/[locale]`, `src/lib/shop.ts` |
| Pelanggan masuk dan melihat faktur miliknya | `sequence-pelanggan.puml` | `sequence/` `.png` `.svg` | OK | `src/app/(portal)/portal/account`, `src/lib/actions/service.ts` |
| Sales masuk lalu jual, daftar unit, dan buat tiket | `sequence-sales.puml` | `sequence/` `.png` `.svg` | OK | `src/app/(portal)/portal/pos`, `src/app/(portal)/portal/inventory`, `src/lib/store-demo.ts` |
| Teknisi masuk lalu kerjakan tiket servis | `sequence-teknisi.puml` | `sequence/` `.png` `.svg` | OK | `src/app/(portal)/portal/service`, `src/lib/validations.ts` |
| Admin masuk lalu kelola toko dan pantau bisnis | `sequence-admin.puml` | `sequence/` `.png` `.svg` | OK | `src/app/(portal)/portal/dashboard`, `src/app/(portal)/portal/products`, `src/app/(portal)/portal/staff`, `src/app/(portal)/portal/settings`, `src/app/(portal)/portal/reports` |
| Penjualan kasir dengan tukar tambah opsional | `activity-penjualan-kasir.puml` | `.png` `.svg` | OK | `src/app/(portal)/portal/pos`, `src/lib/store-demo.ts` |
| Status tiket servis dan perpindahannya | `state-tiket-servis.puml` | `.png` `.svg` | OK | `REPAIR_FLOW` di `src/lib/validations.ts` |
| Status unit inventaris dan perpindahannya | `state-status-unit.puml` | `.png` `.svg` | OK | `demoUpdateUnitStatus` di `src/lib/store-demo.ts`, pemicu `trg_prevent_sold_reactivation` di migrasi |
| Objek bisnis At Cell dan relasinya | `concept-domain.puml` | `.png` `.svg` | OK | Skema `products`, `inventory_units`, `transactions`, `transaction_items`, `trade_in_records`, `service_tickets`, `store_settings`, `profiles` di `src/db/schema.ts` dan migrasi |

Render tertunda: tidak ada.
