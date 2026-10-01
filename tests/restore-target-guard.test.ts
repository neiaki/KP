import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Guard target pada scripts/restore-postgres.sh.
 *
 * pg_restore --clean menjatuhkan lalu membangun ulang seluruh schema pada
 * target, jadi yang perlu dijaga bukan hanya "restore-nya jalan" tapi "restore
 * ini tidak mungkin mendarat di database yang hidup". Sebelum guard ini ada,
 * ALLOW_RESTORE=YES saja sudah cukup: URL produksi diekspor, satu flag
 * ditekan, dan skema produksi hilang.
 *
 * Tidak ada database yang disentuh test ini. pg_restore dan psql diganti
 * tiruan di PATH yang mencatat argv-nya, dan psql tiruan ikut menyalin isi
 * berkas SQL yang diterimanya sehingga isi stub auth.users bisa diperiksa.
 * Jadi yang terbukti di sini adalah script menolak atau berhenti di titik
 * yang benar, bukan bahwa restore-nya benar-benar berhasil.
 */

const script = new URL("../scripts/restore-postgres.sh", import.meta.url).pathname;

type Hasil = {
  status: number | null;
  stdout: string;
  stderr: string;
  panggilan: string[];
  sqlStub: string;
};

/**
 * Jalankan script dengan pg_restore dan psql tiruan.
 *
 * pg_restore tiruan mengeluarkan blok COPY public.profiles berisi satu id yang
 * memuat kutip tunggal, jadi jalur stub auth.users ikut teruji di setiap
 * pemanggilan.
 */
function jalankan(env: Record<string, string>): Hasil {
  const akar = mkdtempSync(join(tmpdir(), "restore-guard-"));
  const bin = join(akar, "bin");
  mkdirSync(bin);
  const catat = join(akar, "panggilan.log");
  const salinSql = join(akar, "stub.sql");
  writeFileSync(catat, "");
  writeFileSync(salinSql, "");
  writeFileSync(join(akar, "atcell-test.dump"), "bukan dump sungguhan");

  writeFileSync(
    join(bin, "psql"),
    [
      "#!/usr/bin/env bash",
      `printf 'psql %s\\n' "$*" >> '${catat}'`,
      // Argumen pertama psql adalah URL, jadi -f dicari di seluruh argumen dan
      // bukan di posisi pertama.
      'while [ "$#" -gt 0 ]; do',
      `    if [ "$1" = "-f" ] && [ -n "$2" ]; then cp "$2" '${salinSql}'; fi`,
      "    shift",
      "  done",
      "printf 't\\n'",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  writeFileSync(
    join(bin, "pg_restore"),
    [
      "#!/usr/bin/env bash",
      `printf 'pg_restore %s\\n' "$*" >> '${catat}'`,
      'if [ "$1" = "--data-only" ]; then',
      "  printf 'COPY public.profiles (id) FROM stdin;\\n'",
      "  printf \"a'; drop table auth.users; --\\n\"",
      "  printf '\\\\.\\n'",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  const hasil = spawnSync("bash", [script], {
    encoding: "utf8",
    timeout: 60_000,
    // Environment diwarisi dari proses test lalu ditimpa seperlunya, supaya
    // PATH tiruan menang tanpa menghilangkan variabel yang mungkin dibutuhkan.
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      DUMP_FILE: join(akar, "atcell-test.dump"),
      ...env,
    },
  });

  return {
    status: hasil.status,
    stdout: hasil.stdout,
    stderr: hasil.stderr,
    panggilan: readFileSync(catat, "utf8").split("\n").filter(Boolean),
    sqlStub: readFileSync(salinSql, "utf8"),
  };
}

const LOKAL = "postgres://atcell:rahasia@127.0.0.1:5432/atcell_restore_test";
const PRODUKSI =
  "postgres://atcell:rahasia@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

function destructive(h: Hasil): string[] {
  return h.panggilan.filter((p) => p.startsWith("pg_restore --clean"));
}

test("host produksi ditolak walau semua flag lain diberikan", () => {
  // Kerugian paling besar ada di sini, jadi refusal ini tidak boleh punya jalan
  // keluar: tidak ada flag yang mengaktifkannya, dan host produksi yang sengaja
  // ditulis ke RESTORE_ALLOWED_HOSTS tetap ditolak.
  const hasil = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_ASSUME_YES: "1",
    RESTORE_ALLOWED_HOSTS: "aws-0-ap-southeast-1.pooler.supabase.com",
    RESTORE_DATABASE_URL: PRODUKSI,
  });
  assert.equal(hasil.status, 3, `script harus berhenti, bukan restore. ${hasil.stderr}`);
  assert.match(hasil.stderr, /produksi/i);
  assert.deepEqual(
    destructive(hasil),
    [],
    "pg_restore --clean tidak boleh pernah dijalankan pada host produksi"
  );
  assert.doesNotMatch(
    hasil.stdout + hasil.stderr,
    /rahasia/,
    "kredensial dari URL tidak boleh bocor ke output"
  );
});

test("setiap penanda host produksi ditolak, termasuk subdomainnya", () => {
  const ditolak: Array<[string, string]> = [
    ["db.abcdefgh.supabase.co", "*.supabase.co"],
    ["aws-0-ap-southeast-1.pooler.supabase.com", "*.supabase.com via pooler"],
    ["atcell.my.id", "domain toko"],
    ["login.atcell.my.id", "subdomain toko"],
    ["SUPABASE.CO", "huruf besar harus ikut ditolak"],
  ];

  for (const [host, alasan] of ditolak) {
    const hasil = jalankan({
      ALLOW_RESTORE: "YES",
      RESTORE_ASSUME_YES: "1",
      RESTORE_ALLOWED_HOSTS: host,
      RESTORE_DATABASE_URL: `postgres://atcell:x@${host}:5432/postgres`,
    });
    assert.equal(
      hasil.status,
      3,
      `${host} (${alasan}) harus ditolak, dapat: ${hasil.stderr}`
    );
    assert.deepEqual(destructive(hasil), [], `${host} tidak boleh menjalankan pg_restore --clean`);
  }
});

test("host non-lokal yang tidak diizinkan juga ditolak", () => {
  // Restore target resmi ada di network internal Coolify, jadi daftar izin
  // harus bisa memblokir host lain dan bukan hanya daftar produksi.
  const hasil = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_ASSUME_YES: "1",
    RESTORE_DATABASE_URL: "postgres://atcell:x@standby-tidak-dikenal:5432/atcell",
  });
  assert.equal(hasil.status, 3, `script harus berhenti. ${hasil.stderr}`);
  assert.match(hasil.stderr, /RESTORE_ALLOWED_HOSTS/);
  assert.deepEqual(destructive(hasil), []);
});

