#!/usr/bin/env bash
# Restore objek Supabase Storage At Cell dari arsip atcell-storage-*.tar.enc.
#
# Kontrak arsip sama dengan backup-storage.sh:
#   metadata.sql        dump skema + data storage (buckets, objects, policies)
#   manifest.json       daftar objek: bucket, path, size, mimetype, sha256
#   <bucket>/<path>     byte objek apa adanya
#
# Mode bawaan adalah verifikasi: dekripsi, checksum sidecar, manifest, ukuran,
# dan SHA-256 setiap objek diperiksa tanpa menyentuh jaringan. Upload dan apply
# metadata hanya terjadi bila ALLOW_STORAGE_RESTORE=YES dan target eksplisit
# diberikan. Ini mencegah satu salah ketik mengubah project produksi.
#
# Restore bersifat additive: objek yang sudah ada ditimpa dengan x-upsert,
# objek yang tidak ada di arsip tidak dihapus. Tidak ada operasi delete.
#
# Exit: 1 konfigurasi/alat, 2 arsip/manifest tidak valid, 3 host target
# ditolak, 4 guard target, 5 apply metadata gagal, 6 upload/verifikasi gagal.
#
# Jalankan dengan bash, bukan sh.
if [ -z "${BASH_VERSION:-}" ]; then
  echo "ERROR: script ini wajib dijalankan dengan bash, bukan sh. Gunakan: bash $0" >&2
  exit 64
fi
set -Eeuo pipefail
umask 077

: "${STORAGE_ARCHIVE:?STORAGE_ARCHIVE wajib diisi}"

for alat in jq openssl tar sha256sum python3; do
  command -v "$alat" >/dev/null 2>&1 || {
    echo "GAGAL: $alat tidak tersedia." >&2
    exit 1
  }
done

[ -f "$STORAGE_ARCHIVE" ] || {
  echo "GAGAL: arsip Storage tidak ada: $STORAGE_ARCHIVE" >&2
  exit 1
}
[ -f "${STORAGE_ARCHIVE}.sha256" ] || {
  echo "GAGAL: checksum ${STORAGE_ARCHIVE}.sha256 tidak ada. Arsip tidak bisa dibuktikan utuh." >&2
  exit 1
}

passphrase=""
if [ -n "${STORAGE_PASSPHRASE_FILE:-}" ]; then
  [ -r "$STORAGE_PASSPHRASE_FILE" ] || {
    echo "GAGAL: STORAGE_PASSPHRASE_FILE tidak bisa dibaca." >&2
    exit 1
  }
  passphrase="$(cat -- "$STORAGE_PASSPHRASE_FILE")"
elif [ -n "${STORAGE_PASSPHRASE:-}" ]; then
  passphrase="$STORAGE_PASSPHRASE"
elif [ -n "${OFFSITE_PASSPHRASE_FILE:-}" ]; then
  [ -r "$OFFSITE_PASSPHRASE_FILE" ] || {
    echo "GAGAL: OFFSITE_PASSPHRASE_FILE tidak bisa dibaca." >&2
    exit 1
  }
  passphrase="$(cat -- "$OFFSITE_PASSPHRASE_FILE")"
elif [ -n "${OFFSITE_PASSPHRASE:-}" ]; then
  passphrase="$OFFSITE_PASSPHRASE"
fi
if [ -z "$passphrase" ]; then
  echo "GAGAL: passphrase enkripsi Storage tidak tersedia." >&2
  exit 1
fi

kerja="$(mktemp -d)"
config_curl=""
bersihkan() {
  rm -rf -- "$kerja"
  [ -z "$config_curl" ] || rm -f -- "$config_curl"
}
trap bersihkan EXIT

direktori_arsip="$(dirname "$STORAGE_ARCHIVE")"
nama_arsip="$(basename "$STORAGE_ARCHIVE")"
(cd "$direktori_arsip" && sha256sum -c --status "${nama_arsip}.sha256") || {
  echo "GAGAL: checksum ${nama_arsip}.sha256 tidak cocok. Arsip korup atau sudah diubah." >&2
  exit 2
}

