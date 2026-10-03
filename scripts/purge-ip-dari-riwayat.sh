#!/usr/bin/env bash
#
# Menghapus alamat IP asli dari riwayat git, bukan hanya dari working tree.
#
# Working tree repo ini dijaga bersih oleh tests/no-secret-in-repo.test.ts.
# Tapi guard itu hanya membaca berkas yang ter-track di checkout sekarang,
# sedangkan nilai yang bocor dulu masih hidup di commit lama. Siapa pun yang
# `git clone` repo ini bisa mendapatkannya dengan satu `git log`.
#
# Skrip ini mencari nilai yang dicurigai secara dinamis, jadi tidak ada
# alamat yang perlu disamarkan di dalam skrip. Skripnya sendiri aman masuk
# repo publik.
#
# PENTING: hasil deteksi adalah kandidat, bukan daftar yang dipercaya. Angka dengan
# empat oktet juga bentuk nomor versi, dan nomor versi banyak di repo ini.
# Karena itu rewrite TIDAK PERNAH memakai hasil deteksi secara langsung.
# Nilai yang benar-benar ditulis ulang harus ada di file yang dipakai
# --daftar, jadi orang yang menjalankan yang memutuskan.
#
# Yang dilakukan skrip:
#   1. Menolak jalan kalau working tree kotor atau ada worktree lain aktif
#   2. Membuat bundle seluruh riwayat sebagai jaring pengaman
#   3. Melaporkan kandidat beserta file mana yang memegangnya
#   4. Menulis ulang hanya nilai dari --daftar, kalau diminta
#   5. Memverifikasi ulang hasil rewrite
#
# Skrip ini tidak pernah menyentuh remote. Perintah force-push hanya
# dicetak, jadi orang yang menjalankan tetap memegang kendali.
#
# Pemakaian:
#   scripts/purge-ip-dari-riwayat.sh                    # laporan kandidat
#   scripts/purge-ip-dari-riwayat.sh --daftar nilai.txt # rewrite nilai itu
#
# Setelah rewrite, ref yang ditulis ulang wajib di-force-push, dan GitHub
# perlu diminta membersihkan objek gantung lewat Support. Commit SHA lama
# masih bisa dipanggil selama belum di-garbage-collect.

set -euo pipefail

# Rentang yang aman untuk dokumentasi dan pengujian. Nilai di luar sini
# dianggap kebocoran dan ditulis ulang. Daftar ini harus sama dengan yang
# dipakai tests/no-secret-in-repo.test.ts, kalau tidak dua penjaga akan
# menyimpang.
readonly RENTANG_AMAN=("0" "10" "127" "192.168" "192.0.2" "198.51.100" "203.0.113" \
  "172.16" "172.17" "172.18" "172.19" "172.20" "172.21" "172.22" "172.23" \
  "172.24" "172.25" "172.26" "172.27" "172.28" "172.29" "172.30" "172.31")

# Alamat yang sudah dipublikasikan luas dan bukan milik siapa pun. Sama
# seperti yang sudah diizinkan guard.
readonly KONSTANTA_PUBLIK=("1.1.1.1" "8.8.8.8" "9.9.9.9" "1.2.3.4")

readonly POLA_IP='([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})'

# Commit yang memuat nilai bocor hanya ada di satu berkas, jadi
# hanya berkas itu yang perlu ditulis ulang.
readonly BERKAS_BOCOR="docs/COOLIFY-PANEL.md"

jalankan=0
daftar=""

# Parsing argumen memakai while, bukan for. `for arg in "$@"` mengambil
# salinan daftar argumen di awal, jadi `shift` di dalamnya tidak
# menggeser argumen. Tanpa itu, nama file setelah --daftar akan terbaca
# sebagai argumen tersendiri dan skrip berhenti dengan pesan galat.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --jalankan)
      jalankan=1
      ;;
    --daftar)
      [ "$#" -ge 2 ] || gagal "--daftar harus diikuti nama file"
      daftar="$2"
      shift
      ;;
    -h | --help)
      sed -n '3,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'argumen tidak dikenal: %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

cd "$(git rev-parse --show-toplevel)"

gagal() {
  printf 'BERHENTI: %s\n' "$1" >&2
  exit 1
}

printf '== Purging alamat IP dari riwayat ==\n\n'

# --- 1. Syarat keselamatan ------------------------------------------------

[ -z "$(git status --porcelain)" ] ||
  gagal "working tree kotor. Commit atau stash dulu, lalu jalankan ulang."

jumlah_worktree=$(git worktree list | grep -c . || true)
[ "$jumlah_worktree" -le 1 ] ||
  gagal "ada $jumlah_worktree worktree aktif. Tutup worktree lain dulu.
      Rewrite menyentuh ref bersama dan bisa merusak checkout yang
      sedang berjalan di worktree lain."

