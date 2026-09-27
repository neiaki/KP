import test from "node:test";
import assert from "node:assert/strict";
import {
  REPAIR_FLOW,
  createTicketSchema,
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

/**
 * Referensi foto dijaga karena bentuk nilainya berubah. Dua bucket foto
 * pelanggan sengaja privat, jadi yang disimpan ke photo_urls adalah path
 * Storage, bukan URL. Sebelumnya photoUrls hanya menerima URL penuh, jadi begitu
 * pemakai mulai menyimpan path, setiap foto yang sudah tersimpan ditolak begitu
 * tiket diperbarui dari meja kerja.
 *
 * Sebaliknya, baris lama yang terlanjur menyimpan URL dan mode mock lokal
 * masih harus diterima, jadi kedua bentuknya dibolehkan.
 */
const DASAR_TIKET = {
  customerName: "Budi Santoso",
  customerPhone: "081234567890",
  deviceModel: "iPhone 13 Pro",
  issueNotes: "Layar retak setelah jatuh",
};

function cekFoto(foto: string) {
  return createTicketSchema.safeParse({ ...DASAR_TIKET, photoUrls: [foto] }).success;
}

test("photoUrls menerima path Storage dan URL", () => {
  // Path Storage adalah bentuk yang dipakai sejak bucket jadi privat.
  assert.equal(cekFoto("a1b2c3d4-uuid/foto.jpg"), true, "path Storage harus diterima");
  // URL penuh tetap diterima supaya data lama dan mode mock tidak ikut rusak.
  assert.equal(cekFoto("https://contoh.supabase.co/storage/v1/object/public/x.jpg"), true);
  assert.equal(cekFoto("/products/iphone-15-pro-1.jpg"), true, "path aset lokal harus diterima");
});

test("photoUrls menolak path yang keluar dari folder sendiri", () => {
  // Dua titik berurutan lolos uji karakter, tapi maknanya keluar dari folder
  // staf yang jadi prefix saat upload. Kunci Storage semacam ini tak boleh
  // tersimpan, karena satu staf bisa menimpa folder staf lain.
  assert.equal(cekFoto("../rahasia/foto.jpg"), false, "naik satu tingkat harus ditolak");
  assert.equal(cekFoto("a/b/../../../x.jpg"), false, "naik beberapa tingkat harus ditolak");
});

test("photoUrls menolak nilai kosong, karakter aneh, dan kelebihan jumlah", () => {
  assert.equal(cekFoto(""), false);
  assert.equal(cekFoto("   "), false, "spasi saja dianggap kosong");
  assert.equal(cekFoto("javascript:alert(1)"), false, "skema lain bukan URL yang sah");
  assert.equal(cekFoto("foto tanpa.jpg spasi"), false, "spasi di tengah path tidak sah");
  assert.equal(
    createTicketSchema.safeParse({
      ...DASAR_TIKET,
      photoUrls: Array.from({ length: 11 }, (_, i) => `a/foto-${i}.jpg`),
    }).success,
    false,
    "lebih dari sepuluh foto harus ditolak"
  );
});

test("photoUrls bawaan tetap daftar kosong", () => {
  const hasil = createTicketSchema.parse(DASAR_TIKET);
  assert.deepEqual(
    hasil.photoUrls,
    [],
    "tanpa photoUrls harus jadi daftar kosong, bukan undefined"
  );
});
