import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Repo ini diperlakukan sebagai publik walau sekarang private, jadi apa pun
 * yang ada di sini harus aman dibaca siapa saja. Test ini menahan tiga
 * kelas kebocoran yang sudah pernah terjadi di repo ini.
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
  // gh[pousr] mencakup personal, oauth, user, server, dan refresh.
  // docs/SECRET-ROTATION.md sudah memakai kelas yang sama sejak awal.
  /gh[pousr]_[A-Za-z0-9]{20,}/,
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

/*
 * Userinfo menurut RFC 3986 hanya boleh berisi unreserved, pct-encoded,
 * dan sub-delims, lalu ditutup titik dua. Jadi karakter pemisah
 * komponen (`/`, `?`, `#`) tidak mungkin jadi bagian userinfo,
 * dan memuatnya membuat pencocokan melintasi path atau query.
 *
 * Tanpa larangan itu, `postgres://example.com/db?redirect=a:b@c` ikut
 * terbaca punya kredensial padahal tidak ada password sama sekali.
 * Pola di bawah memakai kelas RFC 3986 persis, bukan daftar tebakan.
 */
const USERINFO =
  "(?:%[0-9A-Fa-f]{2}|[A-Za-z0-9._~-]|" +
  "[!$&'()*+,;=]|:)+";

const POLA_URL_KREDENSIAL = new RegExp(
  `(?:${SKEMA_DB})://${USERINFO}@`,
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
  "x",              // fixture pendek di test penjaga restore
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

/*
 * Guard ini sendiri harus memuat alamat yang seharusnya ditolak,
 * karena test pembanding allowlist tidak bisa cek Homestead
 * tanpa counter-example. Tanpa pengecualian di bawah, guard akan
 * selalu gagal pada dirinya sendiri, dan jalan keluar yang paling
 * mudah diambil orang adalah mematikan guard-nya.
 *
 * Penegakan pada file ini tetap ada: test allowlist dan test
 * kepekaan pola di bagian bawah dijalankan sebagai kode, bukan
 * dengan memindai teks berkasnya.
 */
const SKIP_BERKAS = new Set(["tests/no-secret-in-repo.test.ts"]);

const terlacak = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString()
  .split("\0")
  .filter((p) => p && !SKIP.test(p) && !SKIP_BERKAS.has(p));

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

/*
 * IPv6 belum ditutup oleh guard di atas. Pola IPv4 hanya mengenali
 * empat oktet bertitik, jadi alamat IPv6 tidak pernah dibaca sama
 * sekali. Padahal host produksi punya alamat IPv6, dan alamat itu
 * milik owner, sama seperti IP v4-nya.
 *
 * Token yang tersusun dari hex dan titik dua bukan cuma alamat.
 * Bentuk yang sama dipakai MAC address dan sidik jari sertifikat.
 * Ketiganya dibedakan dari bentuknya:
 * IPv6 punya delapan grup, atau punya `::` sebagai penyingkat
 * nol. MAC selalu enam grup dan tidak pernah punya `::`, sidik jari
 * keytool juga tidak, dan timestamp tidak punya `::` serta hanya
 * dua titik dua. Semua grup sepanjang dua digit berarti byte-byte
 * dari sidik jari, bukan alamat.
 *
 * Bentuk terakhir yang harus tertangkap adalah alamat IPv4-mapped
 * seperti `::ffff:203.0.113.7`, karena bentuk itu lazim dipakai
 * di header `x-forwarded-for`. Ekor IPv4-nya ikut dalam token,
 * lalu diperiksa dengan aturan IPv4 yang sama.
 */
const POLA_TOKEN_IPV6 =
  /(?<![0-9A-Za-z:.])([0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?:\.(?:\d{1,3}\.?){3})?)(?![0-9A-Za-z:.])/g;

/*
 * Nilai IPv6 yang boleh muncul di repo publik: loopback untuk
 * fixture lokal, dan rentang dokumentasi RFC 3849 yang tidak
 * dimiliki siapa pun.
 *
 * Link-local `fe80::/10` sengaja tidak ada di sini. Alamat itu
 * milik satu host di satu link, jadi justru menunjuk lokasi
 * fisik. Contoh yang dipakai dokumentasi umum memakai `fe80::1`,
 * tapi repo ini tidak punya kebutuhan operasional untuk itu.
 */
const IPV6_DIJKASIH = [/^::1?$/, /^2001:db8(:|$)/];

/*
 * Nol di depan tiap grup tidak mengubah alamat, tapi mengubah
 * bentuknya, jadi `2001:db8::1` dan `2001:0db8:0:0:0:0:0:1`
 * adalah alamat yang sama. Tanpa normalisasi, allowlist hanya
 * akan menangkap salah satu dari keduanya.
 */
function normalisasiIpv6(alamat: string): string {
  return alamat
    .split(":")
    .map((grup) =>
      grup === "" ? "" : grup.replace(/^0+(?=.)/, "").toLowerCase()
    )
    .join(":");
}

function ipv6Berisiko(teks: string): string[] {
  const hasil: string[] = [];
  for (const cocok of teks.matchAll(POLA_TOKEN_IPV6)) {
    const alamat = cocok[1];
    const titikDua = (alamat.match(/:/g) ?? []).length;
    if (!alamat.includes("::") && titikDua < 7) continue;

    // Alamat IPv4-mapped dan IPv4-compatible. Ekor IPv4-nya
    // dinilai dengan aturan IPv4, jadi `::ffff:203.0.113.7`
    // boleh tapi `::ffff:198.18.7.9` tidak.
    const ipv4 = alamat.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
    if (ipv4) {
      if (ipBerisiko(ipv4).length > 0) hasil.push(alamat);
      continue;
    }

    const grup = alamat.split(":").filter((g) => g.length > 0);
    if (grup.every((g) => g.length === 2)) continue;
    const baku = normalisasiIpv6(alamat);
    if (IPV6_DIJKASIH.some((pola) => pola.test(baku))) continue;
    hasil.push(alamat);
  }
  return hasil;
}

test("repo tidak memuat alamat ipv6", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    for (const { baris, teks } of barisTeks(rel)) {
      for (const alamat of ipv6Berisiko(teks)) {
        bermasalah.push(`${rel}:${baris} ${alamat}`);
      }
    }
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `alamat ipv6 ini tidak boleh ada di repo publik: ` +
      `${bermasalah.join(", ")}`
  );
});