alat=""
command -v git-filter-repo >/dev/null 2>&1 && alat=filter-repo
[ "$alat" = "filter-repo" ] || git filter-branch --help >/dev/null 2>&1 && alat=filter-branch
[ -n "$alat" ] || gagal "tidak ada git filter-repo maupun git filter-branch"

printf 'alat rewrite: git %s\n' "$alat"

# --- 2. Jaring pengaman ----------------------------------------------------

cadangan="../atcell-riwayat-$(date +%Y%m%d-%H%M%S).bundle"
printf '\nBackup ke %s ... ' "$cadangan"
git bundle create "$cadangan" --all >/dev/null 2>&1 ||
  gagal "gagal membuat bundle di $cadangan"
printf 'selesai (%s)\n' "$(du -h "$cadangan" | cut -f1)"

# --- 3. Cari nilai bocor ---------------------------------------------------

# Alamat dianggap bocor kalau empat oktetnya valid, bukan ada di rentang
# aman, dan bukan konstanta publik. Cara mencari nilai ini sengaja memakai
# git grep per revisi, bukan menyalin logika guard, supaya tidak ada
# daftar nilai yang harus dijaga dua tempat.
# `-h` suppresses nama berkas, jadi yang keluar hanya nilai yang cocok itu sendiri.
# Tanpa `-h`, keluaran berbentuk rev:path:nilai dan penyaringan di bawah
# akan membaca "docs/COOLIFY-PANEL" sebagai oktet pertama.
deteksi() {
  git grep -I -h -o -E "$POLA_IP" "$1" -- . 2>/dev/null |
    sort -u |
    awk -v aman="${RENTANG_AMAN[*]}" -v konst="${KONSTANTA_PUBLIK[*]}" '
      BEGIN { n = split(aman, g, " "); for (i = 1; i <= n; i++) G[g[i]] = 1
              n = split(konst, k, " "); for (i = 1; i <= n; i++) K[k[i]] = 1 }
      {
        split($0, o, ".")
        if (o[1] > 255 || o[2] > 255 || o[3] > 255 || o[4] > 255) next
        if (K[$0]) next
        # Allowlist guard berisi awalan, bukan alamat lengkap: "10" berarti
        # semua 10.x.x.x, "192.168" berarti semua 192.168.x.x. Dicoba dari
        # yang paling panjang supaya tidak ada yang lolos hanya karena
        # kebetulan cocok dengan awalan yang lebih pendek.
        if (G[o[1] "." o[2] "." o[3]]) next
        if (G[o[1] "." o[2]]) next
        if (G[o[1]]) next
        if (o[1] == "172" && o[2] >= 16 && o[2] <= 31) next
        print $0
      }'
}

printf '\nNilai yang dianggap bocor pada HEAD saat ini: '
nilai_head=$(deteksi HEAD || true)
if [ -z "$nilai_head" ]; then
  printf 'tidak ada\n'
else
  printf '\n'
  printf '%s\n' "$nilai_head" | sed 's/^/  /'
  printf '\nPERINGATAN: nilai di atas masih ada di working tree.\n'
  printf 'Guard harus gagal kalau ini repo yang benar. Perbaiki dulu di\n'
  printf 'commit terpisah. Rewrite riwayat tidak boleh dipakai menutupi\n'
  printf 'kebocoran yang masih hidup.\n'
  gagal "working tree masih memuat nilai yang dianggap bocor"
fi

printf '\nCommit yang masih menjangkau nilai bocor:\n'
daftar_rev=$(
  for rev in $(git rev-list --all); do
    nilai=$(deteksi "$rev" || true)
    [ -n "$nilai" ] && printf '%s|%s\n' "$rev" "$(printf '%s' "$nilai" | tr '\n' ' ')"
  done
) || true

if [ -z "$daftar_rev" ]; then
  printf '  tidak ada. Riwayat sudah bersih.\n'
  exit 0
fi

printf '%s\n' "$daftar_rev" | while IFS='|' read -r rev nilai; do
  printf '  %s  %s\n' "$(git log -1 --format='%h %s' "$rev" | cut -c1-70)" "$nilai"
done

jumlah=$(printf '%s\n' "$daftar_rev" | grep -c . || true)
printf '\n%d commit masih memuat nilai bocor.\n' "$jumlah"

# --- 4. Rencana atau rewrite ------------------------------------------------

if [ "$jalankan" -eq 0 ] || [ -z "$daftar" ]; then
  if [ "$jalankan" -eq 1 ]; then
    printf '\n--jalankan tanpa --daftar tidak melakukan rewrite.\n'
    printf 'Nilai yang ditulis ulang harus disebutkan orang yang mengalaminya,\n'
    printf 'bukan ditebak dari deteksi.\n'
  fi
  cat <<RENCANA

== Rencana, belum dijalankan ==

Buat file yang berisi satu nilai per baris, hanya yang benar-benar milik
Anda atau milik orang lain yang tidak boleh dipakai seenaknya. Contoh isi:

  scripts/purge-ip-dari-riwayat.sh --jalankan --daftar nilai-saya.txt

