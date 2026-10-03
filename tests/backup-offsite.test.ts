import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const offsiteScriptUrl = new URL("../scripts/backup-offsite.sh", import.meta.url);
const offsiteScript = await readFile(offsiteScriptUrl, "utf8");

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

const offsiteScriptPath = fileURLToPath(offsiteScriptUrl);

// Isi throwaway, bukan data apical. Dipakai supaya script punya dump yang
// checksum-nya cocok, sehingga satu-satunya alasan gagal adalah kondisi yang
// memang diuji di bawah.
const ISI_UJI = "DUMPERIKUT-BUKAN-DATA-ASLI\n";
const NAMA_UJI = "atcell-20260101T000000Z.dump";

/*
 * Daftar isi arsip tiruan. Bentuk barisnya mengikuti pg_restore --list:
 *   "<oid>; 0 <oid> TABLE DATA <skema> <tabel> <pemilik>"
 */
const TOC_DENGAN_AUTH = [
  ";",
  "; Archive created at 2026-10-03 04:52:05 UTC",
  ";",
  "22; 2615 16498 SCHEMA - auth supabase_auth_admin",
  "4384; 0 16686 TABLE DATA auth identities supabase_auth_admin",
  "4370; 0 16528 TABLE DATA auth users supabase_auth_admin",
  "4050; 0 25586 TABLE DATA public products postgres",
].join("\n");

const TOC_TANPA_AUTH = [
  ";",
  "4050; 0 25586 TABLE DATA public products postgres",
  "4052; 0 25603 TABLE DATA public inventory_units postgres",
].join("\n");

/**
 * pg_restore tiruan. Script off-site memakai `pg_restore --list` untuk
 * membuktikan arsip bisa dibaca dan memuat auth.users, jadi test harus
 * menyediakan tiruan itu: isi arsip uji bukan arsip PostgreSQL sungguhan, dan
 * pg_restore asli akan menolaknya sebelum logika yang sedang diuji sempat
 * dijalankan.
 */
async function siapinPgRestoreTiruan(dir: string): Promise<string> {
  const bin = join(dir, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "pg_restore"),
    [
      "#!/usr/bin/env bash",
      "cat <<'TOC'",
      "",
      ...TOC_DENGAN_AUTH.split("\n"),
      "",
      "TOC",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );
  return bin;
}

/** pg_restore tiruan yang menolak arsip, untuk menguji jalur gagalnya. */
async function siapinPgRestoreRusak(dir: string): Promise<string> {
  const bin = join(dir, "bin-rusak");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "pg_restore"),
    ["#!/usr/bin/env bash", "echo 'pg_restore: error: input file appears to be a text format dump file' >&2", "exit 1", ""].join("\n"),
    { mode: 0o755 }
  );
  return bin;
}

/** pg_restore tiruan yang daftar isinya tidak memuat auth.users. */
async function siapinPgRestoreTanpaAuth(dir: string): Promise<string> {
  const bin = join(dir, "bin-tanpa-auth");
  await mkdir(bin, { recursive: true });
  await writeFile(
    join(bin, "pg_restore"),
    ["#!/usr/bin/env bash", "cat <<'TOC'", "", ...TOC_TANPA_AUTH.split("\n"), "", "TOC", "exit 0", ""].join("\n"),
    { mode: 0o755 }
  );
  return bin;
}

async function siapkanDirektoriUji(
  opts: { pgRestore?: string } = {}
): Promise<{
  dumps: string;
  staging: string;
  ppFile: string;
  bin: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "offsite-uji-"));
  const dumps = join(dir, "dumps");
  const staging = join(dir, "staging");
  await mkdir(dumps);
  await writeFile(join(dumps, NAMA_UJI), ISI_UJI);
  const sum = createHash("sha256").update(ISI_UJI).digest("hex");
  await writeFile(join(dumps, `${NAMA_UJI}.sha256`), `${sum}  ${NAMA_UJI}\n`);
  // Passphrase lemparan yang dibuat di dalam test ini dan tidak pernah
  // dicetak, hanya dipakai untuk membuktikan script menolak jalan tanpa tujuan.
  const ppFile = join(dir, "passphrase");
  await writeFile(ppFile, "passphrase-buangan-untuk-test\n", { mode: 0o600 });
  const bin = opts.pgRestore ?? (await siapinPgRestoreTiruan(dir));
  return { dumps, staging, ppFile, bin };
}

function jalankanScript(env: Record<string, string>) {
  return spawnSync("bash", [offsiteScriptPath], {
    // Env dibangun eksplisit: variabel OFFSITE_* dari mesin test tidak boleh
    // ikut terbawa dan membuat kondisi uji terlewati diam-diam.
    env: { PATH: process.env.PATH ?? "", NODE_ENV: process.env.NODE_ENV ?? "test", ...env },
    encoding: "utf8",
  });
}

