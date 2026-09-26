import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";

/*
 * NFR-07 mengikat dua sisi yang harus berubah bersama:
 *   - sisi SQL       : trigger + private.current_actor_id() (migrasi 0007)
 *   - sisi aplikasi  : setAuditActor() yang menulis atcell.actor_id
 *
 * tests/audit-trail.test.ts mengunci sisi aplikasi secara statis (baca source).
 * File ini mengunci sisi SQL dengan menjalankannya sungguhan. Dua-duanya perlu:
 * kalau nama setting atau format UUID berubah di satu sisi saja, test statis
 * tetap hijau tapi audit produksi menulis NULL semua.
 *
 * Test opt-in lewat DATABASE_URL supaya `npm test` di CI tanpa database tetap
 * jalan. Setiap perubahan dibungkus savepoint yang di-rollback, jadi tidak pernah
 * meninggalkan data di database mana pun.
 */

const url = process.env.DATABASE_URL;
const skip = url ? false : "butuh DATABASE_URL";

// max: 1 supaya semua test memakai connection yang sama. Ini yang membuat uji
// kebocoran di bawah benar-benar menguji connection pool, bukan kebetulan.
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;

/**
 * Jalankan `fn` di dalam transaction, lalu batalkan semua perubahannya dengan
 * ROLLBACK TO SAVEPOINT. Nilai balik `fn` tetap dikembalikan.
 */
async function inRolledBackTransaction<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  assert.ok(sql, "koneksi database tidak dibuat");
  return sql!.begin(async (tx) => {
    const t = tx as unknown as postgres.TransactionSql;
    await t`savepoint audit_test`;
    try {
      return await fn(t);
    } finally {
      await t`rollback to savepoint audit_test`;
    }
  }) as Promise<T>;
}

/**
 * postgres.js mengembalikan baris tanpa tipe kolomnya, jadi setiap cast harus
 * lewat unknown lebih dulu. Helper ini satu jalan untuk semua cast di file ini.
 */
function rows<T>(result: unknown): T[] {
  return result as unknown as T[];
}

/**
 * Satu unit yang statusnya bukan 'sold'. Trigger trg_prevent_sold_reactivation
 * menolak perubahan apa pun dari status sold, jadi unit itu tidak bisa dipakai
 * untuk menguji transisi.
 */
async function pickMutableUnit(tx: postgres.TransactionSql) {
  const hasil = await tx`
    select id, status::text as status
      from public.inventory_units
     where status <> 'sold'
     order by id
     limit 1
  `;
  const [unit] = rows<{ id: number; status: string }>(hasil);
  assert.ok(unit, "perlu minimal satu inventory_units non-sold untuk menguji audit");
  return unit;
}

/** Status tujuan yang berbeda dari status sekarang dan bukan 'sold'. */
const ALTERNATE: Record<string, string> = {
  available: "reserved",
  reserved: "in_service",
  in_service: "available",
  returned: "available",
};

test.after(async () => {
  if (sql) await sql.end({ timeout: 5 });
});

test("perubahan status tanpa aktor tetap tercatat dengan aktor NULL", { skip }, async () => {
  const baris = await inRolledBackTransaction(async (tx) => {
    const unit = await pickMutableUnit(tx);
    const target = ALTERNATE[unit.status] ?? "available";
    await tx`update public.inventory_units set status = ${target}::unit_status where id = ${unit.id}`;
    const hasil = await tx`
      select old_status::text as dari, new_status::text as ke, actor_id
        from public.unit_status_audit where unit_id = ${unit.id}
    `;
    return rows<{ dari: string; ke: string; actor_id: string | null }>(hasil)[0];
  });

  assert.equal(baris.ke.length > 0, true, "perubahan tanpa aktor tetap harus masuk audit");
  assert.equal(baris.actor_id, null, "tanpa set_config, aktor harus NULL bukan error");
});