test("host yang dinyatakan di RESTORE_ALLOWED_HOSTS lolos ke tahap berikutnya", () => {
  // Jalur sah untuk restore target Coolify. Yang dibuktikan di sini adalah guard
  // host tidak menolaknya, bukan bahwa restore ke sana benar-benar jalan.
  const hasil = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_ASSUME_YES: "1",
    RESTORE_ALLOWED_HOSTS: "atcell-restore-local",
    RESTORE_DATABASE_URL: "postgres://atcell:x@atcell-restore-local:5432/atcell",
  });
  assert.equal(hasil.status, 0, `restore pada target yang diizinkan harus jalan. ${hasil.stderr}`);
  assert.equal(destructive(hasil).length, 1, "pg_restore --clean harus dijalankan sekali");
});

test("container PostgreSQL sekali pakai di host lokal tidak butuh flag tambahan", () => {
  // Drill resmi restore ke container sekali pakai, jadi jalur loopback harus
  // tetap bisa dipakai tanpa menyatakan host apa pun.
  const hasil = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_ASSUME_YES: "1",
    RESTORE_DATABASE_URL: LOKAL,
  });
  assert.equal(hasil.status, 0, `path loopback harus tetap bisa dipakai. ${hasil.stderr}`);
  assert.equal(destructive(hasil).length, 1);
});

test("ALLOW_RESTORE saja tetap wajib ada", () => {
  const hasil = jalankan({
    RESTORE_ASSUME_YES: "1",
    RESTORE_DATABASE_URL: PRODUKSI,
  });
  assert.equal(hasil.status, 2, `script harus berhenti. ${hasil.stderr}`);
  assert.deepEqual(hasil.panggilan, [], "tidak boleh ada perintah database sama sekali");
});

test("tanpa konfirmasi interaksi script berhenti sebelum menyentuh database", () => {
  // Konfirmasi ditulis ke /dev/tty. Di runner ini tidak ada controlling
  // terminal, jadi script harus menolak dengan pesannya sendiri, bukan dengan
  // ENXIO dari shell. Jalur tanpa interaksi diuji lewat RESTORE_ASSUME_YES.
  const hasil = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_DATABASE_URL: LOKAL,
  });
  assert.equal(hasil.status, 4, `script harus berhenti tanpa konfirmasi. ${hasil.stderr}`);
  assert.deepEqual(hasil.panggilan, [], "tidak boleh ada perintah database sebelum konfirmasi");
});

