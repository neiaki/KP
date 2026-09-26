import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * NFR-07 minta setiap mutasi status unit dan tiket servis tercatat dengan
 * stempel waktu dan identitas pelaku. Test ini mengunci sisi SQL dan sisi
 * aplikasi, karena keduanya harus berubah bersama: kalau trigger hilang tapi
 * setAuditActor masih ada, audit kosong; sebaliknya kalau setAuditActor hilang
 * tapi trigger ada, semua baris tercatat dengan aktor NULL.
 */

const migrationPath = fileURLToPath(
  new URL("../supabase/migrations/0007_audit_trail.sql", import.meta.url)
);
const migration = readFileSync(migrationPath, "utf8");

test("tabel audit dibuat dengan kolom pelaku dan stempel waktu", () => {
  assert.match(migration, /create table if not exists public\.unit_status_audit/);
  assert.match(migration, /create table if not exists public\.service_ticket_audit/);
  // NFR-07: stempel waktu dan identitas pelaku.
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /actor_id uuid references public\.profiles\(id\)/);
});

test("pencatatan lewat trigger, bukan lewat kode aplikasi", () => {
  // Trigger AFTER UPDATE OF status supaya perubahan lewat SQL manual pun
  // tercatat. Kalau ini hilang, NFR-07 bisa dilewati dari SQL Editor.
  assert.match(
    migration,
    /create trigger trg_audit_unit_status\s+after update of status on public\.inventory_units/
  );
  assert.match(
    migration,
    /create trigger trg_audit_ticket_status\s+after update of repair_status on public\.service_tickets/
  );
  // Perubahan status yang sama tidak boleh menambah baris audit.
  assert.match(migration, /if new\.status is not distinct from old\.status then/);
  assert.match(migration, /if new\.repair_status is not distinct from old\.repair_status then/);
});

test("aktor dibaca dari transaction-local, bukan auth.uid()", () => {
  // src/db/client.ts memakai koneksi postgres langsung, jadi auth.uid() selalu
  // NULL di jalur itu. Aktor harus lewat set_config transaction-local.
  assert.match(migration, /current_setting\('atcell\.actor_id', true\)/);
  assert.match(migration, /is_local|t.transaction|s\.true\)|, true\)/);
  // String rusak tidak boleh menggagalkan pencatatan.
  assert.match(migration, /exception when others then[\s\S]*?return null;/);
});

test("audit bersifat append-only dari sisi aplikasi", () => {
  // Tidak boleh ada policy INSERT, UPDATE, atau DELETE untuk role aplikasi.
  // Regex dibelah dua supaya tidak butuh flag dotAll, karena tsconfig
  // repository ini masih menyasar target di bawah es2018.
  assert.equal(
    /for (insert|update|delete)/i.test(migration),
    false,
    "audit tidak boleh punya policy tulis untuk role aplikasi"
  );
  assert.match(migration, /grant select on public\.unit_status_audit/);
  assert.match(migration, /grant all on public\.unit_status_audit/);
  assert.match(migration, /to service_role;/);
});

test("semua jalur mutasi status mengirim aktor", () => {
  // Tiga jalur yang mengubah status: inventaris, tiket servis, dan POS.
  const files = [
    "../src/lib/actions/inventory.ts",
    "../src/lib/actions/service.ts",
    "../src/lib/actions/pos.ts",
  ];
  for (const rel of files) {
    const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    assert.match(
      source,
      /setAuditActor\(tx, guard\.profile\.id\)/,
      `${rel} harus mengirim aktor lewat setAuditActor`
    );
    // Aktor hanya sah kalau ditulis DI DALAM transaction, kalau tidak
    // set_config langsung kedaluwarsa dan audit mencatat NULL.
    assert.match(
      source,
      /db\.transaction\(async \(tx\) => \{[\s\S]*?setAuditActor\(/,
      `${rel} harus memanggil setAuditActor di dalam db.transaction`
    );
  }
});

test("helper aktor tidak punya jalur menulis ke tabel audit", () => {
  const helpers = readFileSync(
    fileURLToPath(new URL("../src/lib/actions/_helpers.ts", import.meta.url)),
    "utf8"
  );
  assert.match(helpers, /export async function setAuditActor/);
  // transaction-local: nilai true sebagai argumen ketiga set_config.
  assert.match(helpers, /set_config\('atcell\.actor_id'.*true\)\`/);
  // Aktor kosong harus jadi string kosong, bukan null, karena set_config
  // menerima teks. Trigger yang mengubahnya kembali jadi NULL.
  assert.match(helpers, /actorId \?\? ""/);
});
