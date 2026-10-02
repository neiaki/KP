import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canAccessPortalPath } from "../src/lib/access.ts";
import { UNIT_STATUS_OLEH_TEKNISI } from "../src/lib/validations.ts";

/*
 * Gerbang status teknisi hanya berguna kalau ada kontrol yang reachable untuk
 * teknisi.
 *
 * Audit: /portal/inventory hanya untuk admin dan sales, satu-satunya pemanggil
 * updateUnitStatus di repo adalah halaman inventaris itu, dan /portal/service
 * yang memang boleh dibuka teknisi tidak punya satu pun kontrol status unit.
 * Akibatnya UNIT_STATUS_OLEH_TEKNISI menjaga kontrol yang tidak bisa dicapai:
 * unit yang sudah selesai diperbaiki menggantung di in_service sampai admin atau
 * sales turun tangan.
 *
 * Halaman portal adalah "use client" dan mengimpor next/navigation, jadi tidak
 * bisa diimpor di runner Node. Yang diuji di sini adalah invarian yang membuat
 * alurnya benar: technological halaman yang boleh dibuka teknisi harus punya
 * jalan ke action-nya, dan halaman itu hanya boleh meminta status yang gerbang
 * izinkan.
 */

async function baca(rel: string): Promise<string> {
  return readFile(new URL(rel, import.meta.url), "utf8");
}

const SERVICE = "../src/app/(portal)/portal/service/page.tsx";

test("halaman yang teknisi boleh buka memang memuat kontrol status unit", async () => {
  const halaman = await baca(SERVICE);
  assert.match(
    halaman,
    /updateUnitStatus/,
    "halaman servis harus memanggil updateUnitStatus, kalau tidak teknisi tidak punya jalan masuk maupun keluar dari in_service"
  );
  assert.match(halaman, /inventoryUnits/, "unit yang cocok dicari dari inventoryUnits");
  assert.match(halaman, /updateUnitStatus\(unitTiket\.id, status\)/);
});

test("kontrol di halaman servis hanya meminta status yang gerbang izinkan", async () => {
  // Halaman ini adalah satu-satunya tempat teknisi bisa mengubah status unit,
  // jadi dia tidak boleh pernah meminta status yang akan ditolak. available
  // sengaja tidak boleh muncul di sini: itu status yang menerbitkan unit ke
  // etalase publik.
  const halaman = await baca(SERVICE);
  const dipanggil = [...halaman.matchAll(/handleUnitService\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(
    dipanggil.sort(),
    [...UNIT_STATUS_OLEH_TEKNISI].sort(),
    "halaman servis harus meminta persis status yang gerbang teknisi izinkan"
  );
  assert.equal(
    dipanggil.includes("available"),
    false,
    "available tidak boleh diminta dari halaman mana pun yang dibuka teknisi"
  );
});

test("unit ticketservice dicocokkan lewat IMEI, karena tiket tidak punya unit_id", async () => {
  // service_tickets tidak punya kolom unit_id, jadi satu-satunya penghubung
  // yang benar adalah IMEI. Cocokkan harus persis, bukan endsWith atau
  // contains, supaya unit yang kebetulan punya digit serupa tidak ikut berubah.
  const skema = await baca("../src/db/schema.ts");
  const tabelTiket = skema.slice(
    skema.indexOf("export const serviceTickets"),
    skema.indexOf("export const", skema.indexOf("export const serviceTickets") + 10)
  );
  assert.equal(
    /unit_id/.test(tabelTiket),
    false,
    "kalau service_tickets nanti punya unit_id, penghubung IMEI di halaman servis harus ditinjau ulang"
  );

  const halaman = await baca(SERVICE);
  assert.match(
    halaman,
    /inventoryUnits\.find\(\(unit\) => unit\.imei === imeiTiket\)/,
    "pencocokan harus persis pada IMEI, bukan pencocokan sebagian"
  );
  assert.equal(/imei_or_sn\.includes\(/.test(halaman), false);
});

test("unit sold tidak pernah menawarkan tombol apa pun", async () => {
  // sold terminal oleh trigger trg_prevent_sold_reactivation, jadi menawarkan
  // tombol di sini hanya menghasilkan error yang sudah pasti terjadi.
  const halaman = await baca(SERVICE);
  assert.match(
    halaman,
    /unitTiket\.status === "sold"/,
    "unit sold harus dicegat dan tidak boleh mendapat kontrol status"
  );
});

test("jalur inventaris tetap tertutup untuk teknisi", async () => {
  // Kontrol baru ada di /portal/service. Membuka /portal/inventory untuk teknisi
  // akan memberi mereka form registrasi batch IMEI dan editor harga yang
  // requireRole-nya admin|sales, jadi UI-nya hanya menghasilkan error.
  assert.equal(canAccessPortalPath("/portal/inventory", "technician"), false);
  assert.equal(canAccessPortalPath("/portal/inventory", "admin"), true);
  assert.equal(canAccessPortalPath("/portal/inventory", "sales"), true);
  // Dan halaman yang mereka memang pakai tetap terbuka.
  assert.equal(canAccessPortalPath("/portal/service", "technician"), true);
});

test("halaman servis memakai store, bukan Server Action langsung", async () => {
  // Pola yang dipakai halaman ini sejak sebelumnya: satu jalur tulis lewat
  // store, supaya salinan tiket di store ikut terbarui dan tidak ada Half
  // update. Kontrol unit baru harus mengikuti pola yang sama.
  const halaman = await baca(SERVICE);
  assert.match(halaman, /const \{ serviceTickets, updateServiceTicket, inventoryUnits, updateUnitStatus, currentRole \} =\n?\s*useStore\(\);/);
  assert.equal(
    /import\s+\{[^}]*updateUnitStatus[^}]*\}\s+from\s+"@\/lib\/actions\/inventory"/.test(halaman),
    false,
    "halaman harus lewat store, bukan memanggil action inventory secara langsung"
  );
});
