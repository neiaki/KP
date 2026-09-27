#!/usr/bin/env bash
# Restore ke database sementara. Script ini destruktif dan harus diaktifkan
# secara eksplisit melalui ALLOW_RESTORE=YES.
# Untuk dump Supabase, jalankan scripts/restore-target-bootstrap.sql lebih dulu.
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

command -v psql >/dev/null 2>&1 || {
  echo "psql tidak tersedia di environment ini." >&2
  exit 1
}

pg_restore --list "$DUMP_FILE" >/dev/null

# Dump ini sengaja hanya mencakup schema public dan private, jadi tabel
# auth.users tidak ikut di dalamnya. Auth dikelola Supabase sebagai backup
# terpisah. Masalahnya, public.profiles punya FK ke auth.users(id), sehingga
# restore ke target yang auth.users-nya kosong selalu berhenti di
# profiles_id_fkey dan seluruh transaksi dibatalkan karena --single-transaction.
#
# Jadi sebelum restore, auth.users diisi stub untuk setiap id yang dipakai
# profiles. Stub memakai domain .invalid supaya jelas bukan akun sungguhan:
# account asli baru ada setelah backup Auth Supabase diterapkan di atas target.
# Baris stub memakai on conflict do nothing, jadi restore ke target yang
# sudah punya Auth asli tidak merusak apa pun.
seed_auth_stubs() {
  local ids_file stub_sql
  ids_file="$(mktemp)"
  trap 'rm -f -- "$ids_file"' RETURN

  pg_restore --data-only -t profiles -f - "$DUMP_FILE" \
    | awk -F'\t' '
        /^COPY public\.profiles / { inside = 1; next }
        inside && /^\\\.$/ { exit }
        inside && NF { print $1 }
      ' \
    | sort -u >"$ids_file"

  if [[ ! -s "$ids_file" ]]; then
    echo "Tidak ada baris public.profiles di dump; lewati stub auth."
    return 0
  fi

  stub_sql="$(mktemp)"
  {
    echo "begin;"
    while read -r id; do
      [[ -n "$id" ]] || continue
      printf "insert into auth.users (id, email, raw_user_meta_data) values ('%s', 'restore-stub-%s@invalid.local', '{\"atcell_restore_stub\":true}'::jsonb) on conflict (id) do nothing;\n" \
        "$id" "$id"
    done <"$ids_file"
    echo "commit;"
  } >"$stub_sql"

  psql "$RESTORE_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$stub_sql" >/dev/null
  rm -f -- "$stub_sql"

  printf 'Stub auth.users dibuat: %s baris (account asli belum ikut di dump).\n' "$(wc -l <"$ids_file")"
}

if psql "$RESTORE_DATABASE_URL" -q -t -c "select to_regclass('auth.users') is not null" 2>/dev/null | grep -q t; then
  seed_auth_stubs
else
  echo "auth.users tidak ada di target. Jalankan scripts/restore-target-bootstrap.sql lebih dulu." >&2
  exit 1
fi

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
printf 'Stub auth.users hanya placeholder. Terapkan backup Auth Supabase sebelum target dipakai sungguhan.\n'
printf 'Lakukan smoke test RLS, migration, dan health sebelum target dianggap siap.\n'
