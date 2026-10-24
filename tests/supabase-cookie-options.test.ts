import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * Cookie sesi Supabase harus httpOnly dan secure di production.
 *
 * @supabase/ssr 0.12.7 memakai httpOnly: false dan tanpa secure untuk semua
 * cookie yang ia pasang, termasuk chunk auth-token yang memuat access dan
 * refresh token. Override-nya lewat cookieOptions di createServerClient, dan
 * test ini menjaga dua hal: nilainya benar, dan kedua call site benar-benar
 * memakainya sehingga tidak bisa hilang diam-diam lewat refactor.
 */

const { authCookieOptions } = await import("../src/lib/supabase/cookie-options.ts");

test("cookie sesi selalu httpOnly dengan path akar", () => {
  const options = authCookieOptions();
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/");
  assert.equal(options.sameSite, "lax");
});

test("cookie sesi hanya secure di production", () => {
  assert.equal(authCookieOptions("production").secure, true);
  assert.equal(authCookieOptions("development").secure, false);
  assert.equal(authCookieOptions(undefined).secure, false);
});

test("kedua pembuat client Supabase memasang cookieOptions keamanan", () => {
  const sumber = [
    "src/proxy.ts",
    "src/lib/supabase/server.ts",
  ].map((p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
  for (const isi of sumber) {
    assert.match(
      isi,
      /cookieOptions:\s*authCookieOptions\(\)/,
      "call site createServerClient wajib memakai authCookieOptions()"
    );
  }
});
