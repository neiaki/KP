#!/usr/bin/env bash
# Drill arsip Storage terbaru tanpa menyentuh jaringan.
#
# Backup yang belum pernah dibuka belum bisa disebut cadangan. Drill ini
# memilih atcell-storage-*.tar.enc terbaru, memverifikasi checksum,
# mendekripsi, lalu memeriksa manifest serta SHA-256 setiap objek lewat
# restore-storage.sh mode verifikasi. Tidak ada URL atau key yang dibutuhkan,
# dan tidak ada objek yang diunggah.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi
set -Eeuo pipefail
umask 077

ARSIP_DIR="${STORAGE_BACKUP_DIR:-${BACKUP_DIR:-/data/backups/atcell}}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

log()  { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { printf '%s GAGAL: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

[ -d "$ARSIP_DIR" ] || fail "direktori arsip Storage tidak ada: $ARSIP_DIR"

terbaru=""
for kandidat in "${ARSIP_DIR}"/atcell-storage-*.tar.enc; do
  [ -f "$kandidat" ] || continue
  if [ -z "$terbaru" ] || [ "$kandidat" -nt "$terbaru" ]; then
    terbaru="$kandidat"
  fi
done
[ -n "$terbaru" ] || fail "tidak ada atcell-storage-*.tar.enc di $ARSIP_DIR"

nama="$(basename "$terbaru")"
[ -f "${terbaru}.sha256" ] || fail "checksum ${nama}.sha256 tidak ada"
umur=$(( ( $(date -u +%s) - $(stat -c %Y "$terbaru") ) / 86400 ))
log "Drill Storage mulai. Arsip: $nama (umur ${umur} hari)"
if [ "$umur" -gt 2 ]; then
  log "PERINGATAN: arsip Storage terbaru berumur ${umur} hari. Backup harian mungkin berhenti."
fi

log "Menjalankan verifikasi arsip (tanpa upload)."
if STORAGE_ARCHIVE="$terbaru" bash "${SCRIPTS_DIR}/restore-storage.sh"; then
  log "Drill Storage LULUS pada ${nama}: checksum, manifest, dan hash objek cocok."
else
  fail "Drill Storage gagal pada ${nama}."
fi