test("offsite gagal keras saat passphrase kosong, bukan dilewati diam-diam", async () => {
  // Ini kontrak yang melindungi produksi. Versi lama keluar 0 sambil menulis
  // "lewati tanpa gagal", sehingga cron melaporkan berhasil setiap malam
  // tanpa mengirim apa pun. Exit bukan-nol harus diuji dengan menjalankan
  // script sungguhan, bukan dengan membaca teksnya.
  const { dumps, staging, bin } = await siapkanDirektoriUji();
  const hasil = jalankanScript({ BACKUP_DIR: dumps, OFFSITE_STAGING_DIR: staging, PATH: `${bin}:${process.env.PATH ?? ""}` });

  assert.notEqual(
    hasil.status,
    0,
    "passphrase kosong harus keluar bukan-nol, bukan exit 0"
  );
  assert.match(hasil.stderr, /GAGAL/);
  assert.doesNotMatch(hasil.stderr, /lewati tanpa gagal/);

  // Tanpa passphrase script berhenti sebelum mengenkripsi, jadi tidak ada
  // file .enc sama sekali. Tidak ada yang bisa terkirim dalam keadaan terbuka.
  const isiStaging = await readdir(staging).catch(() => [] as string[]);
  assert.deepEqual(isiStaging, [], "tidak boleh ada berkas terenkripsi tanpa passphrase");
});

test("offsite gagal keras saat terkripsi tapi tidak ada tujuan upload", async () => {
  // Terenkripsi di lokal saja berarti seluruh cadangan masih hidup dan mati
  // di host yang sama, yaitu kondisi yang justru skrip ini dibuat untuk cegah.
  const { dumps, staging, ppFile, bin } = await siapkanDirektoriUji();
  const hasil = jalankanScript({
    BACKUP_DIR: dumps,
    OFFSITE_STAGING_DIR: staging,
    OFFSITE_PASSPHRASE_FILE: ppFile,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  });

  assert.notEqual(hasil.status, 0, "tanpa tujuan upload harus keluar bukan-nol");
  assert.match(hasil.stderr, /GAGAL/);
  assert.match(hasil.stderr, /tujuan upload/);
});

test("offsite gagal keras saat tidak ada dump sama sekali", async () => {
  // Passphrase wajib disediakan. Tanpa itu script berhenti lebih dulu di
  // pemeriksaan passphrase, jadi cabang "tidak ada dump" yang sedang diuji
  // tidak pernah disentuh dan test ini tetap hijau apa pun yang terjadi
  // di sana.
  const { ppFile, bin } = await siapkanDirektoriUji();
  const dir = await mkdtemp(join(tmpdir(), "offsite-uji-kosong-"));
  const dumps = join(dir, "dumps");
  await mkdir(dumps);
  const hasil = jalankanScript({
    BACKUP_DIR: dumps,
    OFFSITE_STAGING_DIR: join(dir, "staging"),
    OFFSITE_PASSPHRASE_FILE: ppFile,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  });

  assert.notEqual(hasil.status, 0, "backup yang tidak terjadi harus gagal");
  assert.match(hasil.stderr, /GAGAL/);
  // Harus pesan yang tepat, bukan GAGAL apa saja. Tanpa baris ini test
  // ini tetap lolos meski cabang yang diuji sama sekali tidak sama
  // dengan cabang yang dicek.
  assert.match(hasil.stderr, /tidak ada dump/);
});

test("offsite tidak pernah keluar 0 tanpa mengirim apa pun", async () => {
  // Penjaga terakhir terhadap regresi: script tidak boleh punya jalur exit 0
  // yang tidak berarti off-host copy benar-benar terkirim.
  const { dumps, staging, ppFile, bin } = await siapkanDirektoriUji();
  const hasil = jalankanScript({
    BACKUP_DIR: dumps,
    OFFSITE_STAGING_DIR: staging,
    OFFSITE_PASSPHRASE_FILE: ppFile,
    OFFSITE_RCLONE_REMOTE: join(staging, "tidak-ada-remote-ini"),
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  });

  // rclone tidak ada di lingkungan uji, jadi script harus berhenti dengan
  // kegagalan dan bukan mengklaim terkirim.
  assert.notEqual(hasil.status, 0);
  assert.doesNotMatch(hasil.stdout, /terkirim terenkripsi/);
});

test("offsite hanya menyentuh berkas miliknya sendiri", () => {
  // Pola nama dikunci ke atcell-*.dump dan atcell-*.dump.enc supaya file
  // lain di direktori yang sama tidak ikut terenkripsi atau terhapus oleh
  // rotasi.
  assert.match(offsiteScript, /atcell-\*\.dump/);
  assert.match(offsiteScript, /atcell-\*\.dump\.enc/);
});

