import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  staffRoleSchema,
  wouldLeaveNoAdmin,
} from "../src/lib/validations.ts";

/*
 * Aksi peran staf dulu menulis role apa pun yang dikirim dan tidak pernah
 * menghitung sisa admin. Admin terakhir yang kehilangan perannya (demote
 * atau dinonaktifkan) mengunci semua orang dari portal, dan pemulihannya
 * butuh tulis langsung ke database.
 *
 * Syaratnya tidak bisa diuji lewat panggilan database dari sini, jadi
 * predicate-nya diekstrak jadi wouldLeaveNoAdmin di src/lib/validations.ts,
 * lalu dipanggil oleh kedua aksi dengan bentuk yang sama.
 */

/*
 * Pengaman kedua, untuk hal yang tidak bisa diuji tanpa database: apakah
 * kedua aksi benar-benar memanggil predicate itu SEBELUM menulis. Tanpa ini,
 * penghapusan satu baris wouldLeaveNoAdmin dari auth.ts akan lolos dari test
 * di atas yang hanya menguji predicate-nya.
 */
const authAction = readFileSync(new URL("../src/lib/actions/auth.ts", import.meta.url), "utf8");

test("kedua aksi memanggil penjaga admin sebelum menulis", () => {
  const update = authAction.slice(
    authAction.indexOf("export async function updateStaffRole"),
    authAction.indexOf("export async function deactivateStaff")
  );
  const deactivate = authAction.slice(
    authAction.indexOf("export async function deactivateStaff"),
    authAction.indexOf("export async function listStaff")
  );
  assert.ok(update.length > 0 && deactivate.length > 0, "kedua aksi harus ada di auth.ts");
  assert.match(update, /wouldLeaveNoAdmin\(/, "updateStaffRole harus memanggil predicate");
  assert.match(deactivate, /wouldLeaveNoAdmin\(/, "deactivateStaff harus memanggil predicate");
  // Penjaga harus mendahului tulisan, bukan Paralel dengannya.
  assert.ok(
    update.indexOf("wouldLeaveNoAdmin(") < update.indexOf(".update(profiles)"),
    "penjaga harus dicek sebelum update"
  );
  assert.ok(
    deactivate.indexOf("wouldLeaveNoAdmin(") < deactivate.indexOf("deleteUser("),
    "penjaga harus dicek sebelum deleteUser"
  );
});

test("admin terakhir yang kehilangan peran ditolak", () => {
  // Skenario yang paling merusak: satu-satunya admin di toko diturunkan.
  // deactivateStaff memanggil predicate yang sama dengan nextIsAdmin: false,
  // jadi jalur penonaktifan ikut tertutupnya.
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 1, targetIsAdmin: true, nextIsAdmin: false }),
    true
  );
});

test("hanya hitungan 1 yang ditolak, admin lain masih menyisakan", () => {
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 2, targetIsAdmin: true, nextIsAdmin: false }),
    false
  );
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 7, targetIsAdmin: true, nextIsAdmin: false }),
    false
  );
});

test("staf non-admin bebas diturunkan atau dinonaktifkan walau cuma satu admin", () => {
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 1, targetIsAdmin: false, nextIsAdmin: false }),
    false
  );
});

test("peran yang tidak berubah tidak dihitung sebagai kehilangan admin", () => {
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 1, targetIsAdmin: true, nextIsAdmin: true }),
    false
  );
});

test("promosi ke admin tidak pernah ditolak, bahkan saat hitungan 0", () => {
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 0, targetIsAdmin: false, nextIsAdmin: true }),
    false
  );
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 1, targetIsAdmin: true, nextIsAdmin: true }),
    false
  );
});

test("nilai database yang aneh (0 admin, target admin) tetap ditolak", () => {
  // Kalau baris admin hilang di luar aplikasi, menurunkan satu-satunya admin
  // yang tersisa tidak boleh lolos diam-diam.
  assert.equal(
    wouldLeaveNoAdmin({ adminCount: 0, targetIsAdmin: true, nextIsAdmin: false }),
    true
  );
});

test("peran dari client harus lolos enum user_role", () => {
  for (const role of ["admin", "sales", "technician", "customer"]) {
    assert.equal(staffRoleSchema.safeParse(role).success, true, `peran ${role} harus sah`);
  }
  // Tipe UserRole dihapus saat runtime, jadi string ini bisa masuk ke action.
  for (const role of ["superadmin", "ADMIN", "", "admin,superadmin", "admin'"]) {
    assert.equal(
      staffRoleSchema.safeParse(role).success,
      false,
      `peran ${JSON.stringify(role)} harus ditolak sebelum sampai ke query`
    );
  }
  for (const role of [null, undefined, 1, {}, ["admin"]]) {
    assert.equal(staffRoleSchema.safeParse(role).success, false);
  }
});
