import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { assemblePortalSnapshot as AssemblePortalSnapshot } from "../src/lib/actions/_portal-snapshot.ts";

const { registerHooks } = nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      next: (specifier: string, context: unknown) => unknown
    ) => unknown;
  }) => void;
};
const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith("@/") && !specifier.startsWith("./") && !specifier.startsWith("../")) {
      return next(specifier, context);
    }
    const target = specifier.startsWith("@/")
      ? pathToFileURL(resolve(srcRoot, specifier.slice(2))).href
      : specifier;
    return next(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`, context);
  },
});

const { assemblePortalSnapshot } = (await import("../src/lib/actions/_portal-snapshot.ts")) as {
  assemblePortalSnapshot: typeof AssemblePortalSnapshot;
};

const settings = {
  id: 1,
  store_name: "At Cell",
  description_id: "Toko HP",
  description_en: "Phone shop",
  address: "Serpong",
  latitude: 0,
  longitude: 0,
  phone_number: "081234567890",
  opening_hours: { monday_friday: "09.00-18.00", saturday_sunday: "09.00-15.00" },
  updated_at: "2026-10-17T00:00:00.000Z",
};

const productRows = [
  {
    id: 3,
    brand: "Samsung",
    model_name: "Galaxy A55",
    specs: "8/256 GB",
    default_price: "5499000",
    image_url: "/products/a55.webp",
    official_images: null,
    second_images: null,
    created_at: "2026-10-17T00:00:00.000Z",
  },
];

const transactionRows = [
  {
    id: 12,
    invoice_number: "INV-12",
    sales_id: null,
    customer_id: "customer-1",
    customer_name: "Ayu",
    customer_phone: "081234567890",
    total_amount: "5499000",
    trade_in_deduction: "0",
    final_payment: "5499000",
    payment_method: "cash" as const,
    created_at: "2026-10-17T00:00:00.000Z",
    transaction_items: [
      {
        id: 21,
        transaction_id: 12,
        unit_id: 31,
        unit_price: "5499000",
        warranty_duration_months: 12,
        inventory_units: {
          id: 31,
          product_id: 3,
          imei: "123456789012345",
          condition: "new" as const,
          status: "sold" as const,
          purchase_cost: "4300000",
          selling_price: "5499000",
          created_at: "2026-10-17T00:00:00.000Z",
        },
      },
    ],
  },
];

const ticketRow = {
  id: 41,
  ticket_code: "SRV-20261017-ABCDEFGH",
  customer_id: "customer-1",
  technician_id: null,
  customer_name: "Ayu",
  customer_phone: "081234567890",
  device_model: "Galaxy A55",
  device_name: null,
  imei_or_sn: "123456789012345",
  issue_notes: "Layar mati",
  problem_description: null,
  technician_notes: null,
  repair_status: "received" as const,
  photo_urls: null,
  sparepart_fee: "0",
  labor_fee: "0",
  total_fee: "0",
  warranty_days: 30,
  cost_breakdown: null,
  created_at: "2026-10-17T00:00:00.000Z",
  updated_at: "2026-10-17T00:00:00.000Z",
  picked_up_at: null,
};

const profile = {
  id: "customer-1",
  full_name: "Ayu",
  role: "customer" as const,
  phone_number: "081234567890",
  username: "ayu",
  created_at: "2026-10-17T00:00:00.000Z",
};

test("snapshot customer membatasi profil dan menyembunyikan modal pembelian unit", () => {
  const snapshot = assemblePortalSnapshot({
    profile,
    storeSettings: settings,
    productRows,
    inventoryUnits: [],
    transactionRows,
    serviceTicketRows: [ticketRow],
    profileRows: [
      {
        id: "staff-1",
        full_name: "Admin",
        role: "admin",
        phone_number: "081111111111",
        username: "admin",
        created_at: "2026-10-16T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(snapshot.profiles, [profile]);
  assert.equal(snapshot.transactions[0]?.items[0]?.unit?.purchase_cost, 0);
  assert.equal(snapshot.transactions[0]?.items[0]?.unit?.selling_price, 5499000);
  assert.equal(snapshot.serviceTickets[0]?.ticket_code, ticketRow.ticket_code);
  assert.deepEqual(snapshot.products[0]?.official_images, []);
});

test("snapshot staf mempertahankan profil dan nilai internal yang memang diizinkan", () => {
  const staffProfile = { ...profile, id: "staff-1", role: "admin" as const };
  const snapshot = assemblePortalSnapshot({
    profile: staffProfile,
    storeSettings: settings,
    productRows,
    inventoryUnits: [],
    transactionRows,
    serviceTicketRows: [],
    profileRows: [
      {
        id: "customer-1",
        full_name: "Ayu",
        role: "customer",
        phone_number: "081234567890",
        username: "ayu",
        created_at: "2026-10-17T00:00:00.000Z",
      },
    ],
  });

  assert.equal(snapshot.profiles[0]?.username, "ayu");
  assert.equal(snapshot.transactions[0]?.items[0]?.unit?.purchase_cost, 4300000);
});
