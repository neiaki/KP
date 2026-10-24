#!/usr/bin/env bash
# Backup Supabase Storage At Cell: metadata skema storage + seluruh isi
# bucket, dipaketkan, dienkripsi, lalu dikirim ke tujuan off-site.
#
# Kenapa script ini ada: backup-postgres.sh hanya menampung public/private/
# auth Storage tidak ikut, sebagaimana tertulis di header script itu: foto
# katalog, foto kondisi servis, dan foto trade-in hanya dicadangkan oleh
# layanan Supabase. Bentuk celahnya sama dengan auth.users sebelum
# penambahan --schema=auth: restore target terlihat sepadahal etalase tidak
# punya satu pun foto. Target script ini: satu arsip yang cukup untuk
# memulihkan bucket beserta pengaturannya (metadata + policies) dan semua
# objeknya di project lain, tanpa meminta Supabase.
#
# Bentuk hasil: satu berkas tar terenkripsi AES-256-CBC PBKDF2 yang berisi
#   metadata.sql        pg_dump --schema=storage (buckets, objects, policies)
#   manifest.json       daftar objek: bucket, path, size, mimetype, sha256
#   <bucket>/<path>     isi objek apa adanya
#
# Semua jalur gagal menghentikan script dengan status bukan-nol DAN pesan yang
# jelas. Tidak ada jalur keluar 0 yang artinya "tidak melakukan apa-apa";
# pelajaran dari backup-offsite.sh (versi lama keluar 0 diam-diam) diterapkan
# tanpa perkecilan.
#
# Konvensi kripto-operasional yang dipegang: kredensial tidak pernah menjadi
# argumen curl. Argumen proses terbaca lewat /proc/<pid>/cmdline dan bisa ikut
# tercatat process monitor, jadi key masuk lewat stdin (--config -), pola yang
# sama dengan token Telegram di atcell-watchdog.sh.
#
# Script ini memakai construct khusus bash (set -E, pipefail, process
# substitution) dan GNU tar (--sort=name), sama seperti saat backup-postgres.sh
# dipakai di image postgres:17-alpine dan wrapper host yang berbasis Ubuntu.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi
set -Eeuo pipefail
umask 077

: "${BACKUP_DIR:?GAGAL: BACKUP_DIR wajib diisi}"

# Storage yang benar-benar kosong biasanya menandakan URL/key salah atau
# menunjuk ke project yang tidak berjalan, jadi default-nya gagal.
# STORAGE_ALLOW_EMPTY=1 dinyatakan eksplisit mengizinkan arsip yang isinya
# hanya metadata. Pola ini sama dengan pemeriksaan auth di backup-postgres.sh:
# backup yang "berhasil" padahal tidak menyimpan apa pun adalah rasa aman palsu.
if [ "${STORAGE_ALLOW_EMPTY:-0}" = "1" ]; then
  STORAGE_ALLOW_EMPTY=1
else
  STORAGE_ALLOW_EMPTY=0
fi

for tool in curl openssl sha256sum tar jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "GAGAL: $tool tidak tersedia di mesin ini." >&2
    exit 1
  }
done

# ---- Kredensial ------------------------------------------------------------

supabase_url="${STORAGE_SUPABASE_URL:?GAGAL: STORAGE_SUPABASE_URL wajib diisi}"
supabase_url="${supabase_url%/}"

api_key=""
if [ -n "${STORAGE_API_KEY_FILE:-}" ]; then
  [ -r "$STORAGE_API_KEY_FILE" ] || { echo "GAGAL: STORAGE_API_KEY_FILE tidak bisa dibaca." >&2; exit 1; }
  api_key="$(cat -- "$STORAGE_API_KEY_FILE")"
elif [ -n "${STORAGE_API_KEY:-}" ]; then
  api_key="$STORAGE_API_KEY"