/*
 * IP bukan satu-satunya identitas host. Nama host, machine-id, dan
 * id instance menunjuk lokasi fisik yang sama, dan tiga hal itu
 * muncul bersama di output `hostnamectl`, `docker inspect`, dan
 * panel cloud. Semuanya milik owner, jadi repo publik tidak boleh
 * memuat salah satunya.
 *
 * Pola di bawah sengaja spesifik per penyedia. Pola umum seperti
 * `host: <apa pun>` akan menolak hostname container CI dan
 * hostname dummy di test, jadi hanya bentuk yang benar-benar
 * dipakai penyedia cloud yang ditutup.
 */
const POLA_IDENTITAS_HOST: { pola: RegExp; label: string }[] = [
  // Hostname bawaan Tencent Cloud CVM, bentuk VM-<zone>-<index>-<suffix>.
  {
    pola: /\bVM-\d{1,3}-\d{1,5}-[a-z0-9]{4,}\b/g,
    label: "hostname CVM Tencent",
  },
  // Id instance dan id Lighthouse Tencent Cloud.
  {
    pola: /\b(?:ins|ivl|cvm|lhins)-[a-z0-9]{6,}\b/g,
    label: "id instance Tencent",
  },
];

/*
 * machine-id adalah 32 karakter hex dan muncul di paling banyak
 * output audit host, tapi hex 32 sendiri terlalu sering muncul
 * sebagai sidik jari dan dummy test. Pola ini membaca nilai
 * machine-id saja, dengan penanda di sekitarnya yang dicari lebih
 * dulu.
 */
const POLA_MACHINE_ID =
  /(?:machine[-_ ]?id|machineid)\D{0,24}([0-9a-f]{32})\b/gi;

