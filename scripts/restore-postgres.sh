#!/usr/bin/env bash
# Restore ke database sementara. Script ini destruktif: pg_restore --clean
# menjatuhkan lalu membangun ulang seluruh schema pada target.
#
# Untuk dump Supabase, jalankan scripts/restore-target-bootstrap.sql lebih dulu.
#
# Lapisan pengaman, semuanya harus terpenuhi sebelum ada satu baris SQL pun
# yang jalan:
#
# 1. BASH_VERSION. Script ini memakai construct khusus bash ([[ ]] dan
#    ${var//[[:space:]]/}), sama seperti scripts/backup-postgres.sh. Tanpa
#    guard ini, dijalankan lewat sh/dash, script berhenti dengan pesan miliknya
#    sendiri yang tidak menunjuk ke penyebabnya.
# 2. ALLOW_RESTORE=YES. Tidak lagi cukup sendiri, tapi tetap syarat pertama.
# 3. Host target harus loopback, atau dinyatakan di RESTORE_ALLOWED_HOSTS.
#    Host produksi ditolak tanpa syarat apa pun dan tanpa flag untuk
#    membukanya: produksi adalah sumber dump, bukan target restore.
# 4. Konfirmasi interaktif yang menyebut host dan database target persis, atau
#    RESTORE_ASSUME_YES=1 untuk drill terjadwal tanpa interaksi. Lewat jalur
#    ini, guard 3 tetap berlaku.
# 5. RESTORE_DRY_RUN=1 menjalankan seluruh guard, mencetak target dan perintah
#    yang akan dijalankan, lalu berhenti tanpa membuka koneksi.
#
# Yang tidak bisa dilompati: daftar host produksi dan daftar host target.
# Yang bisa dilompati hanya prompt, lewat RESTORE_ASSUME_YES=1.
#
# Sisa risiko yang jujur: alamat IP produksi yang ditulis manual ke
# RESTORE_DATABASE_URL tanpa nama hostnya tidak bisa dibedakan dari IP mana
# pun. Itulah sebabnya konfirmasi di guard 4 tetap wajib di jalur interaktif.

# Guard ini harus mendahului set -Eeuo pipefail. Pada /bin/sh berupa dash,
# opsi pipefail ditolak dan sh keluar dengan pesan miliknya sendiri, jadi
# pesan yang sampai ke operator bukan milik script ini. Pola yang sama dipakai
# scripts/backup-postgres.sh.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi

set -Eeuo pipefail
umask 077

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL wajib diisi}"
: "${DUMP_FILE:?DUMP_FILE wajib diisi}"

if [[ "${ALLOW_RESTORE:-}" != "YES" ]]; then
  echo "Restore dibatalkan. Set ALLOW_RESTORE=YES hanya untuk restore target sementara." >&2
  exit 2
fi

# --------------------------------------------------------------------------
# Baca host dan nama database dari URL.
#
# URL tidak pernah dicetak, dan kredensial di dalamnya tidak pernah disimpan
# ke variabel: bagian sebelum '@' langsung dibuang. Yang dipakai ke bawah hanya
# host dan nama database, karena itu yang harus dilihat manusia sebelum
# database dihapus isinya. Password wajib di-percent-encode di dalam URL, jadi
# pembuangan di '@' pertama selalu benar.
# --------------------------------------------------------------------------
tanpa_kredensial="${RESTORE_DATABASE_URL#*://}"
tanpa_kredensial="${tanpa_kredensial##*@}"
tanpa_opsi="${tanpa_kredensial%%\?*}"

