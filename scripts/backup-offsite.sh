#!/usr/bin/env bash
# Salinan off-host terenkripsi untuk dump At Cell.
#
# Standby di VPS yang sama melindungi dari kerusakan data, tapi tidak dari
# kehilangan VPS itu sendiri. Script ini menutup celah itu: dump terbaru
# dienkripsi lalu dikirim keluar host. Tanpa ini, seluruh cadangan hidup
# dan mati di tempat yang sama dengan aplikasinya.
#
# Urutan: pilih dump terbaru -> verifikasi checksum -> pastikan arsip benar-benar
# terbaca dan memuat auth -> enkripsi -> upload -> verifikasi sisi jauh (bila
# didukung) -> rotasi lokal salinan terenkripsi. Dump asli di BACKUP_DIR tidak
# disentuh sama sekali.
#
# Perilaku saat OFFSITE_* belum dikonfigurasi: script KELUAR BUKAN-NOL.
# Versi lama keluar 0 sambil menulis "lewati tanpa gagal", sehingga cron
# melaporkan berhasil setiap malam padahal tidak ada satu pun byte yang
# dienkripsi dan tidak ada yang dikirim. Cadangan yang diam-diam tidak jalan
# lebih berbahaya daripada tidak ada, karena ia menciptakan rasa aman yang
# palsu. Kegagalan yang sebenarnya (enkripsi gagal, upload gagal, checksum
# jauh beda) tetap keluar bukan-nol.
#
# Karena itu tidak ada lagi jalur keluar 0 yang berarti "tidak melakukan
# apa-apa" di script ini. Exit 0 berarti off-host copy benar-benar ada.
#
# Yang tetap dijaga: tanpa passphrase script berhenti sebelum mengenkripsi,
# jadi tidak pernah ada upload dalam keadaan terbuka.
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
# pg_restore dipakai untuk membuktikan arsip benar-benar bisa dibaca dan memuat
# data auth. Tanpa tool ini pemeriksaan itu mustahil dijalankan, jadi
# ketiadaannya menggagalkan off-site di awal daripada mengirim arsip yang isinya
# hanya dijamin oleh checksum.
command -v pg_restore >/dev/null 2>&1 || {
  echo "pg_restore tidak tersedia. Tanpa pg_restore isi arsip tidak bisa dibuktikan." >&2
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
  # Jalur ini dulu keluar 0. Tiga malam berturut-turut log berbunyi
  # "lewati tanpa gagal" sementara tidak ada file .enc yang pernah dibuat.
  # Sekarang jadi kegagalan yang terdengar.
  # Yang disebut di sini sengaja hanya bentuk _FILE: test penjaga rahasia
  # menolak echo yang menyebut passphrase telanjang, dan pesan ini tidak
  # perlu melintasinya untuk tetap jelas.
  echo "GAGAL: OFFSITE belum dikonfigurasi: tidak ada passphrase yang tersedia (OFFSITE_PASSPHRASE_FILE kosong atau tidak terbaca)." >&2
  echo "GAGAL: tidak ada satu pun byte yang dienkripsi dan tidak ada yang dikirim. Job ini gagal, bukan dilewati." >&2
  exit 1
fi

# Dump terbaru milik backup-postgres.sh. Pola nama dikunci supaya file lain
# di direktori yang sama tidak ikut terkirim.
terbaru="$(ls -1t "${BACKUP_DIR}"/atcell-*.dump 2>/dev/null | head -n 1 || true)"
if [ -z "$terbaru" ]; then
  # Sama seperti di atas: backup yang tidak terjadi tidak boleh keluar 0.
  echo "GAGAL: tidak ada dump di $BACKUP_DIR, jadi tidak ada yang bisa dikirim off-site." >&2
  exit 1
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

# Checksum hanya membuktikan berkas tidak berubah sejak ditulis, bukan bahwa
# isinya masih bisa dibaca atau punya apa yang dibutuhkan restore. Dua-duanya
# dicek di sini, sebelum enkripsi dan upload, karena dump rusak yang terkirim
# ke off-site memberi rasa aman semu: salinannya ada di dua tempat, tapi tidak
# bisa dipakai memulihkan login.
#
# Keluaran pg_restore ditahan di variabel lalu diperiksa, bukan dialirkan ke
# grep yang langsung keluar begitu nemu baris. Pola itu membuat pg_restore
# menerima SIGPIPE dan pipefail mengubah kegagalan nyata jadi 141, persis
# seperti yang pernah terjadi di guard auth.users pada restore-postgres.sh.
if ! toc_daftar="$(pg_restore --list "$terbaru" 2>&1)"; then
  printf 'GAGAL: %s tidak bisa dibaca sebagai arsip PostgreSQL, off-site dibatalkan.\n' "$dasar" >&2
  printf 'Rinciannya: %s\n' "$toc_daftar" >&2
  exit 1
fi
if ! [[ "$toc_daftar" =~ (^|[[:space:]])TABLE[[:space:]]+DATA[[:space:]]+auth[[:space:]]+users([[:space:]]|$) ]]; then
  {
    printf 'GAGAL: %s tidak memuat data auth.users, off-site dibatalkan.\n' "$dasar"
    echo "Skema auth tidak ikut ter-backup, jadi salinan off-site ini tidak bisa dipakai memulihkan akun staf."
    echo "Periksa --schema=auth pada perintah pg_dump di scripts/backup-postgres.sh."
  } >&2
  exit 1
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
  # Terenkripsi di lokal saja berarti seluruh cadangan masih hidup dan mati
  # di host yang sama, yaitu kondisi yang justru skrip ini dibuat untuk
  # cegah. Jadi ini juga kegagalan.
  echo "GAGAL: tidak ada tujuan upload: OFFSITE_RCLONE_REMOTE dan OFFSITE_PUT_URL kosong." >&2
  echo "GAGAL: ${keluar_dir}/${nama_enc} sudah terenkripsi di lokal, tapi belum keluar dari host ini." >&2
  exit 1
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

printf 'Off-site selesai: %s terkirim terenkripsi (%s entri data auth).\n' \
  "$nama_enc" "$(printf '%s\n' "$toc_daftar" | grep -cE '(^|[[:space:]])TABLE[[:space:]]+DATA[[:space:]]+auth[[:space:]]')"