arsip_tar="$kerja/arsip.tar"
printf '%s' "$passphrase" |
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "$STORAGE_ARCHIVE" -out "$arsip_tar" -pass stdin || {
  echo "GAGAL: arsip tidak bisa didekripsi. Passphrase salah atau arsip rusak." >&2
  exit 2
}
passphrase=""

# Daftar anggota dibaca lewat python3 karena nama dari arsip pihak lain tidak
# boleh dipercaya: path absolut, segmen "..", karakter kontrol, symlink, dan
# hardlink harus ditolak sebelum satu byte pun diekstrak.
daftar_anggota="$(python3 - "$arsip_tar" <<'PY'
import sys
import tarfile

with tarfile.open(sys.argv[1], "r:") as arsip:
    rusak = False
    for anggota in arsip.getmembers():
        nama = anggota.name.rstrip("/")
        if not nama:
            print("X\t<nama kosong>")
            rusak = True
            continue
        segmen = nama.split("/")
        if (nama.startswith("/") or any(s in ("", ".", "..") for s in segmen)
                or any(ord(c) < 32 or ord(c) == 127 for c in nama)):
            print(f"X\t{nama}")
            rusak = True
            continue
        if anggota.isdir():
            print(f"D\t{nama}")
        elif anggota.isreg():
            print(f"F\t{nama}")
        else:
            print(f"X\t{nama}")
            rusak = True
    sys.exit(1 if rusak else 0)
PY
)" || {
  echo "GAGAL: arsip memuat nama/entri yang tidak aman; restore dibatalkan." >&2
  exit 2
}

duplikat="$(printf '%s\n' "$daftar_anggota" | cut -f2- | LC_ALL=C sort | uniq -d)"
if [ -n "$duplikat" ]; then
  echo "GAGAL: arsip memuat anggota ganda: $duplikat" >&2
  exit 2
fi

for wajib in metadata.sql manifest.json; do
  printf '%s\n' "$daftar_anggota" | grep -qxF "F	$wajib" || {
    echo "GAGAL: arsip tidak memuat $wajib." >&2
    exit 2
  }
done

# manifest.json dan metadata.sql diekstrak lebih dulu; kontrak manifest
# menentukan himpunan berkas yang sah untuk sisa arsip.
tar -xf "$arsip_tar" -C "$kerja" --no-same-owner --no-same-permissions metadata.sql manifest.json || {
  echo "GAGAL: metadata.sql/manifest.json tidak bisa diekstrak." >&2
  exit 2
}
manifest="$kerja/manifest.json"
metadata="$kerja/metadata.sql"

if ! jq -e '
  def safe_path:
    type == "string"
    and length > 0
    and (startswith("/") | not)
    and (test("[[:cntrl:]]") | not)
    and (split("/") | all(. != "" and . != "." and . != ".."));

  . as $root |
  (.created | type == "string") and
  (.source_host | type == "string" and length > 0 and (test("[[:cntrl:]]") | not)) and
  (.buckets | type == "array" and length > 0) and
  (all(.buckets[]; safe_path and test("^[A-Za-z0-9][A-Za-z0-9._-]*$"))) and
  (.files | type == "array") and
  (all(.files[];
    (.bucket | safe_path) and
    (.bucket as $b | ($root.buckets | index($b)) != null) and
    (.path | safe_path) and
    (.sha256 | test("^[0-9a-f]{64}$")) and
    ((.size == null) or (.size | type == "number" and . >= 0)) and
    ((.mimetype == null) or (.mimetype | type == "string" and (test("[[:cntrl:]]") | not)))
  )) and
  (([.files[] | "\(.bucket)/\(.path)"] | length) == ([.files[] | "\(.bucket)/\(.path)"] | unique | length))
' "$manifest" >/dev/null; then
  echo "GAGAL: manifest Storage tidak valid." >&2
  exit 2
fi

if ! grep -qsE 'storage\.buckets' "$metadata" \
   || ! grep -qsE 'storage\.objects' "$metadata"; then
  echo "GAGAL: metadata.sql tidak memuat storage.buckets atau storage.objects." >&2
  exit 2
fi

# Himpunan berkas di arsip harus persis sama dengan yang disebut manifest.
# Ini menolak arsip yang menyelipkan berkas tambahan di luar daftar.
daftar_manifest="$(jq -r '.files[] | "\(.bucket)/\(.path)"' "$manifest" | LC_ALL=C sort)"
daftar_berkas="$(printf '%s\n' "$daftar_anggota" | awk -F'\t' '$1=="F"{print $2}' \
  | grep -vxF -e 'metadata.sql' -e 'manifest.json' | LC_ALL=C sort)"
