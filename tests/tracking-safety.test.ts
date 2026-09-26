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

test("tracking publik membatasi kuota per IP dan global", () => {
  // Guard harus jalan sebelum query database, kalau tidak penjebolan tetap.Database.
  assert.match(publicTracking, /consumeRateLimit/);
  assert.match(publicTracking, /track-ip:/);
  assert.match(publicTracking, /track-global/);
  assert.match(publicTracking, /TRACKING_PER_IP_LIMIT/);
  assert.match(publicTracking, /TRACKING_GLOBAL_LIMIT/);

  const rateLimitIndex = publicTracking.indexOf("consumeRateLimit");
  const queryIndex = publicTracking.indexOf(".from(serviceTickets)");
  assert.ok(rateLimitIndex > -1, "harus memanggil consumeRateLimit");
  assert.ok(queryIndex > -1, "harus tetap melakukan query");
  assert.ok(rateLimitIndex < queryIndex, "rate limit harus dicek sebelum query database");
});