test("repo tidak memuat identitas host milik owner", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    for (const { baris, teks } of barisTeks(rel)) {
      for (const { pola, label } of POLA_IDENTITAS_HOST) {
        for (const cocok of teks.matchAll(pola)) {
          bermasalah.push(`${rel}:${baris} ${label} ${cocok[0]}`);
        }
      }
      for (const cocok of teks.matchAll(POLA_MACHINE_ID)) {
        bermasalah.push(`${rel}:${baris} machine-id ${cocok[1]}`);
      }
    }
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `identitas host berikut tidak boleh ada di repo publik: ` +
      `${bermasalah.join(", ")}`
  );
});

test("daftar ipv6 yang diizinkan jujur", () => {
  // Kalau IPV6_DIJKASIH diisi pola yang terlalu longgar, guard
  // di atas diam-diam jadi longgar juga. Perbandingan lewat
  // normalisasi supaya allowlist tidak bisa lolos hanya karena
  // nol di depan grup tidak dihapus.
  const bolehMuncul = (nilai: string) => {
    const baku = normalisasiIpv6(nilai);
    return IPV6_DIJKASIH.some((pola) => pola.test(baku));
  };
  const diizinkan = [
    "::",
    "::1",
    "2001:db8::1",
    "2001:0db8:0:0:0:0:0:1",
  ];
  for (const nilai of diizinkan) {
    assert.ok(bolehMuncul(nilai), `nilai ini harus diizinkan: ${nilai}`);
  }
  const ditolak = ["::2", "2001:db9::1", "2606:4700::1111", "fe80::1"];
  for (const nilai of ditolak) {
    assert.ok(
      !bolehMuncul(nilai),
      `nilai ini tidak boleh diizinkan: ${nilai}`
    );
  }
});

/*
 * Password adalah seluruh teks setelah titik dua pertama pada userinfo.
 * Userinfo bisa memuat titik dua lagi. Memotong di titik dua kedua
 * menghasilkan potongan salah, dan password asli ikut lolos.
 */
function passwordDari(url: string): string | null {
  const setelahSkema = url.slice(url.indexOf("//") + 2);
  const akhirUserinfo = setelahSkema.indexOf("@");
  if (akhirUserinfo === -1) return null;
  const userinfo = setelahSkema.slice(0, akhirUserinfo);
  const titik = userinfo.indexOf(":");
  if (titik === -1) return null;
  const password = userinfo.slice(titik + 1);
  return password.length > 0 ? password : null;
}

