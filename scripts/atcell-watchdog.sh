#!/usr/bin/env bash
# Pengawas uptime At Cell: pengganti sementara UptimeRobot sampai monitor
# eksternal dipasang. Cron tiap 5 menit, memeriksa jalur penuh
# Traefik -> aplikasi -> database lewat /api/health/ready.
#
# Prinsipnya: suara hanya saat status BERUBAH, supaya log tidak penuh oleh
# "masih sakit" setiap 5 menit. Tapi "hanya saat berubah" pernah berarti tidak
# ada suara sama sekali: begitu ambang terlampaui dan state sudah `fail`, cabang
# "gagal < ambang" dan cabang "sudah fail" sama-sama tidak mencetak apa pun.
# Inciden yang panjang karena itu hilang tanpa jejak, dan yang tersisa cuma satu
# baris peringatan pertama.
#
# Karena itu pencatatan dibuat di tiga tempat sekaligus:
#
#   1. Log berkas, seperti sebelumnya.
#   2. syslog/journal lewat `logger -t atcell-watchdog`, supaya
#      `journalctl -t atcell-watchdog` dan `grep atcell-watchdog
#      /var/log/syslog` menemukan insiden tanpa harus tahu nama file log.
#      syslog dipakai karena di situlah operator pertama kali melihat, dan
#      karena /var/log bisa ikut hilang bersama hosting-nya.
#   3. Berkas insiden di $STATE_DIR/incident yang hidup selama outage dan
#      dihapus saat pulih, berisi sejak kapan, kode HTTP berapa, dan berapa
#      kali gagal berturut-turut.
#
# Selama outage masih berjalan, watchdog mengulang pencatatan setiap
# ULANG_MENIT menit (default 30). Cukup jarang supaya log tidak membanjir, dan
# cukup sering supaya "masih sakit" tidak pernah hilang.
#
# Notifikasi Telegram opsional lewat /root/.atcell-watchdog.env
# (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Tanpa itu pencatatan tetap berjalan;
# yang hilang hanya pesan ke luar. Tidak ada token yang dibuat atau ditebak di
# sini, dan tanpa dua variabel itu notify() keluar tanpa melakukan apa pun.
set -uo pipefail
umask 077

LOG="${WATCHDOG_LOG:-/var/log/atcell-watchdog.log}"
STATE_DIR="${WATCHDOG_STATE_DIR:-/var/lib/atcell-watchdog}"
STATE_FILE="$STATE_DIR/state"
FAIL_FILE="$STATE_DIR/fails"
INCIDENT_FILE="$STATE_DIR/incident"
BEAT_FILE="$STATE_DIR/beat"
ENV_FILE="${WATCHDOG_ENV_FILE:-/root/.atcell-watchdog.env}"

# Lewat 127.0.0.1 dengan SNI dan Host yang benar, jadi yang diuji adalah jalur
# produksi yang sama (Traefik TLS -> aplikasi -> database) tanpa hairpin NAT ke
# IP publik. Sertifikat tetap diverifikasi penuh.
URL_INTERNAL="${WATCHDOG_URL:-https://atcell.my.id/api/health/ready}"
HOST_HEADER="${WATCHDOG_HOST:-atcell.my.id}"
# Setel WATCHDOG_RESOLVE ke string kosong untuk menguji tanpa pemetaan nama.
if [ -n "${WATCHDOG_RESOLVE+x}" ]; then
  RESOLVE="$WATCHDOG_RESOLVE"
else
  RESOLVE="${HOST_HEADER}:443:127.0.0.1"
fi
TIMEOUT="${WATCHDOG_TIMEOUT:-15}"
BATAS_GAGAL="${WATCHDOG_BATAS_GAGAL:-2}"
ULANG_MENIT="${WATCHDOG_ULANG_MENIT:-30}"

notify() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  # --fail wajib: Telegram menjawab HTTP 4xx untuk token yang dicabut atau
  # TELEGRAM_CHAT_ID yang salah, dan tanpa --fail curl tetap keluar 0. Notifikasi
  # yang gagal diam-diam adalah yang paling berbahaya di komponen ini, karena
  # operator mengira alerting sudah hidup sementara tidak ada yang masuk.
  # Kegagalan dicatat lewat catat, bukan ditelan: token tidak ikut ke log
  # karena pesan yang dicatat tidak memuat URL.
  if ! curl -sS --fail -m 15 -o /dev/null \
    --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
    --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null; then
    catat warning "Notifikasi Telegram gagal terkirim. Periksa TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di $ENV_FILE."
  fi
}

