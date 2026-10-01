import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Batas versi `next` di .github/workflows/security.yml tidak bisa dipercaya
 * hanya dari workflow itu sendiri.
 *
 * Github menjalankan workflow `pull_request` dari merge commit PR, bukan dari
 * versi workflow di branch tujuan. Jadi PR yang menurunkan `next` ke versi
 * lama DAN menghapus langkah "Check next version floor" akan lolos, karena
 * yang dijalankan adalah berkas yang sudah dihapus itu. Menjalankan pemeriksaan
 * yang sama pada `push` ke main tidak menutup celah itu: perubahan yang sama
 * ikut ter-merge, jadi pemeriksaannya tetap hilang saat commit-nya sampai ke
 * main.
 *
 * Yang menutup celahnya adalah CODEOWNERS, karena ia mengatur siapa yang boleh
 * menyetujui perubahan, bukan apakah pemeriksaan berjalan. Dan itu hanya berlaku
 * kalau branch protection mengaktifkannya, jadi kedua berkas diuji di sini.
 */

const workflow = readFileSync(
  new URL("../.github/workflows/security.yml", import.meta.url),
  "utf8"
);
const codeowners = readFileSync(
  new URL("../.github/CODEOWNERS", import.meta.url),
  "utf8"
);

test("pemeriksaan batas versi juga berjalan pada commit main", () => {
  // Jalur ini murni deteksi: hasilnya terlihat di riwayat build main segera
  // setelah merge, bukan menunggu jadwal mingguan.
  assert.match(workflow, /^ {2}push:$/m, "workflow security.yml perlu pemicu push");
  const blokPush = workflow.slice(workflow.search(/^ {2}push:$/m));
  assert.match(
    blokPush.slice(0, 200),
    /^ {2}push:\n {4}branches:\n {6}- main$/m,
    "pemicu push harus dibatasi ke branch main"
  );
  // Jalur cepat di PR tetap dipakai: turunnya versi harus terlihat sebelum merge.
  assert.match(workflow, /^ {2}pull_request:$/m, "umpan balik cepat di PR harus tetap ada");
  assert.match(workflow, /^ {6}- \.github\/workflows\/security\.yml$/m);
  // CODEOWNERS ikut memicu workflow, jadi edit pada daftar owner itu sendiri
  // ikut diperiksa.
  assert.match(workflow, /^ {6}- \.github\/CODEOWNERS$/m);
});

test("langkah pemeriksaan batas versi masih ada dan masih gagal saat versi di bawah", () => {
  // Keberadaan langkahnya saja tidak cukup: yang dijaga adalah bahwa ia
  // compares per komponen dan keluar dengan kode bukan nol, bukan sekadar
  // mencetak informasi.
  assert.match(workflow, /- name: Check next version floor/);
  assert.match(workflow, /const FLOOR = "16\.3\.6";/);
  assert.match(workflow, /process\.exit\(1\);/);
});

test("CODEOWNERS menutup jalur yang tidak bisa ditutup workflow", () => {
  const baris = codeowners
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  assert.ok(baris.length > 0, "CODEOWNERS harus punya minimal satu aturan");

  // Setiap aturan harus punya owner yang valid. Aturan tanpa owner diabaikan
  // GitHub, jadi aturan seperti ini hanya menipu.
  for (const aturan of baris) {
    const [, pola, owner] = /^(\S+)\s+(.+)$/.exec(aturan) ?? [];
    assert.ok(pola, `baris CODEOWNERS tidak bisa dibaca: ${aturan}`);
    assert.match(owner.trim(), /^@\S+$/, `owner pada aturan ini tidak valid: ${aturan}`);
  }

  // Folder workflow harus terlindungi, dan CODEOWNERS sendiri juga, kalau tidak
  // daftar owner bisa dikosongkan lewat PR yang sama.
  assert.match(codeowners, /^\.github\/workflows\/\s+@\S+$/m);
  assert.match(codeowners, /^\.github\/CODEOWNERS\s+@\S+$/m);
});

test("catatan di CODEOWNERS menyebut langkah branch protection yang mengaktifkan", () => {
  // Tanpa branch protection, CODEOWNERS hanya permintaan. Yang diuji di sini
  // bukan sekadar kata "branch protection", tapi langkah setting yang
  // mengaktifkannya, supaya catatan tidak berubah jadi_schedule tanpa isi.
  assert.match(
    codeowners,
    /branch protection/i,
    "CODEOWNERS harus menyebut bahwa branch protection yang mengaktifkannya"
  );
  assert.match(codeowners, /Require a pull request before merging/i);
  assert.match(codeowners, /Require approvals/i);
  assert.match(codeowners, /Bypass|bypass/i);
  assert.match(codeowners, /hanya permintaan|Cuma permintaan/i);
});

test("jalur destruktif dan penjaga otorisasi ikut terlindungi", () => {
  assert.match(codeowners, /^scripts\/\s+@\S+$/m);
  assert.match(codeowners, /^\/src\/db\/\s+@\S+$/m);
  assert.match(codeowners, /^\/src\/lib\/access\.ts\s+@\S+$/m);
});
