import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const offsiteScript = await readFile(
  new URL("../scripts/backup-offsite.sh", import.meta.url),
  "utf8"
);

test("offsite memakai bash dan tidak pernah mencetak rahasia", () => {
  // Sama seperti backup-postgres.sh: construct bash dan pipefail tidak ada
  // di dash, jadi guard ini mencegah rotasi mati tanpa suara.
  assert.match(offsiteScript, /BASH_VERSION/);
  assert.match(offsiteScript, /set -Eeuo pipefail/);
  // Passphrase dan token tidak boleh lewat argumen (terlihat di ps) dan
  // tidak boleh dicetak ke log cron.
  assert.doesNotMatch(offsiteScript, /echo.*OFFSITE_PASSPHRASE[^_]/);
  assert.doesNotMatch(offsiteScript, /echo.*OFFSITE_PUT_TOKEN[^_]/);
  assert.doesNotMatch(
    offsiteScript,
    /printf.*OFFSITE_PASSPHRASE[^_]|printf.*OFFSITE_PUT_TOKEN[^_]/
  );
});

test("offsite mengenkripsi sebelum mengirim, bukan sebaliknya", () => {
  // Tanpa enkripsi, dump berisi nama, telepon, dan IMEI pelanggan terkirim
  // apa adanya ke storage pihak ketiga. Urutan pemanggilan harus menjamin
  // tidak ada jalur yang mengupload dump mentah.
  assert.match(offsiteScript, /openssl enc -aes-256-cbc -pbkdf2/);
  const enkripsi = offsiteScript.indexOf("openssl enc");
  const uploadRclone = offsiteScript.indexOf("rclone copyto");
  const uploadCurl = offsiteScript.indexOf("curl --fail");
  assert.ok(enkripsi > -1, "langkah enkripsi harus ada");
  assert.ok(
    enkripsi < uploadRclone && enkripsi < uploadCurl,
    "enkripsi harus terjadi sebelum upload mana pun"
  );
  // Dump mentah tidak boleh disebut sebagai sumber upload.
  assert.doesNotMatch(
    offsiteScript,
    /copyto[^$]*"\$terbaru"|upload-file "\$terbaru"/
  );
});

test("offsite memverifikasi checksum sebelum enkripsi", () => {
  // Mengenkripsi dump yang rusak hanya memindahkan masalah ke tempat yang
  // lebih jauh dan lebih mahal untuk diketahui. Checksum lokal yang dibuat
  // backup-postgres.sh harus cocok dulu, kalau tidak seluruh proses batal.
  assert.match(offsiteScript, /sha256sum -c/);
});

test("offsite diam saat belum dikonfigurasi, gagal saat setengah jalan", () => {
  // Cron harian tetap terpasang sebelum tujuan off-site ada, jadi kondisi
  // belum-dikonfigurasi harus exit 0 dengan pesan yang jelas, bukan gagal
  // setiap malam dan membuat log yang menutupi kegagalan sungguhan.
  assert.match(offsiteScript, /belum dikonfigurasi.*lewati tanpa gagal/);
  assert.match(offsiteScript, /exit 0/);
  // Sebaliknya, enkripsi gagal atau upload gagal tidak boleh diam.
  assert.match(offsiteScript, /batalkan sebelum upload/);
});

test("offsite hanya menyentuh berkas miliknya sendiri", () => {
  // Pola nama dikunci ke atcell-*.dump dan atcell-*.dump.enc supaya file
  // lain di direktori yang sama tidak ikut terenkripsi atau terhapus oleh
  // rotasi.
  assert.match(offsiteScript, /atcell-\*\.dump/);
  assert.match(offsiteScript, /atcell-\*\.dump\.enc/);
});
