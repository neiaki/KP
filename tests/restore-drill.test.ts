import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/*
 * Drill restore dijalankan sungguhan dengan docker tiruan.
 *
 * Yang diuji bukan isi teks skrip, tapi tiga hal yang menentukan apakah drill
 * ini boleh dipercaya: drill tidak pernah menyentuh standby atau produksi,
 * drill berhenti dengan gagal saat hasil restore tidak punya akun auth asli,
 * dan container drill selalu dibuang, termasuk ketika drill gagal di tengah.
 */

const drillScript = new URL("../scripts/restore-drill.sh", import.meta.url).pathname;

const DUMMY_ID = "9f2c1a7b4d5e6f708192a3b4c5d6e7f8";

type Skenario = {
  tabel?: string;
  etalase?: string;
  rlsMati?: string;
  yatim?: string;
  authAsli?: string;
  authTotal?: string;
  authIdentitas?: string;
  restoreRc?: string;
  /** Kalau diisi, drill harus gagal karena port drill bocor ke luar. */
  publishPort?: string;
};

type Hasil = {
  status: number | null;
  stdout: string;
  stderr: string;
  panggilan: string[];
};

/**docker tiruan yang mencatat seluruh argumen dan menjawab query tiruan. */
function dockerPalsu(skenario: Skenario, catat: string): string {
  return [
    "#!/usr/bin/env bash",
    `printf 'docker %s\\n' "$*" >> '${catat}'`,
    'sub="$1"',
    'shift || true',
    'sql=""',
    'sebelum=""',
    'punya_script=false',
    'punya_pg_isready=false',
    'for a in "$@"; do',
    '  if [ "$sebelum" = "-c" ]; then sql="$a"; fi',
    '  case "$a" in *restore-postgres.sh) punya_script=true;; esac',
    '  case "$a" in pg_isready) punya_pg_isready=true;; esac',
    '  sebelum="$a"',
    "done",
    'case "$sub" in',
    "  run) printf '%s\\n' '" + DUMMY_ID + "'; exit 0;;",
    "  ps)",
    "    case \" $* \" in",
    "      *' -q '*) exit 0;;",
    '    esac',
    `    printf '%s\\n' '${DUMMY_ID}'`,
    "    exit 0;;",
    "  port)",
    `    [ -n '${skenario.publishPort ?? ""}' ] && printf '%s' '${skenario.publishPort ?? ""}'`,
    "    exit 0;;",
    "  exec)",
    '    if [ "$punya_pg_isready" = true ]; then exit 0; fi',
    '    if [ "$punya_script" = true ]; then exit ' + (skenario.restoreRc ?? "0") + "; fi",
    '    case "$sql" in',
    "      *\"to_regclass('public.profiles')\"*) printf '%s\\n' '" + (skenario.tabel ?? "t") + "';;",
    "      *'from v_public_inventory'*) printf '%s\\n' '" + (skenario.etalase ?? "7") + "';;",
    "      *'not rowsecurity'*) printf '%s\\n' '" + (skenario.rlsMati ?? "0") + "';;",
    "      *'left join auth.users'*) printf '%s\\n' '" + (skenario.yatim ?? "0") + "';;",
    "      *\"raw_user_meta_data->>'atcell_restore_stub'\"*) printf '%s\\n' '" + (skenario.authAsli ?? "7") + "';;",
    "      *'from auth.identities'*) printf '%s\\n' '" + (skenario.authIdentitas ?? "7") + "';;",
    "      *'count(*) from auth.users'*) printf '%s\\n' '" + (skenario.authTotal ?? "7") + "';;",
    "      *) printf '\\n';;",
    "    esac",
    "    exit 0;;",
    "  rm|logs) exit 0;;",
    "esac",
    "exit 0",
    "",
  ].join("\n");
}

function siapkan(
  skenario: Skenario,
  opsi: { tanpaDump?: boolean; tanpaChecksum?: boolean; checksumRusak?: boolean; umurHari?: number } = {}
): { hasil: Hasil; panggilan: string[] } {
  const akar = mkdtempSync(join(tmpdir(), "restore-drill-"));
  const bin = join(akar, "bin");
  const dirDump = join(akar, "backup");
  mkdirSync(bin, { recursive: true });
  mkdirSync(dirDump);

  const catat = join(akar, "docker.log");
  writeFileSync(catat, "");
  const fake = join(bin, "docker");
  writeFileSync(fake, dockerPalsu(skenario, catat));
  chmodSync(fake, 0o755);

  if (!opsi.tanpaDump) {
    const nama = "atcell-20261003T021700Z.dump";
    writeFileSync(join(dirDump, nama), "bukan dump sungguhan");
    if (!opsi.tanpaChecksum) {
      const isi = opsi.checksumRusak ? "0".repeat(64) : "";
      if (isi) {
        writeFileSync(join(dirDump, `${nama}.sha256`), `${isi}  ${nama}\n`);
      } else {
        const nyata = spawnSync("sha256sum", [nama], { cwd: dirDump, encoding: "utf8" });
        writeFileSync(join(dirDump, `${nama}.sha256`), nyata.stdout);
      }
      if (opsi.umurHari !== undefined) {
        const ketika = new Date(Date.now() - opsi.umurHari * 86_400_000);
        utimesSync(join(dirDump, nama), ketika, ketika);
      }
    }
  }

  const hasilProses = spawnSync("bash", [drillScript], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      DUMP_DIR: dirDump,
      DRILL_CONTAINER: "atcell-restore-drill",
    },
  });

  return {
    hasil: {
      status: hasilProses.status,
      stdout: hasilProses.stdout ?? "",
      stderr: hasilProses.stderr ?? "",
      panggilan: readFileSync(catat, "utf8").split("\n").filter(Boolean),
    },
    panggilan: readFileSync(catat, "utf8").split("\n").filter(Boolean),
  };
}

