import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/*
 * Matriks peran untuk seluruh Server Action (STANDAR At Cell bagian A).
 *
 * Setiap Server Action yang diekspor harus punya gerbang peran
 * (requireRole / getCurrentProfile), KECUALI yang memang dirancang publik.
 * Daftar pengecualian di bawah sengaja ditulis lengkap dengan alasannya:
 * menambah aksi publik baru harus terasa sebagai keputusan sadar, bukan
 * lolos diam-diam dari pemindaian.
 *
 * Pemindaian dilakukan terhadap source karena menolak peran salah tidak
 * bisa diuji runtime tanpa database dan sesi; pola yang sama dipakai
 * tests/write-gate.test.ts lapis 2. Tes ini terbukti gagal ketika
 * pemanggilan requireRole pada satu aksi dihapus (mutasi manual,
 * dicatat di docs/LOOP_LOG.md).
 */

const actionsDir = new URL("../src/lib/actions/", import.meta.url);

/** Aksi yang memang tanpa gerbang peran, dengan alasan yang bisa diaudit. */
const AKSI_PUBLIK = new Map<string, string>([
  ["signInWithUsername", "login publik; throttle kredensial 3 lapis + pesan seragam"],
  ["signUpCustomer", "pendaftaran pelanggan publik; requireWriteAccess + throttle"],
  ["signOut", "mengakhiri sesi pemanggil sendiri"],
  ["trackTicketPublic", "pelacakan publik via kode tiket; 3 lapis rate limit"],
  ["getPublicInventory", "etalase publik; view v_public_inventory tanpa kolom sensitif"],
  ["getPublicStoreSettings", "profil toko publik"],
  ["getPublicImageUrls", "peta path foto katalog publik"],
  ["getPublicSnapshot", "snapshot etalase publik"],
]);

async function daftarAksi(): Promise<
  Array<{ berkas: string; nama: string; isi: string }>
> {
  const hasil: Array<{ berkas: string; nama: string; isi: string }> = [];
  const berkasList = (await readdir(actionsDir)).filter(
    (f) => f.endsWith(".ts") && !f.startsWith("_")
  );
  for (const berkas of berkasList) {
    const isi = await readFile(new URL(berkas, actionsDir), "utf8");
    if (!isi.startsWith('"use server"')) continue;
    const potongan = isi.split(/^export (?:async )?function (\w+)/m);
    // split menghasilkan [preamble, nama1, body1, nama2, body2, ...]
    for (let i = 1; i < potongan.length; i += 2) {
      hasil.push({ berkas, nama: potongan[i], isi: potongan[i + 1] ?? "" });
    }
  }
  return hasil;
}

test("setiap Server Action ber-gerbang peran atau terdaftar publik", async () => {
  const aksi = await daftarAksi();
  assert.ok(aksi.length > 30, `harus menemukan puluhan aksi, ketemu ${aksi.length}`);
  const tanpaGerbang: string[] = [];
  for (const a of aksi) {
    if (AKSI_PUBLIK.has(a.nama)) continue;
    const bergerbang =
      a.isi.includes("requireRole(") || a.isi.includes("getCurrentProfile(");
    if (!bergerbang) tanpaGerbang.push(`${a.berkas}:${a.nama}`);
  }
  assert.deepEqual(
    tanpaGerbang,
    [],
    `aksi tanpa gerbang peran (tambahkan requireRole atau daftarkan di AKSI_PUBLIK dengan alasan): ${tanpaGerbang.join(", ")}`
  );
});

test("aksi publis yang terdaftar benar-benar ada di source", async () => {
  const aksi = await daftarAksi();
  const nama = new Set(aksi.map((a) => a.nama));
  const hilang = [...AKSI_PUBLIK.keys()].filter((n) => !nama.has(n));
  assert.deepEqual(hilang, [], `entri AKSI_PUBLIK yang sudah tidak ada: ${hilang.join(", ")}`);
});

test("aksi memvalidasi input dengan safeParse, bukan parse yang bisa melempar", async () => {
  const aksi = await daftarAksi();
  const berbahaya: string[] = [];
  for (const a of aksi) {
    const baris = a.isi
      .split("\n")
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\.parse\(/.test(l) && !/safeParse|JSON\.parse/.test(l));
    if (baris.length) berbahaya.push(`${a.berkas}:${a.nama} baris ${baris.map(([n]) => n).join(",")}`);
  }
  assert.deepEqual(
    berbahaya,
    [],
    `pakai safeParse agar input tidak valid jadi pesan, buka exception 500: ${berbahaya.join(", ")}`
  );
});
