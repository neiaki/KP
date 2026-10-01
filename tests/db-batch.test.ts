import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/*
 * Sifat dbBatch di src/db/client.ts saat pool dipatok satu koneksi.
 *
 * Jalur ini tidak dipakai pada konfigurasi bawaan (POOL_MAX 12), tapi tetap
 * diuji karena DB_POOL_MAX=1 adalah cara orang menekan jumlah koneksi, dan
 * pool postgres.js dengan max 1 tidak bisa menguras antrean. dbBatch
 *usercontent membuat jalur itu tidak pernah menyangkutkan instance.
 *
 * Env dipasang sebelum impor karena client.ts membaca DB_POOL_MAX saat modul
 * dimuat. node --test memproses tiap berkas di proses sendiri, jadi env di sini
 * tidak bocor ke test lain.
 */
process.env.DB_POOL_MAX = "1";
delete process.env.VERCEL;

const clientUrl = new URL("../src/db/client.ts", import.meta.url);
const { dbBatch, POOL_EFEKTIF, dbBatchStep, DB_BATCH_STEP_TIMEOUT_MS } = await import(
  clientUrl.href
);

test("satu koneksi membuat dbBatch berjalan berurutan", async () => {
  assert.equal(POOL_EFEKTIF, 1, "test ini memakai DB_POOL_MAX=1");

  let sedang = 0;
  let puncak = 0;
  const langkah = [1, 2, 3, 4].map((n) => async () => {
    sedang++;
    puncak = Math.max(puncak, sedang);
    await new Promise((selesai) => setTimeout(selesai, 10));
    sedang--;
    return n;
  });

  const hasil = await dbBatch(langkah);

  assert.equal(puncak, 1, `dbBatch menjalankan ${puncak} langkah sekaligus pada pool satu koneksi`);
  assert.deepEqual(hasil, [1, 2, 3, 4], "hasil harus urut sesuai langkah");
});

test("dua batch bersamaan tidak saling menimpa", async () => {
  // Layout, page, dan StoreJsonLd dirender bersamaan, jadi dua batch dari dua
  // tempat berbeda bisa masuk bersamaan. Mengurutkan di dalam satu batch saja
  // tidak cukup kalau dua batch masuk bersamaan.
  let sedang = 0;
  let puncak = 0;
  const hitung = async <T,>(n: T) => {
    sedang++;
    puncak = Math.max(puncak, sedang);
    await new Promise((selesai) => setTimeout(selesai, 10));
    sedang--;
    return n;
  };

  const [a, b] = await Promise.all([
    dbBatch([() => hitung("a1"), () => hitung("a2")]),
    dbBatch([() => hitung("b1"), () => hitung("b2")]),
  ]);

  assert.equal(puncak, 1, `dua batch berjalan bareng: puncak ${puncak} langkah`);
  assert.deepEqual(a, ["a1", "a2"]);
  assert.deepEqual(b, ["b1", "b2"]);
});

test("batch yang gagal tidak membekukan batch berikutnya", async () => {
  await assert.rejects(
    () =>
      dbBatch([
        async () => {
          throw new Error("kegagalan buatan");
        },
      ]),
    /kegagalan buatan/
  );

  assert.deepEqual(await dbBatch([async () => "masih hidup"]), ["masih hidup"]);
});

test("langkah yang menggantung ditolak, bukan dibiarkan mengunci antrean", async () => {
  // Tidak ada galat dari driver untuk query yang mengantre, dan statement_timeout
  // juga tidak berlaku karena statement-nya tidak pernah sampai ke server.
  // Tanpa batas waktu di sini, satu langkah yang tidak resolve membekukan
  // seluruh instance.
  assert.ok(DB_BATCH_STEP_TIMEOUT_MS > 0, "batas waktu langkah harus bernilai");

  const macet = () => new Promise<never>(() => {});
  await assert.rejects(
    () => dbBatchStep(macet, 0, 30),
    /lewat 30 ms tanpa jawaban/
  );

  // Setelah langkahnya ditolak, antrean harus tetap bisa dipakai.
  assert.deepEqual(await dbBatch([async () => "setelah timeout"]), ["setelah timeout"]);
});

test("dbBatch menolak pemanggilan di dalam dirinya sendiri", async () => {
  // Pemanggilan bersarang akan menunggu antrean yang ujungnya adalah dirinya
  // sendiri, jadi tidak akan pernah keluar. Guard ini yang mengubahnya jadi
  // galat yang bisa dibaca.
  let pesan = "";
  try {
    await dbBatch([
      async () => {
        try {
          await dbBatch([async () => "dalam"]);
        } catch (galat) {
          pesan = String((galat as Error).message);
          return "luar";
        }
        return "tidak melempar";
      },
    ]);
  } catch (galat) {
    pesan = String((galat as Error).message);
  }

  assert.match(pesan, /tidak boleh dipanggil di dalam dbBatch/);
});
test("snapshot publik dipakai bersama ketika pembacaan sedang berjalan", async () => {
  // Delapan pengunjung bersamaan dengan delapan query per render berarti 64
  // query, dan postgres.js tidak menguras antrean query yang menunggu koneksi.
  // Satu pembacaan yang dipakai bersama membuat|IDnya tetap oito query,
  // tanpa menyimpan data basi: yang dibagikan hanya pembacaan yang sedang
  // berjalan, jadi umurnya paling beberapa ratus milidetik.
  const sumber = await readFile(
    new URL("../src/lib/actions/public.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    sumber,
    /bacaSnapshotBerjalan/,
    "getPublicSnapshot harus memakai satu pembacaan bersama saat masih berjalan"
  );
  assert.match(
    sumber,
    /if \(bacaSnapshotBerjalan === berjalan\) bacaSnapshotBerjalan = undefined;/,
    "hanya pembacaan yang dimulai sendiri boleh membersihkan pembacaan bersama"
  );
});