fi
[ -n "$api_key" ] || {
  echo "GAGAL: STORAGE belum dikonfigurasi: tidak ada key (STORAGE_API_KEY_FILE kosong atau tidak terbaca)." >&2
  echo "GAGAL: job ini gagal, bukan dilewati." >&2
  exit 1
}

bucket_csv="${BUCKETS:-product-images,service-photos,trade-in-photos}"

# Passphrase diperiksa sebelum metadata dan objek diunduh. Tanpa ini, backup
# akan menghabiskan bandwidth dan menulis plaintext ke staging, lalu gagal di
# langkah terakhir. Gagal cepat juga berarti tidak ada arsip terbuka yang
# tertinggal saat cron berjalan tanpa konfigurasi.
passphrase=""
if [ -n "${STORAGE_PASSPHRASE_FILE:-}" ]; then
  [ -r "$STORAGE_PASSPHRASE_FILE" ] || { echo "GAGAL: STORAGE_PASSPHRASE_FILE tidak bisa dibaca." >&2; exit 1; }
  passphrase="$(cat -- "$STORAGE_PASSPHRASE_FILE")"
elif [ -n "${STORAGE_PASSPHRASE:-}" ]; then
  passphrase="$STORAGE_PASSPHRASE"
fi
[ -n "$passphrase" ] || {
  echo "GAGAL: STORAGE belum dikonfigurasi: tidak ada passphrase (STORAGE_PASSPHRASE_FILE kosong atau tidak terbaca)." >&2
  echo "GAGAL: backup tidak dikirim dalam bentuk terbuka. Job ini gagal, bukan dilewati." >&2
  exit 1
}

# ---- Staging ---------------------------------------------------------------

mkdir -p "$BACKUP_DIR"
staging="$(mktemp -d "${BACKUP_DIR}/.storage-XXXXXX")"
chmod 700 "$staging"
enc_path=""
cleanup_staging() {
  # Arsip terenkripsi sementara ikut dibersihkan saat gagal di tengah jalan.
  [ -z "$enc_path" ] || rm -f -- "$enc_path"
  rm -rf -- "$staging"
}
trap cleanup_staging EXIT

manifest_tsv="$staging/manifest.tsv"
: >"$manifest_tsv"

# ---- Metadata skema storage ------------------------------------------------
# Bucket + policies dibaca bukan dari dugaan, tapi bukti dari database.
# Dump plain (SQL) supaya intergritasnya bisa diperiksa berbasis teks tanpa
# alat troli tambahan. storage.objects tidak berisi isi file (konten di S3),
# jadi dump ini tidak membawa data pelanggan, hanya metadata terstruktur.

metadata_path="$staging/metadata.sql"
if [ -n "${STORAGE_METADATA_DUMP_FILE:-}" ]; then
  # Jalur test/integrasi: dump sudah disediakan, script tetap memverifikasi
  # isinya sama seperti jalur produksi.
  cp -- "$STORAGE_METADATA_DUMP_FILE" "$metadata_path"
  chmod 600 "$metadata_path"
else
  : "${SOURCE_DATABASE_URL:?GAGAL: SOURCE_DATABASE_URL wajib diisi (atau sediakan STORAGE_METADATA_DUMP_FILE).}"
  command -v docker >/dev/null 2>&1 || {
    echo "GAGAL: docker tidak ada sehingga pg_dump tidak bisa dijalankan." >&2
    exit 1
  }
  # Berkas harus telah ada sebelum di-mount supaya docker tidak
  # mengubahnya menjadi directory bind.
  : >"$metadata_path"
  chmod 600 "$metadata_path"
  docker run --rm \
    -e SOURCE_DATABASE_URL \
    --mount "type=bind,src=$metadata_path,dst=/out/metadata.sql" \
    postgres:17-alpine \
    sh -c 'pg_dump --format=plain --no-owner --no-acl --schema=storage -f /out/metadata.sql "$SOURCE_DATABASE_URL"' \
    >/dev/null 2>&1 || {
    echo "GAGAL: pg_dump metadata storage di dalam postgres:17-alpine gagal." >&2
    exit 72
  }
  chown "$(id -u):$(id -g)" "$metadata_path" 2>/dev/null || true
  chmod 600 "$metadata_path" 2>/dev/null || true
