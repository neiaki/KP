import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Repo ini publik, jadi apa pun yang ada di sini bisa dibaca
 * siapa saja tanpa login. Test ini menahan tiga kelas kebocoran
 * yang sudah pernah terjadi di repo ini.
 *
 * 1. IP publik asli. Hace-nya karena rule firewall yang
 *    benar-benar jalan di host disalin apa adanya ke dokumen,
 *    jadi nilainya nyata. Repo ini tidak boleh memuat
 *    alamat IP milik siapa pun, termasuk IP rumah owner.
 *
 * 2. Token dan kunci layanan, dari log atau dari environment
 *    produksi yang salah tempel.
 *
 * 3. URL yang menyisipkan kredensial di dalamnya.
 *
 * Yang boleh muncul hanya placeholder untuk dokumentasi atau
 * pengujian, dan semuanya tercatat terbuka di bawah. Menambah
 * nilai baru ke daftar itu keputusan sadar, bukan lolos diam.
 */

// Rentang aman untuk dokumentasi dan pengujian.
const RENTANG_IP_SAFE = new Set([
  "127",
  "10",
  "192.168",
  "0",
  "192.0.2",
  "198.51.100",
  "203.0.113",
]);

// Alamat publik yang dipakai sebagai konstanta yang dikenal
// luas, bukan milik siapa pun. Tidak ada di sini alamat
// pribadi, alamat rumah, atau alamat VPS.
const IP_KONSTANTA_PUBLIK = new Set([
  "1.2.3.4",  // placeholder dokumen lama
  "1.1.1.1",  // resolver publik
  "8.8.8.8",  // resolver publik
  "9.9.9.9",  // resolver publik
]);

const POLA_IP = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;

const POLA_TOKEN = [
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /sb_publishable_[A-Za-z0-9_-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk_live_[A-Za-z0-9]{10,}/,
  /pk_live_[A-Za-z0-9]{10,}/,
  /sk-ant-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY/,
];

const SKEMA_DB =
  "postgres|postgresql|redis|mongodb|mysql";

const POLA_URL_KREDENSIAL = new RegExp(
  `(?:${SKEMA_DB}):` +
    `//[^\\s"'<>()]*:[^\\s"'<>()@]+@`,
  "gi"
);

// Password dummy yang boleh muncul pada URL ber-kredensial.
// Semuanya password container buang-buang atau placeholder
// dokumentasi, bukan password sungguhan. Password sungguhan
// selalu string acak, jadi tidak mungkin menabrak daftar ini.
// Nilai yang mengandung metakarakter regex bukan kredensial.
// Contohnya pola pencarian di docs/SECRET-ROTATION.md yang memang
// dipakai untuk mencari kebocoran.
const POLA_BUKAN_NILAI = /[[\]()\\.*+?|]/;

const PASSWORD_DUMMY = new Set([
  "postgres",       // container postgres di workflow CI
  "x",              // fixture最短 di test penjaga restore
  "PASSWORD",
  "YOUR-PASSWORD",
  "rahasia",
  "secret",
  "password",
  "example",
  "dummy",
]);

const SKIP = new RegExp(
  "\\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|" +
    "eot|pdf|zip|gz|mp4|webm|lock)$",
  "i"
);

const root = fileURLToPath(new URL("../", import.meta.url));

const terlacak = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString()
  .split("\0")
  .filter((p) => p && !SKIP.test(p));

function barisTeks(rel: string): { baris: number; teks: string }[] {
  let isi: string;
  try {
    isi = readFileSync(`${root}${rel}`, "utf8");
  } catch {
    return [];
  }
  // Berkas biner bisa lolos penyaringan ekstensi.
  if (isi.includes("\0")) return [];
  return isi.split("\n").map((teks, i) => ({ baris: i + 1, teks }));
}

function ipBerisiko(teks: string): string[] {
  const hasil: string[] = [];
  for (const cocok of teks.matchAll(POLA_IP)) {
    const a = cocok[1];
    const b = cocok[2];
    const c = cocok[3];
    const d = cocok[4];
    if ([a, b, c, d].some((o) => Number(o) > 255)) continue;
    const ip = `${a}.${b}.${c}.${d}`;
    if (IP_KONSTANTA_PUBLIK.has(ip)) continue;
    if (a === "172" && Number(b) >= 16 && Number(b) <= 31) continue;
    if (RENTANG_IP_SAFE.has(`${a}.${b}.${c}`)) continue;
    if (RENTANG_IP_SAFE.has(`${a}.${b}`)) continue;
    if (RENTANG_IP_SAFE.has(a)) continue;
    hasil.push(ip);
  }
  return hasil;
}

test("repo tidak memuat IP publik asli", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    for (const { baris, teks } of barisTeks(rel)) {
      for (const ip of ipBerisiko(teks)) {
        bermasalah.push(`${rel}:${baris} ${ip}`);
      }
    }
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `IP ini tidak boleh ada di repo publik. Pakai variabel ` +
      `ADMIN_IP atau rentang RFC 5737: ${bermasalah.join(", ")}`
  );
});

test("repo tidak memuat token atau kunci layanan", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    for (const { baris, teks } of barisTeks(rel)) {
      for (const pola of POLA_TOKEN) {
        if (pola.test(teks)) {
          bermasalah.push(`${rel}:${baris} cocok ${pola}`);
        }
      }
    }
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `token ini tidak boleh ada di repo publik: ${bermasalah.join(", ")}`
  );
});

test("repo tidak memuat url dengan kredensial di dalamnya", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    for (const { baris, teks } of barisTeks(rel)) {
      for (const cocok of teks.matchAll(POLA_URL_KREDENSIAL)) {
        const password = cocok[0].split("//")[1]?.split(":")[1] ?? "";
        const nilai = password.replace(/@.*$/, "");
        if (PASSWORD_DUMMY.has(nilai)) continue;
        if (POLA_BUKAN_NILAI.test(nilai)) continue;
        bermasalah.push(`${rel}:${baris} ${nilai.slice(0, 20)}`);
      }
    }
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `url berikut menyisipkan kredensial: ${bermasalah.join(", ")}`
  );
});

test("daftar ip yang diizinkan jujur", () => {
  // Kalau RENTANG_IP_SAFE diisi nilai yang bukan range, guard
  // di atas diam-diam jadi longgar.
  for (const p of RENTANG_IP_SAFE) {
    assert.match(
      p,
      /^\d{1,3}(\.\d{1,3}){0,2}$/,
      `entri ini bukan bentuk ip: ${p}`
    );
  }
});


