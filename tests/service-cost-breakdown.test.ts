import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { updateTicketSchema } from "../src/lib/validations.ts";
import type { ServiceTicket } from "../src/types/index.ts";
import type { buildServiceNotaHtml as BuildServiceNotaHtml } from "../src/lib/print-nota.ts";

/*
 * `service_tickets.cost_breakdown` sudah ada di skema, sudah divalidasi, dan
 * sudah dicetak di nota servis. Yang tidak pernah ada adalah jalan untuk
 * mengisinya, jadi setiap faktura yang tercetak selama ini hanya menunjukkan
 * satu baris total. Test ini mengunci ujung ke ujungnya: apa yang boleh
 * disimpan, apa yang ditulis Server Action, dan apa yang benar-benar keluar
 * di atas kertas.
 */

/**
 * Modul src/ ditulis untuk bundler Next, jadi import-nya tanpa ekstensi dan
 * memakai alias `@/`. Node tidak bisa keduanya, jadi hook ini hanya melengkapi
 * resolusi. Logikanya tetap dijalankan apa adanya, bukan disalin ke test.
 */
// registerHooks sudah ada di Node-nya, tapi belum ada di @types/node v20 yang
// terpasang di repo, jadi diambil lewat cast di sini.
const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};

const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith("@/") && !specifier.startsWith("./") && !specifier.startsWith("../")) {
      return next(specifier, context);
    }
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolvePath(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

// Import dinamis: modul hanya bisa diresolve setelah hook di atas terdaftar.
const { buildServiceNotaHtml } = (await import("../src/lib/print-nota.ts")) as {
  buildServiceNotaHtml: typeof BuildServiceNotaHtml;
};

const serviceAction = readFileSync(
  new URL("../src/lib/actions/service.ts", import.meta.url),
  "utf8"
);
const servicePage = readFileSync(
  new URL("../src/app/(portal)/portal/service/page.tsx", import.meta.url),
  "utf8"
);
const storeSource = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");

const updateTicketBody = serviceAction.slice(
  serviceAction.indexOf("export async function updateTicket"),
  serviceAction.indexOf("export async function listTickets")
);

const baseInput = {
  ticketId: 1,
  repairStatus: "in_progress" as const,
  technicianNotes: "Ganti digitizer",
};

const item = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  name: "Digitizer iPhone 12",
  cost: 450_000,
  type: "sparepart" as const,
  ...over,
});

test("rincian biaya yang lengkap diterima update tiket", () => {
  const result = updateTicketSchema.safeParse({
    ...baseInput,
    costBreakdown: [
      item(),
      item({ id: "b2", name: "Pemasangan", cost: 100_000, type: "labor" }),
    ],
  });
  assert.equal(result.success, true, JSON.stringify(result.error?.issues ?? []));
});

test("rincian biaya ditolak kalau tidak bisa dicetak sebagai nota", () => {
  // Nama kosong akan tercetak sebagai baris kosong di nota.
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, costBreakdown: [item({ name: "x" })] }).success, false);
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, costBreakdown: [item({ name: "   " })] }).success, false);
  // Nominal negatif dan tipe di luar sparepart/labor ditolak.
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, costBreakdown: [item({ cost: -1 })] }).success, false);
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, costBreakdown: [item({ type: "ongkir" })] }).success, false);
  // Baris tanpa id tidak bisa diedit maupun dihapus nanti.
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, costBreakdown: [item({ id: "" })] }).success, false);
  // Batas 50 baris sama dengan batas yang dipaksakan UI.
  const tooMany = Array.from({ length: 51 }, (_, i) => item({ id: `b${i}` }));
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, costBreakdown: tooMany }).success, false);
});

test("foto progres repairs harus berupa URL dan maksimal sepuluh", () => {
  const url = "https://atcell.co.id/storage/v1/object/public/service-photos/a.jpg";
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, photoUrls: [url] }).success, true);
  assert.equal(updateTicketSchema.safeParse({ ...baseInput, photoUrls: ["bukan-url"] }).success, false);
  assert.equal(
    updateTicketSchema.safeParse({
      ...baseInput,
      photoUrls: Array.from({ length: 11 }, (_, i) => `${url}${i}`),
    }).success,
    false
  );
});

test("Server Action menyimpan rincian biaya dan foto progres", () => {
  assert.match(updateTicketBody, /costBreakdown:\s*v\.costBreakdown/);
  assert.match(updateTicketBody, /photoUrls:\s*v\.photoUrls/);
  // Keduanya opsional, jadi tiket lama yang belum punya rincian tetap bisa
  // diperbarui tanpa mengirim field apa pun.
  assert.match(updateTicketBody, /v\.costBreakdown !== undefined/);
  assert.match(updateTicketBody, /v\.photoUrls !== undefined/);
});