Jangan pakai hasil deteksi di atas tanpa diperiksa. Angka dengan empat oktet
juga bentuk nomor versi, dan di repo ini ada banyak nomor versi seperti
itu. Salah masuk daftar berarti nomor versi ikut ditulis ulang.

Bundel di $cadangan dipakai kalau perlu membatalkan.

Ref yang harus di-force-push sesudah rewrite:

$(git for-each-ref --format='  %(refname:short)' refs/heads | grep -v HEAD)

Repository ini masih belum bersih hanya dengan rewrite:

  1. Objek gantung masih bisa diambil lewat SHA. Minta GitHub Support
     menjalankan garbage collection.
  2. refs/pull/* milik GitHub tidak hilang karena force-push, dan itu yang
     menahan commit lama. Minta Support membersihkannya juga.
  3. Nilai yang sudah pernah publik bisa saja sudah tersimpan di luar repo.
     Untuk IP rumah satu-satunya penutup yang pasti adalah mengganti
     alamatnya di ISP, atau menjadikan repo ini private.

RENCANA
  exit 0
fi

printf '\n== Menjalankan rewrite ==\n'

daftar_nilai=$(mktemp)
trap 'rm -f "$daftar_nilai" "${daftar_nilai}.rp"' EXIT

# Hanya baris yang memang berbentuk alamat IPv4 yang dipakai. Baris lain
# di file daftar ditolak, bukan diabaikan diam-diam.
grep -vE '^\s*(#|$)' "$daftar" |
  grep -vE '^([0-9]{1,3}\.){3}[0-9]{1,3}$' >"$daftar_nilai.bad" || true
if [ -s "$daftar_nilai.bad" ]; then
  printf 'BARIS DI FILE DAFTAR BUKAN ALAMAT IPv4:\n' >&2
  sed 's/^/  /' "$daftar_nilai.bad" >&2
  rm -f "$daftar_nilai.bad"
  gagal "perbaiki file daftar lalu jalankan ulang"
fi
grep -vE '^\s*(#|$)' "$daftar" >"$daftar_nilai"

jumlah_nilai=$(grep -c . "$daftar_nilai" || true)
[ "$jumlah_nilai" -gt 0 ] || gagal "file daftar kosong"
printf 'nilai yang akan disamarkan: %s\n' "$jumlah_nilai"

if [ "$alat" = "filter-repo" ]; then
  # filter-repo membaca daftar nilai dari file, jadi tidak ada nilai yang
  # bocor ke shell history atau ke environment.
  sed 's/^/literal:/' "$daftar_nilai" >"${daftar_nilai}.rp"
  git filter-repo --replace-text "${daftar_nilai}.rp" --force
else
  printf 'filter-repo tidak ada, memakai filter-branch.\n'
  # Titik pada alamat diperlakukan sebagai karakter biasa, bukan wildcard.
  pola=$(sed 's/\./\\./g' "$daftar_nilai" | paste -sd'|' -)
  filter=$(cat <<FILTER
if git ls-files --error-unmatch $BERKAS_BOCOR >/dev/null 2>&1; then
  blob=\$(git show ":$BERKAS_BOCOR" | sed -E "s/($pola)/<IP-publik>/g" | git hash-object -w --stdin)
  git update-index --cacheinfo 100644,\$blob,$BERKAS_BOCOR
fi
FILTER
)
  FILTER="$filter" git filter-branch -f --index-filter "$filter" \
    --prune-empty --tag-name-filter cat -- --all
fi

# --- 5. Verifikasi ---------------------------------------------------------

if [ "$alat" = "filter-branch" ]; then
  printf '\nMembersihkan ref asli dan objek gantung ...\n'
  rm -rf .git/refs/original
  git reflog expire --expire=now --all
  git gc --prune=now --quiet 2>/dev/null || true
fi

printf '\n== Verifikasi ==\n'
printf 'Sisa nilai bocor di riwayat lokal: '
sisa=$(for rev in $(git rev-list --all); do deteksi "$rev"; done | sort -u || true)
if [ -z "$sisa" ]; then
  printf 'tidak ada\n'
else
  printf '\n'
  printf '%s\n' "$sisa" | sed 's/^/  /'
fi

printf '\n== Selesai rewrite lokal ==\n'
printf 'Langkah berikutnya di luar skrip ini:\n'
printf '  1. Cek git log --oneline bahwa commitnya masih masuk akal.\n'
printf '  2. Force-push branch yang masih dipakai.\n'
printf '  3. Minta GitHub Support membersihkan objek gantung dan refs/pull/*.\n'
printf '  4. Untuk IP rumah, ganti alamatnya di ISP. Itu satu-satunya penutup\n'
printf '     yang benar-benar membuang nilai ini dari dunia.\n'
printf '  Bundle pengaman: %s\n' "$cadangan"