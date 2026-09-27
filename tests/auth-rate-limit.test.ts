import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CREDENTIAL_ACCOUNT_LIMIT,
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

test("lapisan per akun menahan serangan tersebar tanpa mengunci toko", () => {
  // Lapisan per pasangan dan per IP sama-sama memuat alamat klien, jadi
  // keduanya cuma membatasi satu alamat. Lapisan per akun tidak memuat IP:
  // satu penyerang dengan banyak alamat tetap terikat ke satu kuota.
  resetRateLimits();
  let allowed = 0;
  // Tiap permintaan datang dari alamat berbeda supaya lapisan lain tidak
  // pernah penuh. Cuma lapisan per akun yang bisa menghentikan ini.
  for (let i = 0; i < CREDENTIAL_ACCOUNT_LIMIT * 4; i++) {
    if (!consumeCredentialAttempt(`172.16.0.${i % 250}.${Math.floor(i / 250)}`, "admin").allowed) {
      break;
    }
    allowed++;
  }
  assert.equal(
    allowed,
    CREDENTIAL_ACCOUNT_LIMIT,
    "lapisan per akun harus berhenti tepat di batasnya meski IP terus berganti"
  );

  // Orang berikutnya di toko punya username sendiri, jadi tidak ikut kena.
  assert.equal(
    consumeCredentialAttempt("172.16.9.9", "kasir01").allowed,
    true,
    "menyerang satu akun tidak boleh mengunci username staf lain"
  );
});

test("toko di belakang satu NAT tidak saling mengunci", () => {
  // Skenario yang dijanjikan komentar: beberapa staf berbagi satu IP
  // publik. Semua orang punya username sendiri, jadi tiap orang memakai
  // bucket per akun dan bucket per IP sendiri.
  resetRateLimits();
  const staff = ["admin", "kasir01", "kasir02", "teknik01", "teknik02"];
  for (const name of staff) {
    for (let i = 0; i < 6; i++) {
      assert.equal(
        consumeCredentialAttempt("103.28.14.7", name).allowed,
        true,
        `${name} terkunci pada percobaan ke-${i + 1}; kuota per IP harus cukup untuk satu NAT`
      );
    }
  }
});

test("lapisan per akun juga tidak jadi oracle keberadaan username", () => {
  // Lapisan baru tidak menerima apa pun soal apakah username terdaftar, tapi
  // itu harus dibuktikan, bukan diasumsikan. Username terdaftar dan tidak
  // terdaftar harus memberi urutan verdict yang PERSIS sama, termasuk
  // retryAfterSeconds, saat keduanya dihajar sampai melewati batas per akun.
  resetRateLimits();
  const attempts = CREDENTIAL_ACCOUNT_LIMIT + 5;
  const verdictFor = (name: string) =>
    Array.from({ length: attempts }, (_, i) =>
      // Alamat berbeda tiap giliran supaya yang menguji adalah lapisan per
      // akun, bukan per IP.
      consumeCredentialAttempt(`10.20.${Math.floor(i / 200)}.${i % 200}`, name)
    );

  const forExisting = verdictFor("admin");
  const forMissing = verdictFor("entahapa");

  assert.deepEqual(
    forExisting,
    forMissing,
    "username tak dikenal harus punya urutan verdict identik dengan yang terdaftar"
  );
  assert.equal(
    forExisting.at(-1)?.allowed,
 false,
    "lapisan per akun harus memblokir username tak dikenal juga"
  );
  assert.ok(
    forExisting.some((v) => !v.allowed && v.retryAfterSeconds > 0),
    "verdict terblokir harus tetap memberi sisa waktu"
  );
});

test("pesan throttle identik untuk semua lapisan, jadi tidak bisa dibedakan", () => {
  // auth.ts hanya punya satu titik pemanggilan throttleCredential, jadi
  // lapisan baru tidak mungkin mengubah pesan. Ini yang mengunci sifat itu.
  const calls = authAction.match(/consumeCredentialAttempt\(/g) ?? [];
  assert.equal(calls.length, 1, "harus ada tepat satu titik pemanggilan throttle");
  assert.ok(
    authAction.includes("const verdict = consumeCredentialAttempt("),
    "pesan throttle dibangun dari satu verdict yang sama untuk semua lapisan"
  );
});
