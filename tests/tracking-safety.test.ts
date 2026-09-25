import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serviceAction = await readFile(
  new URL("../src/lib/actions/service.ts", import.meta.url),
  "utf8"
);
const publicTracking = serviceAction.slice(serviceAction.indexOf("export async function trackTicketPublic"));

test("tracking publik tidak mengembalikan PII, biaya, atau foto", () => {
  assert.doesNotMatch(publicTracking, /customerName: serviceTickets\.customerName/);
  assert.doesNotMatch(publicTracking, /issueNotes: serviceTickets\.issueNotes/);
  assert.doesNotMatch(publicTracking, /photoUrls: serviceTickets\.photoUrls/);
  assert.doesNotMatch(publicTracking, /sparepartFee: serviceTickets\.sparepartFee/);
  assert.doesNotMatch(publicTracking, /totalFee: serviceTickets\.totalFee/);
  assert.match(publicTracking, /imei_or_sn/);
  assert.match(publicTracking, /repair_status/);
});