test("dry run melewati guard host lalu berhenti sebelum database disentuh", () => {
  // Dry run harus tetap menolak target yang tidak sah; kalau tidak, dry run
  // justru jadi cara melewati daftar host.
  const ditolak = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_DRY_RUN: "1",
    RESTORE_ALLOWED_HOSTS: "atcell-restore-local",
    RESTORE_DATABASE_URL: PRODUKSI,
  });
  assert.equal(ditolak.status, 3, "dry run tidak boleh melewatkan guard host");

  const sah = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_DRY_RUN: "1",
    RESTORE_DATABASE_URL: LOKAL,
  });
  assert.equal(sah.status, 0, `dry run harus selesai. ${sah.stderr}`);
  assert.match(sah.stdout, /DRY RUN/);
  assert.match(sah.stdout, /atcell_restore_test/, "dry run harus menyebut nama database");
  assert.match(sah.stdout, /127\.0\.0\.1/, "dry run harus menyebut host target");
  // pg_restore --list tetap jalan karena ia hanya membaca berkas dump dan tidak
  // membuka koneksi sama sekali; memakainya sebagai guard berguna karena
  ///archive/ yang rusak akan ketahuan sebelum operator menekan restore sungguhan.
  // Yang tidak boleh terjadi di dry run adalah perintah yang menyentuh
  // database: stub auth.users dan pg_restore --clean.
  const menyentuhDatabase = sah.panggilan.filter(
    (p) => p.startsWith("pg_restore --clean") || p.startsWith("pg_restore --data-only") || p.startsWith("psql")
  );
  assert.deepEqual(
    menyentuhDatabase,
    [],
    "dry run tidak boleh menjalankan perintah apa pun yang menyentuh database"
  );
  assert.doesNotMatch(sah.stdout, /rahasia/, "URL lengkap tidak boleh tercetak");
});

test("script menolak jalan di shell yang bukan bash", () => {
  // [[ ]] dan ${var//[[:space:]]/} tidak dijamin ada di /bin/sh. Tanpa guard
  // BASH_VERSION, pemanggil sh mendapat pesan miliknya sendiri yang tidak
  // menunjuk ke penyebabnya: pada dash, set -o pipefail ditolak dan sh keluar
  // sebelum baris pertama script ini berjalan.
  //
  // Shell yang dipakai dipilih dari yang benar-benar ada di mesin ini, karena di
  // banyak distro /bin/sh sudah berupa symlink ke bash dan menjalankan
  // `sh script` tidak akan menguji apa pun.
  const sumber = readFileSync(new URL("../scripts/restore-postgres.sh", import.meta.url), "utf8");
  const kandidat = ["dash", "zsh"];
  const nonBash = kandidat.find(
    (nama) => spawnSync("sh", ["-c", `command -v ${nama}`]).status === 0
  );
  if (nonBash === undefined) {
    const posisiGuard = sumber.indexOf('[ -z "${BASH_VERSION:-}" ]');
    assert.ok(posisiGuard > -1, "penjaga BASH_VERSION harus ada");
    assert.ok(
      posisiGuard < sumber.indexOf("set -Eeuo pipefail"),
      "penjaga harus mendahului set -Eeuo pipefail, karena sh keluar di situ lebih dulu"
    );
    return;
  }

  const hasil = spawnSync(nonBash, [script], { encoding: "utf8", timeout: 30_000 });
  assert.equal(hasil.status, 64, `${nonBash} harus ditolak dengan kode 64. ${hasil.stderr}`);
  assert.match(hasil.stderr, /bash/);
});

test("id profil dari dump di-escape sebelum masuk ke SQL", () => {
  // Id di dalam dump adalah data, bukan kode. Tanpa pelipatan kutip tunggal, satu
  // id yang memuat ' sudah cukup untuk menutup literal dan menyuntik statement.
  const hasil = jalankan({
    ALLOW_RESTORE: "YES",
    RESTORE_ASSUME_YES: "1",
    RESTORE_DATABASE_URL: LOKAL,
  });
  assert.equal(hasil.status, 0, `restore tiruan harus jalan. ${hasil.stderr}`);
  assert.match(hasil.sqlStub, /insert into auth\.users/, "stub auth.users harus dibuat");

  // Id dari tiruan adalah: a'; drop table auth.users; --
  assert.match(
    hasil.sqlStub,
    /values \('a''; drop table auth\.users; --'/,
    "kutip tunggal pada id harus dilipat ganda"
  );
  assert.doesNotMatch(
    hasil.sqlStub,
    /values \('a'; drop/,
    "id tidak boleh bisa menutup literal dan menyuntik statement"
  );
  const pernyataan = hasil.sqlStub
    .split("\n")
    .filter((baris) => baris.startsWith("insert into"));
  assert.equal(pernyataan.length, 1, "satu id harus menghasilkan tepat satu statement");
});
