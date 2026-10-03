#!/usr/bin/env bash
# Dump logis At Cell tanpa mencetak URL/password database.
#
# Skema yang ikut: public, private, dan auth. auth ikut karena account staf
# ADA di database yang sama dengan data bisnis: public.profiles mereferensi
# auth.users(id). Dump yang hanya memuat public dan private menghasilkan
# restore target tempat tidak ada satu pun orang yang bisa login. Kerugiannya
# tidak terlihat dari sisi restore: FK tetap terpenuhi karena auth.users diisi
# stub, jadi restore hijau lalu database meyakinkan dipakai orang yang sebenarnya
# tidak ada di dalamnya. Karena itu isi dump diperiksa setelah pg_dump selesai
# dan dump tanpa auth diperlakukan sebagai kegagalan, bukan sukses setengah jadi.
#
# Storage TIDAK ikut. Bucket foto produk, foto servis, dan foto trade-in masih
# hanya dicadangkan oleh layanan Supabase, jadi bentuk celahnya sama dengan
# yang auth punya sebelum 3 Oktober 2026. Script ini tidak menutup celah itu.
#
# Script ini memakai construct khusus bash: opsi 'set -E' dan 'set -o pipefail',
# serta process substitution 'done < <(find ...)' pada blok rotasi di bawah.
# Keduanya tidak dijamin ada di /bin/sh. Pada image postgres berbasis Debian,
# /bin/sh adalah dash: 'set -o pipefail' ditolak dan blok rotasi mati dengan
# "Syntax error: redirection unexpected", sehingga dump lama diam-diam tidak
# pernah dihapus sementara wrapper tetap melaporkan 'pg_dump gagal' padahal
# dump sudah berhasil dibuat. Guard di bawah menghentikan script dengan pesan
# yang jelas, bukan membiarkan rotasi mati tanpa suara.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi
set -Eeuo pipefail
umask 077

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL wajib diisi}"
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"

# pg_restore bukan lagi sanity check opsional: dialah yang membuktikan bahwa
# auth benar-benar masuk ke dump. Kalau tool ini tidak ada, pemeriksaannya
# mustahil dijalankan, jadi ketiadaannya menggagalkan backup di awal daripada
# membiarkan backup_withoutauth lewat tanpa suara.
command -v pg_restore >/dev/null 2>&1 || {
  echo "pg_restore tidak tersedia. Tanpa pg_restore isi dump tidak bisa dibuktikan dan auth bisa hilang tanpa suara." >&2
  exit 1
}

# Berapa lama dump lama dibuang. 0 berarti tidak pernah dihapus, jadi yang
# memakai KEEP_DAYS=0 harus menyimpan salinannya di luar (misalnya rsync ke
# tempat lain). Tanpa rotasi, direktori backup tumbuh tanpa batas sampai disk
# penuh, dan disk penuh adalah tempat terakhir yang boleh menyimpan cadangan.
KEEP_DAYS="${KEEP_DAYS:-14}"
case "$KEEP_DAYS" in
  ''|*[!0-9]*|-*)
    echo "KEEP_DAYS harus bilangan bulat non-negatif, bukan '${KEEP_DAYS}'." >&2
    exit 1
    ;;
esac