fi

if [ ! -s "$metadata_path" ]; then
  echo "GAGAL: metadata.sql kosong; pg_dump atau berkas dump tidak menghasilkan apa pun." >&2
  exit 72
fi

if ! grep -qsE 'storage\.buckets' "$metadata_path" \
   || ! grep -qsE 'storage\.objects' "$metadata_path"; then
  echo "GAGAL: metadata.sql tidak memuat storage.buckets atau storage.objects." >&2
  echo "Periksa peran koneksi dan argumen: pg_dump --schema=storage, bukan --table=storage.objects saja." >&2
  exit 72
fi

# ---- Validasi nama bucket ---------------------------------------------------

IFS=',' read -r -a bucket_parts <<<"$bucket_csv"
BUKET=()
for b in "${bucket_parts[@]}"; do
  b="${b//[[:space:]]/}"
  [ -n "$b" ] || continue
  printf '%s' "$b" | grep -qE '^[a-z0-9][a-z0-9_.-]{0,99}$' \
    || { echo "GAGAL: nama bucket memuat karakter yang tidak diperizinkan: '$b'." >&2; exit 77; }
  BUKET+=("$b")
done
[ "${#BUKET[@]}" -gt 0 ] || { echo "GAGAL: daftar bucket kosong." >&2; exit 77; }

# ---- Listing + unduhan per bucket ------------------------------------------
# BFS antar folder: setiap entri list TANPA metadata adalah folder, name-nya
# jadi prefix baru. Setiap entri dengan metadata adalah objek: langsung
# diunduh dan hash. Pagination by-offset dari sortBy:name-asc supaya
# konsistensi offset tidak mengandalkan urutan pelisensian server.

LIMIT_HALAMAN=100
total_berkas=0
bucket_kosong=""

