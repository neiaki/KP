#!/usr/bin/env bash
# Drill restore: dump terbaru -> database sekali pakai -> verifikasi -> hapus.
#
# Runbook ini sudah lama menjanjikan restore test ("Backup yang belum pernah
# di-restore belum bisa disebut cadangan"), tapi tidak pernah dijadwalkan, jadi
# tidak pernah terjadi. Script ini menjadikannya kejadian yang berulang dan
# bisa gagal: setiap dump yang di-backup akan diuji, bukan hanya dump yang
# kebetulan sedang ada ketika ada orang yang remembering.
#
# Yang dijaga keras di script ini:
#
# 1. Target drill DIBUAT script ini, bukan database yang sudah ada. Container
#    drill memakai --network none, jadi satu-satunya antarmuka yang hidup di
#    dalamnya adalah loopback miliknya sendiri. Standby tidak punya port host,
#    dan tidak ada satu pun container lain yang bisa menjangkau drill ini.
# 2. Tidak ada credential di mana pun. Container drill memakai
#    POSTGRES_HOST_AUTH_METHOD=trust dan tidak punya password sama sekali,
#    serta tidak ada port yang dipublikasikan. Yang direstore adalah data
#    produksi ke container sekali pakai, jadi tidak ada rahasia yang perlu
#    dibuat hanya untuk membuangnya lagi.
# 3. Standby dan produksi tidak pernah jadi target. Verifikasi hanya memakai
#    docker exec ke container milik drill ini.
# 4. Kebersihan. Container dibuang apa pun yang terjadi lewat trap EXIT, jadi
#    drill yang gagal di tengah tidak meninggalkan PostgreSQL hidup di host.
#
# Exit 0 berarti dump terbaru benar-benar bisa dipulihkan DAN hasilnya punya
# akun auth asli. Exit bukan-nol berarti salah satu dari itu tidak benar, dan
# cron mencatat GAGAL.
#
# Script ini memakai construct khusus bash: [[ ]], ${var//.../}, dan perbandingan
# string. Jalankan dengan bash.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi
set -Eeuo pipefail
umask 077

DUMP_DIR="${DUMP_DIR:-/data/backups/atcell}"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
DRILL_CONTAINER="${DRILL_CONTAINER:-atcell-restore-drill}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

log()  { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "GAGAL: $*"; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker tidak tersedia; drill restore butuh container PostgreSQL sekali pakai"

berhasil=0
gagal=0
container_id=""

buang() {
  if [ -n "$container_id" ]; then
    docker rm -f "$container_id" >/dev/null 2>&1 || true
  fi
}
trap buang EXIT

cek_lulus() {
  # $1 = nama pemeriksaan, $2 = nilai terukur, $3 = syarat ("t", "0", "+0")
  lokal_nilai="$2"
  lokal_syarat="$3"
  lokal_lulus=0
  case "$lokal_syarat" in
    t)  [ "$lokal_nilai" = "t" ] && lokal_lulus=1 ;;
    0)  [ "$lokal_nilai" -eq 0 ] 2>/dev/null && lokal_lulus=1 ;;
    +0) [ "$lokal_nilai" -gt 0 ] 2>/dev/null && lokal_lulus=1 ;;
    *)  [ "$lokal_nilai" = "$lokal_syarat" ] && lokal_lulus=1 ;;
  esac
  if [ "$lokal_lulus" -eq 1 ]; then
    printf '  OK    %-32s %s\n' "$1" "$lokal_nilai"
    berhasil=$((berhasil + 1))
  else
    printf '  GAGAL %-32s %s (harus: %s)\n' "$1" "$lokal_nilai" "$lokal_syarat"
    gagal=$((gagal + 1))
  fi
}

# --------------------------------------------------------------------------
# 1. Pilih dump terbaru dan buktikan bahwa file itu utuh.
# --------------------------------------------------------------------------
[ -d "$DUMP_DIR" ] || fail "direktori dump tidak ada: $DUMP_DIR"

