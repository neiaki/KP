import test from "node:test";
import assert from "node:assert/strict";
import {
  REPAIR_FLOW,
  imeiSchema,
  isAllowedTransition,
  posSaleSchema,
  registerUnitsSchema,
  ticketCodeSchema,
  productUpdateSchema,
  storeSettingsUpdateSchema,
} from "../src/lib/validations.ts";

test("IMEI hanya menerima tepat 15 digit angka", () => {
  assert.equal(imeiSchema.safeParse("123456789012345").success, true);
  assert.equal(imeiSchema.safeParse("12345678901234").success, false);
  assert.equal(imeiSchema.safeParse("1234567890123456").success, false);
  assert.equal(imeiSchema.safeParse("12345678901234A").success, false);
});

test("batch IMEI menolak duplikasi di dalam input", () => {
  const result = registerUnitsSchema.safeParse({
    productId: 1,
    condition: "new",
    purchaseCost: 1000000,
    sellingPrice: 1200000,
    imeis: ["123456789012345", "123456789012345"],
  });
  assert.equal(result.success, false);
});

test("POS menerima trade-in IMEI valid dan menolak IMEI invalid", () => {
  const base = {
    unitId: 1,
    customerName: "Pelanggan Test",
    customerPhone: "081234567890",
    paymentMethod: "qris" as const,
    warrantyDurationMonths: 3,
  };
  const valid = posSaleSchema.safeParse({
    ...base,
    tradeIn: {
      originalBrandModel: "Xiaomi Redmi Note 8",
      imei: "123456789012345",
      gradingDetails: { screen: "good" },
      offeredPrice: 500000,
      photoUrls: [],
    },
  });
  assert.equal(valid.success, true);

  const invalid = posSaleSchema.safeParse({
    ...base,
    tradeIn: {
      originalBrandModel: "Xiaomi Redmi Note 8",
      imei: "1234",
      gradingDetails: {},
      offeredPrice: 500000,
      photoUrls: [],
    },
  });
  assert.equal(invalid.success, false);
});

test("schema update tidak mengaktifkan default create", () => {
  const product = productUpdateSchema.safeParse({ specs: "RAM 8GB" });
  assert.equal(product.success, true);
  if (product.success) {
    assert.deepEqual(product.data, { specs: "RAM 8GB" });
  }

  const settings = storeSettingsUpdateSchema.safeParse({ phone_number: "081234567890" });
  assert.equal(settings.success, true);
  if (settings.success) {
    assert.deepEqual(settings.data, { phone_number: "081234567890" });
  }
});

test("kode tiket dan transisi workflow mengikuti aturan operasional", () => {
  assert.equal(ticketCodeSchema.safeParse("SRV-20260925-0001").success, true);
  assert.equal(ticketCodeSchema.safeParse("SRV-2026-0001").success, false);
  assert.equal(isAllowedTransition("received", "diagnosing"), true);
  assert.equal(isAllowedTransition("received", "completed"), false);
  assert.equal(REPAIR_FLOW.completed.includes("picked_up"), true);
});