test("aktor yang dikirim lewat set_config tersimpan di baris audit", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    const [aktor] = rows<{ id: string }>(
      await tx`select id::text as id from public.profiles order by id limit 1`
    );
    assert.ok(aktor, "butuh minimal satu profil untuk jadi aktor");
    const unit = await pickMutableUnit(tx);
    const target = ALTERNATE[unit.status] ?? "available";

    // Bentuknya persis sama dengan yang ditulis setAuditActor() di aplikasi.
    await tx`select set_config('atcell.actor_id', ${aktor.id}, true)`;
    await tx`update public.inventory_units set status = ${target}::unit_status where id = ${unit.id}`;

    const [baris] = rows<{ aktor: string }>(
      await tx`select actor_id::text as aktor from public.unit_status_audit where unit_id = ${unit.id}`
    );
    return { terkirim: aktor.id, tersimpan: baris.aktor };
  });

  assert.equal(hasil.tersimpan, hasil.terkirim, "aktor harus sama dengan yang dikirim set_config");
});

test("set_config is_local tidak bocor ke transaction berikutnya", { skip }, async () => {
  // Inilah alasan set_config memakai is_local = true. postgres.js memakai
  // connection pool: kalau nilainya tidak transaction-local, request berikutnya
  // yang memakai connection sama akan salah mencatat identitas orang lain.
  assert.ok(sql, "koneksi database tidak dibuat");
  const db = sql;

  const [aktor] = rows<{ id: string }>(await db`select id::text as id from public.profiles order by id limit 1`);
  assert.ok(aktor, "butuh minimal satu profil untuk jadi aktor");

  // Transaction 1: pasang aktor lalu baca balik. Tidak ada perubahan data.
  await db.begin(async (tx) => {
    await tx`select set_config('atcell.actor_id', ${aktor.id}, true)`;
    const [baca] = rows<{ isi: string | null }>(
      await tx`select nullif(current_setting('atcell.actor_id', true), '') as isi`
    );
    assert.equal(baca.isi, aktor.id, "harus terbaca di transaction yang sama");
  });

  // Transaction 2: connection yang sama (max: 1), nilai harus sudah hilang.
  await db.begin(async (tx) => {
    const [baca] = rows<{ isi: string | null }>(
      await tx`select nullif(current_setting('atcell.actor_id', true), '') as isi`
    );
    assert.equal(baca.isi, null, "aktor lama tidak boleh bocor ke transaction berikutnya");
  });
});

test("update kolom selain status tidak menambah baris audit", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    const unit = await pickMutableUnit(tx);
    const [{ sebelum }] = await tx`
      select count(*)::int as n from public.unit_status_audit where unit_id = ${unit.id}
    `;
    // selling_price sengaja: kolom non-status yang ada di inventory_units.
    await tx`
      update public.inventory_units
         set selling_price = selling_price
       where id = ${unit.id}
    `;
    const [{ sesudah }] = await tx`
      select count(*)::int as n from public.unit_status_audit where unit_id = ${unit.id}
    `;
    return { sebelum, sesudah };
  });

  assert.equal(hasil.sesudah, hasil.sebelum, "hanya perubahan status yang masuk NFR-07");
});

test("status yang tidak berubah tidak menambah baris audit", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    const unit = await pickMutableUnit(tx);
    const [{ sebelum }] = await tx`
      select count(*)::int as n from public.unit_status_audit where unit_id = ${unit.id}
    `;
    await tx`update public.inventory_units set status = ${unit.status}::unit_status where id = ${unit.id}`;
    const [{ sesudah }] = await tx`
      select count(*)::int as n from public.unit_status_audit where unit_id = ${unit.id}
    `;
    return { sebelum, sesudah };
  });

  assert.equal(hasil.sesudah, hasil.sebelum, "tidak ada transisi berarti tidak ada audit");
});

