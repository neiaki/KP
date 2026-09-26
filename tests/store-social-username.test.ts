import test from "node:test";
import assert from "node:assert/strict";
import {
  storeSettingsUpdateSchema,
  usernameSchema,
} from "../src/lib/validations.ts";

/*
 * Dua aturan ini menjaga form settings dan form login dari jadi celah:
 * URL sosmed yang bisa disuntik lewat skema non-http, dan username yang
 * tidak cocok dengan check constraint di migrasi 0005.
 */

test("URL sosmed hanya menerima http dan https", () => {
  const base = { store_name: "At Cell Serpong" };
  assert.equal(
    storeSettingsUpdateSchema.safeParse({ ...base, social_facebook: "https://facebook.com/atcell" }).success,
    true
  );
  assert.equal(
    storeSettingsUpdateSchema.safeParse({ ...base, social_instagram: "http://instagram.com/atcell" }).success,
    true
  );
  // Skema ini bisa mengeksekusi skrip atau mencuri data saat link dibuka.
  assert.equal(
    storeSettingsUpdateSchema.safeParse({ ...base, social_x: "javascript:alert(1)" }).success,
    false
  );
  assert.equal(
    storeSettingsUpdateSchema.safeParse({ ...base, social_tiktok: "data:text/html,<script>alert(1)</script>" }).success,
    false
  );
  // Kolom kosong berarti platform disembunyikan, itu sah.
  assert.equal(
    storeSettingsUpdateSchema.safeParse({ ...base, social_tiktok: "" }).success,
    true
  );
});

test("username mengikuti aturan yang sama dengan check constraint DB", () => {
  // Batas check: ^[a-z0-9._-]{3,32}$
  assert.equal(usernameSchema.safeParse("admin").success, true);
  assert.equal(usernameSchema.safeParse("teknisi_1").success, true);
  assert.equal(usernameSchema.safeParse("a.b-c").success, true);
  assert.equal(usernameSchema.safeParse("ab").success, false, "kurang dari 3 karakter");
  assert.equal(usernameSchema.safeParse("a".repeat(33)).success, false, "lebih dari 32 karakter");
  assert.equal(usernameSchema.safeParse("admin@atcell").success, false, "tanda baca tidak diizinkan");
  assert.equal(usernameSchema.safeParse("admin adi").success, false, "spasi tidak diizinkan");
  // Huruf besar dan spasi dinormalkan, bukan ditolak, supaya yang diketik
  // Admin dan admin menghasilkan username yang sama di database.
  const upper = usernameSchema.safeParse("Admin");
  assert.equal(upper.success, true, "huruf besar tidak ditolak, hanya dinormalkan");
  if (upper.success) assert.equal(upper.data, "admin");
  const parsed = usernameSchema.safeParse("  Budi.Santoso  ");
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data, "budi.santoso");
});
