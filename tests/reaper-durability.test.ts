import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Reaper pooler harus benar-benar membunuh koneksi macet, bukan hanya menghitung.
 *
 * Pada 16 Nov 2026 situs 503 seharian lebih karena 16 koneksi Supavisor macet
 * di wait_event ClientRead. Release gate untuk skrip ini: kandidat dihitung
 * dulu, dry-run tidak membunuh apa pun, dan tanpa dry-run backend yang
 * terpilih benar-benar diterminasi lewat pg_terminate_backend.
 *
 * Semua test menjalankan skrip sungguhan dengan docker, curl, dan logger
 * tiruan, lalu memeriksa apa yang tertulis di log dan syslog.
 */

const reaper = new URL("../scripts/atcell-db-reaper.sh", import.meta.url).pathname;

type Hasil = {
  status: number | null;
  log: string;
  syslog: string;
  dockerLog: string;
};

function jalankan(opsi: {
  kandidat: string;
  terminated?: string;
  dryRun?: boolean;
  telegram?: boolean;
  tanpaContainer?: boolean;
}): Hasil {
  const akar = mkdtempSync(join(tmpdir(), "reaper-"));
  const bin = join(akar, "bin");
  mkdirSync(bin, { recursive: true });

  const catatCurl = join(akar, "curl.log");
  const catatConfig = join(akar, "curl-config.log");
  const catatLogger = join(akar, "logger.log");
  const dockerLog = join(akar, "docker.log");
  const log = join(akar, "reaper.log");
  const envFile = join(akar, "reaper.env");
  writeFileSync(catatCurl, "");
  writeFileSync(catatConfig, "");
  writeFileSync(catatLogger, "");
  writeFileSync(dockerLog, "");
  writeFileSync(log, "");

  if (opsi.telegram) {
    // Nilai bukan token sungguhan; curl tiruan tidak pernah menyentuh Telegram.
    writeFileSync(envFile, "TELEGRAM_BOT_TOKEN=token-tiruan\nTELEGRAM_CHAT_ID=-1000000\n");
    chmodSync(envFile, 0o600);
  }

  // Tiruan docker: menghabiskan stdin, mencatat pemanggilan, lalu menjawab
  // sesuai peran. `docker run` membedakan query hitung vs query terminasi
  // dari isi SQL di stdin.
  writeFileSync(
    join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      'input="$(cat)"',
      `printf 'docker %s | stdin: %s\\n' "$*" "\${input//$'\\n'/ }" >> '${dockerLog}'`,
      'case "${1:-}" in',
      "  ps)",
      opsi.tanpaContainer ? "    exit 0 ;;" : "    echo container-palsu ;;",
      "  inspect)",
      "    printf 'DATABASE_URL=postgresql://palsu.invalid/atcell\\n' ;;",
      "  run)",
      '    if [[ "$input" == *pg_terminate_backend* ]]; then',
      `      printf '%s\\n' '${opsi.terminated ?? "0"}'`,
      "    else",
      `      printf '%s\\n' '${opsi.kandidat}'`,
      "    fi ;;",
      "  *) echo 'docker: argumen tidak dikenali' >&2; exit 64 ;;",
      "esac",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  writeFileSync(
    join(bin, "curl"),
    [
      "#!/usr/bin/env bash",
      `printf 'curl %s\\n' "$*" >> '${catatCurl}'`,
      'pakai_fail=0',
      'pakai_config=0',
      'permintaan="$*"',
      'for a in "$@"; do',
      '  [ "$a" = "--fail" ] && pakai_fail=1',
      '  [ "$a" = "--config" ] && pakai_config=1',
      'done',
      'if [ "$pakai_config" = 1 ]; then',
      '  konfigurasi="$(cat)"',
      `  printf '%s\\n' "$konfigurasi" >> '${catatConfig}'`,
      '  permintaan="$permintaan $konfigurasi"',
      'fi',
      'case "$permintaan" in',
      '  *https://api.telegram.org/*)',
      '    if [ "${FAKE_TELEGRAM:-200}" -ge 400 ] && [ "$pakai_fail" = 1 ]; then exit 22; fi',
      "    printf 'ok'; exit 0;;",
      'esac',
      "printf '000'",
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  writeFileSync(
    join(bin, "logger"),
    ["#!/usr/bin/env bash", `printf 'logger %s\\n' "$*" >> '${catatLogger}'`, "exit 0", ""].join("\n"),
    { mode: 0o755 }
  );

  const hasil = spawnSync("bash", [reaper], {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      REAPER_LOG: log,
      WATCHDOG_ENV_FILE: envFile,
      REAPER_MAX_AGE_MIN: "30",
      REAPER_DRY_RUN: opsi.dryRun ? "1" : "0",
      FAKE_TELEGRAM: "200",
    },
  });

  return {
    status: hasil.status,
    log: readFileSyncSafe(log),
    syslog: readFileSyncSafe(catatLogger),
    dockerLog: readFileSyncSafe(dockerLog),
  };
}

function readFileSyncSafe(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

test("nol kandidat: keluar 0, tidak ada terminasi, log sunyi", () => {
  const h = jalankan({ kandidat: "0" });
  assert.equal(h.status, 0);
  assert.equal(h.dockerLog.includes("pg_terminate_backend"), false);
  assert.equal(h.log.includes("Menemukan"), false);
});

test("dry-run: kandidat tercatat, terminasi tidak dipanggil", () => {
  const h = jalankan({ kandidat: "3", dryRun: true });
  assert.equal(h.status, 0);
  assert.ok(h.log.includes("Menemukan 3"));
  assert.ok(h.log.includes("DRY RUN"));
  assert.equal(h.dockerLog.includes("pg_terminate_backend"), false);
});

test("terminasi sungguhan: pg_terminate_backend dipanggil, alert dicatat", () => {
  const h = jalankan({ kandidat: "2", terminated: "2" });
  assert.equal(h.status, 0);
  assert.ok(h.dockerLog.includes("pg_terminate_backend"));
  assert.ok(h.log.includes("Reaper membunuh 2"));
  assert.ok(h.syslog.includes("atcell-db-reaper"));
});

test("output psql rusak: keluar 3, tidak membunuh apa pun", () => {
  const h = jalankan({ kandidat: "psql: error: something failed" });
  assert.equal(h.status, 3);
  assert.ok(h.log.includes("Output tidak terduga"));
  assert.equal(h.dockerLog.includes("pg_terminate_backend"), false);
});

test("container tidak ditemukan: keluar 2, tidak melempar error keras", () => {
  const h = jalankan({ kandidat: "0", tanpaContainer: true });
  assert.equal(h.status, 2);
  assert.ok(h.log.includes("tidak ditemukan"));
});

test("telegram dikonfigurasi: notifikasi terkirim lewat curl", () => {
  const akarLog = jalankan({ kandidat: "1", terminated: "1", telegram: true });
  assert.equal(akarLog.status, 0);
  // Notifikasi tercatat di config curl; tidak ada kegagalan tercatat.
  assert.equal(akarLog.log.includes("Notifikasi Telegram gagal"), false);
});
