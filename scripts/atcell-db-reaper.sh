#!/usr/bin/env bash
# Pembersih koneksi pooler Supavisor yang ditinggal klientnya.
#
# Kenapa ini ada: pada 16 Nov 2026 situs atcell.my.id 503 selama seharian lebih
# karena 16 koneksi di sisi Supavisor macet di wait_event ClientRead (query
# selesai, jawaban sudah terkirim, tapi client tidak pernah membaca/menutup).
# Pool transaction mode penuh, /api/health/ready menjawab 503, dan Traefik
# menghentikan seluruh routing. pg_terminate_backend adalah jalan keluar yang
# dipakai, dan itu harus dijadwalkan.
#
# Cara kerja: mencari backend client yang menunggu ClientRead dengan transaksi
# terbuka lebih tua dari REAPER_MAX_AGE_MIN (bawaan 30 menit), lalu dibunuh.
# Query publik snapshot butuh milidetik; tidak ada query sah yang boleh
# menganggur setengah jam menunggu client.
#
# Keamanan: hanya membunuh backend SELECT yang menunggu client. Backend yang
# sedang benar-benar menjalankan statement tidak terpilih. REAPER_DRY_RUN=1
# hanya melaporkan kandidat tanpa membunuh apa pun.
#
# DATABASE_URL dibaca dari environment, atau diambil dari container aplikasi
# yang berlabel coolify.applicationUuid=$APP_UUID. Secret hanya ditulis ke
# berkas sementara 0600 dan tidak pernah tercetak ke log maupun argv; berkas
# itu dihapus oleh trap di akhir.
set -uo pipefail
umask 077

LOG="${REAPER_LOG:-/var/log/atcell-db-reaper.log}"
ENV_FILE="${WATCHDOG_ENV_FILE:-/root/.atcell-watchdog.env}"
APP_UUID="${APP_UUID:-mebqjoh2ne1y3vt6jqryvvu9}"
BATAS_MENIT="${REAPER_MAX_AGE_MIN:-30}"
PSQL_IMAGE="${PSQL_IMAGE:-postgres:17-alpine}"

catat() {
  # Tingkat dipakai langsung sebagai level syslog, sama seperti watchdog.
  printf '%s %s %s\n' "$(date -u +%Y%m%dT%H%M%SZ)" "$1" "$2" >>"$LOG"
  if command -v logger >/dev/null 2>&1; then
    logger -t atcell-db-reaper -p "daemon.$1" -- "$2" 2>/dev/null || true
  fi
}

notify() {
  # Berkas env yang sama dengan watchdog: satu token Telegram, dua pemakai.
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  if ! printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' \
    "$TELEGRAM_BOT_TOKEN" \
    | curl -sS --fail -m 15 -o /dev/null --config - \
      --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
      --data-urlencode "text=$1" 2>/dev/null; then
    catat warning "Notifikasi Telegram gagal terkirim. Periksa token di $ENV_FILE."
  fi
}

[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

TMPDIR_REAPER=""
bersihkan() {
  [ -n "$TMPDIR_REAPER" ] && rm -rf -- "$TMPDIR_REAPER"
}
trap bersihkan EXIT

TMPDIR_REAPER="$(mktemp -d)"
chmod 700 "$TMPDIR_REAPER"

if [ -n "${DATABASE_URL:-}" ]; then
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL" >"$TMPDIR_REAPER/env"
else
  cid="$(docker ps --filter "label=coolify.applicationUuid=${APP_UUID}" --format '{{.Names}}' | head -n1)"
  if [ -z "$cid" ]; then
    catat error "Container aplikasi dengan label coolify.applicationUuid=${APP_UUID} tidak ditemukan."
    exit 2
  fi
  # Nilai env tidak pernah dicetak: baris DATABASE_URL=... ditulis apa adanya
  # ke berkas 0600 (grep, bukan sed: nilai butuh nama kuncinya untuk --env-file).
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$cid" \
    | grep -m1 '^DATABASE_URL=' >"$TMPDIR_REAPER/env"
  if [ ! -s "$TMPDIR_REAPER/env" ]; then
    catat error "DATABASE_URL tidak ditemukan di container $cid."
    exit 2
  fi
fi
chmod 600 "$TMPDIR_REAPER/env"

psql_jalan() {
  # SQL dibaca dari stdin (-f -) supaya tanda kutip di dalamnya tidak pernah
  # menyentuh quoting shell maupun argv container.
  docker run --rm -i \
    --env-file "$TMPDIR_REAPER/env" \
    -e "PSQL_BATAS=$BATAS_MENIT" \
    "$PSQL_IMAGE" sh -c \
    'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batas="$PSQL_BATAS" -tAf -'
}

kandidat="$(psql_jalan <<'SQL' 2>&1
with kandidat as (
  select pid
  from pg_stat_activity
  where backend_type = 'client backend'
    and wait_event = 'ClientRead'
    and xact_start is not null
    and xact_start < now() - make_interval(mins => :batas)
    and pid <> pg_backend_pid()
)
select count(*) from kandidat;
SQL
)" || { catat error "Gagal menghitung kandidat: $kandidat"; exit 3; }

kandidat="$(printf '%s' "$kandidat" | tail -n1 | tr -d '[:space:]')"
if ! [[ "$kandidat" =~ ^[0-9]+$ ]]; then
  catat error "Output tidak terduga dari psql: $kandidat"
  exit 3
fi

if [ "$kandidat" -eq 0 ]; then
  exit 0
fi

catat warning "Menemukan $kandidat backend ClientRead lebih tua dari ${BATAS_MENIT} menit."

if [ "${REAPER_DRY_RUN:-0}" = "1" ]; then
  catat info "DRY RUN aktif: tidak ada backend yang dibunuh."
  exit 0
fi

hasil="$(psql_jalan <<'SQL' 2>&1
with kandidat as (
  select pid
  from pg_stat_activity
  where backend_type = 'client backend'
    and wait_event = 'ClientRead'
    and xact_start is not null
    and xact_start < now() - make_interval(mins => :batas)
    and pid <> pg_backend_pid()
)
select count(*) from (select pg_terminate_backend(pid) from kandidat) t;
SQL
)" || { catat error "Gagal terminasi: $hasil"; exit 4; }

hasil="$(printf '%s' "$hasil" | tail -n1 | tr -d '[:space:]')"
catat alert "Reaper membunuh $hasil backend pooler yang menunggu client (batas ${BATAS_MENIT} menit)."
notify "At Cell: reaper membunuh $hasil koneksi pooler macet (ClientRead > ${BATAS_MENIT} menit)."
exit 0
