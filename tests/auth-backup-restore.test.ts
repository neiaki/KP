import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Auth harus ikut dalam dump, dan harus ada di hasil restore.
 *
 * Dua skrip di sini dijalankan sungguhan dengan pg_dump, pg_restore, dan psql
 * tiruan, bukan dengan mencocokkan teks skrip. Yang diuji perilakunya: skrip
 * keluar dengan kode berapa, file apa yang ditulis, dan apakah akun yang ada
 * di target benar-benar akun asli.
 *
 * Bentuk baris arsip custom mengikuti pg_restore --list:
 *   "<oid>; 0 <oid> TABLE DATA <skema> <tabel> <pemilik>"
 */

const backupScript = new URL("../scripts/backup-postgres.sh", import.meta.url).pathname;
const restoreScript = new URL("../scripts/restore-postgres.sh", import.meta.url).pathname;

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

const LOKAL = "postgresql://postgres@127.0.0.1:5432/atcell_restore_test";

type Skenario = {
  toc: string;
  authTotal?: string;
  authAsli?: string;
  authYatim?: string;
  /** Isi id profil pada blok COPY untuk pengujian escaping. */
  barisProfil?: string[];
};

type Hasil = {
  status: number | null;
  stdout: string;
  stderr: string;
  panggilan: string[];
  isiDirektoriDump: string[];
  sqlStub: string;
};

/**
 * Tulis pg_dump, pg_restore, dan psql tiruan di PATH kosong, lalu jalankan
 * skrip dengan PATH tiruan itu di depan. Tidak ada database yang disentuh.
 */
