import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import { REPAIR_FLOW, isAllowedTransition } from "../src/lib/validations.ts";
import { getDb } from "../src/db/client.ts";
import { inventoryUnits, serviceTickets } from "../src/db/schema.ts";
import type { Db } from "../src/db/client.ts";

/*
 * NFR-07: "Setiap mutasi status unit (IMEI) dan tiket servis tercatat dengan
 * stempel waktu dan identitas pengguna yang melakukan perubahan."
 *
 * Hasil audit production: unit_status_audit 1 baris, service_ticket_audit 5
 * baris, dan actor_id NULL di 6 dari 6. Mechanismenya sudah ada di migrasi
 * 0007 (setting transaction-local atcell.actor_id dibaca
 * private.current_actor_id()), dan sisi aplikasinya sudah ada di
 * setAuditActor() yang dipanggil updateUnitStatus() dan updateTicket().
 * Yang belum ada buktinya bahwa jalur itu benar-benar mengisi kolom, jadi
 * file ini menjalankannya sungguhan.
 *
 * Yang diuji BUKAN source text. Test ini memuat modul aplikasi yang asli,
 * lalu menjalankan urutan yang sama persis dengan Server Action:
 *
 *   db.transaction(async (tx) => {
 *     await setAuditActor(tx, profileId);          <- helper asli
 *     await tx.select(...).for("update");          <- kunci baris, seperti di action
 *     await tx.update(inventoryUnits).set({ ... }); <- query Drizzle asli
 *   })
 *
 * semuanya terhadap trigger, RLS, dan constraint production, di dalam satu
 * transaction yang selalu di-rollback sehingga tidak pernah meninggalkan data.
 *
 * Kenapa tidak memanggil updateUnitStatus() dan updateTicket() secara
 * langsung: keduanya memanggil requireRole() lebih dulu, yang membaca session
 * Supabase lewat next/headers. Session itu tidak bisa dipalsukan di luar
 * runtime Next tanpa menyalin implementasinya ke dalam test, dan menyalinnya
 * justru menghilangkan tepat hal yang sedang diuji. Test ini karena itu
 * menjalankan transplant yang persis, memakai helper dan query aslinya, bukan
 * tiruan.tests/audit-trail.test.ts mengunci sisi pemanggilnya secara statis.
 *
 * Test opt-in lewat DATABASE_URL, sama seperti tests/audit-trail-db.test.ts,
 * supaya `npm test` di CI tanpa database tetap hijau.
 */

const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

/*
 * Alias "@/..." milik tsconfig dan import relatif tanpa ekstensi milik Next
 * tidak dipahami resolver ESM Node. Pola ini sudah dipakai
 * tests/unit-label-nota.test.ts.
 *
 * Hook ini juga mengganti "@/lib/supabase/server" dengan stub. Modul itu
 * menarik next/headers dan @supabase/ssr yang hanya hidup di runtime Next,
 * dan tidak ada satupun yang dipakai file ini: requireRole tidak pernah
 * dipanggil di sini. Batas modulnya diganti lempar, bukan implementasi
 * tiruan, supaya tidak ada kode produksi yang diam-diam ditiru.
 */
const SERVER_CLIENT_STUB =
  "data:text/javascript,export async function createClient(){throw new Error('stub: test ini tidak memakai sesi Supabase');}";

