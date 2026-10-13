# Diagram UML At Cell

Folder ini menampung diagram UML (Unified Modeling Language) At Cell.
Acuan alur tetap daftar use case di bagian 2 `UC-AtCell.md` dan
diagram Mermaid inline di bagian 3 berkas itu.

## Aturan isi

- Satu diagram satu sumber, misal `use-case.puml` atau `activity-pos.mmd`.
- Setiap sumber `.puml` atau `.mmd` wajib disertai render `.png` dan `.svg`
  dengan stem yang sama, supaya tautan gambar tidak rusak.
- Tulis nama model, status, dan tanggal render di deskripsi tiap diagram.
- Jangan menautkan berkas yang sudah dihapus. Catatan historis boleh
  menyebut nama berkas lama, tapi tautan Markdown harus menunjuk
  berkas yang ada.

## Rencana isi

- `sequence-diagram-atcell.md` : lima sequence diagram per aktor yang sudah
  diverifikasi ke `src/proxy.ts`, `src/lib/access.ts`, dan halaman portal.
- `use-case.png` / `use-case.svg` : ringkasan aktor dan use case utama.
- `activity-*.png` / `activity-*.svg` : alur POS, servis, dan trade-in.
- `sequence-*.png` / `sequence-*.svg` : interaksi antar modul.
- `class.png` / `class.svg` : struktur data produk, unit, tiket, dan transaksi.
