import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Runbook verifikasi DB pernah memakai `$DATABASE_URL` untuk `psql` yang
 * menerapkan migrasi. Di repo ini `DATABASE_URL` adalah pooler production,
 * jadi operator yang sudah mengekspornya bisa menulis ke database yang salah.
 *
 * Test ini menjaga dua hal yang mudah hilang saat runbook diedit:
 * - operasi tulis hanya memakai variabel database uji;
 * - daftar query 5.x tetap sinkron dengan sumber kanonik di proposals.
 */

const runbook = readFileSync(
  new URL("../docs/DB-VERIFICATION-RUNBOOK.md", import.meta.url),
  "utf8"
);
const proposals = readFileSync(
  new URL("../docs/db-integrity-proposals.md", import.meta.url),
  "utf8"
);

test("runbook tidak memakai DATABASE_URL untuk operasi tulis", () => {
  assert.doesNotMatch(
    runbook,
    /psql\s+"\$DATABASE_URL"/,
    "psql harus memakai VERIFY_DATABASE_URL, bukan DATABASE_URL production"
  );
  assert.match(
    runbook,
    /VERIFY_DATABASE_URL/,
    "runbook harus mendokumentasikan VERIFY_DATABASE_URL"
  );
});

test("daftar query 5.x di runbook mencakup semua heading proposals", () => {
  const headings = [...proposals.matchAll(/^### (5\.\d+) /gm)].map(
    (match) => match[1]
  );
  assert.ok(headings.length >= 11, "proposals harus punya 5.1 sampai 5.11");

  for (const nomor of headings) {
    assert.match(
      runbook,
      new RegExp(`^- ${nomor.replace(".", "\\.")} `, "m"),
      `runbook tidak menyebut query ${nomor}`
    );
  }
});

test("validasi constraint M dijelaskan sebagai kondisional", () => {
  assert.match(
    runbook,
    /inventory_units_selling_price_not_below_cost_chk/,
    "constraint M harus disebut"
  );
  assert.match(
    runbook,
    /hanya ada kalau[\s\S]{0,120}keputusan M dipertahankan/i,
    "runbook harus menjelaskan bahwa constraint M opsional"
  );
});