# Dipilih lewat perbandingan waktu modifikasi di dalam loop, bukan lewat
# `ls -1t | head -n1`. head keluar setelah satu baris sementara ls masih
# menulis, jadi ls bisa menerima SIGPIPE dan pipefail mengubah seluruh
# pemilihan dump jadi gagal tepat saat direktori backup mulai banyak isinya.
paling_baru=""
for kandidat in "${DUMP_DIR}"/atcell-*.dump; do
  [ -f "$kandidat" ] || continue
  if [ -z "$paling_baru" ] || [ "$kandidat" -nt "$paling_baru" ]; then
    paling_baru="$kandidat"
  fi
done
[ -n "$paling_baru" ] || fail "tidak ada dump atcell-*.dump di $DUMP_DIR"

DUMP="$paling_baru"
DUMP_BASENAME="$(basename "$DUMP")"
DUMP_UMUR_HARI=$(( ( $(date -u +%s) - $(stat -c %Y "$DUMP") ) / 86400 ))
log "Drill restore mulai. Dump: $DUMP_BASENAME (umur ${DUMP_UMUR_HARI} hari)"

[ -f "${DUMP}.sha256" ] || fail "checksum ${DUMP_BASENAME}.sha256 tidak ada. Dump tidak bisa dibuktikan utuh."
# Checksum ditulis dengan nama relatif, jadi harus dicek dari dalam direktori
# tempat dump diletakkan.
if ! (cd "$DUMP_DIR" && sha256sum -c --status "${DUMP_BASENAME}.sha256"); then
  fail "checksum ${DUMP_BASENAME}.sha256 tidak cocok. Dump korup; salinan off-site juga tidak akan menolong."
fi
log "Checksum dump cocok."

if [ "$DUMP_UMUR_HARI" -gt 2 ]; then
  log "PERINGATAN: dump terbaru berumur ${DUMP_UMUR_HARI} hari. Backup harian mungkin berhenti sejak tanggal itu."
fi

# --------------------------------------------------------------------------
# 2. Siapkan container sekali pakai.
# --------------------------------------------------------------------------
# Sisa drill dari run sebelumnya boleh ada kalau run sebelumnya mati mendadak.
# Namanya milik script ini, jadi membuangnya aman; yang bukan milik script ini
# tidak pernah ikut tersentuh karena pencocokan nama memakai jangkar penuh.
if [ -n "$(docker ps -a --filter "name=^/${DRILL_CONTAINER}$" -q)" ]; then
  log "Membuang sisa drill dari run sebelumnya: $DRILL_CONTAINER"
  docker rm -f "$DRILL_CONTAINER" >/dev/null
fi

# --network none: tidak ada jalur ke host mana pun, termasuk ke produksi dan ke
# standby. Postgres tetap bisa dipakai lewat loopback di dalam container.
docker run --detach \
  --name "$DRILL_CONTAINER" \
  --network none \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=postgres \
  --volume "${SCRIPTS_DIR}:/scripts:ro" \
  --volume "${DUMP_DIR}:/backup:ro" \
  "$PG_IMAGE" >/dev/null || fail "gagal menjalankan container drill dari $PG_IMAGE"

container_id="$(docker ps -a --filter "name=^/${DRILL_CONTAINER}$" --format '{{.ID}}' | head -n1)"
[ -n "$container_id" ] || fail "container drill tidak terlihat setelah dijalankan"

# Bukti bahwa drill ini tidak terjangkau dari luar: tidak ada port yang
# dipublikasikan.
POR="$(docker port "$container_id" 2>/dev/null | tr -d '[:space:]' || true)"
cek_lulus "port drill tidak dipublikasikan" "${POR:-tidak-ada}" "tidak-ada"

siap=0
for _ in $(seq 1 60); do
  if docker exec "$container_id" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    siap=1
    break
  fi
  sleep 1
done
if [ "$siap" -ne 1 ]; then
  docker logs "$container_id" 2>&1 | tail -20
  fail "PostgreSQL drill tidak siap dalam 60 detik"