# catat <tingkat> <pesan>
#
# Tingkat dipakai langsung sebagai level syslog (info/warning/alert), jadi isi
# berkas dan syslog bisa dicari dengan kata yang sama.
catat() {
  printf '%s %s %s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$1" "$2" >>"$LOG"
  if command -v logger >/dev/null 2>&1; then
    logger -t atcell-watchdog -p "daemon.$1" -- "$2" 2>/dev/null || true
  fi
}

lama_menit() {
  # Durasi insiden dalam menit, dihitung dari epoch di berkas insiden.
  local mulai sekarang
  mulai="$(sed -n 's/^mulai=//p' "$INCIDENT_FILE" 2>/dev/null || true)"
  [ -n "$mulai" ] || return 0
  sekarang="$(date -u +%s)"
  printf '%s' "$(( (sekarang - mulai) / 60 ))"
}

mkdir -p "$STATE_DIR"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

kode="000"
if [ -n "$RESOLVE" ]; then
  out="$(curl -sS -m "$TIMEOUT" -o /dev/null -w '%{http_code}' \
    --resolve "$RESOLVE" "$URL_INTERNAL" 2>/dev/null)" && kode="$out"
else
  out="$(curl -sS -m "$TIMEOUT" -o /dev/null -w '%{http_code}' \
    "$URL_INTERNAL" 2>/dev/null)" && kode="$out"
fi

sebelum="$(cat -- "$STATE_FILE" 2>/dev/null || echo unknown)"

if [ "$kode" = "200" ]; then
  echo 0 >"$FAIL_FILE"
  # Durasi dibaca SEBELUM berkas insiden dihapus. Urutan sebaliknya
  # menghasilkan "setelah  menit sakit" tepat pada baris yang paling penting
  # untuk dibaca operator.
  durasi="$(lama_menit)"
  rm -f -- "$INCIDENT_FILE" "$BEAT_FILE"
  if [ "$sebelum" = "unknown" ]; then
    # Run pertama setelah pemasangan. "PULIH" akan salah baca di sini: tidak
    # ada insiden yang dipulihkan, karena belum ada yang pernah tercatat.
    echo ok >"$STATE_FILE"
    catat info "SEHAT: /api/health/ready 200. Tidak ada catatan sebelumnya, ini run pertama."
  elif [ "$sebelum" != "ok" ]; then
    echo ok >"$STATE_FILE"
    catat info "PULIH: /api/health/ready kembali 200 setelah ${durasi} menit sakit."
    notify "At Cell pulih: health check kembali 200."
  fi
  exit 0
fi

gagal=$(( $(cat -- "$FAIL_FILE" 2>/dev/null || echo 0) + 1 ))
echo "$gagal" >"$FAIL_FILE"

# STATE_FILE hanya menyimpan status yang TERKONFIRMASI. Menulis "fail" sejak
# peringatan pertama akan membuat transisi ok->sakit tidak pernah tercatat,
# karena saat ambang tercapai statusnya sudah terlanjur "fail".
if [ "$gagal" -lt "$BATAS_GAGAL" ]; then
  catat warning "peringatan: /api/health/ready menjawab $kode ($gagal/$BATAS_GAGAL)"
  exit 1
fi

if [ "$sebelum" != "fail" ]; then
  echo fail >"$STATE_FILE"
  sekarang="$(date -u +%s)"
  echo "$sekarang" >"$BEAT_FILE"
  {
    printf 'mulai=%s\n' "$sekarang"
    printf 'kode=%s\n' "$kode"
    printf 'gagal_beruntun=%s\n' "$gagal"
    printf 'url=%s\n' "$URL_INTERNAL"
    printf 'dimulai_pada=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$INCIDENT_FILE"
  catat alert "SAKIT: /api/health/ready menjawab $kode sebanyak $gagal kali berturut-turut."
  notify "At Cell sakit: /api/health/ready menjawab $kode ($gagal x berturut-turut)."
  exit 1
fi

# Sudah berstatus fail dan tetap gagal: jalur yang dulu tidak menulis apa pun
# sama sekali, sehingga outage panjang bisa berjalan seharian tanpa satu baris
# pun di log mana pun.
beat_lama="$(cat -- "$BEAT_FILE" 2>/dev/null || echo 0)"
sekarang="$(date -u +%s)"
if [ $((sekarang - beat_lama)) -ge $((ULANG_MENIT * 60)) ]; then
  echo "$sekarang" >"$BEAT_FILE"
  durasi="$(lama_menit)"
  catat alert "SAKIT (masih): /api/health/ready menjawab $kode, ${gagal} kali berturut-turut, sudah ${durasi} menit sejak gagal pertama."
  notify "At Cell masih sakit: /api/health/ready $kode sudah ${durasi} menit."
fi
exit 1