import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { buildContentSecurityPolicy } from "../src/lib/csp.ts";

/*
 * Dokumen CSP dijaga supaya tidak kedaluwarsa diam-diam. src/lib/csp.ts sudah
 * dijaga oleh tests/csp.test.ts, tapi dokumen yang menjelaskan cara kerjanya
 * bisa terlihat seperti catatan yang tidak perlu lalu ikut dibersihkan.
 * Padahal dua hal yang paling penting justru hanya tertulis di dokumen:
 * nonce harus dipasang sebagai header request dan header respons, dan area
 * portal harus dirender per permintaan. Dua hal itu tidak terlihat dari kode
 * manapun kalau tidak dicari.
 *
 * Test di sini menjaga arah dua:
 *
 * 1. Setiap directive yang benar-benar dipakai harus dijelaskan di dokumen.
 * 2. Setiap directive yang dijelaskan di dokumen harus benar-benar dipakai.
 *    Arah pertama saja membiarkan dokumen menyebut directive yang sudah dihapus
 *    dari kode, dan dokumen yang salah lebih berbahaya daripada tidak ada.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);
const docsUrl = new URL("../docs/", repoFile("x"));

const isiCsp = await readFile(repoFile("../src/lib/csp.ts"), "utf8");
const isiDokumen = await readFile(new URL("CSP.md", docsUrl), "utf8");
const isiTestCsp = await readFile(repoFile("../tests/csp.test.ts"), "utf8");

/*
 * Nama directive diambil dari blok objek directives di src/lib/csp.ts, bukan
 * dari daftar manual di sini. Daftar manual bisa lolos begitu kode berubah,
 * lalu test tetap hijau padahal yang dijaga sudah tidak ada.
 */
function directiveDiKode(): string[] {
  const mulai = isiCsp.indexOf("const directives");
  assert.ok(mulai > 0, "blok directives tidak ditemukan di src/lib/csp.ts");
  const blok = isiCsp.slice(mulai);
  return [...blok.matchAll(/^\s{4}"([a-z-]+)":/gm)].map((m) => m[1]);
}

function directiveDiDokumen(): string[] {
  // Hanya tabel directive yang baris pertamanya berisi nama dalam backtick.
  // Tabel lain di dokumen ini punya baris pertama berupa kalimat biasa.
  return [...isiDokumen.matchAll(/^\|\s*`([a-z-]+)`/gm)].map((m) => m[1]);
}

/*
 * Nama directive saja tidak cukup, dan inilah buktinya. connect-src pernah
 * menjelaskan satu host ingest Sentry sementara kode sudah menulis tiga, lalu
 * kedua test di atas tetap hijau karena nama directive-nya sama persis. Test
 * yang hanya mencocokkan nama itu menciptakan rasa aman yang salah, karena
 * ia terlihat melindungi dokumen padahal tidak memeriksa isi nilai yang
 * paling mudah basi.
 *
 * Yang di bawah ini membandingkan nilai. Kebijakan dibentuk dari kode
 * sungguhan lewat buildContentSecurityPolicy, bukan disalin dari dokumen,
 * supaya tidak mungkin keduanya sama-sama salah di tempat yang sama.
 */

/*
 * supabaseUrl sengaja dikosongkan supaya host Storage tidak ikut terhitung.
 * Host itu datang dari env dan berbeda per project, jadi memang tidak
 * ditulis di dokumen. Mode produksi juga yang dipakai supaya nilai
 * 'unsafe-inline' pada script-src tidak ikut terbawa.
 */
function kebijakanNyata(): Map<string, string[]> {
  const kebijakan = buildContentSecurityPolicy({
    nonce: "NONCE-DOKUMEN",
    isDevelopment: false,
  });
  return new Map(
    kebijakan.split("; ").map((bagian) => {
      const spasi = bagian.indexOf(" ");
      return [bagian.slice(0, spasi), bagian.slice(spasi + 1).split(" ")] as const;
    })
  );
}

/*
 * Nilai yang ditulis di sel kolom "Nilai" tiap baris tabel directive. Hanya
 * token yang dibungkus backtick yang diambil, karena itulah bentuk yang
 * dipakai dokumen untuk menyatakan nilai. Sel alasan sengaja diabaikan,
 * sebab di situ kalimat bebas menulis ulang istilah tanpa mengubah apa pun.
 */
