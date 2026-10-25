import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/*
 * Anti double-sell pada POS (STANDAR At Cell bagian A: "dua penjualan
 * bersamaan").
 *
 * Lapis 1 (selalu jalan, tanpa database): executeSale wajib (a) membungkus
 * penjualan dalam db.transaction, (b) mengunci baris unit dengan
 * .for("update"), dan (c) menyaring status "available" SEKALIGUS dengan
 * penguncian, sehingga dua transaksi bersamaan tidak bisa sama-sama
 * melihat unit available. Tanpa salah satu dari tiga itu, dua kasir yang
 * menekan bayar di detik yang sama bisa menjual unit yang sama dua kali.
 * Tes ini terbukti gagal ketika .for("update") dihapus dari kode (mutasi
 * manual, dicatat di docs/LOOP_LOG.md).
 *
 * Lapis 2 (butuh DATABASE_URL, dijalankan CI postgres:17; skip lokal
 * mengikuti pola tests/audit-trail-db.test.ts): dua executeSale
 * ditembak bersamaan ke satu unit yang sama; tepat satu yang boleh lolos.
 */

const posSource = await readFile(
  new URL("../src/lib/actions/pos.ts", import.meta.url),
  "utf8"
);

test("executeSale mengunci unit dalam transaction dengan filter available", () => {
  assert.match(posSource, /db\.transaction\(/, "penjualan wajib dibungkus db.transaction");
  assert.match(
    posSource,
    /\.for\("update"\)/,
    "SELECT unit wajib .for('update') supaya dua kasir bersamaan tidak lolos bersama"
  );
  assert.match(
    posSource,
    /eq\(inventoryUnits\.status,\s*"available"\)/,
    "penguncian wajib menyaring status available sekaligus, bukan cek lalu kunci terpisah"
  );
});

test("urutan benar: kunci terjadi di dalam transaction", () => {
  const mulaiTx = posSource.indexOf("db.transaction(");
  const kunci = posSource.indexOf('.for("update")');
  assert.ok(mulaiTx !== -1 && kunci !== -1, "transaction dan for-update harus ada");
  assert.ok(kunci > mulaiTx, "for-update harus berada setelah pembuka transaction");
});

// ---- Lapis 2: uji konkuren sungguhan dengan database (opt-in CI) ----

const url = process.env.DATABASE_URL;
if (url) {
  const { registerHooks } = (await import("node:module")) as unknown as {
    registerHooks: (hooks: unknown) => void;
  };
  const { pathToFileURL } = await import("node:url");
  const { resolve: resolvePath } = await import("node:path");
  const repoRoot = new URL("../", import.meta.url);
  const srcRoot = new URL("src/", repoRoot);

  // Profil admin palsu untuk requireRole: yang diuji di sini adalah
  // perlombaan antar-transaksi, bukan otorisasi (otorisasi dijaga
  // tests/server-action-role-guard.test.ts dan matriks write-gate).
  const ADMIN_ID = "00000000-0000-0000-0000-0000000000aa";
  const profilAdmin = {
    id: ADMIN_ID,
    full_name: "Tes Konkuren",
    role: "admin",
    phone_number: "081200000000",
    username: "tes-konkuren",
    email: "tes-konkuren@atcell.test",
    created_at: new Date().toISOString(),
  };
  const SUPABASE_STUB =
    "data:text/javascript," +
    encodeURIComponent(
      `export async function createClient(){return {auth:{getUser:async()=>({data:{user:{id:"${ADMIN_ID}"},error:null}})},from:(t)=>{if(t!=="profiles")throw new Error("stub hanya profiles");const d=${JSON.stringify(
        profilAdmin
      )};return {select(){return this},eq(){return this},single(){return {data:d}}}}}}`
    );
  const CACHE_STUB = "data:text/javascript,export function revalidatePath(){}";
  const HEADERS_STUB =
    "data:text/javascript,export async function headers(){return new Map()}";

  registerHooks({
    resolve(specifier: string, context: unknown, next: (s: string, c: unknown) => unknown) {
      if (specifier === "@/lib/supabase/server") {
        return { url: SUPABASE_STUB, format: "module", shortCircuit: true };
      }
      if (specifier === "next/cache") {
        return { url: CACHE_STUB, format: "module", shortCircuit: true };
      }
      if (specifier === "next/headers") {
        return { url: HEADERS_STUB, format: "module", shortCircuit: true };
      }
      if (!specifier.startsWith("@/") && !/^\.{1,2}\//.test(specifier)) {
        return next(specifier, context);
      }
      const target = specifier.startsWith("@/")
        ? pathToFileURL(resolvePath(fileURLToPath(srcRoot), specifier.slice(2))).href
        : specifier;
      return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
    },
  });

  const postgres = (await import("postgres")).default;
  const probe = postgres(url, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
  let reachable = false;
  try {
    await probe`select 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
  await probe.end({ timeout: 1 }).catch(() => {});

  if (reachable) {
    const { executeSale } = await import("../src/lib/actions/pos.ts");

    test("dua penjualan bersamaan ke satu unit: tepat satu yang berhasil", async () => {
      const pg = postgres(url, { max: 4, prepare: false });
      const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const imei = ("9" + suffix.replace(/\D/g, "").padStart(14, "0")).slice(0, 15);
      try {
        await pg`insert into profiles (id, full_name, role, phone_number, username, email, created_at)
                 values (${ADMIN_ID}, 'Tes Konkuren', 'admin', '081200000000', 'tes-konkuren', 'tes-konkuren@atcell.test', now())
                 on conflict (id) do nothing`;
        const p = await pg`insert into products (brand, model_name, specs, default_price, is_active, is_demo)
                 values ('TesKonkuren', ${"TK-" + suffix}, '', 100000, true, false) returning id`;
        const productId = p[0].id;
        const u = await pg`insert into inventory_units (product_id, imei, status, condition, is_demo, purchase_cost, selling_price)
                 values (${productId}, ${imei}, 'available', 'second', false, 50000, 100000) returning id`;
        const unitId = u[0].id;
        assert.ok(/^\d{15}$/.test(imei), "IMEI seed harus tepat 15 digit");

        const hasil = await Promise.allSettled([
          executeSale({
            unitId: Number(unitId),
            customerName: "Pembeli A",
            customerPhone: "081200000001",
            paymentMethod: "cash",
          } as never),
          executeSale({
            unitId: Number(unitId),
            customerName: "Pembeli B",
            customerPhone: "081200000002",
            paymentMethod: "cash",
          } as never),
        ]);
        const ringkas = hasil.map((h) =>
          h.status === "fulfilled"
            ? `${(h.value as { ok?: boolean }).ok === true ? "OK" : "FAIL:" + (h.value as { error?: string }).error}`
            : "REJECT"
        );
        assert.equal(
          hasil.filter(
            (h) => h.status === "fulfilled" && (h.value as { ok?: boolean }).ok === true
          ).length,
          1,
          `tepat satu penjualan boleh lolos; nyata: ${ringkas.join(" | ")}`
        );
        // Unit yang sudah terjual harus berstatus sold, bukan bentuk lain.
        const akhir = await pg`select status from inventory_units where id = ${unitId}`;
        assert.equal(akhir[0].status, "sold", "unit harus berakhir sold");
      } finally {
        await pg`delete from transaction_items where unit_id in (select id from inventory_units where product_id in (select id from products where model_name like 'TK-%'))`;
        await pg`delete from transactions where customer_name in ('Pembeli A','Pembeli B')`;
        await pg`delete from inventory_units where product_id in (select id from products where model_name like 'TK-%')`;
        await pg`delete from products where model_name like 'TK-%'`;
        await pg`delete from profiles where id = ${ADMIN_ID} and full_name = 'Tes Konkuren'`;
        await pg.end({ timeout: 3 }).catch(() => {});
      }
    });
  }
}
