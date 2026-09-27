import test from "node:test";
import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";

/*
 * Indeks docs/ dijaga karena isinya sudah basi tanpa ada yang memperingatkan.
 * Saat audit, docs/README.md masih berhenti di empat dokumen pertama:
 * UC-AtCell.md, SECRET-ROTATION.md, dan berkas diagram sama sekali tidak
 * disebut. Dokumen yang tidak disebut di indeks docs sama saja tidak ada bagi
 * pembaca yang mencari lewat README, padahal dua di antaranya adalah acuan
 * operasional yang wajib dibaca sebelum menyentuh production.
 *
 * Test juga menjaga arah sebaliknya. Indeks boleh menyebut berkas yang sudah
 * dihapus atau diganti nama, dan itu sama buruknya: pembaca akan mencari
 * dokumen yang tidak ada.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);
const docsUrl = new URL("../docs/", repoFile("x"));

const indeks = await readFile(new URL("README.md", docsUrl), "utf8");
const readme = await readFile(repoFile("../README.md"), "utf8");

const isiDocs = (await readdir(docsUrl, { recursive: true })).filter(
  (p): p is string => typeof p === "string"
);

const dokumen = isiDocs
  .filter((p) => p.endsWith(".md"))
  .filter((p) => p !== "README.md")
  .sort();

test("indeks docs menyebut setiap dokumen yang ada", () => {
  const hilang = dokumen.filter((p) => !indeks.includes(`\`${p}\``));
  assert.deepEqual(
    hilang,
    [],
    `dokumen ini ada di docs/ tapi tidak disebut di docs/README.md: ${hilang.join(", ")}`
  );
});

test("indeks docs tidak menyebut dokumen yang sudah tidak ada", () => {
  const disebut = [...indeks.matchAll(/`([\w.-]+\.md)`/g)].map((m) => m[1]);
  const tidakAda = disebut.filter((n) => !dokumen.includes(n));
  assert.deepEqual(
    tidakAda,
    [],
    `docs/README.md menyebut dokumen yang tidak ada di docs/: ${tidakAda.join(", ")}`
  );
});

test("dokumen acuan ditautkan dari README root", () => {
  // Pembaca tidak selalu mulai dari docs/. README root harus punya pintu masuk
  // ke indeks, lalu ke setiap dokumen yang jadi acuan aktif.
  assert.match(
    readme,
    /docs\/README\.md/,
    "README root harus menunjuk docs/README.md sebagai indeks"
  );
  const aktif = [
    "PRD-AtCell.md",
    "UC-AtCell.md",
    "requirement-2.0.md",
    "DEPLOYMENT-REDUNDANCY.md",
    "SECRET-ROTATION.md",
    "CSP.md",
  ];
  const hilang = aktif.filter((n) => !readme.includes(`docs/${n}`));
  assert.deepEqual(
    hilang,
    [],
    `dokumen acuan ini harus ditautkan dari README root: ${hilang.join(", ")}`
  );
});

test("setiap sumber PlantUML punya render PNG dan SVG", async () => {
  // UC-AtCell.md menyisipkan gambar dengan jalur tetap. Kalau sumbernya
  // ditambah tanpa dirender, tautan gambar di dokumen itu rusak tanpa error
  // build, karena Markdown tidak ikut divalidasi.
  const isi = await readdir(docsUrl);
  const sumber = isi.filter((f) => f.endsWith(".puml"));
  assert.ok(sumber.length > 0, "tidak ada sumber PlantUML di docs/");
  const tanpaRender = sumber
    .filter((f) => {
      const stem = f.replace(/\.puml$/, "");
      return !isi.includes(`${stem}.png`) || !isi.includes(`${stem}.svg`);
    })
    .sort();
  assert.deepEqual(
    tanpaRender,
    [],
    `sumber diagram ini belum dirender ke PNG dan SVG: ${tanpaRender.join(", ")}`
  );
});

test("jalur relatif di indeks docs benar-benar ada", async () => {
  // Jalur relatif dipakai untuk menunjuk README root dari dalam docs/. Path
  // rusak baru ketahuan saat ada yang mengekliknya.
  const dirujuk = [...indeks.matchAll(/\]\((\.\.?\/[^)#]+)\)/g)].map((m) => m[1]);
  const target = new Map<string, URL>();
  for (const p of dirujuk) target.set(p, new URL(p, docsUrl));

  const hilang: string[] = [];
  for (const [p, url] of target) {
    try {
      await access(url);
    } catch {
      hilang.push(p);
    }
  }
  assert.deepEqual(
    hilang.sort(),
    [],
    `jalur di docs/README.md menunjuk berkas yang tidak ada: ${hilang.join(", ")}`
  );
});

test("indeks docs bebas karakter non-ASCII", () => {
  // Dokumen ini ditulis tangan dan sempat terkena karakter CJK yang tidak
  // sengaja. Tidak ada satu pun kebutuhan non-ASCII di dalamnya, jadi
  // keberadaannya berarti ada teks yang rusak atau salah tempel.
  const rusak = indeks
    .split("\n")
    .map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => /[^\x00-\x7F]/.test(l));
  assert.deepEqual(
    rusak.map(([n]) => n),
    [],
    `docs/README.md baris ini punya karakter non-ASCII: ${rusak
      .map(([n, l]) => `${n}: ${l.trim()}`)
      .join(" | ")}`
  );
});