command -v pg_dump >/dev/null 2>&1 || {
  echo "pg_dump tidak tersedia. Jalankan script ini di environment yang memiliki PostgreSQL client." >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_name="atcell-${timestamp}.dump"
dump_path="${BACKUP_DIR}/${dump_name}"
temporary_path="$(mktemp "${BACKUP_DIR}/.${dump_name}.XXXXXX")"

cleanup() {
  rm -f -- "$temporary_path"
}
trap cleanup EXIT

toc_daftar=""
pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --schema=private \
  --schema=auth \
  --file="$temporary_path" \
  "$SOURCE_DATABASE_URL"

chmod 600 "$temporary_path"

# Daftar isi arsip diambil ke variabel, bukan dialirkan ke 'grep -q'. Pola itu
# sudah pernah menyakitkan scripts/restore-postgres.sh: grep -q keluar begitu
# menemukan satu baris, sementara pg_restore yang masih menulis trailer dump
# menerima SIGPIPE, lalu pipefail mengubah status seluruh pipeline jadi 141
# walau restore-nya sendiri tidak salah.
if ! toc_daftar="$(pg_restore --list "$temporary_path" 2>&1)"; then
  echo "pg_restore --list gagal pada dump yang baru dibuat: $toc_daftar" >&2
  exit 1
fi

# Bentuk baris arsip custom: "<oid>; 0 <oid> TABLE DATA <skema> <tabel> <pemilik>".
# Pencocokan dibatasi ke dua kata penuh supaya tabel bernama mirip, misalnya
# 'auth users_backup', tidak ikut dianggap sebagai auth.users.
#
# Dump dan checksum TETAP ditulis ke direktori backup lebih dulu, baru
# pemeriksaan ini dijalankan. Dump tanpa auth masih berguna untuk memulihkan
# data bisnis, dan lebih baik ada daripada tidak ada sama sekali; yang dilakukan
# script ini adalah menolak menyebutnya sukses, bukan membuangnya.
mv -- "$temporary_path" "$dump_path"
# Checksum ditulis dari dalam BACKUP_DIR dan dengan nama relatif, bukan path
# absolut. sha256sum mencatat argumen yang diberikan apa adanya, jadi path yang
# tersimpan di dalam berkas checksum sama dengan tempat dump dibuat. Pada
# Coolify path itu /backup/... di dalam container sekali pakai, sehingga tidak
# pernah ada di mesin tujuan dan "sha256sum -c" selalu gagal, baik di VPS
# maupun di lokasi off-site. Nama relatif membuat dump dan berkas checksum
# pindah bersama dan bisa dicek di mana pun keduanya diletakkan.
(cd "$BACKUP_DIR" && sha256sum "$dump_name" > "${dump_name}.sha256")
chmod 600 "${dump_path}.sha256"

# Status disimpan dulu, skrip tidak keluar di titik ini. Dump tanpa auth tetap
# ditulis ke disk, dan justru pada malam backupnya rusak direktori backup paling
# rawan penuh: rotasi yang dilewati membuat masalah yang sama menumpuk tiap
# malam tanpa henti, dan disk penuh adalah tempat terakhir yang boleh menyimpan
# cadangan. Rotasi dijalankan lebih dulu, baru status ini dikembalikan di akhir.
auth_lengkap=1
if [[ ! "$toc_daftar" =~ (^|[[:space:]])TABLE[[:space:]]+DATA[[:space:]]+auth[[:space:]]+users([[:space:]]|$) ]]; then
  auth_lengkap=0
  {
    printf 'GAGAL: %s sudah ditulis, tapi TIDAK memuat data auth.users.\n' "$dump_name"
    echo "Skema auth tidak ikut ter-backup, jadi restore target berikutnya tidak akan punya akun staf yang bisa login."
    echo "Periksa --schema=auth pada perintah pg_dump di scripts/backup-postgres.sh."
  } >&2
fi

# Garis sukses hanya dicetak kalau dump-nya lengkap. Melihat 'Backup selesai'
# pada dump yang tidak punya auth sama persis dengan hijau keliru yang GAP 5
# minta ditutup, jadi stdout tidak boleh memuatnya di jalur ini.
if [ "$auth_lengkap" -eq 1 ]; then
  printf 'Backup selesai: %s (%s bytes)\n' "$dump_name" "$(stat -c '%s' "$dump_path")"
  printf 'Checksum: %s.sha256\n' "$dump_name"
  printf 'Auth ikut ter-backup: %s entri data auth dalam dump ini.\n' \
    "$(printf '%s\n' "$toc_daftar" | grep -cE '(^|[[:space:]])TABLE[[:space:]]+DATA[[:space:]]+auth[[:space:]]')"
fi

if [ "$KEEP_DAYS" -gt 0 ]; then
  # Hanya nama yang cocok pola milik script ini yang disentuh, supaya direktori
  # backup yang juga menyimpan file lain tidak ikut terhapus.
  removed=0
  while IFS= read -r stale; do
    [ -n "$stale" ] || continue
    rm -f -- "$stale" "$stale.sha256"
    printf 'Dihapus karena lewat %s hari: %s\n' "$KEEP_DAYS" "$(basename "$stale")"
    removed=$((removed + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'atcell-*.dump' -mtime "+$KEEP_DAYS" -print)
  [ "$removed" -eq 0 ] || printf 'Total %s dump lama dihapus.\n' "$removed"
fi

# Status disimpan dikembalikan setelah rotasi selesai. 70 dipakai supaya 'dump
# jadi tapi isinya tidak lengkap' bisa dibedakan dari 'pg_dump gagal' oleh
# pemanggil, dan supaya offsite sync serta watchdog bisa menandai backup ini
# gagal dan tidak ikut disalin ke lokasi lain.
if [ "$auth_lengkap" -ne 1 ]; then
  printf 'Rotasi dump lama tetap dijalankan meski dump ini tidak lengkap, supaya direktori backup tidak terus menumpuk.\n' >&2
  exit 70
fi
