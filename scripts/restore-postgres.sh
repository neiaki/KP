#!/usr/bin/env bash
# Restore ke database sementara. Script ini destruktif dan harus diaktifkan
# secara eksplisit melalui ALLOW_RESTORE=YES.
set -Eeuo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL wajib diisi}"
: "${DUMP_FILE:?DUMP_FILE wajib diisi}"

if [[ "${ALLOW_RESTORE:-}" != "YES" ]]; then
  echo "Restore dibatalkan. Set ALLOW_RESTORE=YES hanya untuk restore target sementara." >&2
  exit 2
fi

if [[ ! -f "$DUMP_FILE" ]]; then
  echo "File dump tidak ditemukan: $DUMP_FILE" >&2
  exit 1
fi

command -v pg_restore >/dev/null 2>&1 || {
  echo "pg_restore tidak tersedia di environment ini." >&2
  exit 1
}

pg_restore --list "$DUMP_FILE" >/dev/null
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --jobs=1 \
  --single-transaction \
  --exit-on-error \
  --dbname="$RESTORE_DATABASE_URL" \
  "$DUMP_FILE"

printf 'Restore selesai: %s\n' "$(basename "$DUMP_FILE")"
printf 'Lakukan smoke test RLS, migration, dan health sebelum target dianggap siap.\n'
