#!/usr/bin/env bash
# Salinan off-host terenkripsi untuk dump At Cell.
#
# Standby di VPS yang sama melindungi dari kerusakan data, tapi tidak dari
# kehilangan VPS itu sendiri. Script ini menutup celah itu: dump terbaru
# dienkripsi lalu dikirim keluar host. Tanpa ini, seluruh cadangan hidup
# dan mati di tempat yang sama dengan aplikasinya.
#
# Urutan: pilih dump terbaru -> verifikasi checksum -> enkripsi ->
# upload -> verifikasi sisi jauh (bila didukung) -> rotasi lokal salinan
# terenkripsi. Dump asli di BACKUP_DIR tidak disentuh sama sekali.
#
# Kapan script ini diam saja (exit 0): saat OFFSITE_* belum dikonfigurasi.
# Cron harian tetap terpasang supaya tidak ada langkah manual yang
# terlupakan, dan log mencatat "belum dikonfigurasi" alih-alih gagal.
# Kegagalan yang sebenarnya (enkripsi gagal, upload gagal, checksum jauh
# beda) selalu exit bukan-nol supaya cron terdengar.
#
# Script ini memakai construct khusus bash, sama seperti backup-postgres.sh.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi
set -Eeuo pipefail
umask 077

: "${BACKUP_DIR:?BACKUP_DIR wajib diisi}"

command -v openssl >/dev/null 2>&1 || {
  echo "openssl tidak tersedia." >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  echo "sha256sum tidak tersedia." >&2
  exit 1
}

# Passphrase tidak pernah lewat argumen (terlihat di ps) dan tidak pernah
# dicetak. Dua cara mengisi, file lebih utama karena tidak tersimpan di
# environment turunannya saat cron mengeksekusi perintah lain.
passphrase=""
if [ -n "${OFFSITE_PASSPHRASE_FILE:-}" ]; then
  [ -r "$OFFSITE_PASSPHRASE_FILE" ] || {
    echo "OFFSITE_PASSPHRASE_FILE tidak bisa dibaca." >&2
    exit 1
  }
  passphrase="$(cat -- "$OFFSITE_PASSPHRASE_FILE")"
elif [ -n "${OFFSITE_PASSPHRASE:-}" ]; then
  passphrase="$OFFSITE_PASSPHRASE"
fi

if [ -z "$passphrase" ]; then
  echo "OFFSITE belum dikonfigurasi (passphrase kosong), lewati tanpa gagal."
  exit 0
fi

# Dump terbaru milik backup-postgres.sh. Pola nama dikunci supaya file lain
# di direktori yang sama tidak ikut terkirim.
terbaru="$(ls -1t "${BACKUP_DIR}"/atcell-*.dump 2>/dev/null | head -n 1 || true)"
if [ -z "$terbaru" ]; then
  echo "Tidak ada dump di $BACKUP_DIR, lewati tanpa gagal."
  exit 0
fi
dasar="$(basename "$terbaru")"

# Verifikasi checksum lokal dulu: tidak ada gunanya mengenkripsi dan
# mengupload dump yang rusak, dan kegagalan di sini berarti backup harian
# yang bermasalah, bukan script ini.
if [ -f "${terbaru}.sha256" ]; then
  (cd "$BACKUP_DIR" && sha256sum -c "${dasar}.sha256") || {
    echo "Checksum lokal ${dasar} tidak cocok, batalkan sebelum upload." >&2
    exit 1
  }
fi

keluar_dir="${OFFSITE_STAGING_DIR:-${BACKUP_DIR}/.offsite}"
mkdir -p "$keluar_dir"
sementara="$(mktemp "${keluar_dir}/.${dasar}.XXXXXX.enc")"
cleanup() {
  rm -f -- "$sementara"
}
trap cleanup EXIT

# AES-256-CBC dengan PBKDF2 dan salt acak per berkas. -pbkdf2 wajib:
# tanpa itu openssl memakai EVP_BytesToKey satu iterasi yang bisa
# di-bruteforce GPU dalam hitungan jam untuk passphrase pendek.
printf '%s' "$passphrase" |
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in "$terbaru" -out "$sementara" -pass stdin
passphrase=""
chmod 600 "$sementara"

