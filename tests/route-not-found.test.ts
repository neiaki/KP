import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildContentSecurityPolicy, createNonce } from "../src/lib/csp.ts";

/*
 * src/app/not-found.tsx dilayani Next.js sebagai route /_not-found, yang ditulis
 * di luar kedua route group, jadi tidak mewarisi mode render apa pun dari root
 * layout portal. Berkas ini karena itu harus menyatakan mode rendernya sendiri.
 *
 * Nilai yang diimpor dari berkas tidak bisa diperiksa di runner test bawaan
 * Node: `import("../src/app/not-found.tsx")` gagal dengan
 * ERR_UNKNOWN_FILE_EXTENSION "Unknown file extension \".tsx\"", karena runner
 * hanya mengurai TypeScript tanpa JSX, dan berkas ini juga menarik komponen
 * React dan alias @/ yang tidak bisa diurai runner. Karena itu nilai diekstrak
 * dari sumber, sementara aturan CSP di bawah diuji lewat nilai yang benar
 * benar diekspor src/lib/csp.ts.
 */
const NOT_FOUND = new URL("../src/app/not-found.tsx", import.meta.url);
const PORTAL_LAYOUT = new URL("../src/app/(portal)/layout.tsx", import.meta.url);

function modeRender(isi: string): string | null {
  return isi.match(/export const dynamic\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
}

function directive(csp: string, nama: string): string[] {
  const baris = csp.split("; ").find((b) => b.startsWith(`${nama} `));
  return baris ? baris.slice(nama.length + 1).split(" ") : [];
}

test("halaman 404 menyatakan mode render yang sama dengan root layout portal", async () => {
  const [notFound, portalLayout] = await Promise.all([
    readFile(NOT_FOUND, "utf8"),
    readFile(PORTAL_LAYOUT, "utf8"),
  ]);
  assert.equal(
    modeRender(notFound),
    modeRender(portalLayout),
    "kalau mode render 404 berbeda dari portal, nonce per permintaan tidak bisa dijamin untuk keduanya"
  );
  assert.equal(
    modeRender(notFound),
    "force-dynamic",
    "kalau hilang, /_not-found boleh diprerender dan nonce hasil build tidak akan cocok"
  );
});

test("halaman 404 tetap server component supaya segment config dibaca", async () => {
  const isi = await readFile(NOT_FOUND, "utf8");
  assert.ok(
    !/^\s*["']use client["']/m.test(isi),
    "segment config di berkas klien diabaikan tanpa pesan"
  );
});

test("kebijakan CSP tetap memakai nonce dan tidak melonggarkan script-src", () => {
  const nonce = createNonce();
  const scriptSrc = directive(buildContentSecurityPolicy({ nonce }), "script-src");
  assert.ok(scriptSrc.includes(`'nonce-${nonce}'`), "skrip hanya boleh jalan lewat nonce");
  assert.ok(scriptSrc.includes("'strict-dynamic'"), "strict-dynamic harus tetap ada");
  assert.ok(
    !scriptSrc.includes("'unsafe-inline'"),
    `script-src jangan sampai longgar: ${scriptSrc.join(" ")}`
  );
  assert.notEqual(createNonce(), nonce, "nonce harus baru tiap permintaan");
});
