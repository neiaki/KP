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

# git-filter-repo selalu dipilih kalau ada. Rantai `A || B && C` di shell dibaca
# dari kiri ke kanan sebagai `(A || B) && C`, jadi begitu A benar, C ikut jalan
# dan menimpa alat yang baru saja terdeteksi. Akibatnya filter-branch tetap
# terpilih meski filter-repo ada, dan jalur rewrite jadi ikut jalur sempit yang
# cuma menyalin satu berkas.
alat=""
if command -v git-filter-repo >/dev/null 2>&1; then
  alat=filter-repo
elif git filter-branch --help >/dev/null 2>&1; then
  alat=filter-branch
fi
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
simpan_remote_file=""
refs_original_file=""
# ${var:+"$var"} menulis path hanya kalau var tidak kosong, jadi trap ini aman
# walau rewrite berhenti sebelum salah satu tempfile itu dibuat.
daftar_kandidat=$(mktemp)
daftar_baik=$(mktemp)
daftar_bad=$(mktemp)
# ${var:+"$var"} menulis path hanya kalau var tidak kosong, jadi trap ini aman
# walau rewrite berhenti sebelum salah satu tempfile itu dibuat.
trap 'rm -f "$daftar_nilai" "${daftar_nilai}.rp" "$daftar_kandidat" \
  "$daftar_baik" "$daftar_bad" \
  ${simpan_remote_file:+"$simpan_remote_file"} \
  ${refs_original_file:+"$refs_original_file"}' EXIT

# Hanya baris yang memang berbentuk alamat IPv4 yang dipakai. Baris lain di
# file daftar ditolak, bukan diabaikan diam-diam.
#
# Kandidat diambil dengan grep -E, bukan grep -vE. Kalau -v yang dipakai, yang
# masuk justru baris yang BUKAN alamat, jadi daftar yang sah akan terbalik
# dan skrip berhenti di "file daftar kosong" padahal isinya benar semua.
grep -vE '^\s*(#|$)' "$daftar" |
  grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$' >"$daftar_kandidat" || true

while IFS= read -r baris; do
  [ -n "$baris" ] || continue
  # Empat oktet, masing-masing 0 sampai 255. Perbandingan dilakukan dengan
  # aritmetika bukan regex supaya batas 255 ditegakkan, bukan hanya batas
  # jumlah digit.
  IFS=. read -r o1 o2 o3 o4 extra <<EOF
$baris
EOF
  if [ -n "$extra" ] || [ -z "$o1" ] || [ -z "$o4" ]; then
    printf '%s\n' "$baris" >>"$daftar_bad"
    continue
  fi
  sah=1
  for oktet in "$o1" "$o2" "$o3" "$o4"; do
    case "$oktet" in
      '' | *[!0-9]*)
        sah=0
        break
        ;;
    esac
    # 010 dibaca sebagai 10 oleh test aritmetika bash, sama seperti yang
    # dilakukan pembacaan alamat di inet_aton. Tidak diam-diam diterima,
    # ditulis sebagai bentuk oktet saja.
    [ "$((10#$oktet))" -le 255 ] || sah=0
  done
  if [ "$sah" -eq 1 ]; then
    printf '%s\n' "$baris" >>"$daftar_baik"
  else
    printf '%s\n' "$baris" >>"$daftar_bad"
  fi
done <"$daftar_kandidat"

if [ -s "$daftar_bad" ]; then
  printf 'BARIS DI FILE DAFTAR BUKAN ALAMAT IPv4:\n' >&2
  sed 's/^/  /' "$daftar_bad" >&2
  gagal "perbaiki file daftar lalu jalankan ulang"
fi
cp -- "$daftar_baik" "$daftar_nilai"

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
  # filter-branch menulis ulang ref remote-tracking jadi refs/remotes/origin
  # ikut terhapus dan remote origin ikut hilang. Setelah rewrite, `git push`
  # biasa akan gagal karena tidak ada lagi tempat push, dan orang yangbaru
  #push tidak akan sadar itu efek skrip purge, bukan konfigurasi rusak.
  # URL dan semua fetch/push specifiers disimpan lalu dipulihkan.
  simpan_remote_file="$(mktemp)"
  git config --get-regexp '^remote\..*\.(url|pushurl|fetch|push|mirror|prune|tagopt)$' \
    >"$simpan_remote_file" 2>/dev/null || true
  # Titik pada alamat diperlakukan sebagai karakter biasa, bukan wildcard.
  pola=$(sed 's/\./\\./g' "$daftar_nilai" | paste -sd'|' -)
  # Semua berkas ter-track, bukan cuma satu berkas tertentu. Nilai yang bocor
  # pernah ada di satu berkas, tapi orang yang menjalankan skrip ini tidak
  # punya jaminan nilai yang sama tidak ikut muncul di commit lain. Filter yang
  # hanya menyentuh satu berkas akan melaporkan rewrite berhasil sementara nilai
  # aslinya masih utuh di berkas lain. Verifikasi di bawah memang menangkapnya,
  # tapi lebih baik filternya sendiri tidak bergantung pada tebakan.
  filter=$(cat <<FILTER
git ls-files -z | while IFS= read -r -d '' path; do
  blob=\$(git show ":\$path" | sed -E "s/($pola)/<IP-publik>/g" | git hash-object -w --stdin)
  mode=\$(git ls-files -s -- "\$path" | awk '{print \$1}')
  git update-index --cacheinfo "\$mode,\$blob,\$path"
done
FILTER
)
  FILTER="$filter" git filter-branch -f --index-filter "$filter" \
    --prune-empty --tag-name-filter cat -- --all

  # Remote dipulihkan tepat setelah rewrite, sebelum reflog digariskan. Nilai
  # yang ada dibaca dari config, jadi pemulihannya tidak bergantung pada
  # `--partial` dan tidak mengubah perilaku rewrite selain yang di atas.
  if [ -s "$simpan_remote_file" ]; then
    # while di dalam redireksi, bukan pipeline. Jalur `| while` jalan di
    # subshell, jadi perubahan config-nya bisa hilang bersama subshell itu.
    while IFS=' ' read -r kunci nilai; do
      [ -n "$kunci" ] || continue
      git config --local --unset-all "$kunci" 2>/dev/null || true
      # Nilai fetch boleh mengandung spasi setelah nama section, jadi pemisah
      # hanya key, dan sisa baris dipakai utuh sebagai nilai.
      git config --local --add "$kunci" "$nilai"
    done <"$simpan_remote_file"
    printf 'Remote dipulihkan setelah rewrite: %s remote.\n' "$(git remote | wc -l)"
  fi