function nilaiDiDokumen(): Map<string, string[]> {
  const hasil = new Map<string, string[]>();
  for (const baris of isiDokumen.split("\n")) {
    const sel = baris.split("|");
    if (sel.length < 4) continue;
    const nama = /^\s*`([a-z-]+)`\s*$/.exec(sel[1] ?? "");
    if (nama === null) continue;
    hasil.set(
      nama[1],
      [...(sel[2] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1])
    );
  }
  return hasil;
}

test("setiap directive di kode dijelaskan di dokumen", () => {
  const kunci = directiveDiKode();
  assert.ok(kunci.length >= 12, `hanya ${kunci.length} directive terbaca dari kode`);
  const hilang = kunci.filter((n) => !isiDokumen.includes(`\`${n}\``));
  assert.deepEqual(
    hilang,
    [],
    `directive ini dipakai di src/lib/csp.ts tapi tidak dijelaskan di docs/CSP.md: ${hilang.join(", ")}`
  );
});

test("dokumen tidak menjelaskan directive yang tidak dipakai", () => {
  const dipakai = new Set(directiveDiKode());
  const karangan = directiveDiDokumen().filter((n) => !dipakai.has(n));
  assert.deepEqual(
    karangan,
    [],
    `docs/CSP.md menjelaskan directive ini tapi tidak ada di src/lib/csp.ts: ${karangan.join(", ")}`
  );
});

test("nilai setiap directive di dokumen sama dengan nilai di kode", () => {
  const nyata = kebijakanNyata();
  const ditulis = nilaiDiDokumen();
  assert.ok(
    nyata.size >= 12 && ditulis.size >= 12,
    `hanya ${nyata.size} directive terbaca dari kode dan ${ditulis.size} dari dokumen`
  );

  /*
   * script-src dilewati di sini karena punya dua mode dan sel nilainya menunjuk
   * ke tabel mode, bukan menulis nilai. Arah dua-dimensinya dijaga test
   * berikutnya, jadi penyingkatan ini tidak menjadi lubang.
   */
  const dilewati = new Set(["script-src"]);
  const salah: string[] = [];
  for (const [nama, nilai] of nyata) {
    if (dilewati.has(nama)) continue;
    const diDokumen = ditulis.get(nama);
    if (diDokumen === undefined) continue; // nama sudah dijaga test di atas
    const sama =
      diDokumen.length === nilai.length && nilai.every((v, i) => v === diDokumen[i]);
    if (!sama) {
      salah.push(`${nama}: kode=[${nilai.join(" ")}] dokumen=[${diDokumen.join(" ")}]`);
    }
  }
  assert.deepEqual(
    salah,
    [],
    `nilai directive ini di docs/CSP.md tidak sama dengan src/lib/csp.ts:\n${salah.join("\n")}`
  );
});

/*
 * script-src adalah directive paling menentukan, jadi tidak boleh dijaga
 * hanya lewat sebutan "lihat tabel mode". Isi tabel mode itu yang dibandingkan
 * dengan dua mode yang benar-benar dibentuk kode.
 */
/*
 * Nonce dibuat baru tiap permintaan, jadi mustahil ditulis apa adanya di
 * dokumen. Dokumen memakai placeholder `'nonce-...'`, dan itu bentuk yang
 * benar. Perbandingan menormalkan kedua sisi ke placeholder yang sama supaya
 * bentuk yang benar itu tidak ikut dianggap salah.
 */
function normalkanNonce(nilai: string[]): string[] {
  return nilai.map((v) => (v.startsWith("'nonce-") ? "'nonce-...'" : v));
}

