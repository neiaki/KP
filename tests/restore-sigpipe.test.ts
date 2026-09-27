import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const restoreScript = await readFile(
  new URL("../scripts/restore-postgres.sh", import.meta.url),
  "utf8"
);

const pipefailActive = /^set -Eeuo pipefail$/m.test(restoreScript);

/**
 * Ambil program awk yang benar-benar dipakai script, bukan salinan di test ini.
 * Kalau test menulis ulang programnya sendiri, test bisa lulus padahal script
 * masih yang rusak.
 */
function awkProgram(): string {
  const match = restoreScript.match(
    /pg_restore --data-only -t profiles -f - "\$DUMP_FILE" \\\s*\n\s*\| awk -F'\\t' '([\s\S]*?)'\s*\\/
  );
  assert.ok(match, "program awk seed_auth_stubs harus ditemukan di restore script");
  return match[1];
}

/**
 * Bangun producer tiruan yang meniru keluaran `pg_restore --data-only -t profiles`:
 * header COPY, baris data, penanda akhir, lalu trailer dump.
 *
 * Trailer sengaja jauh lebih besar dari pipe buffer kernel (64 KB). Kalau
 * seluruh muatannya muat di buffer, writer selesai sebelum awk menutup pipe,
 * SIGPIPE tidak pernah terjadi, dan test akan lulus walau script sudah rusak
 * lagi. Trailer besar itulah yang membuat balapan ini benar-benar terjadi.
 *
 * Trailer dibangkitkan di dalam bash, bukan dikirim lewat argv: POSIX membatasi
 * satu argumen di 128 KB, jadi payload sebesar itu akan ditolak spawn dengan
 * E2BIG sebelum pipeline-nya sempat jalan.
 */
const TRAILER_LINES = 20000;

function pipelineFor(program: string): string {
  return `set -Eeuo pipefail
{
  printf 'COPY public.profiles (id, full_name, role, phone_number) FROM stdin;\\n'
  for id in "$@"; do
    printf '%s\\tNama Lengkap\\tadmin\\t0812\\n' "$id"
  done
  printf '\\\\.\\n'
  for ((i = 0; i < ${TRAILER_LINES}; i++)); do
    printf -- '-- trailer dump baris panjang nomor %d agar melampaui pipe buffer kernel\\n' "$i"
  done
} | awk -F'\\t' '${program}' | sort -u
`;
}

const SAMPLE_IDS = [
  "11111111-1111-1111-1111-111111111111",
  "22222222-2222-2222-2222-222222222222",
  "33333333-3333-3333-3333-333333333333",
  "44444444-4444-4444-4444-444444444444",
  "55555555-5555-5555-5555-555555555555",
  "66666666-6666-6666-2222-222222222222",
];

test("pipefail tetap aktif di restore script", () => {
  // Kegagalan SIGPIPE cuma merusak run kalau pipefail ikut aktif. Kalau
  // pipefail dimatikan, seluruh test lain di file ini tidak lagi membuktikan
  // apa pun soal perilaku script yang sebenarnya dijalankan.
  assert.ok(pipefailActive, "restore script harus tetap memakai set -Eeuo pipefail");
});

