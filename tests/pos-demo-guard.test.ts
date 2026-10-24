import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * executeSale adalah endpoint HTTP, bukan sekadar helper UI. Menyembunyikan
 * unit demo dari daftar kasir tidak cukup: pemanggil langsung tetap bisa
 * mengirim unitId unit demo. Test ini menjaga penolakan server tetap ada dan
 * tetap terjadi sebelum baris transaksi ditulis.
 *
 * Penolakan di mode demo lokal diuji terpisah di tests/store-demo.test.ts.
 */

const source = readFileSync(
  new URL("../src/lib/actions/pos.ts", import.meta.url),
  "utf8"
);
const executeSale = source.slice(
  source.indexOf("export async function executeSale"),
  source.indexOf("export async function listTransactions")
);

test("executeSale menolak unit demo sebelum insert transaksi", () => {
  const guard = executeSale.indexOf('if (unit.isDemo) throw new Error("UNIT_IS_DEMO")');
  const insert = executeSale.indexOf(".insert(transactions)");
  assert.ok(guard >= 0, "guard unit.isDemo harus ada di executeSale");
  assert.ok(insert >= 0, "insert transaksi harus tetap ada");
  assert.ok(guard < insert, "guard harus berjalan sebelum transaksi ditulis");
});

test("executeSale memetakan penolakan unit demo ke pesan kasir", () => {
  assert.match(executeSale, /err\.message === "UNIT_IS_DEMO"/);
  assert.match(executeSale, /Unit demo tidak bisa dijual lewat kasir/);
});
