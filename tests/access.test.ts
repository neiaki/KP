import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessPortalPath,
  defaultPortalPath,
  isAuthSessionMissingError,
  isPortalLoginPath,
  resolveEffectivePortalPath,
} from "../src/lib/access.ts";

test("route guard membatasi modul portal berdasarkan role", () => {
  assert.equal(canAccessPortalPath("/portal/dashboard", "admin"), true);
  assert.equal(canAccessPortalPath("/portal/dashboard", "sales"), false);
  assert.equal(canAccessPortalPath("/portal/pos", "sales"), true);
  assert.equal(canAccessPortalPath("/portal/inventory", "technician"), false);
  assert.equal(canAccessPortalPath("/portal/service", "technician"), true);
  assert.equal(canAccessPortalPath("/portal/settings", "sales"), false);
  assert.equal(canAccessPortalPath("/portal/account", "customer"), true);
});

test("redirect fallback role mengarah ke modul default yang benar", () => {
  assert.equal(defaultPortalPath("admin"), "/portal/dashboard");
  assert.equal(defaultPortalPath("sales"), "/portal/pos");
  assert.equal(defaultPortalPath("technician"), "/portal/service");
  assert.equal(defaultPortalPath("customer"), "/portal/account");
});

test("proxy menormalkan path subdomain login sebelum guard", () => {
  assert.equal(resolveEffectivePortalPath("/dashboard", true), "/portal/dashboard");
  assert.equal(resolveEffectivePortalPath("/en/login", true), "/en/login");
  assert.equal(resolveEffectivePortalPath("/portal/login", true), "/id/login");
  assert.equal(resolveEffectivePortalPath("/id/catalog", true), "/id/catalog");
  assert.equal(resolveEffectivePortalPath("/id/catalog", false), "/id/catalog");
  assert.equal(isPortalLoginPath("/en/login"), true);
  assert.equal(isPortalLoginPath("/portal/dashboard"), false);
  assert.equal(isAuthSessionMissingError({ name: "AuthSessionMissingError" }), true);
  assert.equal(isAuthSessionMissingError({ name: "FetchError" }), false);
  assert.equal(isAuthSessionMissingError(undefined), true);
});