if [ "$daftar_manifest" != "$daftar_berkas" ]; then
  echo "GAGAL: daftar berkas di arsip tidak sama dengan manifest." >&2
  exit 2
fi

tar -xf "$arsip_tar" -C "$kerja" --no-same-owner --no-same-permissions || {
  echo "GAGAL: arsip gagal diekstrak." >&2
  exit 2
}
if [ -n "$(find "$kerja" -type l -print -quit)" ]; then
  echo "GAGAL: arsip menghasilkan symlink; restore dibatalkan." >&2
  exit 2
fi

jumlah_objek="$(jq '.files | length' "$manifest")"
jumlah_bucket="$(jq '.buckets | length' "$manifest")"
while IFS= read -r item; do
  bucket="$(jq -r '.bucket' <<< "$item")"
  path="$(jq -r '.path' <<< "$item")"
  ukuran_manifest="$(jq -r '.size // empty' <<< "$item")"
  sha_manifest="$(jq -r '.sha256' <<< "$item")"
  berkas="$kerja/$bucket/$path"
  [ -f "$berkas" ] || {
    echo "GAGAL: objek yang disebut manifest tidak ada: $bucket/$path" >&2
    exit 2
  }
  if [ -n "$ukuran_manifest" ]; then
    ukuran_nyata="$(stat -c '%s' "$berkas")"
    if [ "$ukuran_nyata" -ne "$ukuran_manifest" ]; then
      echo "GAGAL: ukuran objek tidak cocok untuk $bucket/$path." >&2
      exit 2
    fi
  fi
  sha_nyata="$(sha256sum "$berkas" | cut -d' ' -f1)"
  if [ "$sha_nyata" != "$sha_manifest" ]; then
    echo "GAGAL: SHA-256 objek tidak cocok untuk $bucket/$path." >&2
    exit 2
  fi
done < <(jq -c '.files[]' "$manifest")

if [ "${ALLOW_STORAGE_RESTORE:-}" != "YES" ]; then
  printf 'Verifikasi Storage LULUS: %s objek, %s bucket, checksum dan hash cocok.\n' \
    "$jumlah_objek" "$jumlah_bucket"
  echo "Mode verifikasi: tidak ada objek yang diunggah. Set ALLOW_STORAGE_RESTORE=YES untuk restore."
  exit 0
fi

: "${STORAGE_RESTORE_URL:?STORAGE_RESTORE_URL wajib diisi saat ALLOW_STORAGE_RESTORE=YES}"
: "${STORAGE_RESTORE_DATABASE_URL:?STORAGE_RESTORE_DATABASE_URL wajib diisi saat ALLOW_STORAGE_RESTORE=YES}"
for alat in curl docker; do
  command -v "$alat" >/dev/null 2>&1 || {
    echo "GAGAL: $alat tidak tersedia." >&2
    exit 1
  }
done

secret=""
if [ -n "${STORAGE_RESTORE_SECRET_KEY_FILE:-}" ]; then
  [ -r "$STORAGE_RESTORE_SECRET_KEY_FILE" ] || {
    echo "GAGAL: STORAGE_RESTORE_SECRET_KEY_FILE tidak bisa dibaca." >&2
    exit 1
  }
  secret="$(cat -- "$STORAGE_RESTORE_SECRET_KEY_FILE")"
elif [ -n "${STORAGE_RESTORE_SECRET_KEY:-}" ]; then
  secret="$STORAGE_RESTORE_SECRET_KEY"
elif [ -n "${STORAGE_RESTORE_SERVICE_ROLE_KEY_FILE:-}" ]; then
  [ -r "$STORAGE_RESTORE_SERVICE_ROLE_KEY_FILE" ] || {
    echo "GAGAL: STORAGE_RESTORE_SERVICE_ROLE_KEY_FILE tidak bisa dibaca." >&2
    exit 1
  }
  secret="$(cat -- "$STORAGE_RESTORE_SERVICE_ROLE_KEY_FILE")"