test("konsumen di pipeline pg_restore tidak keluar sebelum producer selesai", () => {
  // Invariant: di bawah pipefail, konsumen yang keluar lebih dulu menutup pipe,
  // producer kena SIGPIPE, dan seluruh run mati dengan 141 walau restore-nya
  // sendiri tidak salah. Program awk karena itu tidak boleh memakai exit
  // maupun quit, yang keduanya menghentikan pembacaan sebelum producer selesai.
  const program = awkProgram();
  assert.doesNotMatch(
    program,
    /(^|[;{]|\s)(exit|quit)(\s|;|$)/m,
    "awk di seed_auth_stubs tidak boleh keluar lebih dulu; itu memicu SIGPIPE pada pg_restore"
  );
});

test("konsumen di pipeline lain juga tidak keluar lebih dulu", () => {
  // Pola yang sama bisa muncul di konsumen lain di script ini, jadi seluruh
  // stage yang jadi konsumen dalam pipeline diperiksa, bukan cuma awk.
  const stages = [...restoreScript.matchAll(/\|\s*([a-z_]+)/g)].map((m) => m[1]);
  const earlyExitConsumers: Record<string, true> = { head: true, grep: true };
  for (const stage of stages) {
    assert.equal(
      earlyExitConsumers[stage],
      undefined,
      `stage "${stage}" di pipeline bisa keluar sebelum producer selesai`
    );
  }
});

test("guard auth.users tidak memakai pipeline yang bisa kena SIGPIPE", () => {
  // Guard ini sempat melaporkan auth.users tidak ada padahal tabelnya ada.
  // Pipeline psql | grep -q punya dua masalah sekaligus: grep -q keluar begitu
  // nemu t sehingga psql kena SIGPIPE dan pipefail jadi 141, dan stderr yang
  // dibuang ke /dev/null membuat kegagalan asli ikut hilang. Dua-duanya harus
  // benar-benar hilang dari script, bukan dielakkan.
  assert.doesNotMatch(
    restoreScript,
    /psql[^\n|]*\|\s*grep\b/,
    "psql tidak boleh dialirkan ke grep; pakai penampung variabel"
  );
  assert.doesNotMatch(
    restoreScript,
    /to_regclass\('auth\.users'\)[\s\S]{0,300}?2>\/dev\/null/,
    "stderr pemeriksaan auth.users tidak boleh dibuang, supaya kegagalan asli tampil"
  );
  // Kegagalan psql harus tetap menggagalkan run, bukan diteruskan lewat || true.
  assert.doesNotMatch(
    restoreScript,
    /psql[\s\S]{0,300}?\|\|\s*true/,
    "pemeriksaan auth.users tidak boleh ditelan dengan || true"
  );
});

test("perbandingan auth.users normalizing keluaran psql", async () => {
  // Bug kedua yang baru ketahuan setelah perbaikan pertama dikirim: `psql -q -t`
  // tanpa -A mencetak " t" dengan spasi di depan, jadi perbandingan string
  // yang tadinya ketat melaporkan auth.users tidak ada padahal tabelnya ada.
  // Test ini menjalankan normalisasi yang benar-benar dipakai script di atas
  // bentuk keluaran psql yang nyata, termasuk yang gagal.
  const script = `set -Eeuo pipefail
probe="$(printf '%s' "$1")"
probe="\${probe//[[:space:]]/}"
if [ "$probe" = "t" ]; then echo ADA; else echo TIDAK; fi
`;
  const cases: [string, string][] = [
    [" t", "ADA"],
    ["t", "ADA"],
    [" t\n", "ADA"],
    ["f", "TIDAK"],
    [" f", "TIDAK"],
    ["", "TIDAK"],
    ["psql: error: could not connect to server", "TIDAK"],
  ];
  await Promise.all(
    cases.map(([input, expected]) =>
      run("bash", ["-c", script, "bash", input]).then(({ stdout }) => {
        assert.equal(stdout.trim(), expected, `input ${JSON.stringify(input)}`);
      })
    )
  );
});

test("pemeriksaan auth.users memakai keluaran unaligned dari psql", () => {
  // Tanpa -A, psql -t mencetak " t" dan perbandingan ketat jadi salah menilai.
  // Ini persis bug yang membuat guard melaporkan auth.users tidak ada.
  assert.match(
    restoreScript,
    /psql "\$RESTORE_DATABASE_URL" -q -t -A/,
    "psql harus dipanggil dengan -A supaya keluarannya bisa dibandingkan string"
  );
  assert.match(
    restoreScript,
    /auth_probe="\$\{auth_probe\/\/\[\[:space:\]\]\/\}"/,
    "whitespace harus dibuang sebelum auth_probe dibandingkan dengan t"
  );
});

test("program awk di script mengeluarkan tepat id profiles dan membuang trailer", () => {
  const program = awkProgram();
  return run("bash", ["-c", pipelineFor(program), "bash", ...SAMPLE_IDS]).then(
    ({ stdout }) => {
      assert.deepEqual(
        stdout.trim().split("\n").filter(Boolean),
        [...SAMPLE_IDS].sort(),
        "awk harus mengeluarkan tepat id profiles dan membuang trailer dump"
      );
    },
    (error: { code?: number; stderr?: string }) => {
      assert.fail(
        `pipeline awk gagal dengan kode ${error.code}: ${error.stderr ?? ""}. ` +
          "Kode 141 berarti awk keluar sebelum producer selesai."
      );
    }
  );
});

test("program awk di script tidak keluar 141 walau dijalankan berulang", () => {
  // SIGPIPE bersifat balapan, jadi sekali lulus tidak membuktikan apa pun.
  // Producer yang sama dijalankan 25 kali; kalau awk keluar lebih dulu,
  // sebagian run akan selesai dengan 141 dan test ini gagal.
  const program = awkProgram();
  const script = pipelineFor(program);
  return Promise.all(
    Array.from({ length: 25 }, () =>
      run("bash", ["-c", script, "bash", ...SAMPLE_IDS])
    )
  ).then(
    (results) => {
      for (const result of results) {
        assert.deepEqual(
          result.stdout.trim().split("\n").filter(Boolean),
          [...SAMPLE_IDS].sort(),
          "keluarannya harus tetap benar di setiap run"
        );
      }
    },
    (error: { code?: number; stderr?: string }) => {
      assert.fail(
        `pipeline awk gagal dengan kode ${error.code}: ${error.stderr ?? ""}`
      );
    }
  );
});
