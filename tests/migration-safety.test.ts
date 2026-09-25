import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/0001_atcell_schema.sql", import.meta.url),
  "utf8"
);

test("migration production At Cell tetap memuat guard data kritis", () => {
  assert.match(migration, /imei\s+text\s+not\s+null\s+unique/);
  assert.ok(migration.includes("imei ~ '^\\d{15}$'"));
  assert.match(migration, /alter table public\.inventory_units enable row level security/);
  assert.match(migration, /revoke execute on function public\.process_trade_in_sale/);
  assert.ok(migration.includes("public.get_my_role() not in ('admin', 'sales')"));
  assert.match(migration, /create or replace view public\.v_public_inventory/);
  assert.ok(
    migration.includes("public.v_public_inventory from public, anon, authenticated")
  );
  assert.ok(migration.includes("grant usage on schema public to anon, authenticated"));
  assert.ok(migration.includes("for select to anon, authenticated"));
  assert.ok(migration.includes("trg_validate_ticket_transition"));
  assert.ok(migration.includes("INVALID_REPAIR_TRANSITION"));
  assert.ok(migration.includes("SOLD_IS_TERMINAL"));
  assert.doesNotMatch(migration, /grant (?:insert|update|delete)[\s\S]*?to authenticated/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
});