if [[ "$tanpa_opsi" == */* ]]; then
  otoritas="${tanpa_opsi%%/*}"
  TARGET_DATABASE="${tanpa_opsi#*/}"
else
  otoritas="$tanpa_opsi"
  TARGET_DATABASE=""
fi

# Host IPv6 ditulis sebagai [::1]:5432, jadi kurung siku diambil lebih dulu.
if [[ "$otoritas" == \[*\]* ]]; then
  TARGET_HOST="${otoritas%%\]*}"
  TARGET_HOST="${TARGET_HOST#\[}"
elif [[ "$otoritas" == *:* ]]; then
  TARGET_HOST="${otoritas%%:*}"
else
  TARGET_HOST="$otoritas"
fi

if [[ -z "$TARGET_HOST" || -z "$TARGET_DATABASE" ]]; then
  echo "RESTORE_DATABASE_URL harus lengkap dengan host dan nama database." >&2
  exit 1
fi

# --------------------------------------------------------------------------
# Guard 3a: host produksi, ditolak tanpa syarat apa pun.
#
# Daftar di bawah adalah penanda domain yang dipakai Supabase dan domain
# toko. Dalam produksi, nama host itulah yang selalu muncul di
# DATABASE_URL, jadi memblokirnya menutup jalur yang paling mungkin dipakai
# tidak sengaja. Dilakukan SEBELUM daftar izin, sehingga operator yang keliru
# menulis host produksi ke RESTORE_ALLOWED_HOSTS tetap tidak bisa melewatinya.
# --------------------------------------------------------------------------
host_kecil="${TARGET_HOST,,}"
host_produksi=0
for penanda in supabase.co supabase.com atcell.my.id; do
  if [[ "$host_kecil" == "$penanda" || "$host_kecil" == *".$penanda" ]]; then
    host_produksi=1
  fi
done

if [ "$host_produksi" -eq 1 ]; then
  printf 'Restore dibatalkan. Target %s adalah host produksi At Cell.\n' "$TARGET_HOST" >&2
  echo "Produksi adalah sumber dump, bukan target restore, jadi tidak ada flag yang membukanya." >&2
  exit 3
fi

# --------------------------------------------------------------------------
# Guard 3b: host target harus lokal atau dinyatakan.
#
# Loopback dibiarkan tanpa daftar karena drill resmi memakai container
# PostgreSQL sekali pakai di host yang sama, jadi jalur yang paling sering
# dipakai tidak boleh butuh flag tambahan.
#
# Host non-lokal harus disebut di RESTORE_ALLOWED_HOSTS. Arah guardnya
# positif, bukan negatif, karena target restore yang sah di Coolify punya nama
# internal yang hanya operator yang tahu, sedangkan menyalahartikan URL
# produksi adalah kegagalan yang menghapus data.
# --------------------------------------------------------------------------
host_diizinkan=0
case "$host_kecil" in
  localhost | 127.0.0.1 | ::1 | "[::1]") host_diizinkan=1 ;;
esac
for diizinkan in ${RESTORE_ALLOWED_HOSTS:-}; do
  if [[ "$host_kecil" == "${diizinkan,,}" || "$host_kecil" == *.${diizinkan,,} ]]; then
    host_diizinkan=1
  fi
done

if [ "$host_diizinkan" -ne 1 ]; then
  printf 'Restore dibatalkan. Host target %s tidak lokal dan tidak diizinkan.\n' "$TARGET_HOST" >&2
  echo "Tambahkan hostnya ke RESTORE_ALLOWED_HOSTS kalau ini memang restore target resmi." >&2
  exit 3
fi

# --------------------------------------------------------------------------
# Guard 4: konfirmasi yang menyebut target persis.
#
# Prompt ditulis ke /dev/tty, bukan ke stdout, supaya tidak pernah ikut ke
# dalam log tanpa disadari operator. Keberadaan terminal diperiksa dengan
# mencoba membukanya, bukan dengan permission bit: di lingkungan tanpa
# controlling terminal, /dev/tty ada dan terbaca tapi membukanya gagal dengan
# ENXIO, dan itu harus jadi penolakan yang rapi, bukan error dari shell.
# RESTORE_ASSUME_YES=1 melewatkan prompt untuk drill terjadwal, tanpa
# melewatkan guard 3.
#
# RESTORE_DRY_RUN=1 juga melewatkan prompt, dan itu benar: dry run tidak
# mengubah apa pun, jadi tidak ada yang perlu dikonfirmasi. Guard 3 tetap
# berlaku di dry run, sehingga dry run tidak pernah bisa jadi jalan
# daftar host hanya karena tidak ada interaksi.
# --------------------------------------------------------------------------
if [ "${RESTORE_ASSUME_YES:-0}" != "1" ] && [ "${RESTORE_DRY_RUN:-0}" != "1" ]; then
  if ! (: <>/dev/tty) 2>/dev/null; then
    echo "Restore dibatalkan: tidak ada terminal untuk konfirmasi. Set RESTORE_ASSUME_YES=1 untuk run tanpa interaksi." >&2
    exit 4
  fi
  {
    printf '\n  Restore berikut menghapus dan membangun ulang SELURUH schema pada:\n'
    printf '    host      : %s\n' "$TARGET_HOST"
    printf '    database  : %s\n' "$TARGET_DATABASE"
    printf '    dump      : %s\n' "$(basename "$DUMP_FILE")"
    printf '\n  Ketik nama database di atas untuk melanjutkan: '
  } >/dev/tty
  konfirmasi=""
  read -r konfirmasi </dev/tty
  if [ "$konfirmasi" != "$TARGET_DATABASE" ]; then
    echo "Restore dibatalkan: konfirmasi tidak cocok dengan nama database target." >&2
    exit 4
  fi
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

# --------------------------------------------------------------------------
# Guard 5: dry run. Seluruh pemeriksaan di atas sudah lewat, jadi dry run
# berguna untuk membuktikan targetnya benar sebelum ada yang dihapus. Tidak ada
# koneksi ke database yang dibuat di jalur ini.
# --------------------------------------------------------------------------
if [ "${RESTORE_DRY_RUN:-0}" = "1" ]; then
  printf 'DRY RUN. Tidak ada database yang disentuh.\n'
  printf '  host     : %s\n' "$TARGET_HOST"
  printf '  database : %s\n' "$TARGET_DATABASE"
  printf '  dump     : %s\n' "$(basename "$DUMP_FILE")"
  printf '  perintah : pg_restore --clean --if-exists --no-owner --no-privileges'
  printf ' --jobs=1 --single-transaction --exit-on-error --dbname=<RESTORE_DATABASE_URL> %s\n' "$(basename "$DUMP_FILE")"
  exit 0