for bucket in "${BUKET[@]}"; do
  antrian="$staging/.queue.$bucket"
  printf '\n' >"$antrian"

  while IFS= read -r prefix; do
    offset=0
    while :; do
      body="$(mktemp "$staging/.lb.XXXXXX")"
      cfg="$(mktemp "$staging/.lc.XXXXXX")"
      resp="$(mktemp "$staging/.lr.XXXXXX")"
      chmod 600 "$cfg"
      jq -cn --arg prefix "$prefix" --argjson offset "$offset" --argjson limit "$LIMIT_HALAMAN" \
        '{prefix:$prefix, limit:$limit, offset:$offset, sortBy:{column:"name", order:"asc"}}' >"$body"
      {
        printf 'url = "%s/storage/v1/object/list/%s"\n' "$supabase_url" "$bucket"
        printf 'header = "apikey: %s"\n' "$api_key"
        printf 'header = "Authorization: Bearer %s"\n' "$api_key"
        printf 'request = "POST"\n'
        printf 'header = "Content-Type: application/json"\n'
        printf 'data-binary = "@%s"\n' "$body"
      } >"$cfg"
      if ! curl --silent --show-error --fail --output "$resp" --config "$cfg" 2>/dev/null; then
        echo "GAGAL: listing bucket=$bucket prefix='$prefix' offset=$offset gagal." >&2
        exit 76
      fi
      rm -f "$cfg" "$body"

      if ! jumlah="$(jq -r 'length' "$resp")"; then
        echo "GAGAL: respons listing bukan JSON valid (bucket $bucket prefix='$prefix' offset=$offset)." >&2
        exit 76
      fi
      if [ "$jumlah" -eq 0 ]; then
        break
      fi

      entries="$(mktemp "$staging/.le.XXXXXX")"
      jq -r '.[] | [ .name, (if (.metadata) then "file" else "folder" end), ((.metadata.size // "") | tostring), ((.metadata.mimetype // "") | tostring) ] | @tsv' \
        "$resp" >"$entries"
      rm -f "$resp"

      while IFS=$'\t' read -r nama jenis size mime; do
        [ -n "$nama" ] || continue
        if [ "$jenis" = "folder" ]; then
          folder_path="${prefix}${nama}"
          # Folder juga divalidasi: server bisa mengirim nama folder berisi
          # traversal ("../escape"), dan prefix yang tumbuh tanpa batas membuat
          # BFS berputar selamanya (bukan deadlock, hanya loop tak berujung).
          if ! awk -v p="$folder_path" 'BEGIN{n=split(p,s,"/"); for(i=1;i<=n;i++) if(s[i]==""||s[i]=="."||s[i]==".."){exit 1} exit 0}'; then
            echo "GAGAL: nama folder mencurigakan '$folder_path' (bucket $bucket) ditolak." >&2
            exit 74
          fi
          if printf '%s' "$folder_path" | LC_ALL=C grep -q '[[:cntrl:]]'; then
            echo "GAGAL: nama folder memuat karakter kontrol (bucket $bucket)." >&2
            exit 74
          fi
          printf '%s/\n' "$folder_path" >>"$antrian"
          continue
        fi

        full_path="${prefix}${nama}"

        # Segmen path diperiksa satu per satu: segmen kosong menangkap
        # jalur absolut, "//", dan slash buntut; "."/".." menangkap traversal.
        # Ini ketat: membangun jalur dengan penyambungan string harus bisa
        # membuktikan tidak ada jalannya keluar dari staging.
        if ! awk -v p="$full_path" 'BEGIN{n=split(p,s,"/"); for(i=1;i<=n;i++) if(s[i]==""||s[i]=="."||s[i]==".."){exit 1} exit 0}'; then
          echo "GAGAL: nama objek mencurigakan '$full_path' (bucket $bucket) ditolak." >&2
          exit 74
        fi
        panjang="$(printf '%s' "$full_path" | wc -c)"
        [ "$panjang" -le 2000 ] \
          || { echo "GAGAL: nama objek terlalu panjang (bucket $bucket): ${panjang} byte." >&2; exit 74; }
        # Karakter kontrol tidak boleh lolos: manifest TSV akan rusak oleh tab
        # dan baris baru, dan nama berbaris baru menyamarkan jalur lain di log.
        if printf '%s' "$full_path" | LC_ALL=C grep -q '[[:cntrl:]]'; then
          echo "GAGAL: nama objek memuat karakter kontrol (bucket $bucket)." >&2
          exit 74
        fi

        down_dir="$staging/$bucket/$(dirname "$full_path")"
        mkdir -p "$down_dir"
        tujuan="$staging/$bucket/$full_path"

        seg="$(printf '%s' "$full_path" | jq -Rr 'split("/")|map(@uri)|join("/")')"
        dl_cfg="$(mktemp "$staging/.lc.XXXXXX")"
        chmod 600 "$dl_cfg"
        {
          printf 'url = "%s/storage/v1/object/%s/%s"\n' "$supabase_url" "$bucket" "$seg"
          printf 'header = "apikey: %s"\n' "$api_key"
          printf 'header = "Authorization: Bearer %s"\n' "$api_key"
        } >"$dl_cfg"
        # Nama output lewat argv, bukan config: nilai itu cuma jalur staging
        # (tanpa secret) dan nama file boleh memuat tanda kutip begitu saja,
        # yang bakal merusak format config file kalau ditempel di sana.
        if ! curl --silent --show-error --fail --output "$tujuan" --config "$dl_cfg" 2>/dev/null; then
          echo "GAGAL: download bucket=$bucket path='$full_path' gagal." >&2
          exit 76
        fi
        rm -f "$dl_cfg"

        ukuran="$(stat -c '%s' "$tujuan")"
        if [ -n "$size" ] && [ "$size" != "null" ] \
           && ! [ "$ukuran" -eq "$size" ] 2>/dev/null; then
          echo "GAGAL: ukuran tidak cocok bucket=$bucket path='$full_path': server=$size vs unduh=$ukuran." >&2
          exit 71
        fi
        sha="$(sha256sum "$tujuan" | cut -d' ' -f1)"
        printf '%s\t%s\t%s\t%s\t%s\n' "$bucket" "$full_path" "$sha" "$ukuran" "${mime:-}" >>"$manifest_tsv"
        total_berkas=$((total_berkas + 1))
      done <"$entries"
      rm -f "$entries"

      if [ "$jumlah" -lt "$LIMIT_HALAMAN" ]; then
        break
      fi
      offset=$((offset + LIMIT_HALAMAN))
    done
  done <"$antrian"

  rm -f "$antrian"
  in_bucket="$(awk -v b="$bucket" -F"\t" '$1==b{n++}END{print n+0}' "$manifest_tsv")"
  if [ "$in_bucket" -eq 0 ]; then
    bucket_kosong="$bucket_kosong $bucket"
  fi
