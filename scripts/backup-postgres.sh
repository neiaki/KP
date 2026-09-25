#!/usr/bin/env bash
# Dump logis At Cell tanpa mencetak URL/password database.
set -Eeuo pipefail
umask 077

: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL wajib diisi}"
: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"

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
  --file="$temporary_path" \
  "$SOURCE_DATABASE_URL"

chmod 600 "$temporary_path"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$temporary_path" >/dev/null
fi

mv -- "$temporary_path" "$dump_path"
sha256sum "$dump_path" > "${dump_path}.sha256"
chmod 600 "${dump_path}.sha256"

printf 'Backup selesai: %s (%s bytes)\n' "$dump_name" "$(stat -c '%s' "$dump_path")"
printf 'Checksum: %s.sha256\n' "$dump_name"
