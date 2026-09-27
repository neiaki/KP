import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

/*
 * Aset di public/ dijaga karena dua arahnya sama-sama merusak tanpa error.
 *
 * Arah pertama, berkas menggantung. Lima SVG bawaan create-next-app
 * (file.svg, globe.svg, next.svg, vercel.svg, window.svg) ikut ter-commit
 * sejak proyek dibuat dan tidak pernah dirujuk satu pun. Semuanya duduk di
 * root public/, sehingga tetap ter-serve sebagai /file.svg dan /next.svg
 * walaupun tidak ada yang memakainya.
 *
 * Arah kedua, rujukan ke berkas yang tidak ada. Mode lokal tanpa Supabase
 * memakai src/lib/mock-data.ts yang menunjuk /products/...jpg secara
 * langsung. Kalau fotonya terhapus atau diganti nama, galeri tidak error,
 * hanya diam-diam menampilkan kotak kosong, dan itu baru ketahuan saat mode
 * demo dibuka.
 *
 * Test sengaja tidak menilai foto produk yang tidak disebut di src/. Dua belas
 * dari tiga puluh tujuh foto di public/products memang tidak disebut sebagai
 * harfiah di kode, karena lokasinya datang dari tabel product_images. Menilai
 * berkas seperti itu sebagai menggantung akan salah dan hanya bikin upsetting.
 */

const repoFile = (rel: string) => new URL(rel, import.meta.url);
const publicUrl = new URL("../public/", repoFile("x"));
const srcUrl = new URL("../src/", repoFile("x"));

const isiSrc = (await readdir(srcUrl, { recursive: true })).filter(
  (p): p is string => typeof p === "string" && /\.(ts|tsx)$/.test(p)
);

const teksSrc = await Promise.all(
  isiSrc.map(async (p) => [p, await readFile(new URL(p, srcUrl), "utf8")] as const)
);

/** Path aset lokal yang disebut sebagai literal di kode. */
function asetDisebut(): string[] {
  const hasil = new Set<string>();
  for (const [, isi] of teksSrc) {
    for (const m of isi.matchAll(/["'`](\/(?:products|payments)\/[A-Za-z0-9._-]+)["'`]/g)) {
      // Path contoh seperti "/products/...jpg" di komentar bukan rujukan nyata.
      if (!m[1].includes("...")) hasil.add(m[1]);
    }
  }
  return [...hasil].sort();
}

async function ada(relatif: string): Promise<boolean> {
  try {
    await readFile(new URL(relatif, publicUrl));
    return true;
  } catch {
    return false;
  }
}

test("tidak ada berkas menggantung langsung di root public/", async () => {
  // Berkas di dalam public/products dan public/payments boleh ada tanpa
  // dirujuk kode, karena lokasi fotonya datang dari database. Yang diperiksa
  // hanya berkas yang duduk langsung di root public/, karena di situlah
  // create-next-app menaruh berkas bakinya.
  const loose = (await readdir(publicUrl))
    .filter((f) => /\.(svg|png|jpg|jpeg|webp|ico)$/.test(f))
    .sort();
  assert.deepEqual(
    loose,
    [],
    `berkas ini ada di root public/ tapi tidak ada yang memakainya: ${loose.join(", ")}`
  );
});

test("setiap aset yang disebut kode benar-benar ada di disk", async () => {
  const disebut = asetDisebut();
  assert.ok(disebut.length > 0, "tidak ada aset lokal yang disebut kode, test ini jadi tidak berarti");

  const hilang: string[] = [];
  for (const p of disebut) {
    if (!(await ada(p.replace(/^\//, "")))) hilang.push(p);
  }
  assert.deepEqual(
    hilang,
    [],
    `kode menyebut aset ini tapi berkasnya tidak ada, hasilnya kotak kosong: ${hilang.join(", ")}`
  );
});

test("aset pembayaran QRIS tetap ada dan dirujuk", async () => {
  // README dan AGENTS.md menyebut public/payments/qris.svg sebagai logo resmi.
  // Berkasnya dipakai sebagai fallback saat logo CDN gagal dimuat, jadi
  // menghapusnya membuat halaman pembayaran kosong tanpa jejaknya.
  assert.ok(await ada("payments/qris.svg"), "public/payments/qris.svg hilang");
  assert.ok(
    asetDisebut().includes("/payments/qris.svg"),
    "public/payments/qris.svg ada tapi tidak dirujuk kode mana pun"
  );
});
