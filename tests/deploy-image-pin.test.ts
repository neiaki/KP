import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

/*
 * Dockerfile.coolify menarik image hasil build GitHub Actions. Semula tag-nya
 * `latest`, dan itu membuat deploy meneruskan image lama tanpa pernah gagal.
 *
 * Coolify menjalankan `docker build --no-cache` tanpa `--pull`. --no-cache
 * hanya membersihkan cache lapisan build, bukan cache base image, jadi
 * `FROM ghcr.io/neiaki/kp:latest` memakai salinan tag yang sudah ada di lokal
 * VPS dan tidak pernah menanyakan registry lagi.
 *
 * Gejalanya tidak muncul di laporan Coolify. Status deployment hijau, health
 * check hijau, health endpoint tetap 200. Yang membedakan hanya isi respons:
 * /robots.txt dilayani sebagai HTML, footer masih memakai warna navy lama,
 * nomor telepon kosong, dan ukuran HTML landing sama persis seperti sebelum
 * deploy.
 *
 * Karena tidak ada sinyal yang gagal, penjaga di sini harus bisa menangkap
 * kembalinya ke `latest` tanpa deploy sungguhan. Uji negatif di akhir berkas
 * memastikan predikatnya sendiri masih bisa menangkap, karena kelas cacat
 * "guard yang diam-diam tidak bisa gagal" sudah beberapa kali muncul di repo.
 *
 * Uji "commit yang dipin ada di repository" sengaja tidak ada di sini.
 * actions/checkout@v4 di kedua workflow memakai fetch-depth bawaan yaitu satu,
 * jadi runner hanya memegang satu commit dan commit sebelumnya tidak ada di
 * objek database. Uji seperti itu akan hijau di mesin lokal dan merah di CI.
 * Membiarkannya lulus diam-diam di shallow clone tidak lebih baik, karena
 * penjaganya lalu berhenti menjaga tanpa ada yang gagal. Tag salah bentuk sudah
 * ditolak tiga test lain, dan tag yang menunjuk commit tidak ada akan gagal
 * di deploy dengan pesan yang menyebut tagnya, jadi kehilangan uji ini tidak
 * membuka jalan bagi kegagalan senyap.
 */

const repo = (rel: string) => new URL(rel, import.meta.url);

const dockerfile = await readFile(repo("../Dockerfile.coolify"), "utf8");
const workflow = await readFile(
  repo("../.github/workflows/docker-publish.yml"),
  "utf8",
);

const BENTUK_SHA = /^sha-[0-9a-f]{40}$/;

/**
 * Ambil tag dari baris FROM yang aktif.
 *
 * Komentar di Dockerfile ini juga memuat contoh `FROM ... sha-<commit>`, jadi
 * yang diambil harus baris yang benar-benar ada di luar blok komentar.
 */
function tagDariFrom(isi: string): string | null {
  for (const baris of isi.split("\n")) {
    const cocok = baris.match(/^\s*FROM\s+\S+/);
    if (cocok) {
      const tag = cocok[0].trim().split(/\s+/).pop() ?? "";
      const titik = tag.lastIndexOf(":");
      return titik === -1 ? "" : tag.slice(titik + 1);
    }
  }
  return null;
}

/**
 * Tag dianggap aman kalau persis sha-<commit> sepanjang 40 karakter.
 *
 * Latest ditolak karena memakai cache base image lokal VPS. Variabel build
 * ditolak karena bisa kosong tanpa terlihat kalau Coolify tidak mengirimnya.
 */
function tagAman(tag: string | null): boolean {
  if (!tag) return false;
  if (tag.includes("$") || tag.includes("{")) return false;
  if (tag.includes("ARG")) return false;
  return BENTUK_SHA.test(tag);
}

function tag(): string {
  const nilai = tagDariFrom(dockerfile);
  assert.ok(nilai, "tidak ada baris FROM di Dockerfile.coolify");
  return nilai;
}

test("tag di Dockerfile.coolify aman untuk deploy Coolify", () => {
  assert.ok(
    tagAman(tag()),
    `tag "${tag()}" tidak aman. Coolify menjalankan docker build tanpa ` +
      "--pull, jadi tag harus berupa sha-<commit> sepanjang 40 karakter, " +
      "bukan latest.",
  );
});

test("tag itu bukan latest", () => {
  assert.notEqual(
    tag(),
    "latest",
    "tag latest memakai cache base image lokal VPS sehingga deploy hijau " +
      "padahal image lama yang jalan",
  );
});

test("format tag yang dipin sama dengan yang diturunkan workflow", () => {
  const menurunkanShaPenuh =
    /type=raw,value=sha-\$\{\{\s*github\.sha\s*\}\}/.test(workflow);
  assert.ok(
    menurunkanShaPenuh,
    "docker-publish.yml tidak lagi menurunkan tag sha-${{ github.sha }} penuh",
  );
});

