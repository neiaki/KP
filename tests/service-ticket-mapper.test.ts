import test from "node:test";
import assert from "node:assert/strict";
import {
  mapDrizzleServiceTicket,
  mapSupabaseServiceTicket,
} from "../src/lib/actions/_ticket-mappers.ts";

const drizzleRow = {
  id: 7,
  ticketCode: "SRV-20261017-ABCDEFGH",
  customerId: null,
  technicianId: "tech-1",
  customerName: "Ayu",
  customerPhone: "081234567890",
  deviceModel: "Galaxy A55",
  deviceName: null,
  imeiOrSn: "123456789012345",
  issueNotes: "Layar mati",
  problemDescription: null,
  technicianNotes: null,
  repairStatus: "diagnosing" as const,
  photoUrls: [],
  sparepartFee: "125000",
  laborFee: "50000.5",
  totalFee: "175000.5",
  warrantyDays: 30,
  costBreakdown: [],
  createdAt: new Date("2026-10-17T01:02:03.000Z"),
  updatedAt: new Date("2026-10-17T02:02:03.000Z"),
  pickedUpAt: null,
};

const supabaseRow = {
  id: 7,
  ticket_code: "SRV-20261017-ABCDEFGH",
  customer_id: null,
  technician_id: "tech-1",
  customer_name: "Ayu",
  customer_phone: "081234567890",
  device_model: "Galaxy A55",
  device_name: null,
  imei_or_sn: "123456789012345",
  issue_notes: "Layar mati",
  problem_description: null,
  technician_notes: null,
  repair_status: "diagnosing" as const,
  photo_urls: null,
  sparepart_fee: "125000",
  labor_fee: "50000.5",
  total_fee: "175000.5",
  warranty_days: 30,
  cost_breakdown: null,
  created_at: "2026-10-17T01:02:03.000Z",
  updated_at: "2026-10-17T02:02:03.000Z",
  picked_up_at: null,
};

test("mapper Drizzle dan Supabase menghasilkan tiket domain yang sama", () => {
  const expected = {
    id: 7,
    ticket_code: "SRV-20261017-ABCDEFGH",
    customer_id: null,
    technician_id: "tech-1",
    customer_name: "Ayu",
    customer_phone: "081234567890",
    device_model: "Galaxy A55",
    device_name: "Galaxy A55",
    imei_or_sn: "123456789012345",
    imei: "123456789012345",
    issue_notes: "Layar mati",
    problem_description: "Layar mati",
    technician_notes: undefined,
    repair_status: "diagnosing",
    photo_urls: [],
    sparepart_fee: 125000,
    labor_fee: 50000.5,
    total_fee: 175000.5,
    warranty_days: 30,
    cost_breakdown: [],
    created_at: "2026-10-17T01:02:03.000Z",
    updated_at: "2026-10-17T02:02:03.000Z",
    picked_up_at: null,
  };

  assert.deepEqual(mapDrizzleServiceTicket(drizzleRow), expected);
  assert.deepEqual(mapSupabaseServiceTicket(supabaseRow), expected);
});

test("mapper menjaga nilai tiket yang tersedia dan menormalkan tanggal serah terima", () => {
  const breakdown = [{ id: "part-1", name: "Baterai", cost: 80000, type: "sparepart" as const }];
  const drizzle = mapDrizzleServiceTicket({
    ...drizzleRow,
    deviceName: "Galaxy A55 5G",
    problemDescription: "Baterai menggembung",
    technicianNotes: "Pesan baterai",
    photoUrls: ["https://example.test/photo.jpg"],
    costBreakdown: breakdown,
    pickedUpAt: new Date("2026-10-18T03:04:05.000Z"),
  });
  const supabase = mapSupabaseServiceTicket({
    ...supabaseRow,
    device_name: "Galaxy A55 5G",
    problem_description: "Baterai menggembung",
    technician_notes: "Pesan baterai",
    photo_urls: ["https://example.test/photo.jpg"],
    cost_breakdown: breakdown,
    picked_up_at: "2026-10-18T03:04:05.000Z",
  });

  assert.equal(drizzle.device_name, "Galaxy A55 5G");
  assert.equal(supabase.problem_description, "Baterai menggembung");
  assert.deepEqual(drizzle.photo_urls, ["https://example.test/photo.jpg"]);
  assert.deepEqual(supabase.cost_breakdown, breakdown);
  assert.equal(drizzle.picked_up_at, "2026-10-18T03:04:05.000Z");
  assert.equal(supabase.picked_up_at, "2026-10-18T03:04:05.000Z");
});