done

if [ "$total_berkas" -eq 0 ]; then
  if [ "$STORAGE_ALLOW_EMPTY" -eq 1 ]; then
    echo "PERINGATAN: tidak ada satu pun objek; melanjutkan, arsip berisi metadata saja (STORAGE_ALLOW_EMPTY=1)." >&2
  else
    echo "GAGAL: tidak ada satu pun objek yang diunduh. Bucket kosong: ${bucket_kosong# }" >&2
    echo "GAGAL: backup tanpa byte berisi tidak boleh disebut sukses. Set STORAGE_ALLOW_EMPTY=1 kalau ini memang disengaja." >&2
    exit 73
  fi
fi

# ---- Manifest ---------------------------------------------------------------
# TSV -> JSON lewat jq: kombinasi supaya semua karakter dalam nama file tidak
# mampu merusak JSON (split @tsv memastikan setiap TSV baris dipetakan aman).

manifest_json="$staging/manifest.json"
host_supabase="$(printf '%s' "$supabase_url" | sed -E 's#^https?://##')"
created="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -Rs \
  --arg created "$created" \
  --arg host "$host_supabase" \
  --arg buckets "${BUKET[*]}" \
  '{created:$created, source_host:$host, buckets:($buckets | split(" ")),
    files:( (split("\n") | map(select(length>0)) | map(split("\t") | {bucket:.[0], path:.[1], sha256:.[2],
                    size: (if .[3] != "" then (.[3] | tonumber) else null end),
                    mimetype: (if .[4] != "" then .[4] else null end)})) )}' \
  <"$manifest_tsv" >"$manifest_json"

if ! jq -e --argjson diharapkan "$total_berkas" '
  (.created | type == "string") and
  (.source_host | type == "string") and
  (.buckets | type == "array" and length > 0) and
  (.files | type == "array" and length == $diharapkan) and
  all(.files[];
    (.bucket | type == "string") and
    (.path | type == "string") and
    (.sha256 | test("^[0-9a-f]{64}$"))
  )' "$manifest_json" >/dev/null; then
  echo "GAGAL: manifest.json tidak lengkap atau tidak sesuai jumlah objek ($total_berkas)." >&2
  exit 1
fi

# ---- Arsip + enkripsi ------------------------------------------------------
# GNU tar: --sort=name dan mtime=0 supaya plaintext tar untuk isi yang sama
# tidak bergantung urutan folder yang dihasilkan filesystem. Enkripsi tetap
# memakai salt acak, jadi berkas .enc tidak pernah byte-identik, dan itu
# disengaja: dua salinan .enc yang identik justru petunjuk kompromi.

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
tar_name="atcell-storage-${timestamp}.tar"
tar_path="$staging/$tar_name"

tar_args=(metadata.sql manifest.json)
for bucket in "${BUKET[@]}"; do
  [ -d "$staging/$bucket" ] && tar_args+=("$bucket")
done

