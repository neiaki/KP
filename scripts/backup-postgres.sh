#!/usr/bin/env bash
# Dump logis At Cell tanpa mencetak URL/password database.
# Backup Auth dan Storage dikelola oleh layanan Supabase secara terpisah.
set -Eeuo pipefail
umask 077

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL wajib diisi}"
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"

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

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --schema=private \
  --file="$temporary_path" \
  "$SOURCE_DATABASE_URL"

chmod 600 "$temporary_path"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$temporary_path" >/dev/null
fi

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

printf 'Backup selesai: %s (%s bytes)\n' "$dump_name" "$(stat -c '%s' "$dump_path")"
printf 'Checksum: %s.sha256\n' "$dump_name"

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
