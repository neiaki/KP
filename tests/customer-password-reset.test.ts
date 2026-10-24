import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Aksi updateCustomerPassword memakai service role Supabase untuk menimpa
 * kata sandi akun Auth apa pun yang id-nya dikirim client. Penjaga terpenting
 * bukan happy path-nya, melainkan urutan pemeriksaan sebelum penimpaan itu
 * terjadi. Aksi ini tidak bisa diuji perilakunya tanpa sesi dan database,
 * jadi wiring dikunci lewat source, sama seperti tests/auth-rate-limit.test.ts
 * yang menjadi presedennya.
 */

const authAction = readFileSync(new URL("../src/lib/actions/auth.ts", import.meta.url), "utf8");

const mulai = authAction.indexOf("export async function updateCustomerPassword");
const selesai = authAction.indexOf("export async function signOut");
assert.ok(mulai > -1, "aksi updateCustomerPassword harus ada di auth.ts");
assert.ok(selesai > mulai, "signOut harus berada setelah updateCustomerPassword");
const aksi = authAction.slice(mulai, selesai);

test("gerbang tulis dan peran admin/sales diperiksa lebih dulu", () => {
  const gerbangAt = aksi.indexOf("requireWriteAccess()");
  const peranAt = aksi.indexOf('requireRole(["admin", "sales"])');
  const kuotaAt = aksi.indexOf("consumeRateLimit(");
  const authAt = aksi.indexOf("updateUserById(");

  assert.ok(gerbangAt > -1, "aksi wajib memanggil requireWriteAccess");
  assert.ok(peranAt > -1, "hanya admin dan sales yang boleh mengganti kata sandi pelanggan");
  assert.ok(
    gerbangAt < peranAt && peranAt < authAt,
    "gerbang tulis dan peran harus lolos sebelum menyentuh Auth"
  );
  assert.ok(kuotaAt > -1 && kuotaAt < authAt, "kuota per staf dipotong sebelum menulis ke Auth");
});

test("target harus benar-benar profil customer sebelum password ditimpa", () => {
  // Tanpa cek peran target, sales bisa menimpa kata sandi admin lewat aksi
  // ini dengan memanggil server action secara langsung.
  const cekTargetAt = aksi.indexOf('target.role !== "customer"');
  const lookupAt = aksi.indexOf(".from(profiles)");
  const authAt = aksi.indexOf("updateUserById(");

  assert.ok(lookupAt > -1, "peran target dibaca dari tabel profiles, bukan dipercaya dari client");
  assert.ok(cekTargetAt > -1, "aksi menolak target yang bukan customer");
  assert.ok(lookupAt < authAt && cekTargetAt < authAt, "cek target terjadi sebelum menimpa password");
});

test("kata sandi baru divalidasi passwordSchema sebelum dipakai", () => {
  const validasiAt = aksi.indexOf("passwordSchema.safeParse");
  const authAt = aksi.indexOf("updateUserById(");
  assert.ok(validasiAt > -1, "validasi minimal 8 karakter harus ada");
  assert.ok(validasiAt < authAt, "validasi terjadi sebelum password dikirim ke Auth");
  assert.ok(
    aksi.includes("password: parsed.data"),
    "yang dikirim ke Auth adalah hasil validasi, bukan input mentah"
  );
});

test("penggantian kata sandi tidak menambah titik throttle kredensial", () => {
  // tests/auth-rate-limit.test.ts mengunci tepat satu pemanggilan
  // consumeCredentialAttempt di auth.ts supaya pesan throttle tidak bisa
  // berbeda antar lapisan. Aksi ini memakai consumeRateLimit, bukan
  // consumeCredentialAttempt, jadi invarian itu tetap utuh.
  const calls = authAction.match(/consumeCredentialAttempt\(/g) ?? [];
  assert.equal(calls.length, 1, "harus tetap ada tepat satu titik pemanggilan throttle kredensial");
  assert.ok(!aksi.includes("consumeCredentialAttempt("));
});

test("halaman pelanggan memanggil dispatcher, bukan server action langsung", () => {
  const page = readFileSync(
    new URL("../src/app/(portal)/portal/customers/page.tsx", import.meta.url),
    "utf8"
  );
  const store = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");

  assert.ok(
    page.includes("updateCustomerPassword, currentRole"),
    "halaman mengambil updateCustomerPassword dari useStore"
  );
  assert.ok(
    store.includes("updateCustomerPasswordAction(userId, password)"),
    "dispatcher meneruskan userId dan kata sandi ke server action di mode live"
  );
});