if ! (cd "$staging" && tar --sort=name --mtime="@0" --owner=0 --group=0 --numeric-owner -cf - "${tar_args[@]}" >"$tar_path"); then
  echo "GAGAL: tar gagal membuat arsip." >&2
  exit 1
fi
chmod 600 "$tar_path"
sha_tar="$(sha256sum -- "$tar_path" | cut -d' ' -f1)"

enc_name="atcell-storage-${timestamp}.tar.enc"
enc_path="$(mktemp "${BACKUP_DIR}/.enc.XXXXXX")"
if ! printf '%s' "$passphrase" | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
     -in "$tar_path" -out "$enc_path" -pass stdin; then
  rm -f -- "$enc_path"
  echo "GAGAL: enkripsi arsip storage gagal." >&2
  exit 1
fi
chmod 600 "$enc_path"

# Baca-ulang: arsip harus terbaca dan isinya pas dinyatakan berhasil. Dua
# pemeriksaan terpisah: hash yang sama dengan plaintext, tar listing punya
# metadata.sql + manifest.json. Passphrase disalurkan ulang ke stdin setiap
# kali openssl dipanggil (perintah itu membaca passphrase dari stdin, bukan
# membaca data dari stdin karena input data lewat -in).
if ! sha_read="$(printf '%s' "$passphrase" | openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -in "$enc_path" -pass stdin 2>/dev/null | sha256sum | cut -d' ' -f1)"; then
  rm -f -- "$enc_path"
  printf 'GAGAL: arsip terenkripsi tidak bisa dibaca-balik dengan hash sama aslinya.\n' >&2
  exit 1
fi
if [ "$sha_tar" != "$sha_read" ]; then
  rm -f -- "$enc_path"
  echo "GAGAL: arsip terenkripsi tidak bisa dibaca-balik dengan hash sama aslinya." >&2
  exit 1
fi
tar_list="$(printf '%s' "$passphrase" | openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -in "$enc_path" -pass stdin 2>/dev/null | tar -tf - 2>/dev/null || true)"
for mutu in metadata.sql manifest.json; do
  printf '%s\n' "$tar_list" | grep -qsE "(^|/)${mutu}\$" || {
    rm -f -- "$enc_path"
    echo "GAGAL: arsip tidak memuat $mutu." >&2
    exit 1
  }
done

rm -f -- "$tar_path"
mv -- "$enc_path" "${BACKUP_DIR}/${enc_name}"
enc_path=""
(cd "$BACKUP_DIR" && sha256sum "$enc_name" > "${enc_name}.sha256")
chmod 600 "${BACKUP_DIR}/${enc_name}.sha256"

# ---- Pengiriman off-site ---------------------------------------------------
# Kedua jalur (rclone, PUT) mengikuti backup-offsite.sh supaya operator tidak
# punya konfigurasi dua rasa. Salinan terenkripsi inilah yang keluar host;
# plaintext tar tidak pernah menyapa network.

terkirim=0
if [ -n "${STORAGE_OFFSITE_RCLONE_REMOTE:-}" ]; then
  command -v rclone >/dev/null 2>&1 || {
    echo "GAGAL: STORAGE_OFFSITE_RCLONE_REMOTE diisi tapi rclone tidak terpasang." >&2
    exit 1
  }
  rclone copyto --checksum "${BACKUP_DIR}/${enc_name}" "${STORAGE_OFFSITE_RCLONE_REMOTE}/${enc_name}"
  rclone copyto --checksum "${BACKUP_DIR}/${enc_name}.sha256" "${STORAGE_OFFSITE_RCLONE_REMOTE}/${enc_name}.sha256"
  terkirim=1
fi