test("offsite membatalkan upload saat arsip tidak bisa dibaca", async () => {
  /*
   * Checksum hanya membuktikan berkas tidak berubah sejak ditulis. Arsip yang
   * korup tapi checksum-nya cocok akan lolos pemeriksaan itu, lalu dikirim ke
   * off-site dan memberi rasa aman semu: salinannya ada di dua tempat tapi
   * tidak bisa dipakai memulihkan apa pun. pg_restore --list wajib jadi gerbang
   * sebelum enkripsi.
   */
  const { dumps, staging, ppFile } = await siapkanDirektoriUji();
  const bin = await siapinPgRestoreRusak(join(dumps, ".."));
  const hasil = jalankanScript({
    BACKUP_DIR: dumps,
    OFFSITE_STAGING_DIR: staging,
    OFFSITE_PASSPHRASE_FILE: ppFile,
    OFFSITE_RCLONE_REMOTE: join(staging, "tidak-ada-remote-ini"),
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  });

  assert.notEqual(hasil.status, 0, "arsip tidak terbaca harus gagal");
  assert.match(hasil.stderr, /tidak bisa dibaca sebagai arsip PostgreSQL/);
  assert.doesNotMatch(hasil.stdout, /terkirim terenkripsi/);
  const isiStaging = await readdir(staging).catch(() => [] as string[]);
  assert.deepEqual(isiStaging, [], "arsip rusak tidak boleh ikut terenkripsi");
});

test("offsite membatalkan upload saat dump tidak memuat auth.users", async () => {
  /*
   * Ini celah yang sama seperti di backup-postgres.sh, tapi di sisi off-site.
   * Kalau dump tanpa auth lolos ke sini, salinan yang keluar ke luar host
   * sama sekali tidak bisa memulihkan akun staf, dan tidak ada yang
   * mengetahuinya karena upload-nya sukses.
   */
  const { dumps, staging, ppFile } = await siapkanDirektoriUji();
  const bin = await siapinPgRestoreTanpaAuth(join(dumps, ".."));
  const hasil = jalankanScript({
    BACKUP_DIR: dumps,
    OFFSITE_STAGING_DIR: staging,
    OFFSITE_PASSPHRASE_FILE: ppFile,
    OFFSITE_RCLONE_REMOTE: join(staging, "tidak-ada-remote-ini"),
    PATH: `${bin}:${process.env.PATH ?? ""}`,
  });

  assert.notEqual(hasil.status, 0, "dump tanpa auth harus gagal");
  assert.match(hasil.stderr, /tidak memuat data auth\.users/);
  assert.doesNotMatch(hasil.stdout, /terkirim terenkripsi/);
  const isiStaging = await readdir(staging).catch(() => [] as string[]);
  assert.deepEqual(isiStaging, [], "dump tanpa auth tidak boleh ikut terenkripsi");
});

test("offsite menolak jalan tanpa pg_restore, bukan mengirim arsip tak terverifikasi", async () => {
  /*
   * Tanpa pg_restore pemeriksaan isi arsip mustahil dijalankan. Melewatinya
   * berarti off-site kembali ke kondisi lama: upload berdasarkan checksum
   * saja, yaitu kondisi yang gap Auth minggu lalu sudah punished di
   * backup-postgres.sh tapi belum di sini.
   *
   * PATH dibuat dari symlink hanya ke tiga perintah yang dibutuhkan sampai
   * guard pg_restore. Kosongkan PATH saja tidak cukup karena pg_restore
   * sungguhan ada di /usr/bin.
   */
  const { dumps, staging, ppFile } = await siapkanDirektoriUji();
  const sempit = await mkdtemp(join(tmpdir(), "offsite-uji-path-sempit-"));
  for (const nama of ["bash", "openssl", "sha256sum"]) {
    await symlink(join("/usr/bin", nama), join(sempit, nama));
  }
  const hasil = jalankanScript({
    BACKUP_DIR: dumps,
    OFFSITE_STAGING_DIR: staging,
    OFFSITE_PASSPHRASE_FILE: ppFile,
    OFFSITE_RCLONE_REMOTE: join(staging, "tidak-ada-remote-ini"),
    PATH: sempit,
  });

  assert.notEqual(hasil.status, 0, "tanpa pg_restore harus keluar bukan-nol");
  assert.match(hasil.stderr, /pg_restore tidak tersedia/);
  const isiStaging = await readdir(staging).catch(() => [] as string[]);
  assert.deepEqual(isiStaging, [], "tidak boleh ada yang terenkripsi tanpa verifikasi");
});
