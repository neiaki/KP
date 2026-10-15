import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveUsernameFromEmail } from "../src/lib/username.ts";

/*
 * Username adalah kunci login dan kolom unique dengan constraint format
 * ^[a-z0-9._-]{3,32}$ (migrasi 0005). Rumus turunannya dipakai di impor
 * pelanggan (src/lib/actions/auth.ts) dan derivasi staf
 * (src/lib/store.ts); dulu ditulis dua kali sehingga bisa berbeda diam-diam.
 * Test ini mengunci hasilnya dan memastikan tidak ada salinan baru.
 */

test("username diturunkan dari bagian email sebelum @", () => {
  assert.equal(deriveUsernameFromEmail("Kasir.01@AtCell.id"), "kasir.01");
  assert.equal(deriveUsernameFromEmail("  budi@example.com  "), "budi");
  // Karakter di luar [a-z0-9._-] dibuang, bukan diganti.
  assert.equal(deriveUsernameFromEmail("a+b c@x.id"), "abc");
  assert.equal(deriveUsernameFromEmail("nama!$%^&*()@x.id"), "nama");
});

test("username dipotong 32 karakter tanpa mengubah karakter yang sah", () => {
  const panjang = deriveUsernameFromEmail(`${"a".repeat(40)}@x.id`);
  assert.equal(panjang.length, 32);
  // Titik di ujung dibiarkan, sama seperti versi SQL trigger-nya; constraint
  // ^[a-z0-9._-]{3,32}$ mengizinkan titik di posisi mana pun.
  assert.equal(deriveUsernameFromEmail("budi.@x.id"), "budi.");
});

test("auth dan store memakai modul username, bukan salinan rumus", () => {
  for (const relatif of ["src/lib/actions/auth.ts", "src/lib/store.ts"]) {
    const sumber = readFileSync(new URL(`../${relatif}`, import.meta.url), "utf8");
    assert.match(
      sumber,
      /import \{ deriveUsernameFromEmail \} from "@\/lib\/username";/,
      `${relatif} harus mengimpor deriveUsernameFromEmail`
    );
    assert.doesNotMatch(
      sumber,
      /split\("@"\)/,
      `${relatif} tidak boleh menyalin rumus pemisahan email lagi`
    );
  }
});