function siapkanBin(
  akar: string,
  skenario: Skenario,
  catat: string,
  salinSql: string
): string {
  const bin = join(akar, "bin");
  mkdirSync(bin, { recursive: true });
  const toc = join(akar, "toc.txt");
  writeFileSync(toc, skenario.toc);
  const baris = skenario.barisProfil ?? ["11111111-1111-1111-1111-111111111111"];

  writeFileSync(
    join(bin, "pg_dump"),
    [
      "#!/usr/bin/env bash",
      `printf 'pg_dump %s\\n' "$*" >> '${catat}'`,
      'tujuan=""',
      'for a in "$@"; do case "$a" in --file=*) tujuan="${a#--file=}";; esac; done',
      '[ -n "$tujuan" ] && printf "arsip custom tiruan\\n" > "$tujuan"',
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  writeFileSync(
    join(bin, "pg_restore"),
    [
      "#!/usr/bin/env bash",
      `printf 'pg_restore %s\\n' "$*" >> '${catat}'`,
      `if [ "$1" = "--list" ]; then cat '${toc}'; exit 0; fi`,
      'if [ "$1" = "--data-only" ]; then',
      "  printf 'COPY public.profiles (id) FROM stdin;\\n'",
      ...baris.map((b) => `  printf '${b.replace(/'/g, "'\\''")}\\n'`),
      "  printf '\\\\.\\n'",
      "  exit 0",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  writeFileSync(
    join(bin, "psql"),
    [
      "#!/usr/bin/env bash",
      `printf 'psql %s\\n' "$*" >> '${catat}'`,
      'sql=""',
      'sebelum=""',
      'for a in "$@"; do',
      '  if [ "$sebelum" = "-c" ]; then sql="$a"; fi',
      `  if [ "$sebelum" = "-f" ] && [ -f "$a" ]; then cp "$a" '${salinSql}'; fi`,
      '  sebelum="$a"',
      "done",
      'case "$sql" in',
      "  *\"to_regclass('auth.users')\"*) printf 't\\n';;",
      `  *"raw_user_meta_data->>'atcell_restore_stub'"*) printf '%s\\n' '${skenario.authAsli ?? "0"}';;`,
      `  *"left join auth.users"*) printf '%s\\n' '${skenario.authYatim ?? "0"}';;`,
      `  *"count(*) from auth.users"*) printf '%s\\n' '${skenario.authTotal ?? "0"}';;`,
      "  *) printf '\\n';;",
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  return bin;
}

function jalankanBackup(skenario: Skenario): Hasil {
  const akar = mkdtempSync(join(tmpdir(), "auth-backup-"));
  const dirDump = join(akar, "backup");
  mkdirSync(dirDump);
  const catat = join(akar, "panggilan.log");
  const salinSql = join(akar, "stub.sql");
  writeFileSync(catat, "");
  writeFileSync(salinSql, "");
  const bin = siapkanBin(akar, skenario, catat, salinSql);

  const hasil = spawnSync("bash", [backupScript], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      SOURCE_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/postgres",
      BACKUP_DIR: dirDump,
      KEEP_DAYS: "0",
    },
  });

  return {
    status: hasil.status,
    stdout: hasil.stdout,
    stderr: hasil.stderr,
    panggilan: readFileSync(catat, "utf8").split("\n").filter(Boolean),
    isiDirektoriDump: readdirSync(dirDump),
    sqlStub: readFileSync(salinSql, "utf8"),
  };
}

function jalankanRestore(skenario: Skenario, dump: string): Hasil {
  const akar = mkdtempSync(join(tmpdir(), "auth-backup-"));
  const catat = join(akar, "panggilan.log");
  const salinSql = join(akar, "stub.sql");
  writeFileSync(catat, "");
  writeFileSync(salinSql, "");
  const bin = siapkanBin(akar, skenario, catat, salinSql);

  const hasil = spawnSync("bash", [restoreScript], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      ALLOW_RESTORE: "YES",
      RESTORE_ASSUME_YES: "1",
      RESTORE_DATABASE_URL: LOKAL,
      DUMP_FILE: dump,
    },
  });

  return {
    status: hasil.status,
    stdout: hasil.stdout,
    stderr: hasil.stderr,
    panggilan: readFileSync(catat, "utf8").split("\n").filter(Boolean),
    isiDirektoriDump: [],
    sqlStub: readFileSync(salinSql, "utf8"),
  };
}

function buatDump(): string {
  const akar = mkdtempSync(join(tmpdir(), "auth-backup-"));
  const dump = join(akar, "atcell-20261003T045205Z.dump");
  writeFileSync(dump, "bukan dump sungguhan");
  return dump;
}

test("pg_dump diminta ikut mengambil schema auth", () => {
  const h = jalankanBackup({ toc: TOC_DENGAN_AUTH });

  assert.equal(h.status, 0, `backup seharusnya sukses: ${h.stderr}`);
  const dump = h.panggilan.find((p) => p.startsWith("pg_dump "));
  assert.ok(dump, "pg_dump harus dijalankan");
  assert.match(dump, /--schema=public/);
  assert.match(dump, /--schema=private/);
  assert.match(dump, /--schema=auth/);
  assert.match(h.stdout, /Auth ikut ter-backup/);
});

test("dump tanpa auth.users gagal dengan kode 70, bukan sukses diam-diam", () => {
  const h = jalankanBackup({ toc: TOC_TANPA_AUTH });

  assert.equal(h.status, 70);
  assert.match(h.stderr, /TIDAK memuat data auth\.users/);
  assert.doesNotMatch(h.stdout, /^Backup selesai/m);
  // Dump tetap ditulis: backup data bisnis untuk malam itu tetap ada. Yang
  // hilang cuma hak menyatakan dump itu lengkap.
  assert.ok(
    h.isiDirektoriDump.some((f) => f.endsWith(".dump")),
    `dump harus tetap ditulis, isi direktori: ${h.isiDirektoriDump.join(", ")}`
  );
  assert.ok(
    h.isiDirektoriDump.some((f) => f.endsWith(".sha256")),
    "checksum harus tetap ditulis"
  );
});

test("tabel auth yang namanya mirip tidak dianggap auth.users", () => {
  const h = jalankanBackup({
    toc: "4370; 0 16528 TABLE DATA auth users_sessions supabase_auth_admin",
  });

  assert.equal(h.status, 70, "auth.users_sessions bukan auth.users");
});

test("backup berhenti sebelum membuat file kalau pg_restore tidak ada", () => {
  const akar = mkdtempSync(join(tmpdir(), "auth-backup-"));
  const dirDump = join(akar, "backup");
  const bin = join(akar, "bin-kosong");
  mkdirSync(bin, { recursive: true });
  mkdirSync(dirDump);
  writeFileSync(join(bin, "pg_dump"), ["#!/usr/bin/env bash", "exit 0", ""].join("\n"), {
    mode: 0o755,
  });
  // Hanya bash yang boleh ada di PATH. Host ini punya PostgreSQL client di
  // /usr/bin, jadi PATH warisan akan membuat "pg_restore tidak ada" selalu
  // hijau tanpa menguji apa pun. Tidak ada perintah luar lain yang dipakai
  // sebelum guard itu:everything sampai baris guard adalah bash builtin.
  symlinkSync("/usr/bin/bash", join(bin, "bash"));

  const hasil = spawnSync("bash", [backupScript], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      NODE_ENV: "test",
      PATH: bin,
      SOURCE_DATABASE_URL: "postgresql://postgres@127.0.0.1:5432/postgres",
      BACKUP_DIR: dirDump,
      KEEP_DAYS: "0",
    },
  });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stderr, /pg_restore tidak tersedia/);
  assert.equal(readdirSync(dirDump).length, 0, "tidak boleh ada dump yang dibuat");
});

