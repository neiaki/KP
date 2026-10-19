import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

/*
 * Diagram arsitektur di README root tampil dua kali: blok Mermaid inline dan
 * gambar PNG hasil render. Aplikasi GitHub di ponsel belum mendukung Mermaid
 * (yang tampil hanya pesan "Unable to render rich display"), jadi gambar
 * cadangan wajib ikut di-commit. Sumber kanoniknya
 * `docs/diagram-uml/bersama/arsitektur-alur.mmd`; blok di README harus
 * identik dengan sumber itu supaya tidak ada dua versi alur arsitektur yang
 * berbeda diam-diam tanpa ada yang gagal.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);

const readme = await readFile(repoFile("../README.md"), "utf8");
const sumber = await readFile(
  repoFile("../docs/diagram-uml/bersama/arsitektur-alur.mmd"),
  "utf8"
);

test("blok Mermaid arsitektur di README identik dengan sumber kanonik", () => {
  const blok = readme.match(/```mermaid\n([\s\S]*?)```/);
  assert.ok(blok, "README root harus memuat blok Mermaid diagram arsitektur");
  assert.equal(
    blok[1].trim(),
    sumber.trim(),
    "blok Mermaid di README berbeda dari docs/diagram-uml/bersama/arsitektur-alur.mmd"
  );
});

test("render PNG dan SVG alur arsitektur ikut di-commit", async () => {
  await access(repoFile("../docs/diagram-uml/bersama/arsitektur-alur.png"));
  await access(repoFile("../docs/diagram-uml/bersama/arsitektur-alur.svg"));
});

test("README menautkan gambar alur arsitektur yang benar-benar ada", async () => {
  const tautan = readme.match(
    /!\[[^\]]*\]\(((?:\.\/)?docs\/diagram-uml\/bersama\/arsitektur-alur\.(?:png|svg))\)/
  );
  assert.ok(
    tautan,
    "README root harus menautkan gambar alur arsitektur sebagai cadangan pembaca yang belum bisa menampilkan Mermaid"
  );
  await access(repoFile(`../${tautan[1].replace(/^\.\//, "")}`));
});

test("gambar fallback tampil sebelum blok Mermaid untuk pembaca GitHub mobile", () => {
  const tautan = readme.indexOf("![Alur arsitektur At Cell");
  const mermaid = readme.indexOf("```mermaid");
  assert.ok(tautan >= 0, "README root harus memuat gambar fallback");
  assert.ok(mermaid >= 0, "README root harus memuat diagram Mermaid");
  assert.ok(
    tautan < mermaid,
    "gambar fallback harus tampil lebih dulu daripada Mermaid yang tidak dirender di aplikasi GitHub mobile"
  );
});
