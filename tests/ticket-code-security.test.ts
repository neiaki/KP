import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TICKET_CODE_PATTERN,
  generateTicketSuffix,
  ticketCodeSchema,
} from "../src/lib/validations.ts";
import { consumeRateLimit, resetRateLimits } from "../src/lib/rate-limit.ts";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260926103000_strengthen_ticket_codes.sql",
    import.meta.url
  ),
  "utf8"
);

// Alfabet base32 tanpa huruf yang mudah tertukar saat dibaca di nota.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

test("kode resi menerima format lama 4 digit dan format baru 8 karakter", () => {
  assert.ok(ticketCodeSchema.safeParse("SRV-20260913-0001").success);
  assert.ok(ticketCodeSchema.safeParse("SRV-20260913-7K4M2QX9").success);
});

test("kode resi lowercase dinormalisasi menjadi huruf besar", () => {
  const parsed = ticketCodeSchema.safeParse("srv-20260913-7k4m2qx9");
  assert.ok(parsed.success);
  assert.equal(parsed.data, "SRV-20260913-7K4M2QX9");
});

test("kode resi menolak huruf ambigu dan bentuk lain", () => {
  for (const bad of [
    "SRV-20260913-7K4M2QX", // hanya 7 karakter
    "SRV-20260913-7K4M2QX99", // 9 karakter
    "SRV-20260913-7K4M2QXI", // mengandung I
    "SRV-20260913-7K4M2QXL", // mengandung L
    "SRV-20260913-7K4M2QXO", // mengandung O
    "SRV-20260913-7K4M2QXU", // mengandung U
    "SRV-2026091-7K4M2QX9", // tanggal tidak lengkap
    "TIC-20260913-7K4M2QX9", // prefix salah
    "SRV-20260913-ABCD", // 4 huruf bukan format lama
  ]) {
    assert.equal(
      ticketCodeSchema.safeParse(bad).success,
      false,
      `harus ditolak: ${bad}`
    );
  }
});

test("generateTicketSuffix selalu 8 karakter dari alfabet base32", () => {
  for (let i = 0; i < 500; i++) {
    const suffix = generateTicketSuffix();
    assert.equal(suffix.length, 8);
    for (const ch of suffix) {
      assert.ok(ALPHABET.includes(ch), `karakter tak terduga: ${ch}`);
    }
  }
});

test("suffix yang dihasilkan cocok dengan pola yang dipakai validasi", () => {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const code = `SRV-${today}-${generateTicketSuffix()}`;
  assert.ok(TICKET_CODE_PATTERN.test(code));
});

test("suffix tidak pernah memakai huruf ambigu dalam banyak sampel", () => {
  for (let i = 0; i < 2000; i++) {
    assert.doesNotMatch(generateTicketSuffix(), /[ILOU]/);
  }
});

test("migrasi SQL memakai CSPRNG dan alfabet yang sama", () => {
  // random() bisa diprediksi dari urutan pemanggilan, jadi harus pakai generator
  // acak kriptografis. gen_random_uuid() dari pg_catalog dipakai supaya tidak
  // perlu menambah schema ke search_path yang sengaja di-pin.
  assert.match(migration, /gen_random_uuid\(\)/);
  assert.doesNotMatch(migration, /floor\(random\(\)/);
  // search_path harus tetap dipin dengan pg_temp di posisi terakhir.
  assert.match(migration, /set search_path = public, private, pg_temp/);
  // Alfabet di SQL harus identik dengan yang dipakai Zod.
  assert.ok(
    migration.includes("'0123456789ABCDEFGHJKMNPQRSTVWXYZ'"),
    "alfabet SQL harus sama dengan yang dipakai validasi"
  );
  // Constraint harus menerima kode lama supaya nota tercetak tetap berlaku.
  assert.match(migration, /\[0-9\]\{4\}\|\[0-9A-HJKMNP-TV-Z\]\{8\}/);
});

test("rate limit menolak permintaan melebihi kuota lalu membukanya lagi", () => {
  resetRateLimits();
  const window = 60_000;

  for (let i = 0; i < 10; i++) {
    const verdict = consumeRateLimit("ip-a", 10, window);
    assert.equal(verdict.allowed, true, `permintaan ${i + 1} harus lolos`);
  }

  const blocked = consumeRateLimit("ip-a", 10, window);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0, "harus memberi saran tunggu");
  assert.equal(blocked.remaining, 0);

  // IP lain tidak boleh ikut terpengaruh.
  assert.equal(consumeRateLimit("ip-b", 10, window).allowed, true);
});

test("rate limit menghitung kuota per kunci secara terpisah", () => {
  resetRateLimits();
  const window = 60_000;

  for (let i = 0; i < 5; i++) {
    assert.equal(consumeRateLimit("sama", 5, window).allowed, true);
  }
  assert.equal(consumeRateLimit("sama", 5, window).allowed, false);
  assert.equal(consumeRateLimit("lain", 5, window).allowed, true);
});

test("jendela rate limit yang kedaluwarsa membuka kuota baru", async () => {
  resetRateLimits();
  // Jendela sengaja dibuat pendek supaya test tidak lama.
  assert.equal(consumeRateLimit("ip-kedaluwarsa", 1, 30).allowed, true);
  assert.equal(consumeRateLimit("ip-kedaluwarsa", 1, 30).allowed, false);

  await new Promise((resolve) => setTimeout(resolve, 45));

  assert.equal(
    consumeRateLimit("ip-kedaluwarsa", 1, 30).allowed,
    true,
    "kuota harus terbuka lagi setelah jendela lewat"
  );
  resetRateLimits();
});
