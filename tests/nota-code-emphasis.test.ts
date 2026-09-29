import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import type { buildServiceNotaHtml as BuildServiceNotaHtml } from "../src/lib/print-nota.ts";
import type { ServiceTicket } from "../src/types/index.ts";

/*
 * Gejala laporan: "kode notaris, bold", yaitu kode nota servis harus tebal.
 *
 * Kode nota servis adalah satu-satunya kode yang dicetak tanpa tebal di
 * seluruh repo. Di aplikasi kodenya sudah tebal (kartu tiket di
 * service/page.tsx memakai font-black, chip di dialog dan di halaman laporan
 * memakai font-bold), dan di nota POS IMEI penanda sah juga dibungkus
 * <strong> dengan alasan tertulis di print-nota.ts. Nota terima servis
 * tertinggal: <span class="mono"> polos.
 *
 * Penting karena nota terima servis adalah dokumen yang dipegang pelanggan,
 * dan footer dokumen itu sendiri menyuruh pelanggan "Tunjukkan kode nota
 * untuk mengambil unit". Kode yang harus ditunjukkan itu harus terbaca
 * sekilas, bukan tenggelam di antara baris lain.
 *
 * Uji ini memanggil buildServiceNotaHtml sungguhan lalu memeriksa HTML yang
 * dihasilkan, jadi pencabutan <strong> langsung menggagalkan uji.
 */

const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

// Import dinamis plus registerHooks dipakai karena static import tidak bisa
// bekerja di sini: src/lib/print-nota.ts mengimpor relatif tanpa ekstensi
// ("./utils"), yang ditolak resolver ESM Node. Pola yang sama sudah dipakai
// tests/unit-label-nota.test.ts.
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
    const relative =
      specifier.startsWith("@/") ||
      specifier.startsWith("./") ||
      specifier.startsWith("../");
    if (!relative) return next(specifier, context);
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(
      /\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`,
      context
    );
  },
});

const { buildServiceNotaHtml } = (await import("../src/lib/print-nota.ts")) as {
  buildServiceNotaHtml: typeof BuildServiceNotaHtml;
};

const KODE = "SRV-20260929-7QK3M2XB";

const tiket: ServiceTicket = {
  id: 42,
  ticket_code: KODE,
  customer_id: null,
  technician_id: null,
  customer_name: "Budi Santoso",
  customer_phone: "082155667788",
  device_model: "Samsung Galaxy S24",
  imei_or_sn: "350000111111111",
  issue_notes: "Layar retak setelah jatuh",
  repair_status: "received",
  photo_urls: [],
  sparepart_fee: 0,
  labor_fee: 100000,
  total_fee: 100000,
  warranty_days: 30,
  created_at: "2026-09-29T02:00:00.000Z",
  updated_at: "2026-09-29T02:00:00.000Z",
};

function nota(ticket: ServiceTicket): string {
  return buildServiceNotaHtml({
    ticket,
    storeName: "At Cell",
    address: "Paku Jaya, Serpong Utara",
    phone: "081234567890",
  });
}

const html = nota(tiket);

test("kode nota servis dicetak tebal", () => {
  assert.match(
    html,
    new RegExp(`<strong>${KODE}</strong>`),
    "kode nota harus dibungkus strong supaya dibaca lebih dulu daripada tanggal"
  );
});

test("kode nota tetap memakai font monospace seperti kode lain di repo", () => {
  const codeLine = html.split("</div>").find((chunk) => chunk.includes(KODE));
  assert.ok(codeLine, "baris kode nota harus ada di nota");
  assert.match(codeLine, /class="mono"/);
  // Yang tebal hanya kodenya. Tanggal di sebelahnya tetap normal.
  assert.doesNotMatch(
    codeLine,
    /<\/strong>[^<]*<strong>/,
    "hanya kode nota yang ditebalkan, tanggal di sebelahnya tetap normal"
  );
});

test("kode nota yang berisi tanda baca tetap ditebalkan dan tetap di-escape", () => {
  const nasty = nota({
    ...tiket,
    ticket_code: 'SRV-20260929-"><script>x</script>',
  });
  assert.doesNotMatch(nasty, /<script>/);
  assert.match(
    nasty,
    /<strong>SRV-20260929-&quot;&gt;&lt;script&gt;x&lt;\/script&gt;<\/strong>/,
    "kode nota yang di-escape tetap harus ditebalkan"
  );
});

test("dialog nota di kasir menebalkan nomor faktur", () => {
  const pos = readFileSync(
    new URL("../src/app/(portal)/portal/pos/page.tsx", import.meta.url),
    "utf8"
  );
  const at = pos.indexOf("completedInvoice.invoice_number");
  assert.notEqual(at, -1, "nomor faktur harus dirender di dialog nota kasir");
  // Jendela dibaca mulai dari baris sebelumnya, karena class penebalkan ada
  // di elemen pembungkus angka, bukan di baris yang memuat nama field-nya.
  const window = pos.slice(Math.max(0, at - 400), at + 200);
  assert.match(
    window,
    /font-bold[^"]*"[^>]*>\s*\{completedInvoice\.invoice_number/,
    "nomor faktur adalah kode nota, jadi harus dibungkus elemen ber-font-bold " +
      "di dialog nota kasir, sama seperti IMEI terikat di bawahnya"
  );
});