test("dump yang membawa auth tidak lagi diisi stub", () => {
  const h = jalankanRestore({ toc: TOC_DENGAN_AUTH, authTotal: "7", authAsli: "7", authYatim: "0" }, buatDump());

  assert.equal(h.status, 0, `restore seharusnya sukses: ${h.stderr}`);
  assert.equal(
    h.sqlStub,
    "",
    "stub auth.users tidak boleh dibuat kalau dump sudah membawa akun asli"
  );
  assert.match(h.stdout, /Akun auth ikut dipulihkan dari dump \(7 akun asli\)/);
});

test("restore yang berakhir tanpa akun asli apa pun dianggap gagal", () => {
  // Tujuh baris di auth.users, tapi semuanya stub. Persis keadaan standby
  // sebelum 3 Oktober 2026, dan versi lama melaporkannya sebagai sukses.
  const h = jalankanRestore({ toc: TOC_DENGAN_AUTH, authTotal: "7", authAsli: "0", authYatim: "0" }, buatDump());

  assert.equal(h.status, 5);
  assert.match(h.stderr, /tidak punya satu pun akun auth asli/);
  assert.match(h.stderr, /Dump yang direstore memuat auth\.users/);
  assert.doesNotMatch(h.stdout, /Restore selesai/);
});

test("dump lama tanpa auth tetap bisa di-restore lewat stub, tapi dilaporkan gagal", () => {
  const h = jalankanRestore({ toc: TOC_TANPA_AUTH, authTotal: "1", authAsli: "0", authYatim: "0" }, buatDump());

  // Stub tetap dibuat supaya FK profiles terpenuhi dan restore bisa jalan.
  assert.match(h.sqlStub, /insert into auth\.users/);
  assert.match(h.sqlStub, /on conflict \(id\) do nothing/);

  // Tapi hasilnya tidak boleh dilaporkan sebagai restore yang berguna.
  assert.equal(h.status, 5);
  assert.match(h.stderr, /tidak memuat auth\.users sama sekali/);
  assert.match(h.stderr, /tidak bisa dipakai untuk memulihkan login/);
});

test("stub tidak menimpa akun asli yang sudah ada di target", () => {
  // Dump lama, tapi target sudah pernah diimpor Auth Supabase sungguhan.
  const h = jalankanRestore({ toc: TOC_TANPA_AUTH, authTotal: "7", authAsli: "7", authYatim: "0" }, buatDump());

  assert.match(h.sqlStub, /on conflict \(id\) do nothing/);
  assert.equal(h.status, 0, `restore seharusnya sukses: ${h.stderr}`);
});

test("profil tanpa pasangan auth membuat restore gagal", () => {
  const h = jalankanRestore({ toc: TOC_DENGAN_AUTH, authTotal: "7", authAsli: "7", authYatim: "2" }, buatDump());

  assert.equal(h.status, 5);
  assert.match(h.stderr, /tidak punya pasangan di auth\.users/);
});

test("file dump yang hilang ditolak sebelum ada yang mencoba restore", () => {
  const akar = mkdtempSync(join(tmpdir(), "auth-backup-"));
  const h = jalankanRestore({ toc: TOC_DENGAN_AUTH }, join(akar, "tidak-ada.dump"));

  assert.notEqual(h.status, 0);
  assert.ok(
    !h.panggilan.some((p) => p.startsWith("pg_restore --clean")),
    "tidak boleh ada pg_restore yang menyentuh database"
  );
});

test("id profil dari dump diperlakukan sebagai data, bukan kode SQL", () => {
  const h = jalankanRestore(
    { toc: TOC_TANPA_AUTH, authTotal: "1", authAsli: "0", authYatim: "0", barisProfil: ["a'; drop table auth.users; --"] },
    buatDump()
  );

  assert.match(h.sqlStub, /a''; drop table auth\.users; --/);
  assert.equal(h.status, 5, "restore tanpa akun asli tetap harus gagal");
});