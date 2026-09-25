import test from "node:test";
import assert from "node:assert/strict";
import { isReady } from "../src/lib/health.ts";

test("readiness hanya siap ketika Supabase, konfigurasi DB, dan koneksi DB aktif", () => {
  assert.equal(
    isReady({
      supabaseConfigured: true,
      databaseConfigured: true,
      databaseReachable: true,
      databaseSchemaReady: true,
      serviceRoleConfigured: true,
    }),
    true
  );
  assert.equal(
    isReady({
      supabaseConfigured: true,
      databaseConfigured: true,
      databaseReachable: false,
      databaseSchemaReady: true,
      serviceRoleConfigured: true,
    }),
    false
  );
  assert.equal(
    isReady({
      supabaseConfigured: false,
      databaseConfigured: true,
      databaseReachable: true,
      databaseSchemaReady: true,
      serviceRoleConfigured: true,
    }),
    false
  );
  assert.equal(
    isReady({
      supabaseConfigured: true,
      databaseConfigured: true,
      databaseReachable: true,
      databaseSchemaReady: false,
      serviceRoleConfigured: true,
    }),
    false
  );
  assert.equal(
    isReady({
      supabaseConfigured: true,
      databaseConfigured: true,
      databaseReachable: true,
      databaseSchemaReady: true,
      serviceRoleConfigured: false,
    }),
    false
  );
});