test("drill yang berhasil memeriksa hasil restore lalu membuang container", () => {
  const { hasil } = siapkan({});

  assert.equal(hasil.status, 0, `drill seharusnya lulus: ${hasil.stderr}${hasil.stdout}`);
  assert.match(hasil.stdout, /Drill restore LULUS/);
  assert.match(hasil.stdout, /OK\s+akun auth asli \(bukan stub\)\s+7/);
  assert.match(hasil.stdout, /Container drill dibuang/);
});

test("drill memakai container sekali pakai tanpa jaringan dan tanpa port terbuka", () => {
  const { panggilan } = siapkan({});

  const run = panggilan.find((p) => p.startsWith("docker run "));
  assert.ok(run, "harus ada docker run");
  assert.match(run, /--network none/);
  assert.doesNotMatch(run, /--publish|-P\s/);
  assert.doesNotMatch(run, /--network (bridge|host|coolify)/);
  // Password tidak boleh ada di mana pun: drill tidak butuh kredensial.
  assert.doesNotMatch(run, /POSTGRES_PASSWORD/);
});

test("drill yang bocor mempublikasikan port dianggap gagal", () => {
  const { hasil } = siapkan({ publishPort: "5432" });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /GAGAL port drill tidak dipublikasikan/);
});

test("drill gagal dan tetap membuang container saat tidak ada akun auth asli", () => {
  // Tujuh baris auth.users yang semuanya stub: kondisi standby sebelum
  // 3 Oktober 2026. Versi lama drill hanya menghitung stub dan lolos.
  const { hasil, panggilan } = siapkan({ authAsli: "0", authTotal: "7" });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /GAGAL akun auth asli \(bukan stub\)\s+0/);
  assert.ok(
    panggilan.some((p) => p.startsWith(`docker rm -f ${DUMMY_ID}`)),
    `container drill harus tetap dibuang, panggilan: ${panggilan.join(" | ")}`
  );
});

test("drill gagal saat hasil restore punya profil tanpa akun auth", () => {
  const { hasil } = siapkan({ yatim: "3" });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /GAGAL profil tanpa akun auth\s+3/);
});

test("drill gagal saat etalase hasil restore kosong", () => {
  const { hasil } = siapkan({ etalase: "0" });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /GAGAL etalase v_public_inventory\s+0/);
});

test("drill gagal saat ada tabel public tanpa RLS", () => {
  const { hasil } = siapkan({ rlsMati: "2" });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /GAGAL tabel public tanpa RLS\s+2/);
});

test("drill gagal dan tetap membuang container saat restore keluar bukan-nol", () => {
  const { hasil, panggilan } = siapkan({ restoreRc: "1" });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /restore-postgres\.sh keluar bukan-nol/);
  assert.ok(
    panggilan.some((p) => p.startsWith(`docker rm -f ${DUMMY_ID}`)),
    "container harus dibuang walau restore gagal"
  );
});

test("drill menolak direktori tanpa dump dan tidak menjalankan container", () => {
  const { hasil, panggilan } = siapkan({}, { tanpaDump: true });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /tidak ada dump atcell-\*\.dump/);
  assert.ok(!panggilan.some((p) => p.startsWith("docker run ")), "tidak boleh ada container yang dibuat");
});

test("drill menolak dump tanpa checksum dan tidak menjalankan container", () => {
  const { hasil, panggilan } = siapkan({}, { tanpaChecksum: true });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /checksum .* tidak ada/);
  assert.ok(!panggilan.some((p) => p.startsWith("docker run ")), "tidak boleh ada container yang dibuat");
});

test("drill menolak dump yang checksum-nya tidak cocok", () => {
  const { hasil, panggilan } = siapkan({}, { checksumRusak: true });

  assert.notEqual(hasil.status, 0);
  assert.match(hasil.stdout, /tidak cocok/);
  assert.ok(!panggilan.some((p) => p.startsWith("docker run ")), "tidak boleh ada container yang dibuat");
});

test("drill memperingatkan dump yang sudah tua tanpa menggagalkan hasil", () => {
  const { hasil } = siapkan({}, { umurHari: 5 });
  assert.match(hasil.stdout, /PERINGATAN: dump terbaru berumur 5 hari/);
  assert.match(hasil.stdout, /Drill restore LULUS/);
});

test("drill menolak jalan dari shell yang bukan bash", () => {
  // Di banyak distro /bin/sh sudah symlink ke bash, jadi `sh script` tidak
  // menguji apa pun. Shell non-bash dicari dari yang benar-benar ada.
  const nonBash = ["dash", "zsh"].find(
    (nama) => spawnSync("sh", ["-c", `command -v ${nama}`]).status === 0
  );
  if (nonBash === undefined) return;

  const proses = spawnSync(nonBash, [drillScript], { encoding: "utf8", timeout: 30_000 });
  assert.equal(proses.status, 64, `${nonBash} harus ditolak dengan kode 64`);
  assert.match(proses.stderr ?? "", /wajib dijalankan dengan bash/);
});