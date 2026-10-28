import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

/*
 * Verifikasi policy RLS terhadap PostgreSQL sungguhan.
 *
 * CI database-tests sudah menjalankan trigger, constraint, dan ledger, tetapi
 * komentar workflow sebelumnya menyatakan RLS tidak diuji. Akibatnya policy
 * yang salah bisa lolos ke production tanpa ada yang mencoba membaca tabel
 * sebagai anon, customer, atau staf.
 *
 * Test ini memakai role PostgreSQL yang sama dengan Supabase (anon,
 * authenticated, service_role) dan mengisi request.jwt.claim.sub untuk
 * mensimulasikan auth.uid(). Semua data seed dibuat di dalam transaction yang
 * selalu di-rollback, jadi tidak ada baris yang tertinggal di database.
 */

const url = process.env.DATABASE_URL;

async function canConnect(target: string): Promise<boolean> {
  const probe = postgres(target, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    onnotice: () => {},
  });
  try {
    await probe`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 }).catch(() => {});
  }
}

const reachable = url ? await canConnect(url) : false;
const skip = !url
  ? "butuh DATABASE_URL"
  : reachable
    ? false
    : "DATABASE_URL tidak bisa dihubungi";

const sql = reachable && url
  ? postgres(url, { max: 1, prepare: false, onnotice: () => {} })
  : null;

type Role = "anon" | "authenticated" | "service_role";

type Seed = {
  ids: {
    admin: string;
    sales: string;
    technician: string;
    customerA: string;
    customerB: string;
  };
  activeModel: string;
  inactiveModel: string;
  unitId: string;
  transactionA: string;
  transactionB: string;
  ticketA: string;
  ticketB: string;
};

class Rollback extends Error {
  constructor() {
    super("rollback test transaction");
  }
}

function rows<T>(result: unknown): T[] {
  return result as unknown as T[];
}

async function seedData(tx: postgres.TransactionSql): Promise<Seed> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const ids = {
    admin: randomUUID(),
    sales: randomUUID(),
    technician: randomUUID(),
    customerA: randomUUID(),
    customerB: randomUUID(),
  };

  // Trigger handle_new_user membuat profil customer. Peran staf diubah
  // setelahnya supaya test juga memakai jalur pembuatan akun yang sama.
  for (const [name, id] of Object.entries(ids)) {
    // Username berbasis id, bukan nama, supaya trigger handle_new_user tidak
    // pernah menghasilkan username yang sama untuk dua akun seed.
    const username = `u_${id.replace(/-/g, "").slice(0, 24)}`;
    // Email harus lowercase: trigger 0005 menjalankan regexp sebelum lower(),
    // jadi huruf besar di prefix email (mis. customerA/customerB) dibuang dan
    // dua akun bisa jatuh ke username yang sama.
    const email = `rls-${name.toLowerCase()}-${suffix}@atcell.test`;
    try {
      await tx`
        insert into auth.users (id, email, raw_user_meta_data)
        values (
          ${id},
          ${email},
          ${tx.json({ full_name: `RLS ${name}`, username })}
        )
      `;
    } catch (error) {
      const detail = error as { message?: string; detail?: string; constraint?: string };
      throw new Error(
        `seed ${name} username=${username} email=${email}: ${detail.message} detail=${detail.detail} constraint=${detail.constraint}`,
        { cause: error }
      );
    }
  }

  await tx`update public.profiles set role = 'admin'::user_role where id = ${ids.admin}`;
  await tx`update public.profiles set role = 'sales'::user_role where id = ${ids.sales}`;
  await tx`update public.profiles set role = 'technician'::user_role where id = ${ids.technician}`;

  const activeModel = `Active ${suffix}`;
  const inactiveModel = `Inactive ${suffix}`;
  const [active] = rows<{ id: string }>(
    await tx`
      insert into public.products (brand, model_name, is_active)
      values ('RLS', ${activeModel}, true)
      returning id
    `
  );
  await tx`
    insert into public.products (brand, model_name, is_active)
    values ('RLS', ${inactiveModel}, false)
  `;

  // IMEI harus tepat 15 digit dan unik. Angka acak menghindari tabrakan
  // kalau file test lain berjalan paralel di database yang sama.
  const imei = Array.from({ length: 15 }, () => Math.floor(Math.random() * 10)).join("");
  const [unit] = rows<{ id: string }>(
    await tx`
      insert into public.inventory_units (product_id, imei, condition, status)
      values (${active.id}, ${imei}, 'new'::unit_condition, 'available'::unit_status)
      returning id
    `
  );

  const [transactionA] = rows<{ id: string }>(
    await tx`
      insert into public.transactions (customer_id, customer_name, payment_method)
      values (${ids.customerA}, 'RLS Customer A', 'cash'::payment_method)
      returning id
    `
  );
  const [transactionB] = rows<{ id: string }>(
    await tx`
      insert into public.transactions (customer_id, customer_name, payment_method)
      values (${ids.customerB}, 'RLS Customer B', 'cash'::payment_method)
      returning id
    `
  );
  await tx`
    insert into public.transaction_items (transaction_id, unit_id, unit_price)
    values (${transactionA.id}, ${unit.id}, 100)
  `;

  const [ticketA] = rows<{ id: string }>(
    await tx`
      insert into public.service_tickets (customer_id, customer_name, device_model)
      values (${ids.customerA}, 'RLS Customer A', 'Phone A')
      returning id
    `
  );
  const [ticketB] = rows<{ id: string }>(
    await tx`
      insert into public.service_tickets (customer_id, customer_name, device_model)
      values (${ids.customerB}, 'RLS Customer B', 'Phone B')
      returning id
    `
  );

  // Perubahan status menulis satu baris audit lewat trigger 0007.
  await tx`update public.inventory_units set status = 'reserved'::unit_status where id = ${unit.id}`;

  return {
    ids,
    activeModel,
    inactiveModel,
    unitId: String(unit.id),
    transactionA: String(transactionA.id),
    transactionB: String(transactionB.id),
    ticketA: String(ticketA.id),
    ticketB: String(ticketB.id),
  };
}

async function withSeed(fn: (tx: postgres.TransactionSql, seed: Seed) => Promise<void>): Promise<void> {
  assert.ok(sql, "koneksi database tidak dibuat");
  try {
    await sql.begin(async (tx) => {
      const seed = await seedData(tx as unknown as postgres.TransactionSql);
      await fn(tx as unknown as postgres.TransactionSql, seed);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

async function asRole<T>(
  tx: postgres.TransactionSql,
  role: Role,
  userId: string | null,
  fn: () => Promise<T>
): Promise<T> {
  await tx`select set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
  await tx.unsafe(`set local role ${role}`);
  try {
    return await fn();
  } finally {
    await tx.unsafe("reset role");
  }
}