test("meja kerja punya tambah, ubah, hapus, dan unggah foto", () => {
  // Titik panggil di JSX, bukan hanya definisinya: tanpa tiga ini teknisi
  // tidak bisa menambah, mengubah, atau membatalkan baris biaya.
  assert.match(servicePage, /onClick=\{\(\) => addCostItem\(/);
  assert.match(servicePage, /onChange=\{\(e\) =>\s*updateCostItem\(/);
  assert.match(servicePage, /onClick=\{\(\) => removeCostItem\(/);
  assert.match(servicePage, /uploadPhoto\(formData, \{ bucket: "service-photos" \}\)/);
  // Bentuk item harus sama dengan ServiceCostItem, bukan struktur baru.
  assert.match(servicePage, /useState<ServiceCostItem\[\]>/);
});

test("penyimpanan lewat Server Action yang sudah ada, bukan endpoint baru", () => {
  const saveHandler = servicePage.slice(
    servicePage.indexOf("const handleSaveTicket"),
    servicePage.indexOf("const filteredTickets")
  );
  assert.ok(saveHandler.length > 0, "handleSaveTicket harus ada di halaman");

  // Halaman hanya boleh punya satu jalur tulis. Memanggil updateTicket
  // langsung di sini selain lewat store akan membuat dua jalur saling
  // menimpa urutan dan meninggalkan salinan tiket setengah jadi.
  assert.match(saveHandler, /await updateServiceTicket\(/);
  assert.doesNotMatch(saveHandler, /updateTicket\(/);
  assert.doesNotMatch(servicePage, /import \{ updateTicket \}/);

  // Rincian dan foto harus ikut terkirim ke store, bukan disimpan lokal saja.
  assert.match(saveHandler, /cost_breakdown: costBreakdown,/);
  assert.match(saveHandler, /photo_urls: progressPhotos,/);

  // Tidak boleh membuka endpoint sendiri.
  assert.doesNotMatch(saveHandler, /fetch\(|XMLHttpRequest|axios/);
});

test("store meneruskan rincian biaya dan foto ke Server Action yang sama", () => {
  // Rantai lengkapnya: halaman -> store -> updateTicket. Kalau store berhenti
  // meneruskan, rincian biaya yang sudah diisi teknisi hilang diam-diam dan
  // nota kembali tercetak tanpa baris rincian.
  const storeHandler = storeSource.slice(
    storeSource.indexOf("const updateServiceTicket"),
    storeSource.indexOf("const addStaff")
  );
  assert.ok(storeHandler.length > 0, "updateServiceTicket harus ada di store");
  assert.match(storeHandler, /updateTicketAction\(\{/);
  assert.match(storeHandler, /costBreakdown:\s*updates\.cost_breakdown/);
  assert.match(storeHandler, /photoUrls:\s*updates\.photo_urls/);
});

test("nota servis benar-benar mencetak tiap baris rincian", () => {
  const ticket: ServiceTicket = {
    id: 1,
    ticket_code: "SRV-20260927-7K4M2QX9",
    customer_name: "Budi",
    customer_phone: "08123456789",
    device_model: "iPhone 12",
    imei_or_sn: "352948110293841",
    issue_notes: "Layar pecah",
    repair_status: "completed",
    sparepart_fee: 450_000,
    labor_fee: 100_000,
    total_fee: 550_000,
    photo_urls: [],
    created_at: "2026-09-27T00:00:00.000Z",
    updated_at: "2026-09-27T00:00:00.000Z",
    cost_breakdown: [
      { id: "b1", name: "Digitizer iPhone 12", cost: 450_000, type: "sparepart" },
      { id: "b2", name: "Pemasangan", cost: 100_000, type: "labor" },
    ],
  };

  const html = buildServiceNotaHtml({
    ticket,
    storeName: "At Cell",
    address: "Paku Jaya, Serpong Utara",
    phone: "021-5551234",
  });

  assert.match(html, /Digitizer iPhone 12/);
  assert.match(html, /Pemasangan/);
  // Nominal tiap baris ikut tercetak, bukan cuma total. Pemisah antara
  // "Rp" dan angkanya non-breaking space dari Intl, jadi pakai \s+.
  assert.match(html, /Rp\s+450\.000/);
  assert.match(html, /Rp\s+100\.000/);
  assert.match(html, /Rp\s+550\.000/);

  // Tanpa rincian, nota tetap sah dan tidak meledak.
  const withoutBreakdown = buildServiceNotaHtml({
    ticket: { ...ticket, cost_breakdown: [] },
    storeName: "At Cell",
    address: "Paku Jaya, Serpong Utara",
    phone: "021-5551234",
  });
  assert.match(withoutBreakdown, /Rp\s+550\.000/);
  assert.doesNotMatch(withoutBreakdown, /undefined/);
});