elif [ -n "${STORAGE_RESTORE_SERVICE_ROLE_KEY:-}" ]; then
  secret="$STORAGE_RESTORE_SERVICE_ROLE_KEY"
fi
if [ -z "$secret" ]; then
  echo "GAGAL: key server target restore tidak tersedia." >&2
  exit 1
fi
if [[ ! "$secret" =~ ^[A-Za-z0-9._~+/=-]+$ ]]; then
  echo "GAGAL: key target restore mengandung karakter yang tidak didukung." >&2
  exit 1
fi

host_target() {
  local url="$1" sisa hostport host
  sisa="${url#*://}"
  hostport="${sisa%%/*}"
  if [[ "$hostport" == \[* ]]; then
    host="${hostport%%]*}"
    host="${host#[}"
  else
    host="${hostport%%:*}"
  fi
  printf '%s' "$host" | tr '[:upper:]' '[:lower:]'
}

sumber_host="$(host_target "http://$(jq -r '.source_host' "$manifest")")"
target_host="$(host_target "$STORAGE_RESTORE_URL")"
if [ -z "$target_host" ]; then
  echo "GAGAL: host target restore tidak bisa dibaca dari STORAGE_RESTORE_URL." >&2
  exit 3
fi

if [ "$target_host" = "$sumber_host" ] && [ "${STORAGE_RESTORE_ALLOW_SAME_HOST:-}" != "YES" ]; then
  echo "GAGAL: target restore sama dengan sumber backup ($target_host)." >&2
  echo "GAGAL: set STORAGE_RESTORE_ALLOW_SAME_HOST=YES hanya jika itu memang project yang ingin ditimpa." >&2
  exit 3
fi
if [ "$target_host" = "$sumber_host" ]; then
  echo "PERINGATAN: menimpa project sumber backup ($target_host) karena STORAGE_RESTORE_ALLOW_SAME_HOST=YES." >&2
fi

case "$target_host" in
  localhost|127.0.0.1|::1) ;;
  *)
    diizinkan=0
    IFS=',' read -r -a daftar_host <<< "${STORAGE_RESTORE_ALLOWED_HOSTS:-}"
    for kandidat in "${daftar_host[@]}"; do
      kandidat="$(printf '%s' "$kandidat" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
      [ -n "$kandidat" ] || continue
      if [ "$kandidat" = "$target_host" ]; then
        diizinkan=1
        break
      fi
    done
    if [ "$diizinkan" -ne 1 ]; then
      echo "GAGAL: host target $target_host tidak diizinkan." >&2
      echo "GAGAL: tambahkan host itu ke STORAGE_RESTORE_ALLOWED_HOSTS bila memang target restore." >&2
      exit 3
    fi
    ;;
esac

api_url="${STORAGE_RESTORE_URL%/}"
case "$api_url" in
  */storage/v1) ;;
  *) api_url="${api_url}/storage/v1" ;;
esac

config_curl="$(mktemp)"
chmod 600 "$config_curl"
printf 'header = "apikey: %s"\nheader = "Authorization: Bearer %s"\n' "$secret" "$secret" > "$config_curl"
secret=""

api() {
  curl --silent --show-error --fail-with-body \
    --retry 3 --retry-delay 1 --retry-all-errors \
    --config "$config_curl" "$@"
}

# Snapshot bucket target SEBELUM mutasi apa pun. Bucket yang sudah ada adalah
# tanda target pernah dipakai; tanpa izin eksplisit restore tidak boleh
# menimpa isinya.
bucket_target="$kerja/buckets-target.json"
api "$api_url/bucket" -o "$bucket_target" || {
  echo "GAGAL: daftar bucket target tidak bisa dibaca." >&2
  exit 1
}
jq -e 'type == "array"' "$bucket_target" >/dev/null || {
  echo "GAGAL: respons daftar bucket target bukan array JSON." >&2
  exit 1
}

while IFS= read -r nama_bucket; do
  if jq -e --arg n "$nama_bucket" 'any(.[]; .name == $n)' "$bucket_target" >/dev/null; then
    if [ "${STORAGE_RESTORE_ALLOW_EXISTING_BUCKETS:-}" != "YES" ]; then
      echo "GAGAL: bucket $nama_bucket sudah ada di target." >&2
      echo "GAGAL: set STORAGE_RESTORE_ALLOW_EXISTING_BUCKETS=YES jika objeknya memang ingin ditimpa." >&2
      exit 4
    fi
  fi
