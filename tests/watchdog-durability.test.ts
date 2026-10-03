import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Watchdog harus benar-benar mencatat, bukan hanya bicara.
 *
 * Bentuk lamanya diam setelah ambang terlampaui: state sudah `fail` dan
 * kegagalan berlanjut, jadi cabang "gagal < ambang" tidak berlaku dan cabang
 * "transisi ke fail" juga tidak berlaku karena state sudah fail. Hasilnya satu
 * baris peringatan pertama lalu tidak ada apa-apa lagi, berapa pun lama outage
 * berjalan.
 *
 * Semua test di sini menjalankan skrip sungguhan dengan curl dan logger tiruan,
 * lalu memeriksa apa yang benar-benar tertulis di log, syslog, dan berkas
 * insiden.
 */

const watchdog = new URL("../scripts/atcell-watchdog.sh", import.meta.url).pathname;

type Hasil = {
  status: number | null;
  log: string;
  syslog: string;
  requests: string[];
  stateDir: string;
};

/**
 * Jalankan watchdog beberapa kali berturut-turut dengan kode health yang
 * diberikan, seperti cron yang berjalan tiap lima menit.
 */
function jalankan(
  kode: readonly string[],
  opsi: { telegram?: boolean; ulangMenit?: number; tanpaLogger?: boolean } = {}
): Hasil {
  const akar = mkdtempSync(join(tmpdir(), "watchdog-"));
  const bin = join(akar, "bin");
  const stateDir = join(akar, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  const catatCurl = join(akar, "curl.log");
  const catatLogger = join(akar, "logger.log");
  const log = join(akar, "watchdog.log");
  const envFile = join(akar, "watchdog.env");
  writeFileSync(catatCurl, "");
  writeFileSync(catatLogger, "");
  writeFileSync(log, "");

  if (opsi.telegram) {
    // Nilai di sini bukan token sungguhan, dan tidak pernah menyentuh
    // Telegram: curl-nya tiruan dan hanya mencatat URL yang diminta.
    writeFileSync(envFile, "TELEGRAM_BOT_TOKEN=token-tiruan\nTELEGRAM_CHAT_ID=-1000000\n");
    chmodSync(envFile, 0o600);
  }

  writeFileSync(
    join(bin, "curl"),
    [
      "#!/usr/bin/env bash",
      `printf 'curl %s\\n' "$*" >> '${catatCurl}'`,
      'for a in "$@"; do',
      "  case \"$a\" in",
      "    https://api.telegram.org/*) printf 'ok'; exit 0;;",
      "  esac",
      "done",
      'printf \'%s\' "${FAKE_KODE:-000}"',
      "",
    ].join("\n"),
    { mode: 0o755 }
  );

  if (!opsi.tanpaLogger) {
    writeFileSync(
      join(bin, "logger"),
      ["#!/usr/bin/env bash", `printf 'logger %s\\n' "$*" >> '${catatLogger}'`, "exit 0", ""].join("\n"),
      { mode: 0o755 }
    );
  }

  let status: number | null = null;
  kode.forEach((k, index) => {
    const hasil = spawnSync("bash", [watchdog], {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        NODE_ENV: "test",
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        WATCHDOG_LOG: log,
        WATCHDOG_STATE_DIR: stateDir,
        WATCHDOG_ENV_FILE: envFile,
        WATCHDOG_URL: "https://contoh.test/api/health/ready",
        WATCHDOG_RESOLVE: "",
        WATCHDOG_ULANG_MENIT: String(opsi.ulangMenit ?? 0),
        FAKE_KODE: k,
      },
    });
    if (index === kode.length - 1) status = hasil.status;
  });

  return {
    status,
    log: readFileSync(log, "utf8"),
    syslog: readFileSync(catatLogger, "utf8"),
    requests: readFileSync(catatCurl, "utf8").split("\n").filter(Boolean),
    stateDir,
  };
}

test("outage yang berlanjut tetap tercatat setelah ambang terlampaui", () => {
  const h = jalankan(["503", "503", "503", "503", "503"]);

  const sakit = h.log.split("\n").filter((b) => b.includes("SAKIT"));
  assert.ok(
    sakit.length >= 3,
    `setiap kelanjutan outage harus tercatat, baris: ${JSON.stringify(sakit)}`
  );
  assert.ok(
    sakit.some((b) => b.includes("SAKIT (masih)")),
    "harus ada pengulangan selama outage berlanjut"
  );
  assert.equal(h.status, 1, "watchdog harus keluar bukan-nol saat sakit");
});