fi
log "Container drill siap."

# --------------------------------------------------------------------------
# 3. Bootstrap lalu restore, keduanya di dalam container drill.
# --------------------------------------------------------------------------
DSN="postgresql://postgres@127.0.0.1:5432/postgres"

docker exec -i "$container_id" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 \
  -f - < "${SCRIPTS_DIR}/restore-target-bootstrap.sql" >/dev/null \
  || fail "restore-target-bootstrap.sql gagal"

log "Bootstrap target selesai. Restore mulai (destructive ke container drill)."

docker exec \
  --env ALLOW_RESTORE=YES \
  --env RESTORE_ASSUME_YES=1 \
  --env RESTORE_DATABASE_URL="$DSN" \
  --env DUMP_FILE="/backup/${DUMP_BASENAME}" \
  "$container_id" \
  bash /scripts/restore-postgres.sh 2>&1 | sed 's/^/  restore: /' \
  || fail "restore-postgres.sh keluar bukan-nol"

# --------------------------------------------------------------------------
# 4. Verifikasi hasil restore.
#
# Dua di antaranya yang paling menentukan: etalase tidak boleh kosong, dan
# target harus punya akun auth ASLI. Memeriksa kelengkapan stub tidak akan
# pernah menangkap apa pun, karena kondisi "setiap profil punya baris
# auth.users" juga terpenuhi oleh database yang isinya 100% akun sintetis.
# --------------------------------------------------------------------------
q() {
  docker exec "$container_id" psql -U postgres -d postgres -X -q -t -A -c "$1" 2>/dev/null | tr -d '[:space:]'
}

cek_lulus "tabel wajib public ada" \
  "$(q "select to_regclass('public.profiles') is not null and to_regclass('public.products') is not null and to_regclass('public.inventory_units') is not null and to_regclass('public.service_tickets') is not null and to_regclass('public.transactions') is not null and to_regclass('public.store_settings') is not null")" \
  "t"

cek_lulus "etalase v_public_inventory" "$(q 'select count(*) from v_public_inventory')" "+0"

# Kolomnya 'rowsecurity', satu kata. 'row_security' adalah nama GUC, bukan
# nama kolom, dan menulis yang salah membuat psql gagal: keluarannya kosong, cek
#lolos karena nilai kosong bukan '0', dan drill gagal dengan alasan yang keliru.
cek_lulus "tabel public tanpa RLS" \
  "$(q "select count(*) from pg_tables where schemaname = 'public' and not rowsecurity")" \
  "0"

cek_lulus "profil tanpa akun auth" \
  "$(q 'select count(*) from public.profiles p left join auth.users u on u.id = p.id where u.id is null')" \
  "0"

auth_asli="$(q "select count(*) from auth.users where coalesce(raw_user_meta_data->>'atcell_restore_stub','') <> 'true'")"
cek_lulus "akun auth asli (bukan stub)" "$auth_asli" "+0"

auth_total="$(q 'select count(*) from auth.users')"
auth_identitas="$(q 'select count(*) from auth.identities')"
log "Auth di hasil restore: ${auth_total} baris auth.users, ${auth_asli} akun asli, ${auth_identitas} baris auth.identities."

# --------------------------------------------------------------------------
# 5. Tutup container. Ini juga terjadi otomatis lewat trap kalau drill gagal
#    di tengah jalan.
# --------------------------------------------------------------------------
docker rm -f "$container_id" >/dev/null || fail "container drill tidak bisa dibuang"
container_id=""
log "Container drill dibuang."

if [ "$gagal" -ne 0 ]; then
  fail "${gagal} dari $((berhasil + gagal)) pemeriksaan drill gagal pada ${DUMP_BASENAME}."
fi

log "Drill restore LULUS pada ${DUMP_BASENAME}: ${berhasil} pemeriksaan, akun auth asli ${auth_asli}, container drill sudah dibuang."