if [ -n "${STORAGE_OFFSITE_PUT_URL:-}" ]; then
  token=""
  if [ -n "${STORAGE_OFFSITE_PUT_TOKEN_FILE:-}" ]; then
    [ -r "$STORAGE_OFFSITE_PUT_TOKEN_FILE" ] || { echo "GAGAL: STORAGE_OFFSITE_PUT_TOKEN_FILE tidak bisa dibaca." >&2; exit 1; }
    token="$(cat -- "$STORAGE_OFFSITE_PUT_TOKEN_FILE")"
  elif [ -n "${STORAGE_OFFSITE_PUT_TOKEN:-}" ]; then
    token="$STORAGE_OFFSITE_PUT_TOKEN"
  fi
  [ -n "$token" ] || {
    echo "GAGAL: STORAGE_OFFSITE_PUT_URL diisi tapi token kosong." >&2
    exit 1
  }
  put_cfg="$(mktemp "$staging/.pc.XXXXXX")"
  chmod 600 "$put_cfg"
  {
    printf 'url = "%s/%s"\n' "${STORAGE_OFFSITE_PUT_URL%/}" "$enc_name"
    printf 'header = "Authorization: Bearer %s"\n' "$token"
    printf 'header = "Content-Type: application/octet-stream"\n'
    printf 'upload-file = "%s"\n' "${BACKUP_DIR}/${enc_name}"
  } >"$put_cfg"
  if ! curl --silent --show-error --fail --config "$put_cfg" 2>/dev/null; then
    echo "GAGAL: PUT ${STORAGE_OFFSITE_PUT_URL}/${enc_name} gagal." >&2
    exit 1
  fi
  rm -f -- "$put_cfg"
  put_cfg="$(mktemp "$staging/.pc.XXXXXX")"
  chmod 600 "$put_cfg"
  {
    printf 'url = "%s/%s"\n' "${STORAGE_OFFSITE_PUT_URL%/}" "${enc_name}.sha256"
    printf 'header = "Authorization: Bearer %s"\n' "$token"
    printf 'header = "Content-Type: text/plain"\n'
    printf 'upload-file = "%s"\n' "${BACKUP_DIR}/${enc_name}.sha256"
  } >"$put_cfg"
  if ! curl --silent --show-error --fail --config "$put_cfg" 2>/dev/null; then
    echo "GAGAL: PUT ${STORAGE_OFFSITE_PUT_URL}/${enc_name}.sha256 gagal." >&2
    exit 1
  fi
  rm -f -- "$put_cfg"
  terkirim=1
fi

if [ "$terkirim" -eq 0 ]; then
  echo "GAGAL: tidak ada tujuan off-site: STORAGE_OFFSITE_RCLONE_REMOTE dan STORAGE_OFFSITE_PUT_URL kosong." >&2
  echo "GAGAL: arsip ${enc_name} sudah terenkripsi di lokal tapi belum keluar dari host ini." >&2
  exit 1
fi

# ---- Rotasi salinan terenkripsi lokal -------------------------------------

simpan="${STORAGE_KEEP_ENCRYPTED:-3}"
case "$simpan" in ''|*[!0-9]*|0) simpan=3 ;; esac
dihapus=0
while IFS= read -r lama; do
  [ -n "$lama" ] || continue
  rm -f -- "$lama" "$lama.sha256"
  dihapus=$((dihapus + 1))
done < <(ls -1t "${BACKUP_DIR}"/atcell-storage-*.tar.enc 2>/dev/null | tail -n "+$((simpan + 1))")
[ "$dihapus" -eq 0 ] || printf 'Salinan terenkripsi lama dihapus: %s berkas.\n' "$dihapus"

# ---- Ringkasan -------------------------------------------------------------

printf 'Backup storage selesai: %s.\n' "$enc_name"
printf 'Berkas objek: %d. Bucket: %s.\n' "$total_berkas" "${BUKET[*]}"
if [ -n "$bucket_kosong" ]; then
  printf 'Bucket tanpa objek: %s.\n' "${bucket_kosong# }"
fi
printf 'Checksum: %s/%s.sha256. Terkirim ke tujuan off-site yang dikonfigurasi.\n' "$BACKUP_DIR" "$enc_name"
