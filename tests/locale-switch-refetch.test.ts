import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Tukar bahasa harus tidak mengulang bacaan snapshot.
 *
 * Gejalanya: menekan ID/EN terasa lama. Penyebabnya bukan komponen switcher
 * (ia memakai next/link, jadi sudah transisi klien), melainkan effect di
 * src/lib/store.ts. useAtCellStore mengambil pathname lewat usePathname(),
 * lalu loadLiveData memakai pathname itu sebagai dependency useCallback, jadi
 * effect pemanggilannya jalan lagi pada SETIAP perubahan pathname.
 *
 * Yang sebenarnya diulang bukan data yang berbeda. getPublicSnapshot() dan
 * getPortalSnapshot() tidak punya parameter bahasa sama sekali, jadi
 * /id/catalog dan /en/catalog menghasilkan snapshot yang identik byte per byte.
 * Setiap ganti bahasa lalu menembak satu permintaan jaringan server action dan
 * satu putaran tiga query Postgres yang jawabannya sudah ada di tangan.
 * Memindahkan pathname mentah keluar dari daftar dependency, diganti dua
 * predikat area rute yang hanya membaca bagian path yang tidak memuat locale,
 * membuat pembacaan sia-sia itu hilang.
 *
 * Berkas store.ts tidak bisa diimpor runner test bawaan Node: dia menarik
 * next/navigation, React, dan alias @/ yang tidak bisa diurai runner, dan
 * isinya penuh efek browser. Karena itu isinya dibaca sebagai teks, sama
 * seperti tests/locale-not-found-boundary.test.ts. Yang dikunci di sini adalah
 * mekanismenya, yaitu daftar dependency itu sendiri, bukan nama export.
 */

const STORE = new URL("../src/lib/store.ts", import.meta.url);

/**
 * Ambil daftar dependency dari pemanggilan useCallback yang diawali `prefix`.
 * Pakai pemindai kurung, bukan regex, karena callback memuat template literal
 * beserta "${...}" di dalamnya sehingga penghitungan kurung naif akan salah.
 */
function depArray(isi: string, prefix: string): string {
  const mulai = isi.indexOf(prefix);
  assert.notEqual(mulai, -1, `tidak ditemukan: ${prefix}`);

  // Kurung dihitung terpisah dari konteks string. Kalau keduanya disatukan,
  // kurung di dalam badan callback ikut terhitung dan pemindai berhenti
  // terlalu awal di kurung useCallback(async () => {.
  const konteks: string[] = [];
  let depth = 0;
  // Mulai tepat SETELAH kurung pembuka useCallback, supaya depth hanya
  // menghitung kurung di dalam badan callback.
  let i = isi.indexOf("(", mulai) + 1;

  for (; i < isi.length; i++) {
    const c = isi[i]!;
    const next = isi[i + 1]!;

    if (konteks.length > 0) {
      const atas = konteks[konteks.length - 1]!;
      if (atas === "{") {
        // Isi "${...}" adalah kode biasa. Yang dibutuhkan di sini hanya
        // letaknya interpolasi berakhir, jadi kurung di dalamnya diabaikan.
        if (c === "{") konteks.push("{");
        else if (c === "}") konteks.pop();
        else if (c === "'" || c === '"' || c === "`") konteks.push(c);
        continue;
      }
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (atas === "`" && c === "$" && next === "{") {
        konteks.push("{");
        i += 1;
        continue;
      }
      if (c === atas) konteks.pop();
      continue;
    }

    if (c === "/" && next === "/") {
      const baris = isi.indexOf("\n", i);
      if (baris === -1) break;
      i = baris;
      continue;
    }
    if (c === "/" && next === "*") {
      const tutup = isi.indexOf("*/", i);
      if (tutup === -1) break;
      i = tutup + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      konteks.push(c);
      continue;
    }
    if (c === "(") {
      depth += 1;
      continue;
    }
    if (c === ")") {
      if (depth === 0) {
        // Kurung penutup argumen useCallback. Daftar dependency ada tepat
        // SEBELUM kurung itu: "}, [isLoginPath, isPortalPath]);"
        const sebelum = isi.slice(0, i);
        const ketemu = sebelum.match(/,\s*(\[[^\]]*\])\s*$/u);
        assert.ok(ketemu, `useCallback untuk ${prefix} tidak punya daftar dependency`);
        return ketemu[1]!.replace(/\s+/g, " ").trim();
      }
      depth -= 1;
    }
  }
  assert.fail(`tidak bisa memindai callback untuk ${prefix}`);
}

test("loadLiveData tidak lagi bergantung pada pathname mentah", async () => {
  const isi = await readFile(STORE, "utf8");
  const deps = depArray(isi, "const loadLiveData = useCallback(");
  assert.equal(
    deps,
    "[isLoginPath, isPortalPath]",
    "dependency loadLiveData harus area rute, bukan pathname. Selama pathname ikut masuk, tiap ganti locale /id <-> /en menembak getPublicSnapshot() kedua yang hasilnya identik."
  );
  assert.doesNotMatch(
    deps,
    /pathname/,
    "pathname mentah di daftar dependency adalah penyebab ulang-tidaknya bacaan tiap ganti bahasa"
  );
});

test("dua predikat area rute hanya membaca bagian path tanpa locale", async () => {
  const isi = await readFile(STORE, "utf8");

  const isLoginPath = isi.match(/const isLoginPath = ([^;]+);/)?.[1];
  assert.equal(
    isLoginPath,
    'pathname.endsWith("/login") || pathname === "/portal/login"',
    "penentu halaman login harus tetap sama supaya perpindahan ke /login tetap mereset state terlindungi"
  );

  const isPortalPath = isi.match(/const isPortalPath = ([^;]+);/)?.[1];
  assert.equal(
    isPortalPath,
    'pathname.startsWith("/portal")',
    "penentu area portal harus tetap sama supaya subdomain portal tidak salah baca snapshot publik"
  );

  // Inilah yang membuat keduanya kebal locale.
  for (const [nama, expr] of [
    ["isLoginPath", isLoginPath],
    ["isPortalPath", isPortalPath],
  ] as const) {
    assert.doesNotMatch(
      expr!,
      /["'`](\/)?(id|en)["'`]/,
      `${nama} membandingkan locale, jadi nilainya ikut berubah saat ganti bahasa dan pembacaan ulang tetap terjadi`
    );
  }
});

test("effect pemanggilannya masih bergantung pada loadLiveData", async () => {
  const isi = await readFile(STORE, "utf8");
  // Rantai ini yang membuat daftar dependency di atas berarti. Kalau effect
  // berhenti bergantung pada loadLiveData, test sebelumnya tidak menggigit
  // apa pun tanpa ketahuan.
  const setelah = isi.slice(isi.indexOf("const loadLiveData = useCallback("));
  const effect = setelah.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[([^\]]*)\]\);/);
  assert.ok(effect, "useEffect pemanggil loadLiveData tidak ditemukan");
  assert.equal(
    effect[1]!.replace(/\s+/g, " ").trim(),
    "loadLiveData",
    "effect harus bergantung pada loadLiveData supaya perubahan area rute tetap memicu pembacaan"
  );
});
