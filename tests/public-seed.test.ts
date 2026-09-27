import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PublicSnapshot } from "../src/lib/actions/public.ts";
import type { Product } from "../src/types/index.ts";
import { resolveSeed, toPublicSeed } from "../src/lib/public-seed.ts";

/*
 * Layout area publik mengisi store dari server lewat getPublicSnapshot, supaya
 * HTML pertama yang sampai ke crawler sudah berisi etalase. Repo ini tidak
 * punya test runner React, jadi yang diuji di sini adalah keputusan yang
 * dipakai store dan layout: resolveSeed dan toPublicSeed. Keduanya modul
 * murni tanpa import nilai, jadi bisa dijalankan langsung oleh node --test
 * tanpa meniru logikanya.
 *
 * src/lib/store.ts dan layout-nya sendiri tidak bisa diimpor di sini
 * (store.ts menarik next/navigation, layout-nya adalah async server
 * component), jadi penyambungan prop publicSeed diuji lewat sumbernya,
 * mengikuti tests/tracking-safety.test.ts.
 */

const storeSource = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
const publicLayout = readFileSync(
  new URL("../src/app/(public)/[locale]/layout.tsx", import.meta.url),
  "utf8"
);
const rootShell = readFileSync(
  new URL("../src/components/root-shell.tsx", import.meta.url),
  "utf8"
);
const storeContext = readFileSync(
  new URL("../src/context/store-context.tsx", import.meta.url),
  "utf8"
);

/*
 * Test double untuk PublicSnapshot. Tipe aslinya punya StoreSettings, Product,
 * dan InventoryUnit lengkap dengan banyak kolom yang tidak dipakai tabel
 * keputusan di bawah, jadi hanya tiga field yang dipakai di sini; sisanya
 * sengaja tidak dibuat karena tidak ada yang membacanya.
 */
const seeded = {
  storeSettings: { store_name: "At Cell", phone_number: "021-5551234" },
  products: [{ id: 1, brand: "Samsung", model_name: "Galaxy S24" }],
  inventoryUnits: [{ id: 7, product_id: 1, imei: "****3841" }],
} as unknown as PublicSnapshot;

const liveWithoutSeed: Product[] = [];
const demoFallback: Product[] = [];

test("render pertama memakai isi seed, bukan kosong", () => {
  // Inilah yang memperbaiki etalase kosong: nilai dari seed harus langsung
  // dipakai, bukan menunggu loadLiveData() di browser.
  assert.deepEqual(
    resolveSeed(seeded, true, (s) => s.products, liveWithoutSeed, demoFallback),
    [{ id: 1, brand: "Samsung", model_name: "Galaxy S24" }]
  );
  assert.equal(resolveSeed(seeded, true, (s) => s.storeSettings.store_name, "", ""), "At Cell");
  assert.equal(resolveSeed(seeded, true, (s) => s.inventoryUnits.length, 0, 0), 1);
});

test("portal tanpa seed tetap kosong lalu diambil dari getPortalSnapshot", () => {
  // Portal sengaja tidak mengirim seed. Kalau seed bocor ke portal, data
  // session pelanggan bisa tampil di halaman publik, dan itu kegagalan paling
  // serius yang mungkin terjadi dari perubahan ini.
  assert.deepEqual(
    resolveSeed(undefined, true, (s) => s.products, liveWithoutSeed, demoFallback),
    liveWithoutSeed,
    "tanpa seed, mode live harus dapat array kosong"
  );

  // Penyambungan prop: layout publik yang mengisinya, layout portal yang tidak.
  assert.match(publicLayout, /<RootProviders publicSeed=\{seed\}>/);
  // RootProviders meneruskan publicSeed ke StoreProvider apa adanya.
  assert.match(rootShell, /<StoreProvider publicSeed=\{publicSeed\}>/);
  // Dan StoreContext meneruskannya ke hook tanpa menyaring apa pun.
  assert.match(storeContext, /useAtCellStore\(publicSeed\)/);
  // Hook store memakai resolveSeed, bukan ternary yang disalin ulang.
  assert.match(storeSource, /resolveSeed\(/);
});

test("mode demo tanpa seed jatuh ke data contoh seperti sebelumnya", () => {
  // Seed tidak boleh mengubah mode lokal. Demo harus selalu memakai data
  // contoh, apa pun yang terjadi di server.
  assert.deepEqual(
    resolveSeed(seeded, false, (s) => s.products, liveWithoutSeed, demoFallback),
    demoFallback,
    "mode demo harus mengabaikan seed"
  );
  assert.deepEqual(
    resolveSeed(null, false, (s) => s.products, liveWithoutSeed, demoFallback),
    demoFallback
  );
  assert.deepEqual(
    resolveSeed(undefined, false, (s) => s.products, liveWithoutSeed, demoFallback),
    demoFallback
  );
});

test("gagal membaca tidak menggagalkan halaman, hanya mengosongkan seed", () => {
  // Beranda yang 500 karena Postgres berkedip tidak dapat diterima.
  assert.equal(toPublicSeed({ ok: true, data: seeded }), seeded);
  assert.equal(toPublicSeed({ ok: false, error: "Katalog sedang tidak dapat dimuat." }), null);
  // Promise yang ditolak menjadi null lewat .catch di layout, dan toPublicSeed
  // juga harus aman kalau yang masuknya null.
  assert.equal(toPublicSeed(null), null);
  assert.equal(toPublicSeed(undefined), null);
  // Layout harus benar-benar memakai toPublicSeed, bukan logikanya sendiri.
  assert.match(publicLayout, /toPublicSeed\(await getPublicSnapshot\(\)\.catch\(\(\) => null\)\)/);
});
