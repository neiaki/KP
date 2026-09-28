import test from "node:test";
import assert from "node:assert/strict";
import { defaultPortalPath } from "../src/lib/access.ts";
import type { UserRole } from "../src/types";
import { resolveLoginDestination } from "../src/lib/login-redirect.ts";

/*
 * Parameter ?next= ditulis src/proxy.ts waktu pengunjung anonim yang ingin
 * membuka halaman portal dipantulkan ke halaman login.
 * Semua test di bawah memanggil fungsi yang sama dengan yang dipanggil login
 * panel, jadi yang diuji adalah keputusannya, bukan cara pemasangannya.
 *
 * Argumen fallback adalah beranda role yang dikembalikan signInWithUsername
 * dari server, sehingga "jatuh ke beranda role" berarti persis tujuan yang
 * dipakai pengguna hari ini kalau tidak ada deep link.
 */
function tujuan(next: string | null | undefined, role: UserRole): string {
  return resolveLoginDestination(next, role, defaultPortalPath(role));
}

test("deep link portal milik role dipakai apa adanya", () => {
  assert.equal(tujuan("/portal/reports", "admin"), "/portal/reports");
  assert.equal(tujuan("/portal/pos", "sales"), "/portal/pos");
  assert.equal(tujuan("/portal/service", "technician"), "/portal/service");
  assert.equal(tujuan("/portal/account", "customer"), "/portal/account");
});

test("query string halaman yang dituju ikut dipertahankan", () => {
  assert.equal(
    tujuan("/portal/reports?dari=login&bulan=2026-09", "admin"),
    "/portal/reports?dari=login&bulan=2026-09"
  );
});

test("host lain ditolak dalam semua bentuknya", () => {
  const nilai = [
    "//evil.example",
    "//evil.example/portal/reports",
    "/\\evil.example",
    "/\\evil.example/portal/reports",
    "https://evil.example/x",
    "https://evil.example/portal/reports",
    "http://atcell.my.id.evil.example/portal/reports",
    "javascript:alert(1)",
    "javascript://portal/reports",
    "portal/reports",
    "",
  ];
  for (const next of nilai) {
    assert.equal(tujuan(next, "admin"), "/portal/dashboard", `next=${next}`);
  }
});

test("halaman di luar portal tidak pernah jadi tujuan login", () => {
  const nilai = ["/id", "/id/catalog", "/en/tracking", "/", "/portal", "/portalX/reports"];
  for (const next of nilai) {
    assert.equal(tujuan(next, "admin"), "/portal/dashboard", `next=${next}`);
  }
});

test("halaman yang tidak boleh dibuka role jatuh ke beranda role", () => {
  assert.equal(tujuan("/portal/reports", "sales"), "/portal/pos");
  assert.equal(tujuan("/portal/settings", "technician"), "/portal/service");
  assert.equal(tujuan("/portal/staff", "sales"), "/portal/pos");
  assert.equal(tujuan("/portal/dashboard", "customer"), "/portal/account");
  // Penjaga role membaca nama path, bukan isi halamannya, jadi prefix yang
  // tidak dikenal juga gugur untuk role selain admin.
  assert.equal(tujuan("/portal/rahasia", "sales"), "/portal/pos");
  assert.equal(tujuan("/portal/rahasia", "admin"), "/portal/rahasia");
});

test("tanpa next tujuan login tetap beranda role", () => {
  assert.equal(tujuan(null, "admin"), "/portal/dashboard");
  assert.equal(tujuan(undefined, "sales"), "/portal/pos");
  assert.equal(tujuan("", "technician"), "/portal/service");
});

test("nilai mencurigakan tidak pernah menghasilkan URL di luar origin sendiri", () => {
  const nilai = [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/x",
    "/portal/x\nSet-Cookie: a=b",
    "/portal/../../evil",
    "/portal/%2f%2fevil.example",
    "https://user:pass@evil.example/portal/reports",
  ];
  for (const next of nilai) {
    const hasil = tujuan(next, "admin");
    assert.ok(
      hasil.startsWith("/portal/"),
      `next=${JSON.stringify(next)} menghasilkan ${hasil}`
    );
    const url = new URL(hasil, "https://atcell.my.id");
    assert.equal(url.origin, "https://atcell.my.id", `next=${next}`);
  }
});