test.after(async () => {
  if (sql) await sql.end({ timeout: 5 });
});

test("anon hanya melihat produk aktif", { skip }, async () => {
  await withSeed(async (tx, seed) => {
    const produk = await asRole(tx, "anon", null, () =>
      tx`select model_name as model from public.products where brand = 'RLS' order by model`
    );
    assert.deepEqual(
      rows<{ model: string }>(produk).map((p) => p.model),
      [seed.activeModel],
      "anon tidak boleh melihat produk nonaktif"
    );
  });
});

test("customer hanya melihat profil, transaksi, item, dan tiket miliknya", { skip }, async () => {
  await withSeed(async (tx, seed) => {
    await asRole(tx, "authenticated", seed.ids.customerA, async () => {
      const profil = await tx`select id::text as id from public.profiles`;
      assert.deepEqual(
        rows<{ id: string }>(profil).map((p) => p.id),
        [seed.ids.customerA],
        "customer hanya boleh melihat profilnya sendiri"
      );

      const transaksi = await tx`select id::text as id from public.transactions`;
      assert.deepEqual(
        rows<{ id: string }>(transaksi).map((t) => t.id),
        [seed.transactionA],
        "customer hanya boleh melihat transaksi miliknya"
      );

      const item = await tx`select count(*)::int as n from public.transaction_items`;
      assert.equal(
        rows<{ n: number }>(item)[0].n,
        1,
        "customer boleh melihat item dari transaksinya sendiri"
      );

      const tiket = await tx`select id::text as id from public.service_tickets`;
      assert.deepEqual(
        rows<{ id: string }>(tiket).map((t) => t.id),
        [seed.ticketA],
        "customer hanya boleh melihat tiket servis miliknya"
      );

      const unit = await tx`select count(*)::int as n from public.inventory_units`;
      assert.equal(
        rows<{ n: number }>(unit)[0].n,
        0,
        "customer bukan staf, jadi tidak boleh melihat stok"
      );

      const produk = await tx`select model_name as model from public.products where brand = 'RLS' order by model`;
      assert.deepEqual(
        rows<{ model: string }>(produk).map((p) => p.model),
        [seed.activeModel],
        "customer hanya melihat produk aktif"
      );
    });
  });
});

