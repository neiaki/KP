import test from "node:test";
import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { authCookieOptions } from "../src/lib/supabase/cookie-options.ts";

/*
 * Verifikasi end-to-end bahwa flag httpOnly/secure benar-benar sampai ke
 * Set-Cookie, bukan hanya tertulis di call site.
 *
 * createServerClient dari @supabase/ssr dipakai dengan adapter cookie stub
 * yang merekam semua option yang diterima setAll. Sesi dipasang lewat
 * auth.setSession dengan JWT ber-exp jauh di masa depan: gotrue hanya
 * mendekode payload secara lokal (tidak memverifikasi tanda tangan, tidak
 * memanggil jaringan) lalu menyimpan sesi ke storage, dan penyimpanan itulah
 * yang memanggil setAll bersama options gabungan DEFAULT_COOKIE_OPTIONS +
 * cookieOptions aplikasi.
 *
 * Tanpa override, options ini membawa httpOnly:false dan tanpa secure dari
 * DEFAULT_COOKIE_OPTIONS library. Dengan authCookieOptions, chunk
 * sb-*-auth-token harus tercatat httpOnly:true.
 */

type CapturedCookie = { name: string; options: Record<string, unknown> };

function buatJwt(expEpochSeconds: number): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url({ sub: "11111111-1111-1111-1111-111111111111", exp: expEpochSeconds, role: "authenticated" }),
    "sig",
  ].join(".");
}

test("setSession mengalirkan flag keamanan sampai setAll", async () => {
  const captured: CapturedCookie[] = [];
  const supabase = createServerClient("https://contoh.supabase.co", "anon-kunci-uji", {
    cookieOptions: authCookieOptions("production"),
    cookies: {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        for (const { name, options } of cookiesToSet) {
          captured.push({ name, options: options ?? {} });
        }
      },
    },
  });

  // setSession pada auth-js terbaru memvalidasi lewat GET /auth/v1/user.
  // Stub fetch supaya tidak ada jaringan nyata: balas user minimal yang sah.
  const fetchAsli = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", aud: "authenticated" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const { error } = await supabase.auth.setSession({
      access_token: buatJwt(Math.floor(Date.now() / 1000) + 3600),
      refresh_token: "refresh-token-uji",
    });
    assert.equal(error, null);
  } finally {
    globalThis.fetch = fetchAsli;
  }

  const chunk = captured.find((c) => c.name.includes("auth-token"));
  assert.ok(chunk, `setAll harus menulis cookie auth-token, yang tertulis: ${captured.map((c) => c.name).join(", ")}`);
  assert.equal(chunk.options.httpOnly, true, "chunk auth-token wajib httpOnly:true");
  assert.equal(chunk.options.secure, true, "di production chunk auth-token wajib secure:true");
  assert.equal(chunk.options.sameSite, "lax");
  assert.equal(chunk.options.path, "/");
});
