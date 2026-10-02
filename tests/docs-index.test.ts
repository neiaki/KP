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
 * Berkas diagram juga boleh hilang dari repo, dan test ini ikut menjaga arah
 * sebaliknya: kalau diagram.mmd dihapus tapi masih disebut di indeks, pembaca
 * akan mencari berkas yang sudah tidak ada. Diagram Mermaid itu dihapus 2
 * Oktober 2026 karena isinya sudah tersalin inline di bagian 3 UC-AtCell.md.
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

test("setiap sumber diagram punya render PNG dan SVG", async () => {
  // Kalau sumber diagram ditambahkan lagi tanpa dirender, tautan gambarnya
  // rusak tanpa error build, karena Markdown tidak ikut divalidasi.
  //
  // repo ini sengaja tidak punya sumber diagram sama sekali sejak 1 Oktober
  // 2026: PlantUML dihapus, lalu berkas Mermaid diagram.mmd dihapus 2 Oktober
  // 2026 karena isinya sudah tersalin inline di bagian 3 UC-AtCell.md. Yang
  // jadi acuan adalah daftar use case. Karena itu test ini tidak lagi menuntut
  // sumbernya ada; yang dijaga hanya bahwa tidak ada sumber yang menggantung,
  // dan penghapusan berkas diagram tidak meninggalkan rujukan menggantung.
  const isi = await readdir(docsUrl);
  const sumber = isi.filter((f) => /\.(puml|mmd)$/.test(f));
  const tanpaRender = sumber
    .filter((f) => {
      const stem = f.replace(/\.(puml|mmd)$/, "");
      return !isi.includes(`${stem}.png`) || !isi.includes(`${stem}.svg`);
    })
    .sort();
  assert.deepEqual(
    tanpaRender,
    [],
    `sumber diagram ini belum dirender ke PNG dan SVG: ${tanpaRender.join(", ")}`
  );

  // Tautan ke berkas diagram yang sudah dihapus harus ditolak dari mana pun,
  // ditulis sebagai `diagram.mmd`, `./diagram.mmd`, atau `docs/diagram.mmd`.
  // Tautan relatif diselesaikan terhadap letaknya masing-masing dokumen, bukan
  //terhadap nama file saja, karena `](./diagram.mmd)` dan `](diagram.mmd)`
  //menunjuk tempat yang berbeda bagi pembaca.
  //
  // Yang diperiksa hanya tautan Markdown, bukan penyebutan nama berkas di
  // dalam kalimat, karena catatan historis memang sengaja masih menyebut
  // diagram.mmd supaya pembaca tahu berkas itu pernah ada dan kenapa dihapus.
  //
  // Test "jalur relatif di indeks docs benar-benar ada" di bawah sudah menangkap
  // tautan menggantung di docs/README.md, tapi tidak menyentuh README root.
  // Jadi pemeriksaan ini memang perlu, dan cakupannya harus lebih luas.
  const dokumenYangDiperiksa = await Promise.all(
    ["README.md", "../README.md"].map(async (p) => ({
      nama: p,
      url: new URL(p, docsUrl),
      isi: await readFile(new URL(p, docsUrl), "utf8"),
    }))
  );
  const menggantung: string[] = [];
  for (const { nama, url, isi } of dokumenYangDiperiksa) {
    for (const cocok of isi.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = cocok[1];
      if (!target.endsWith(".mmd")) continue;
      try {
        await access(new URL(target, url));
      } catch {
        menggantung.push(`${nama} -> ${target}`);
      }
    }
  }
  assert.deepEqual(
    menggantung.sort(),
    [],
    `dokumen ini masih menautkan berkas diagram yang sudah dihapus: ${menggantung.join(", ")}`
  );
});

test("dokumen tidak menunjuk gambar yang tidak ada di docs/", async () => {
  // Tautan gambar Markdown tidak divalidasi oleh build mana pun. Berkas yang
  // dihapus tapi rujukannya masih ada akan muncul sebagai gambar rusak di
  // GitHub, dan tidak ada apa pun yang gagal.
  const isi = new Set(await readdir(docsUrl));
  const bermasalah: string[] = [];

  for (const nama of ["UC-AtCell.md", "PRD-AtCell.md", "README.md"]) {
    const isiDokumen = await readFile(new URL(`./${nama}`, docsUrl), "utf8");
    for (const cocok of isiDokumen.matchAll(/!\[[^\]]*\]\(\.\/([^)\s]+)\)/g)) {
      const target = cocok[1];
      if (!isi.has(target)) bermasalah.push(`${nama} -> ./${target}`);
    }
  }

  assert.deepEqual(
    bermasalah,
    [],
    `dokumen menunjuk gambar yang sudah dihapus: ${bermasalah.join(", ")}`
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