test("penjaga bisa menangkap tag berbahaya, termasuk latest", () => {
  // Uji negatif untuk predikat di atas, bukan untuk parser-nya. Kalau
  // tagAman ternyata menerima latest, maka test pertama di berkas ini tidak
  // sedang mindedguards apa pun.
  const buruk = [
    ["latest", "latest"],
    ["tag kosong", ""],
    ["sha terpotong", "sha-862e1899308e"],
    ["variasinya build", "${IMAGE_TAG}"],
    ["ARG di tag", "ARG"],
    ["branch name", "main"],
    ["hanya sha tanpa commit", "sha-"],
  ] as const;

  for (const [nama, nilai] of buruk) {
    assert.equal(
      tagAman(nilai),
      false,
      `tag "${nama}" dianggap aman oleh penjaga, padahal tidak boleh dipakai`,
    );
  }

  const bagus = `sha-${"a".repeat(40)}`;
  assert.equal(
    tagAman(bagus),
    true,
    "penjaga menolak tag sha yang benar, jadi penjaganya terlalu ketat",
  );
});

test("parser tidak tertipu baris FROM yang hanya contoh di komentar", () => {
  const palsu = [
    "# FROM ghcr.io/neiaki/kp:latest",
    "FROM ghcr.io/neiaki/kp:sha-862e1899308ed2bf885409aa23aabfde130f8764",
  ].join("\n");
  assert.equal(
    tagDariFrom(palsu),
    "sha-862e1899308ed2bf885409aa23aabfde130f8764",
  );
});

/** Nama image yang sedang dideploy, ditulis penuh supaya penjaga ini punya sasaran. */
const IMAGE_PRODUKSI = "ghcr.io/neiaki/kp";

/** Tag apa pun yang menempel pada nama itu, dibaca sampai spasi atau tanda kutip. */
const POLA_TAG_PRODUKSI = new RegExp(
  IMAGE_PRODUKSI.replace(/\//g, "\\/") + ":([^\\s\"'`,)\\]]+)",
  "g"
);

/**
 * Berkas yang mungkin bisa menyebut image deploy.
 *
 * Cukup yang punya arti operasional: Dockerfile, compose, YAML, JSON, dan apa
 * pun di dalam docs/ atau scripts/ karena di sanalah runbook ditulis. Berkas
 * .ts tidak pernah mendeklarasikan image, dan package-lock.json hanya
 * mengulang dependency yang sudah dijaga lockfile-nya.
 */
function bisaMenyebutImage(path: string): boolean {
  if (path === "package-lock.json") return false;
  const nama = path.split("/").pop() ?? "";
  return (
    nama.startsWith("Dockerfile") ||
    nama.startsWith("docker-compose") ||
    path.endsWith(".yml") ||
    path.endsWith(".yaml") ||
    path.endsWith(".json") ||
    path.startsWith("docs/") ||
    path.startsWith("scripts/")
  );
}

/**
 * Semua berkas ter-track, atau dari disk kalau git tidak ada.
 *
 * Jalur disk sengaja ikut menyapu berkas untrack: yang dicari adalah image
 * produksi, dan image yang tidak ter-track tetap salah kalau ditulis.
 */
async function daftarBerkas(): Promise<string[]> {
  try {
    const keluar = execFileSync("git", ["ls-files"], {
      cwd: new URL("../", repo("x")),
      encoding: "utf8",
    });
    return keluar.split("\n").filter(Boolean);
  } catch {
    const akar = new URL("../", repo("x"));
    const semua: string[] = [];
    for (const prefix of ["", "docs/", "scripts/"]) {
      let isi: string[];
      try {
        isi = await readdir(new URL(prefix, akar));
      } catch {
        continue;
      }
      for (const nama of isi) {
        if (nama.startsWith(".")) continue;
        semua.push(prefix + nama);
      }
    }
    return semua;
  }
}

const calonGambar = (await daftarBerkas()).filter(bisaMenyebutImage);

test("tidak ada berkas mana pun yang menyebut image produksi dengan tag latest", async () => {
  const pelanggaran: string[] = [];
  for (const path of calonGambar) {
    let isi: string;
    try {
      isi = await readFile(repo(`../${path}`), "utf8");
    } catch {
      continue;
    }
    isi.split("\n").forEach((baris, nomor) => {
      for (const cocok of baris.matchAll(POLA_TAG_PRODUKSI)) {
        // Digest dilepas lebih dulu supaya tag sha yang ikut menarik latest
        // tidak salah dibaca sebagai latest.
        const tag = cocok[1].split("@")[0];
        if (tag === "latest" || tag.startsWith("latest:")) {
          pelanggaran.push(`${path}:${nomor + 1}`);
        }
      }
    });
  }
  assert.deepEqual(
    pelanggaran,
    [],
    "tag latest memakai cache base image lokal VPS sehingga deploy hijau\n" +
      "padahal image lama yang jalan. Pakai tag sha-<commit> seperti di\n" +
      "Dockerfile.coolify. Berkas dan baris yang harus diperbaiki:\n" +
      pelanggaran.map((p) => `  ${p}`).join("\n")
  );
});
