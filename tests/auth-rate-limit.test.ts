import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CREDENTIAL_ATTEMPT_LIMIT,
  CREDENTIAL_IP_LIMIT,
  consumeCredentialAttempt,
  resetRateLimits,
} from "../src/lib/rate-limit.ts";

/*
 * Login portal dulu terbuka tanpa throttle sama sekali, padahal pendaftaran
 * pelanggan juga terbuka untuk publik. Kuota yang ditegakkan di sini harus
 * dua lapis: per pasangan IP + username, supaya satu penyerang tidak bisa
 * mengunci seluruh toko, dan per IP, supaya memutar username tidak membantu.
 *
 * Lapisan throttle tidak boleh berubah jadi oracle: "terlalu banyak percobaan"
 * hanya boleh bergantung pada berapa kali permintaan datang, bukan pada
 * apakah username-nya terdaftar.
 */

const authAction = readFileSync(new URL("../src/lib/actions/auth.ts", import.meta.url), "utf8");
const signIn = authAction.slice(
  authAction.indexOf("export async function signInWithUsername"),
  authAction.indexOf("export async function signUpCustomer")
);
const signUp = authAction.slice(
  authAction.indexOf("export async function signUpCustomer"),
  authAction.indexOf("export async function signOut")
);

test("percobaan berulang pada satu username dari satu IP diblokir", () => {
  resetRateLimits();
  for (let i = 0; i < CREDENTIAL_ATTEMPT_LIMIT; i++) {
    assert.equal(
      consumeCredentialAttempt("10.0.0.1", "kasir01").allowed,
      true,
      `percobaan ke-${i + 1} masih harus boleh`
    );
  }
  const blocked = consumeCredentialAttempt("10.0.0.1", "kasir01");
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.ok(blocked.retryAfterSeconds > 0, "harus ada sisa waktu");
});

test("satu penyerang tidak mengunci username lain maupun IP lain", () => {
  resetRateLimits();
  for (let i = 0; i <= CREDENTIAL_ATTEMPT_LIMIT; i++) {
    consumeCredentialAttempt("10.0.0.2", "admin");
  }
  // Kalau kuncinya cuma username, satu penyerang bisa membekakan akses staf
  // dengan mengetik "admin" berulang kali.
  assert.equal(consumeCredentialAttempt("10.0.0.2", "kasir01").allowed, true);
  assert.equal(consumeCredentialAttempt("10.0.0.3", "admin").allowed, true);
});

test("memutar username dari satu IP tetap tertahan lapisan per IP", () => {
  resetRateLimits();
  let allowedBeforeBlock = 0;
  for (let i = 0; i < CREDENTIAL_IP_LIMIT + 5; i++) {
    // Username selalu berbeda, jadi bucket per pasangan tidak pernah penuh.
    if (!consumeCredentialAttempt("10.0.0.4", `sisip${i}`).allowed) break;
    allowedBeforeBlock++;
  }
  assert.ok(
    allowedBeforeBlock < CREDENTIAL_IP_LIMIT + 5,
    "ganti username terus-menerus tidak boleh melewati kuota"
  );
  assert.ok(
    allowedBeforeBlock > CREDENTIAL_ATTEMPT_LIMIT,
    "batas per IP harus lebih longgar daripada batas per pasangan"
  );
});

test("throttle tidak jadi oracle keberadaan username", () => {
  resetRateLimits();
  // Dua username, satu terdaftar dan satu tidak. Bila kuota hanya dipotong
  // setelah username ketemu, yang tidak terdaftar akan selalu lolos dan
  // "tidak terblokir" berubah jadi jawaban ya/tidak. Verdict keduanya harus
  // persis sama, jadi tidak ada informasi yang bocor lewat throttle.
  const verdictFor = (name: string) =>
    Array.from({ length: CREDENTIAL_ATTEMPT_LIMIT + 2 }, () =>
      consumeCredentialAttempt("10.0.0.5", name).allowed
    );

  const forExisting = verdictFor("admin");
  const forMissing = verdictFor("entahapa");

  assert.deepEqual(forExisting, forMissing);
  assert.equal(forExisting.at(-1), false, "username tak dikenal juga harus ikut terblokir");

  // Pesan throttle hanya boleh memuat sisa waktu, bukan username.
  const throttleHelper = authAction.slice(
    authAction.indexOf("async function throttleCredential"),
    authAction.indexOf("export async function signInWithUsername")
  );
  const throttleMessage = throttleHelper.match(/return `([^`]*)`;/)?.[1] ?? "";
  assert.ok(throttleMessage.length > 0, "pesan throttle harus ada");
  assert.doesNotMatch(throttleMessage, /username|password|parsed\.data/i);
  assert.deepEqual(
    [...throttleMessage.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim()),
    ["verdict.retryAfterSeconds"]
  );
});

test("pesan kegagalan login tetap sama untuk username salah dan password salah", () => {
  assert.ok(signIn.includes('if (!row?.email) return fail("Username atau kata sandi salah.");'));
  assert.ok(signIn.includes('if (error) return fail("Username atau kata sandi salah.");'));
});

test("throttle dipotong sebelum profil dicari, di login dan di pendaftaran", () => {
  const throttleAt = signIn.indexOf("throttleCredential(");
  const lookupAt = signIn.indexOf('.from("profiles")');
  assert.ok(throttleAt > -1, "login harus memanggil throttleCredential");
  assert.ok(lookupAt > -1, "login tetap harus mencari profil");
  assert.ok(
    throttleAt < lookupAt,
    "throttle harus dipotong sebelum query profil, kalau tidak jadi oracle"
  );

  const signupThrottleAt = signUp.indexOf("throttleCredential(");
  const signupAt = signUp.indexOf("supabase.auth.signUp(");
  assert.ok(signupThrottleAt > -1, "pendaftaran pelanggan juga harus dibatasi");
  assert.ok(signupThrottleAt < signupAt, "throttle harus jalan sebelum membuat akun");
});