done < <(jq -r '.buckets[]' "$manifest")

# Metadata storage (buckets, objects, policies) diterapkan lewat psql di dalam
# postgres:17-alpine. DSN masuk sebagai environment container, bukan argv,
# supaya tidak terlihat di daftar proses host.
if ! docker run --rm \
  -e STORAGE_RESTORE_DATABASE_URL \
  --mount "type=bind,src=$metadata,dst=/out/metadata.sql,readonly" \
  postgres:17-alpine \
  sh -c 'psql "$STORAGE_RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f /out/metadata.sql' \
  >/dev/null 2>&1; then
  echo "GAGAL: apply metadata.sql ke database target gagal (docker psql)." >&2
  exit 5
fi

# Setelah metadata, bucket bisa saja sudah dibuat oleh dump. Buat yang belum
# ada supaya upload tidak menabrak bucket hilang (mis. dump schema-only).
api "$api_url/bucket" -o "$bucket_target" || {
  echo "GAGAL: daftar bucket target tidak bisa dibaca setelah metadata." >&2
  exit 1
}
dibuat=0
while IFS= read -r nama_bucket; do
  if ! jq -e --arg n "$nama_bucket" 'any(.[]; .name == $n)' "$bucket_target" >/dev/null; then
    body="$(jq -cn --arg n "$nama_bucket" '{id:$n, name:$n, public:false}')"
    api -X POST -H 'Content-Type: application/json' \
      --data-binary "$body" "$api_url/bucket" -o /dev/null || {
      echo "GAGAL: bucket $nama_bucket tidak bisa dibuat di target." >&2
      exit 6
    }
    dibuat=$((dibuat + 1))
  fi
done < <(jq -r '.buckets[]' "$manifest")

diunggah=0
while IFS= read -r item; do
  bucket="$(jq -r '.bucket' <<< "$item")"
  path="$(jq -r '.path' <<< "$item")"
  tipe="$(jq -r '.mimetype // "application/octet-stream"' <<< "$item")"
  bucket_enc="$(jq -rn --arg b "$bucket" '$b | @uri')"
  path_enc="$(jq -rn --arg p "$path" '$p | split("/") | map(@uri) | join("/")')"
  api -X POST \
    -H 'x-upsert: true' \
    -H "Content-Type: $tipe" \
    --data-binary "@$kerja/$bucket/$path" \
    "$api_url/object/${bucket_enc}/${path_enc}" -o /dev/null || {
    echo "GAGAL: upload $bucket/$path gagal." >&2
    exit 6
  }
  diunggah=$((diunggah + 1))
done < <(jq -c '.files[]' "$manifest")

# Upload yang menerima HTTP 200 belum tentu menyimpan byte yang benar; hash
# hasil unduhan adalah bukti yang bisa diperiksa.
while IFS= read -r item; do
  bucket="$(jq -r '.bucket' <<< "$item")"
  path="$(jq -r '.path' <<< "$item")"
  sha_manifest="$(jq -r '.sha256' <<< "$item")"
  bucket_enc="$(jq -rn --arg b "$bucket" '$b | @uri')"
  path_enc="$(jq -rn --arg p "$path" '$p | split("/") | map(@uri) | join("/")')"
  hasil="$kerja/verifikasi.bin"
  api "$api_url/object/${bucket_enc}/${path_enc}" -o "$hasil" || {
    echo "GAGAL: verifikasi unduh $bucket/$path gagal." >&2
    exit 6
  }
  sha_hasil="$(sha256sum "$hasil" | cut -d' ' -f1)"
  if [ "$sha_hasil" != "$sha_manifest" ]; then
    echo "GAGAL: verifikasi upload gagal untuk $bucket/$path." >&2
    exit 6
  fi
  rm -f -- "$hasil"
done < <(jq -c '.files[]' "$manifest")

printf 'Restore Storage selesai: %s objek diunggah, %s bucket dibuat.\n' \
  "$diunggah" "$dibuat"
printf 'Verifikasi upload: semua objek cocok dengan SHA-256 manifest.\n'