test("tabel mode script-src sesuai dengan kedua mode di kode", () => {
  const nilaiScriptSrc = (opsi: { nonce?: string }): string[] => {
    const bagian = buildContentSecurityPolicy(opsi)
      .split("; ")
      .find((b) => b.startsWith("script-src "));
    assert.ok(bagian, "script-src harus ada di kebijakan");
    return normalkanNonce(bagian.slice("script-src ".length).split(" "));
  };
  // Tabel mode punya sel: Mode, Kapan, nilai script-src, lalu kosong. Yang
  // diambil adalah sel ketiga, karena di situ nilai ditulis dengan backtick.
  const barisMode = isiDokumen
    .split("\n")
    .filter((l) => /^\|\s*(Nonce|Longgar)\s*\|/.test(l));
  assert.ok(
    barisMode.length >= 2,
    `hanya ${barisMode.length} baris tabel mode terbaca, seharusnya ada dua`
  );

  for (const [label, mode] of [
    ["Nonce", nilaiScriptSrc({ nonce: "NONCE-DOKUMEN" })],
    ["Longgar", nilaiScriptSrc({})],
  ] as const) {
    const sel = barisMode.find((l) => l.startsWith(`| ${label} |`));
    assert.ok(sel, `baris mode ${label} tidak ditemukan di tabel mode`);
    const tertulis = [...(sel.split("|")[3] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    assert.deepEqual(
      tertulis,
      mode,
      `nilai script-src mode ${label} di docs/CSP.md tidak sama dengan src/lib/csp.ts`
    );
  }
});

test("dokumen menyebut dua hal yang paling mudah rusak", () => {
  // Dua hal ini tidak terlihat dari kode kalau tidak dicari, dan salah satu
  // membuat seluruh portal kosong tanpa error build.
  assert.match(
    isiDokumen,
    /x-nonce/,
    "dokumen harus menjelaskan nonce dipasang sebagai header request juga"
  );
  assert.match(
    isiDokumen,
    /force-dynamic/,
    "dokumen harus menjelaskan syarat render per permintaan untuk area portal"
  );
  assert.match(
    isiDokumen,
    /upgrade-insecure-requests/,
    "directive yang sengaja dibuang tetap harus disebut supaya tidak dikembalikan"
  );
});

/*
 * Target tautan diekstrak dengan menghitung kurung, bukan dengan regex biasa.
 * Salah satu path di dokumen ini bernama src/app/(portal)/layout.tsx, dan regex
 * yang berhenti di kurung pertama akan terpotong di tengah path lalu selalu gagal.
 */
function tautanRelatif(md: string): string[] {
  const hasil: string[] = [];
  for (let i = md.indexOf("]("); i !== -1; i = md.indexOf("](", i + 1)) {
    let dalam = 1;
    let j = i + 2;
    while (j < md.length && dalam > 0) {
      if (md[j] === "(") dalam += 1;
      else if (md[j] === ")") dalam -= 1;
      j += 1;
    }
    const target = md.slice(i + 2, j - 1);
    if (target.startsWith("../") || target.startsWith("./")) hasil.push(target);
  }
  return hasil;
}

test("dokumen menunjuk berkas yang benar-benar ada", async () => {
  const dirujuk = tautanRelatif(isiDokumen);
  assert.ok(dirujuk.length >= 6, `hanya ${dirujuk.length} tautan relatif di dokumen`);

  const hilang: string[] = [];
  for (const p of dirujuk) {
    try {
      await access(new URL(p, docsUrl));
    } catch {
      hilang.push(p);
    }
  }
  assert.deepEqual(
    hilang.sort(),
    [],
    `docs/CSP.md menunjuk berkas yang tidak ada: ${hilang.join(", ")}`
  );
});

test("dokumen bebas karakter non-ASCII", () => {
  const rusak = isiDokumen
    .split("\n")
    .map((l, i) => [i + 1, l] as const)
    .filter(([, l]) => /[^\x00-\x7F]/.test(l));
  assert.deepEqual(
    rusak.map(([n]) => n),
    [],
    `docs/CSP.md baris ini punya karakter non-ASCII: ${rusak
      .map(([n, l]) => `${n}: ${l.trim()}`)
      .join(" | ")}`
  );
});

/*
 * Penjaga dokumentasi harus dijaga juga. tests/csp.test.ts bisa dihapus tanpa
 * satu pun error tipe, lalu kebijakan longgar masuk diam-diam. Karena itu test
 * terakhir ini memeriksa isi penjaganya, bukan hanya kebenarannya.
 */
test("penjaga perilaku kebijakan masih ada dan masih membaca berkas", () => {
  assert.ok(
    isiTestCsp.includes('dynamic = "force-dynamic"'),
    "tests/csp.test.ts harus tetap menjaga force-dynamic di layout portal"
  );
  assert.ok(
    // Disimpan sebagai regex literal di tests/csp.test.ts, jadi yang dicari
    // adalah potongan di dalam pola itu, bukan kalimat utuhnya.
    isiTestCsp.includes('x-nonce", nonce'),
    "tests/csp.test.ts harus tetap menjaga nonce di header request"
  );
});