test("outage yang berlanjut juga masuk ke syslog", () => {
  const h = jalankan(["503", "503", "503", "503"]);

  const alert = h.syslog.split("\n").filter((b) => b.includes("alert"));
  assert.ok(alert.length >= 2, `syslog harus menerima pengulangan, isi: ${h.syslog}`);
  assert.ok(h.syslog.includes("-t atcell-watchdog"), "tag syslog harus bisa dicari");
});

test("berkas insiden mencatat sejak kapan, kode berapa, dan berapa kali gagal", () => {
  const h = jalankan(["503", "503"]);
  const isi = readFileSync(join(h.stateDir, "incident"), "utf8");

  assert.match(isi, /^mulai=\d+$/m);
  assert.match(isi, /^kode=503$/m);
  assert.match(isi, /^gagal_beruntun=2$/m);
  assert.match(isi, /^url=https:\/\/contoh\.test\/api\/health\/ready$/m);
});

test("pulih menghapus berkas insiden dan mencatat durasinya", () => {
  const h = jalankan(["503", "503", "200"]);

  assert.equal(
    existsSync(join(h.stateDir, "incident")),
    false,
    "berkas insiden harus dihapus saat pulih"
  );
  assert.match(h.log, /PULIH: \/api\/health\/ready kembali 200 setelah \d+ menit sakit\./);
  assert.equal(readFileSync(join(h.stateDir, "state"), "utf8").trim(), "ok");
  assert.equal(h.status, 0);
});

test("run pertama yang sehat tidak dilaporkan sebagai pemulihan", () => {
  const h = jalankan(["200"]);

  assert.match(h.log, /run pertama/);
  assert.doesNotMatch(h.log, /PULIH/);
});

test("peringatan sebelum ambang menyebut posisi dari ambang", () => {
  const h = jalankan(["503"]);

  assert.match(h.log, /peringatan: \/api\/health\/ready menjawab 503 \(1\/2\)/);
  assert.equal(h.status, 1);
});

test("tanpa kredensial Telegram tidak ada permintaan ke luar sama sekali", () => {
  const h = jalankan(["503", "503"]);

  assert.ok(
    !h.requests.some((r) => r.includes("api.telegram.org")),
    `tidak boleh ada panggilan Telegram tanpa env file: ${h.requests.join(" | ")}`
  );
});

test("dengan kredensial Telegram, transisi sakit dikirim ke chat", () => {
  const h = jalankan(["503", "503"], { telegram: true });

  const kiriman = h.requests.filter((r) => r.includes("api.telegram.org/") && r.includes("sendMessage"));
  assert.equal(
    kiriman.length,
    1,
    `transisi ke sakit harus dikirim tepat sekali: ${h.requests.join(" | ")}`
  );
  assert.match(kiriman[0], /At Cell sakit/);
});

test("outage berlanjut mengirim pengingat, sehingga yang lupa tidak diam", () => {
  const h = jalankan(["503", "503", "503", "503"], { telegram: true });

  const kiriman = h.requests.filter((r) => r.includes("api.telegram.org/") && r.includes("sendMessage"));
  assert.ok(kiriman.length >= 2, `pengingat ulang harus dikirim: ${h.requests.join(" | ")}`);
  assert.ok(kiriman.some((r) => r.includes("masih sakit")));
});

test("health check dipanggil lewat nama host, bukan IP publik", () => {
  const h = jalankan(["200"]);

  const periksa = h.requests.filter((r) => r.includes("/api/health/ready"));
  assert.ok(periksa.length >= 1, "health check harus dipanggil");
  assert.match(periksa[0], /https:\/\/contoh\.test\/api\/health\/ready/);
  assert.doesNotMatch(periksa[0], /--resolve/);
});

test("gagalnya logger tidak menghentikan pencatatan berkas", () => {
  const h = jalankan(["503", "503"], { tanpaLogger: true });

  assert.equal(h.syslog, "", "tidak ada logger di PATH");
  assert.match(h.log, /SAKIT/);
  assert.ok(
    existsSync(join(h.stateDir, "incident")),
    "berkas insiden tetap harus ditulis walau syslog tidak ada"
  );
});