const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/lib/supabase/server") {
      return { url: SERVER_CLIENT_STUB, format: "module", shortCircuit: true };
    }
    if (!specifier.startsWith("@/") && !/^\.{1,2}\//.test(specifier)) return next(specifier, context);
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

// Import dinamis, bukan statis: static import dievaluasi sebelum registerHooks
// di atas berjalan, jadi "@/lib/supabase/server" belum tergantikan saat
// _helpers.ts dimuat.
const { setAuditActor } = await import("../src/lib/actions/_helpers.ts");

/** Objek transaction dari db.transaction(), diturunkan dari tipe Db asli. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const url = process.env.DATABASE_URL;

/** Keberadaan DATABASE_URL tidak menjamin database-nya bisa dihubungi. */
async function canConnect(target: string): Promise<boolean> {
  // prepare: false untuk alasan yang sama seperti di
  // tests/audit-trail-db.test.ts: pooler transaction-mode membunuh named
  // prepared statement bersama backend-nya.
  const probe = postgres(target, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
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

// getDb() adalah singleton dan ukurannya dipilih dari process.env.VERCEL
// (1 koneksi di serverless, 5 di server panjang). Dipaksa ke 1 supaya file ini
// tidak menambah beban koneksi di luar yang dibutuhkan: testnya berurutan dan
// hanya butuh satu connection pada satu waktu. Tanpa ini, suite yang jalan
// bersamaan dengan tests/audit-trail-db.test.ts membuat Supabase pooler
// (transaction mode) membuang named prepared statement milik sesamanya dan
// test itu gagal dengan SQLSTATE 26000.
process.env.VERCEL = process.env.VERCEL ?? "1";
const db = reachable && url ? getDb() : null;

const ROLLBACK = Symbol("rollback");

/**
 * Jalankan `fn` di dalam transaction Drizzle sungguhan, lalu paksa rollback
 * dengan melempar sentinel. Hasil yang dikumpulkan `fn` dikembalikan ke
 * pemanggil supaya assertion dibuat DI LUAR transaction, setelah semua
 * perubahannya sudah hilang dari database.
 */
async function inRolledBackTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  assert.ok(db, "klien database tidak dibuat");
  let captured: T | undefined;
  try {
    await db.transaction(async (tx) => {
      captured = await fn(tx as Tx);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  assert.notEqual(captured, undefined, "transaction tidak mengembalikan hasil");
  return captured as T;
}

/** postgres.js tidak mengembalikan tipe kolom, jadi cast lewat unknown. */
function rows<T>(result: unknown): T[] {
  return result as unknown as T[];
}

type AuditRow = { actor_id: string | null; old_status: string | null; new_status: string };

/** Status tujuan yang berbeda dari status sekarang dan bukan 'sold'. */
const UNIT_CANDIDATES = ["available", "reserved", "in_service", "returned"] as const;

test("updateUnitStatus mencatat profil yang menyetel atcell.actor_id", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    // Aktor harus profil nyata: unit_status_audit.actor_id punya FK ke
    // public.profiles, jadi uuid karangan akan ditolak foreign key.
    const profil = rows<{ id: string }>(
      await tx.execute(sql`select id::text as id from public.profiles order by id limit 1`)
    )[0];
    assert.ok(profil, "perlu minimal satu baris public.profiles untuk menguji audit");

    const unit = await tx
      .select({ id: inventoryUnits.id, status: inventoryUnits.status })
      .from(inventoryUnits)
      .where(sql`${inventoryUnits.status} <> 'sold'`)
      .orderBy(inventoryUnits.id)
      .limit(1)
      .for("update");
    assert.ok(unit[0], "perlu minimal satu inventory_units non-sold untuk menguji audit");

    const target = UNIT_CANDIDATES.find((s) => s !== unit[0].status);
    assert.ok(target, `tidak ada status tujuan yang sah dari ${unit[0].status}`);

    await setAuditActor(tx, profil.id);
    await tx
      .update(inventoryUnits)
      .set({ status: target })
      .where(eq(inventoryUnits.id, unit[0].id));

    const audit = rows<AuditRow>(
      await tx.execute(sql`
        select actor_id::text as actor_id, old_status::text as old_status, new_status::text as new_status
          from public.unit_status_audit
         where unit_id = ${unit[0].id}
         order by id desc
         limit 1
      `)
    )[0];
    return { profilId: profil.id, from: unit[0].status, target, audit };
  });

  assert.ok(hasil.audit, "trigger harus menambah baris di unit_status_audit");
  assert.equal(hasil.audit.new_status, hasil.target, "baris audit harus mencatat status tujuan");
  assert.equal(hasil.audit.old_status, hasil.from, "baris audit harus mencatat status asal");
  assert.notEqual(
    hasil.audit.actor_id,
    null,
    "actor_id NULL: setAuditActor tidak accused trigger, jadi NFR-07 tidak terpenuhi"
  );
  assert.equal(hasil.audit.actor_id, hasil.profilId, "actor_id harus persis profil yang menyetelnya");
});

test("tanpa setAuditActor, perubahan tetap tercatat tapi actor_id NULL (kontrol)", { skip }, async () => {
  // Kontrol ini yang membuat assertion di atas tidak kosong. Kalau trigger
  // hilang, atau private.current_actor_id() mulai mengembalikan UUID tetap,
  // test pertama tetap hijau dan test inilah yang harus merah.
  const hasil = await inRolledBackTransaction(async (tx) => {
    const unit = await tx
      .select({ id: inventoryUnits.id, status: inventoryUnits.status })
      .from(inventoryUnits)
      .where(sql`${inventoryUnits.status} <> 'sold'`)
      .orderBy(inventoryUnits.id)
      .limit(1)
      .for("update");
    assert.ok(unit[0], "perlu minimal satu inventory_units non-sold untuk menguji audit");

    const target = UNIT_CANDIDATES.find((s) => s !== unit[0].status);
    assert.ok(target, `tidak ada status tujuan yang sah dari ${unit[0].status}`);

    await tx
      .update(inventoryUnits)
      .set({ status: target })
      .where(eq(inventoryUnits.id, unit[0].id));

    const audit = rows<AuditRow>(
      await tx.execute(sql`
        select actor_id::text as actor_id, old_status::text as old_status, new_status::text as new_status
          from public.unit_status_audit
         where unit_id = ${unit[0].id}
         order by id desc
         limit 1
      `)
    )[0];
    return audit;
  });

  assert.ok(hasil, "perubahan tanpa aktor tetap harus tercatat");
  assert.equal(hasil.actor_id, null, "tanpa setAuditActor, actor_id harus NULL");
});

test("updateTicket mencatat profil yang menyetel atcell.actor_id", { skip }, async () => {
  const hasil = await inRolledBackTransaction(async (tx) => {
    const profil = rows<{ id: string }>(
      await tx.execute(sql`select id::text as id from public.profiles order by id limit 1`)
    )[0];
    assert.ok(profil, "perlu minimal satu baris public.profiles untuk menguji audit");

    // Transisi diambil dari REPAIR_FLOW asli, supaya trigger
    // trg_validate_ticket_transition tidak menolak update.
    const tiket = await tx
      .select({ id: serviceTickets.id, status: serviceTickets.repairStatus })
      .from(serviceTickets)
      .orderBy(serviceTickets.id)
      .limit(20)
      .for("update");
    const pair = tiket
      .map((t) => ({ id: t.id, from: t.status, to: REPAIR_FLOW[t.status]?.[0] }))
      .find((p) => p.to && isAllowedTransition(p.from, p.to));
    assert.ok(pair, "perlu minimal satu tiket dengan transisi status yang sah");

    await setAuditActor(tx, profil.id);
    await tx
      .update(serviceTickets)
      .set({ repairStatus: pair.to })
      .where(eq(serviceTickets.id, pair.id));

    const audit = rows<AuditRow>(
      await tx.execute(sql`
        select actor_id::text as actor_id, old_status::text as old_status, new_status::text as new_status
          from public.service_ticket_audit
         where ticket_id = ${pair.id}
         order by id desc
         limit 1
      `)
    )[0];
    return { profilId: profil.id, from: pair.from, to: pair.to, audit };
  });

  assert.ok(hasil.audit, "trigger harus menambah baris di service_ticket_audit");
  assert.equal(hasil.audit.new_status, hasil.to, "baris audit harus mencatat status tujuan");
  assert.equal(hasil.audit.old_status, hasil.from, "baris audit harus mencatat status asal");
  assert.notEqual(
    hasil.audit.actor_id,
    null,
    "actor_id NULL: setAuditActor tidak accused trigger pada jalur tiket servis"
  );
  assert.equal(hasil.audit.actor_id, hasil.profilId, "actor_id harus persis profil yang menyetelnya");
});