test("aktor rusak (bukan UUID) tidak menggagalkan pencatatan", { skip }, async () => {
  // Kalau private.current_actor_id() melempar error, seluruh UPDATE dibatalkan
  // dan perubahan status hilang tanpa jejak. Itu kehilangan data yang lebih
  // buruk daripada auditnya kehilangan kolom aktor.
  const hasil = await inRolledBackTransaction(async (tx) => {
    const unit = await pickMutableUnit(tx);
    const target = ALTERNATE[unit.status] ?? "available";
    await tx`select set_config('atcell.actor_id', 'bukan-uuid', true)`;
    await tx`update public.inventory_units set status = ${target}::unit_status where id = ${unit.id}`;
    const [{ n }] = rows<{ n: number }>(
      await tx`select count(*)::int as n from public.unit_status_audit where unit_id = ${unit.id}`
    );
    const [{ status }] = rows<{ status: string }>(
      await tx`select status::text as status from public.inventory_units where id = ${unit.id}`
    );
    return { n, status, target };
  });

  assert.equal(hasil.n, 1, "perubahan tetap dicatat meski aktornya tidak bisa dibaca");
  assert.equal(hasil.status, hasil.target, "perubahan status tidak boleh hilang karena aktornya rusak");
});

test("transisi tiket servis juga tercatat dengan aktornya", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    const [aktor] = rows<{ id: string }>(
      await tx`select id::text as id from public.profiles order by id limit 1`
    );
    assert.ok(aktor, "butuh minimal satu profil untuk jadi aktor");

    // ticket_code sengaja dikosongkan supaya trigger trg_ticket_code yang
    // membangkitkannya. Format kodenya punya check constraint yang ketat,
    // jadi test ini tidak perlu menebak-nebak formatnya.
    const [t] = rows<{ id: number; ticket_code: string }>(
      await tx`
        insert into public.service_tickets
          (customer_name, device_model, imei_or_sn, issue_notes)
        values ('Uji Audit', 'iPhone 13', '', 'uji trigger audit')
        returning id, ticket_code
      `
    );
    assert.match(
      t.ticket_code,
      /^SRV-[0-9]{8}-([0-9]{4}|[0-9A-HJKMNP-TV-Z]{8})$/,
      "trigger harus membangkitkan kode resi yang lolos check constraint"
    );

    await tx`select set_config('atcell.actor_id', ${aktor.id}, true)`;
    await tx`update public.service_tickets set repair_status = 'diagnosing' where id = ${t.id}`;

    const [baris] = rows<{ dari: string; ke: string; aktor: string }>(
      await tx`
        select old_status::text as dari, new_status::text as ke, actor_id::text as aktor
          from public.service_ticket_audit where ticket_id = ${t.id}
      `
    );
    return baris;
  });

  assert.equal(hasil.dari, "received", "status awal tiket harus tercatat");
  assert.equal(hasil.ke, "diagnosing", "status baru tiket harus tercatat");
  assert.ok(hasil.aktor, "aktor tiket harus ikut tercatat");
});

test("tabel audit ada, RLS aktif, dan tidak punya policy tulis", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    const tabel = await tx`
      select c.relname, c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('unit_status_audit', 'service_ticket_audit')
    `;
    const policies = await tx`
      select tablename, cmd from pg_policies
       where schemaname = 'public' and tablename like '%audit%'
    `;
    return {
      tabel: rows<{ relname: string; relrowsecurity: boolean }>(tabel)
        .map((t) => t.relname)
        .sort(),
      semuaRls: rows<{ relname: string; relrowsecurity: boolean }>(tabel).every(
        (t) => t.relrowsecurity
      ),
      cmd: [...new Set(rows<{ cmd: string }>(policies).map((p) => p.cmd))].sort(),
    };
  });

  assert.deepEqual(hasil.tabel, ["service_ticket_audit", "unit_status_audit"]);
  assert.equal(hasil.semuaRls, true, "RLS harus aktif di kedua tabel audit");
  assert.deepEqual(hasil.cmd, ["SELECT"], "audit harus append-only: tidak boleh ada policy INSERT/UPDATE/DELETE");
});