test("sales melihat data staf dan produk nonaktif", { skip }, async () => {
  await withSeed(async (tx, seed) => {
    await asRole(tx, "authenticated", seed.ids.sales, async () => {
      const profil = await tx`select id::text as id from public.profiles`;
      const seedProfileIds = Object.values(seed.ids);
      assert.equal(
        rows<{ id: string }>(profil).filter((p) => seedProfileIds.includes(p.id)).length,
        5,
        "sales harus melihat semua profil seed"
      );

      const unit = await tx`select id::text as id from public.inventory_units`;
      assert.ok(
        rows<{ id: string }>(unit).some((u) => u.id === seed.unitId),
        "sales harus melihat stok seed"
      );

      const transaksi = await tx`select id::text as id from public.transactions`;
      const seedTxIds = [seed.transactionA, seed.transactionB];
      assert.equal(
        rows<{ id: string }>(transaksi).filter((t) => seedTxIds.includes(t.id)).length,
        2,
        "sales harus melihat semua transaksi seed"
      );

      const tiket = await tx`select id::text as id from public.service_tickets`;
      const seedTicketIds = [seed.ticketA, seed.ticketB];
      assert.equal(
        rows<{ id: string }>(tiket).filter((t) => seedTicketIds.includes(t.id)).length,
        2,
        "sales harus melihat semua tiket seed"
      );

      const produk = await tx`select model_name as model from public.products where brand = 'RLS' order by model`;
      assert.deepEqual(
        rows<{ model: string }>(produk).map((p) => p.model),
        [seed.activeModel, seed.inactiveModel],
        "staf boleh melihat produk nonaktif"
      );
    });
  });
});

test("audit hanya terlihat oleh admin atau staf", { skip }, async () => {
  await withSeed(async (tx, seed) => {
    await asRole(tx, "authenticated", seed.ids.admin, async () => {
      const audit = await tx`select count(*)::int as n from public.unit_status_audit`;
      assert.ok(rows<{ n: number }>(audit)[0].n >= 1, "admin harus melihat baris audit");
    });

    await asRole(tx, "authenticated", seed.ids.customerA, async () => {
      const audit = await tx`select count(*)::int as n from public.unit_status_audit`;
      assert.equal(
        rows<{ n: number }>(audit)[0].n,
        0,
        "customer tidak boleh melihat audit staf"
      );
    });
  });
});

test("service_role melewati RLS", { skip }, async () => {
  await withSeed(async (tx, seed) => {
    await asRole(tx, "service_role", null, async () => {
      const produk = await tx`select model_name as model from public.products where brand = 'RLS' order by model`;
      assert.deepEqual(
        rows<{ model: string }>(produk).map((p) => p.model),
        [seed.activeModel, seed.inactiveModel],
        "service_role harus melihat semua produk"
      );

      const unit = await tx`select id::text as id from public.inventory_units`;
      assert.ok(
        rows<{ id: string }>(unit).some((u) => u.id === seed.unitId),
        "service_role harus melihat stok seed"
      );
    });
  });
});

test("anon tidak punya grant baca inventory_units", { skip }, async () => {
  await withSeed(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub', '', true)`;
    await tx.unsafe("set local role anon");
    await tx`savepoint anon_inventory`;
    await assert.rejects(
      () => tx`select count(*) from public.inventory_units`,
      /permission denied/
    );
    await tx`rollback to savepoint anon_inventory`;
    await tx.unsafe("reset role");
  });
});