fi

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

# Ubah satu nilai dari dump menjadi literal SQL yang aman.
#
# Id di dalam dump adalah DATA, bukan kode. Sebelum nilai ini di-escape, satu id
# yang memuat kutip tunggal sudah cukup untuk menutup literal dan menyuntik
# statement lain ke dalam berkas stub. Kutip tunggal dilipat ganda, dan baris
# baru ditolak karena berkas ini satu statement per baris.
sql_literal() {
  local nilai="$1"
  case "$nilai" in
    *$'\n'* | *$'\r'*)
      echo "Id profil di dump mengandung baris baru; dump tidak bisa dipakai." >&2
      return 1
      ;;
  esac
  printf "'%s'" "${nilai//\'/\'\'}"
}

seed_auth_stubs() {
  local ids_file stub_sql count id_literal
  ids_file="$(mktemp)"
  stub_sql="$(mktemp)"

  # Catatan soal awk di bawah. Dulu program ini `exit` begitu kena penanda
  # akhir blok COPY, sementara script berjalan dengan set -o pipefail. Saat awk
  # keluar lebih dulu, pipe-nya ditutup, lalu pg_restore yang masih menulis
  # trailer dump menerima SIGPIPE dan seluruh pipeline mati dengan kode 141,
  # walau restore-nya sendiri tidak salah. Pola yang sama menimpa guard
  # auth.users di bawah. Perbaikannya bukan mematikan pipefail, tapi membuat
  # konsumen menelan semua input sampai producer selesai: setelah penanda akhir
  # distro, awk tetap lanjut membaca tapi berhenti mencetak.
  pg_restore --data-only -t profiles -f - "$DUMP_FILE" \
    | awk -F'\t' '
        /^COPY public\.profiles / { inside = 1; next }
        inside && /^\\\.$/ { selesai = 1; next }
        inside && selesai { next }
        inside && NF { print $1 }
      ' \
    | sort -u >"$ids_file"

  count="$(wc -l <"$ids_file" | tr -d ' ')"
  if [ "$count" -eq 0 ]; then
    rm -f -- "$ids_file" "$stub_sql"
    echo "Tidak ada baris public.profiles di dump; lewati stub auth."
    return 0
  fi

  {
    echo "begin;"
    while read -r id; do
      [ -n "$id" ] || continue
      if ! id_literal="$(sql_literal "$id")"; then
        rm -f -- "$ids_file" "$stub_sql"
        return 1
      fi
      printf "insert into auth.users (id, email, raw_user_meta_data) values (%s, 'restore-stub-' || %s || '@invalid.local', '{\"atcell_restore_stub\":true}'::jsonb) on conflict (id) do nothing;\n" \
        "$id_literal" "$id_literal"
    done <"$ids_file"
    echo "commit;"
  } >"$stub_sql"

  psql "$RESTORE_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$stub_sql" >/dev/null
  rm -f -- "$ids_file" "$stub_sql"

  printf 'Stub auth.users dibuat: %s baris (account asli belum ikut di dump).\n' "$count"
}

# Guard ini pernah melaporkan "auth.users tidak ada di target" padahal tabelnya
# ada. Penyebabnya bukan koneksi: output psql dulu dialirkan ke `grep -q` yang
# langsung keluar begitu nemu t, jadi psql menerima SIGPIPE dan pipefail
# mengubah status pipeline jadi 141. Kalau db benar-benar tidak ada atau psql
# gagal, errornya pun hilang karena stderr dibuang ke /dev/null, jadi dua
# kegagalan itu terlihat sama. Di sini tidak ada pipeline sama sekali: keluaran
# psql ditahan di variabel lalu diperiksa, dan stderr disimpan supaya kegagalan
# asli ikut terbawa ke pesan error.
#
# -A itu wajib: tanpa flag itu psql mencetak " t" dengan spasi di depan, dan
# perbandingan string lalu salah menilai. Spasi dan baris baru tetap
# dibuang lagi di bawah supaya format keluaran psql tidak menggigit.
auth_probe=""
if ! auth_probe="$(psql "$RESTORE_DATABASE_URL" -q -t -A \
      -c "select to_regclass('auth.users') is not null" 2>&1)"; then
  printf 'Gagal memeriksa auth.users di target: %s\n' "$auth_probe" >&2
  exit 1
fi
auth_probe="${auth_probe//[[:space:]]/}"

if [ "$auth_probe" = "t" ]; then
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