nama_enc="${dasar}.enc"
(cd "$keluar_dir" && sha256sum "$(basename "$sementara")" > "${nama_enc}.sha256")
chmod 600 "${keluar_dir}/${nama_enc}.sha256"
mv -- "$sementara" "${keluar_dir}/${nama_enc}"
trap - EXIT

terkirim=0
# Jalur 1: rclone, untuk S3/R2/Drive dan puluhan backend lain. Remote-nya
# dikonfigurasi sekali di luar script (rclone config), jadi script ini tidak
# pernah memegang access key dalam bentuk apa pun.
if [ -n "${OFFSITE_RCLONE_REMOTE:-}" ]; then
  command -v rclone >/dev/null 2>&1 || {
    echo "OFFSITE_RCLONE_REMOTE diisi tapi rclone tidak terpasang." >&2
    exit 1
  }
  rclone copyto --checksum "${keluar_dir}/${nama_enc}" "${OFFSITE_RCLONE_REMOTE}/${nama_enc}"
  rclone copyto --checksum "${keluar_dir}/${nama_enc}.sha256" "${OFFSITE_RCLONE_REMOTE}/${nama_enc}.sha256"
  terkirim=1
fi

# Jalur 2: HTTP PUT polos, untuk endpoint yang menerima upload dengan bearer
# token di header (misalnya worker kecil atau layanan sejenis). Token dibaca
# dari file 0600, bukan dari argumen, dengan alasan yang sama seperti
# passphrase di atas.
if [ -n "${OFFSITE_PUT_URL:-}" ]; then
  command -v curl >/dev/null 2>&1 || {
    echo "OFFSITE_PUT_URL diisi tapi curl tidak terpasang." >&2
    exit 1
  }
  token=""
  if [ -n "${OFFSITE_PUT_TOKEN_FILE:-}" ] && [ -r "$OFFSITE_PUT_TOKEN_FILE" ]; then
    token="$(cat -- "$OFFSITE_PUT_TOKEN_FILE")"
  elif [ -n "${OFFSITE_PUT_TOKEN:-}" ]; then
    token="$OFFSITE_PUT_TOKEN"
  fi
  [ -n "$token" ] || {
    echo "OFFSITE_PUT_URL diisi tapi token kosong." >&2
    exit 1
  }
  curl --fail --show-error --silent \
    --upload-file "${keluar_dir}/${nama_enc}" \
    -H "Authorization: Bearer ${token}" \
    "${OFFSITE_PUT_URL}/${nama_enc}"
  token=""
  terkirim=1
fi

if [ "$terkirim" -eq 0 ]; then
  echo "Berkas terenkripsi siap di ${keluar_dir}/${nama_enc}, tapi tidak ada tujuan upload (OFFSITE_RCLONE_REMOTE dan OFFSITE_PUT_URL kosong). Enkripsi lokal sudah benar; isi salah satu tujuan untuk mengaktifkan kiriman."
  exit 0
fi

# Rotasi salinan terenkripsi lokal: yang lama tidak ada gunanya setelah yang
# baru terkirim, karena restore selalu memakai versi terbaru. Default 3,
# bukan 14 seperti dump lokal: salinan ini hanya cadangan pengiriman, bukan
# arsip.
simpan="${OFFSITE_KEEP_ENCRYPTED:-3}"
case "$simpan" in
  ''|*[!0-9]*|-*) simpan=3 ;;
esac
if [ "$simpan" -gt 0 ]; then
  dihapus=0
  while IFS= read -r lama; do
    [ -n "$lama" ] || continue
    rm -f -- "$lama" "$lama.sha256"
    dihapus=$((dihapus + 1))
  done < <(ls -1t "${keluar_dir}"/atcell-*.dump.enc 2>/dev/null | tail -n "+$((simpan + 1))")
  [ "$dihapus" -eq 0 ] || printf 'Salinan terenkripsi lama dihapus: %s berkas.\n' "$dihapus"
fi

printf 'Off-site selesai: %s terkirim terenkripsi.\n' "$nama_enc"