fi

# --- 5. Verifikasi ---------------------------------------------------------

if [ "$alat" = "filter-branch" ]; then
  printf '\nMembersihkan ref asli dan objek gantung ...\n'
  refs_original_file="$(mktemp)"
  # Ref asli dihapus lewat `git update-ref -d`, bukan `rm -rf .git/refs/original`.
  # Dua alasan: path itu tidak berlaku kalau git dir terpisah dari working tree,
  # dan ref yang sudah dipaketkan tidak ada sebagai berkas di sana sama sekali,
  # jadi `rm -rf` hanya diam-diam tidak menghapus apa pun.
  #
  # while di dalam redireksi bukan pipeline, karena pipeline membuat subshell
  # dan nilai yang diisinya hilang bersama subshell itu.
  git for-each-ref --format='%(refname)' refs/original/ >"$refs_original_file"
  while IFS= read -r ref_asli; do
    [ -n "$ref_asli" ] || continue
    git update-ref -d "$ref_asli"
  done <"$refs_original_file"
  printf 'Ref asli dihapus: %s.\n' "$(grep -c . "$refs_original_file" || printf 0)"
  git reflog expire --expire=now --all
  git gc --prune=now --quiet 2>/dev/null || true
fi

printf '\n== Verifikasi ==\n'

# Dua pemeriksaan dengan bobot berbeda. Yang pertama menentukan exit kode:
# setiap nilai yang diminta orang lewat --daftar harus benar-benar hilang dari
# setiap ref yang ditulis ulang. Kalau salah satu masih ada, rewrite-nya tidak
# berhasil dan skrip wajib keluar bukan-nol, karena exit 0 di sini akan dibaca
# "riwayat sudah bersih" lalu langkah force-push dijalankan.
gagal_pakai_daftar=0
if [ "$jalankan" -eq 1 ] && [ -n "$daftar_nilai" ]; then
  printf 'Memeriksa %s nilai dari daftar di seluruh ref ...\n' "$jumlah_nilai"
  semua_ref=$(git rev-list --all)
  while IFS= read -r nilai; do
    [ -n "$nilai" ] || continue
    masih=$(printf '%s\n' "$semua_ref" |
      while IFS= read -r rev; do [ -n "$rev" ] && git grep -lF -- "$nilai" "$rev" 2>/dev/null || true; done |
      sort -u || true)
    if [ -n "$masih" ]; then
      printf '  MASIH ADA: %s\n' "$nilai"
      printf '%s\n' "$masih" | head -n 5 | sed 's/^/    /'
      gagal_pakai_daftar=1
    else
      printf '  hilang: %s\n' "$nilai"
    fi
  done <"$daftar_nilai"
fi

# Yang kedua hanya laporan. Deteksi memindai bentuk alamat, jadi nilai milik
# orang lain yang muncul karena sengaja tidak ikut defensif tetap terlihat di
# sini tanpa menggagalkan rewrite.
printf '\nSisa nilai bocor di riwayat lokal: '
sisa=$(for rev in $(git rev-list --all); do deteksi "$rev"; done | sort -u || true)
if [ -z "$sisa" ]; then
  printf 'tidak ada\n'
else
  printf '\n'
  printf '%s\n' "$sisa" | sed 's/^/  /'
fi

if [ "$gagal_pakai_daftar" -ne 0 ]; then
  printf '\nGAGAL: ada nilai dari --daftar yang masih ada di riwayat hasil rewrite.\n' >&2
  printf 'Jangan force-push dulu. Periksa apakah ref yang perlu ditulis ulang sudah\n' >&2
  printf 'ikut dalam cakupan `-- --all`, lalu jalankan ulang.\n' >&2
  gagal "rewrite belum bersih"
fi

printf '\n== Selesai rewrite lokal ==\n'
printf 'Langkah berikutnya di luar skrip ini:\n'
printf '  1. Cek git log --oneline bahwa commitnya masih masuk akal.\n'
printf '  2. Force-push branch yang masih dipakai.\n'
printf '  3. Minta GitHub Support membersihkan objek gantung dan refs/pull/*.\n'
printf '  4. Untuk IP rumah, ganti alamatnya di ISP. Itu satu-satunya penutup\n'
printf '     yang benar-benar membuang nilai ini dari dunia.\n'
printf '  Bundle pengaman: %s\n' "$cadangan"