test("repo tidak memuat url dengan kredensial di dalamnya", () => {
  const bermasalah: string[] = [];
  for (const rel of terlacak) {
    for (const { baris, teks } of barisTeks(rel)) {
      for (const cocok of teks.matchAll(POLA_URL_KREDENSIAL)) {
        const nilai = passwordDari(cocok[0]);
        if (nilai === null) continue;
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



/*
 * Uji kepekaan. Guard yang selalu lolos tidak berguna sama sekali:
 * satu ketikan di regex membuat penyaringan jadi tidak pernah
 * menemukan apa pun, dan tidak ada yang melihatnya karena semua
 * test tetap hijau. Jadi setiap kelas kebocoran diuji dua arah:
 * nilai yang harus tertangkap, dan nilai yang mirip sekali tapi
 * memang tidak boleh ikut tertangkap.
 *
 * Nilai yang dipakai di sini bukan milik owner repo. Yang menyerupai
 * IP asli sengaja dibangun dari rentang dokumentasi RFC 5737 dan
 * RFC 3849, plus satu konstanta publik yang sudah dipakai guard IPv4
 * juga.
 */
const IPV6_YANG_HARUS_TERTANGKAP = [
  // 2606:4700::1111 adalah alamat 1.1.1.1 dari Cloudflare, sudah
  // dipublikasikan dan bukan milik siapa pun di repo ini.
  "2606:4700::1111",
  // Link-local, milik satu host di satu link.
  "fe80::1",
  "9db4:1f2e:3a5c:7d8e:0f1a:2b3c:4d5e:6f70",
  // IPv4-mapped dengan IPv4 yang bukan rentang dokumentasi.
  "::ffff:198.18.7.9",
];

test("guard ipv6 menangkap alamat yang bukan loopback atau dokumentasi", () => {
  for (const nilai of IPV6_YANG_HARUS_TERTANGKAP) {
    assert.deepEqual(
      ipv6Berisiko(`ip = ${nilai}`),
      [nilai],
      `nilai ini seharusnya ditolak: ${nilai}`
    );
  }
});

test("guard ipv6 tidak menolak nilai yang cuma mirip", () => {
  const boleh = [
    "::1",
    "::",
    "2001:db8::1",
    "2001:0db8:0:0:0:0:0:1",
    // IPv4-mapped dari rentang dokumentasi, bentuk yang lazim di
    // header x-forwarded-for.
    "::ffff:203.0.113.7",
    "::ffff:192.0.2.15",
    // Sidik jari sertifikat dari keytool, 32 grup dua digit.
    "5A:62:B4:4A:D0:40:8A:ED:D1:DF:23:17:4F:21:9C:FE:25:CB:CA:C6:D8:E2:8E:D3:E5:02:3F:E5:C6:59:A9:E3",
    // MAC address.
    "5A:62:B4:4A:D0:40:8A:ED",
    // Waktu dan durasi.
    "10:30:100",
    "04:52:05",
    "00:00",
  ];
  for (const nilai of boleh) {
    assert.deepEqual(
      ipv6Berisiko(`nilai = ${nilai}`),
      [],
      `nilai ini tidak boleh ditolak: ${nilai}`
    );
  }
});

test("guard ipv4 masih menangkap ip publik", () => {
  // Dua nilai pertama adalah konstanta publik yang sudah boleh
  // muncul, jadi harus tetap lolos. Sisanya harus tertangkap.
  for (const nilai of ["1.1.1.1", "203.0.113.9", "192.168.1.10", "10.0.0.1"]) {
    assert.deepEqual(ipBerisiko(`ip = ${nilai}`), [], `seharusnya lolos: ${nilai}`);
  }
  // 198.18.0.0/15 adalah rentang benchmark RFC 2544 dan
  // 192.88.99.0/24 adalah relay 6to4 yang sudah dibubarkan.
  // Keduanya bukan milik siapa pun dan tidak boleh lolos, jadi
  // dipakai sebagai contoh yang harus ditolak.
  for (const nilai of ["198.18.7.9", "192.88.99.7"]) {
    assert.deepEqual(
      ipBerisiko(`ip = ${nilai}`),
      [nilai],
      `seharusnya tertangkap: ${nilai}`
    );
  }
});

test("guard identitas host menangkap nama host penyedia", () => {
  // Dua baris pertama adalah hostname bawaan Tencent Cloud CVM,
  // dua baris berikutnya id instance dan id Lighthouse. Semuanya
  // contoh sintetis, bukan hostname host mana pun.
  const harusTertangkap = [
    "VM-3-17-build01",
    "VM-42-9-staging",
    "ins-4a1b2c3d",
    "lhins-9f8e7d6c",
  ];
  for (const nilai of harusTertangkap) {
    const kena = POLA_IDENTITAS_HOST.some(
      ({ pola }) => [...nilai.matchAll(pola)].length > 0
    );
    assert.ok(kena, `nama host ini seharusnya ditolak: ${nilai}`);
  }
});

test("guard identitas host tidak menangkap nama biasa", () => {
  const boleh = [
    "ubuntu",
    "atcell-web-1",
    "postgres",
    "coolify-sentinel",
    "ins-app",
    "vm-small",
    "VM-1-1",
  ];
  for (const nilai of boleh) {
    for (const { pola } of POLA_IDENTITAS_HOST) {
      // `test` pada regex global menyimpan lastIndex antar panggilan,
      // jadi hasil berturutan bergantian dan guard ini bisa lolos
      // karena ada nilai yang tidak pernah benar-benar diuji.
      // matchAll tidak menyimpan apa pun.
      assert.deepEqual(
        [...nilai.matchAll(pola)],
        [],
        `nama ini tidak boleh ditolak: ${nilai}`
      );
    }
  }
});

test("guard machine id menangkap nilai di belakang penanda", () => {
  const hex = "0123456789abcdef0123456789abcdef";
  for (const templat of [
    `machine-id: ${hex}`,
    `machine_id = ${hex}`,
    `Machine ID  ${hex}`,
    `machineid ${hex}`,
  ]) {
    const cocok = [...templat.matchAll(POLA_MACHINE_ID)];
    assert.equal(cocok.length, 1, `tidak tertangkap: ${templat}`);
    assert.equal(cocok[0][1], hex);
  }
});

test("guard machine id tidak menangkap hex tanpa penanda", () => {
  const hex = "0123456789abcdef0123456789abcdef";
  for (const templat of [hex, `cek digest: ${hex}`, `id: ${hex}`]) {
    assert.deepEqual(
      [...templat.matchAll(POLA_MACHINE_ID)],
      [],
      `seharusnya tidak tertangkap: ${templat}`
    );
  }
});

/*
 * File guard ini dikecualikan dari pemindaian di atas, karena
 * harus memuat nilai yang justru ditolak. Pengecualian itu
 * membuka lubang: file ini justru tempat paling mungkin ada
 * nilai asli ditempel, karena isinya soal nilai asli.
 *
 * Test di bawah menutup lubang itu. Isi file dipindai seperti
 * biasa, tapi setiap nilai contoh yang sengaja ada di sini
 * diganti placeholder lebih dulu. Jadi menyisipkan IP asli ke
 * file guard tetap ketahuan, sementara counter-example yang
 * memang dibutuhkan tetap bisa ditulis.
 *
 * Semuanya sintetis. Tidak ada nilai milik owner, dan tidak ada
 * alamat yang benar-benar dialokasikan ke siapa pun.
 */
const CONTOH_GUARD = [
  "2606:4700::1111",
  "fe80::1",
  "fe80::",
  "2001:db9::1",
  "::2",
  "9db4:1f2e:3a5c:7d8e:0f1a:2b3c:4d5e:6f70",
  "::ffff:198.18.7.9",
  "::ffff:203.0.113.7",
  "::ffff:192.0.2.15",
  "2001:0db8:0:0:0:0:0:1",
  "0123456789abcdef0123456789abcdef",
  "VM-3-17-build01",
  "VM-42-9-staging",
  "198.18.7.9",
  "198.18.0.0",
  "192.88.99.7",
  "192.88.99.0",
  "lhins-9f8e7d6c",
  "ins-4a1b2c3d",
];

test("file guard sendiri tidak memuat nilai milik siapa pun", () => {
  const nama = "tests/no-secret-in-repo.test.ts";
  const isi = readFileSync(`${root}${nama}`, "utf8");
  // Panjang dari panjang, supaya `::ffff:198.18.7.9` diganti sebelum
  // `198.18.7.9` dan tidak menyisakan ekor yang tak dikenal.
  const disamarkan = [...CONTOH_GUARD]
    .sort((a, b) => b.length - a.length)
    .reduce((teks, nilai) => teks.split(nilai).join("<contoh>"), isi);

  const bermasalah = [
    ...ipBerisiko(disamarkan).map((n) => `ipv4 ${n}`),
    ...ipv6Berisiko(disamarkan).map((n) => `ipv6 ${n}`),
  ];
  for (const { pola, label } of POLA_IDENTITAS_HOST) {
    for (const cocok of disamarkan.matchAll(pola)) {
      bermasalah.push(`${label} ${cocok[0]}`);
    }
  }
  for (const cocok of disamarkan.matchAll(POLA_MACHINE_ID)) {
    bermasalah.push(`machine-id ${cocok[1]}`);
  }
  assert.deepEqual(
    bermasalah.sort(),
    [],
    `file guard sendiri memuat nilai yang tidak boleh ada: ` +
      `${bermasalah.join(", ")}`
  );
});

test("semua contoh di file guard benar-benar sintetis", () => {
  // Nilai contoh tidak boleh memakai IP milik orang. Rentang
  // benchmark RFC 2544, rentang 6to4 yang dibubarkan, dan
  // konstanta resolver publik adalah satu-satunya yang boleh
  // muncul di daftar ini.
  const boleh = new Set([
    "198.18.7.9",
    "198.18.0.0",
    "192.88.99.7",
    "192.88.99.0",
    "1.1.1.1",
    "8.8.8.8",
    "9.9.9.9",
  ]);
  for (const nilai of CONTOH_GUARD) {
    for (const ip of ipBerisiko(nilai)) {
      assert.ok(
        boleh.has(ip),
        `contoh di guard memakai ip yang tidak sintetis: ${nilai}`
      );
    }
  }
});
