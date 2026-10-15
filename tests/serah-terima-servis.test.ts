import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { serviceWarrantyEnd } from "../src/lib/warranty.ts";
import { demoUpdateServiceTicket } from "../src/lib/store-demo.ts";
import type { ServiceTicket } from "../src/types/index.ts";

/*
 * FR-B-04 (serah terima unit) diuji di sini karena tiga hal bisa melenceng
 * tanpa menggagalkan test lain:
 *
 * 1. Gerbang konfirmasi nota. Kalau hilang, unit bisa keluar tanpa nota asli
 *    dilihat, dan itu tidak terlihat dari data mana pun sesudahnya.
 * 2. Stempel waktu serah terima. Kalau ikut berubah pada update biasa,
 *    masa garansi pelanggan bergeser dengan sendirinya.
 * 3. Perhitungan akhir garansi di halaman lacak. Rumus yang salah menghasilkan
 *    tanggal yang salah dijanjikan ke pelanggan, tanpa error apa pun.
 *
 * Demo dan live memakai penjaga yang sama supaya alur yang dilatih staf di
 * mode demo tidak lebih longgar dari production.
 */

// localStorage tidak ada di node. Stub ini hanya meniru yang dipakai modul.
function pasangStorageAwal(): Map<string, string> {
  const isi = new Map<string, string>();
  const stub = {
    getItem: (kunci: string) => (isi.has(kunci) ? isi.get(kunci)! : null),
    setItem: (kunci: string, nilai: string) => {
      isi.set(kunci, String(nilai));
    },
    removeItem: (kunci: string) => {
      isi.delete(kunci);
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: stub,
    writable: true,
    configurable: true,
  });
  return isi;
}

/** Setter React tiruan: menampung nilai terakhir, mendukung updater function. */
function penampung<T>(awal: T): {
  nilai: () => T;
  set: (v: T | ((sebelum: T) => T)) => void;
} {
  let sekarang = awal;
  return {
    nilai: () => sekarang,
    set: (v) => {
      sekarang = typeof v === "function" ? (v as (s: T) => T)(sekarang) : v;
    },
  };
}

function tiket(id: number, status: ServiceTicket["repair_status"]): ServiceTicket {
  return {
    id,
    ticket_code: `SRV-20260101-TEST${String(id).padStart(4, "0")}`,
    customer_id: null,
    technician_id: null,
    customer_name: "Pelanggan",
    customer_phone: "",
    device_model: "Unit",
    imei_or_sn: "",
    issue_notes: "",
    repair_status: status,
    photo_urls: [],
    sparepart_fee: 0,
    labor_fee: 100000,
    total_fee: 100000,
    warranty_days: 30,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("akhir garansi dihitung dari waktu serah terima plus hari garansi", () => {
  assert.equal(
    serviceWarrantyEnd("2026-01-01T00:00:00.000Z", 30)?.toISOString(),
    "2026-01-31T00:00:00.000Z"
  );
  // Garansi 0 hari berarti berakhir tepat saat unit diserahkan.
  assert.equal(
    serviceWarrantyEnd("2026-01-01T00:00:00.000Z", 0)?.toISOString(),
    "2026-01-01T00:00:00.000Z"
  );
});

test("tiket yang belum diambil tidak punya akhir garansi", () => {
  assert.equal(serviceWarrantyEnd(null, 30), null);
  assert.equal(serviceWarrantyEnd(undefined, 30), null);
  // Nilai rusak tidak boleh menghasilkan tanggal Invalid Date di layar.
  assert.equal(serviceWarrantyEnd("bukan-tanggal", 30), null);
});

test("angka hari yang tidak masuk akal dijepit ke rentang aman", () => {
  assert.equal(
    serviceWarrantyEnd("2026-01-01T00:00:00.000Z", -7)?.toISOString(),
    "2026-01-01T00:00:00.000Z"
  );
  assert.equal(
    serviceWarrantyEnd("2026-01-01T00:00:00.000Z", Number.NaN)?.toISOString(),
    "2026-01-01T00:00:00.000Z"
  );
  assert.equal(
    serviceWarrantyEnd("2026-01-01T00:00:00.000Z", 10.9)?.toISOString(),
    "2026-01-11T00:00:00.000Z"
  );
});

test("demo menolak serah terima tanpa konfirmasi nota", () => {
  pasangStorageAwal();
  const wadah = penampung<ServiceTicket[]>([tiket(1, "completed")]);
  assert.throws(
    () => demoUpdateServiceTicket(wadah.nilai(), 1, { repair_status: "picked_up" }, wadah.set),
    /nota servis/,
    "transisi lengkap -> picked_up tanpa nota harus ditolak di demo juga"
  );
  assert.equal(wadah.nilai()[0]!.repair_status, "completed");
});

test("demo menstempel waktu serah terima sekali saja", () => {
  pasangStorageAwal();
  const wadah = penampung<ServiceTicket[]>([tiket(1, "completed")]);
  demoUpdateServiceTicket(
    wadah.nilai(),
    1,
    { repair_status: "picked_up" },
    wadah.set,
    { notaConfirmed: true }
  );
  const sesudah = wadah.nilai()[0]!;
  assert.equal(sesudah.repair_status, "picked_up");
  assert.ok(sesudah.picked_up_at, "waktu serah terima harus tercatat");
  const stempel = sesudah.picked_up_at;

  // Update berikutnya pada tiket yang sudah diambil tidak menggeser awal
  // masa garansi, sejalan dengan coalesce pada trigger database.
  demoUpdateServiceTicket(
    wadah.nilai(),
    1,
    { technician_notes: "catatan tambahan" },
    wadah.set
  );
  assert.equal(wadah.nilai()[0]!.picked_up_at, stempel);
});

const repoFile = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("migrasi menambah kolom picked_up_at dan stempelnya di trigger", () => {
  const migrasi = repoFile(
    "../supabase/migrations/20261015000000_service_ticket_picked_up_at.sql"
  );
  assert.match(migrasi, /add column if not exists picked_up_at timestamptz/);
  assert.match(
    migrasi,
    /new\.picked_up_at := coalesce\(new\.picked_up_at, now\(\)\)/,
    "trigger harus mengisi sekali, bukan menimpa nilai yang sudah ada"
  );
  // Non-destruktif: hanya add column dan create or replace.
  assert.doesNotMatch(migrasi, /drop table|truncate|delete from/i);
});

test("skema dan validasi memuat kontrak serah terima", () => {
  const schema = repoFile("../src/db/schema.ts");
  assert.match(schema, /pickedUpAt: timestamp\("picked_up_at", \{ withTimezone: true \}\)/);
  const validations = repoFile("../src/lib/validations.ts");
  assert.match(validations, /notaConfirmed: z\.boolean\(\)\.optional\(\)/);
});

test("Server Action menegakkan konfirmasi dan menstempel waktu", () => {
  const service = repoFile("../src/lib/actions/service.ts");
  assert.match(
    service,
    /v\.repairStatus === "picked_up"[\s\S]{0,160}?v\.notaConfirmed !== true/,
    "updateTicket harus menolak picked_up tanpa notaConfirmed"
  );
  assert.match(service, /pickedUpAt: new Date\(\)/);
  // Halaman lacak publik butuh stempelnya untuk menghitung akhir garansi.
  assert.match(service, /picked_up_at: t\.pickedUpAt \? toISO\(t\.pickedUpAt\) : null/);
});

test("meja kerja meminta konfirmasi nota sebelum unit diserahkan", () => {
  const page = repoFile("../src/app/(portal)/portal/service/page.tsx");
  assert.match(page, /Nota servis asli sudah ditunjukkan/);
  assert.match(page, /editStatus === "picked_up" && selectedTicket\.repair_status !== "picked_up"/);
  assert.match(page, /\{ notaConfirmed \}/, "konfirmasi harus diteruskan ke store");
});

test("halaman lacak menampilkan tanggal akhir garansi setelah unit diambil", () => {
  const tracking = repoFile("../src/app/(public)/[locale]/tracking/tracking-content.tsx");
  assert.match(tracking, /picked_up_at: data\.picked_up_at/);
  assert.match(tracking, /serviceWarrantyEnd\(activeTicket\.picked_up_at/);
  assert.match(tracking, /Berlaku sampai \{formatDateOnly\(warrantyEnd, locale\)\}/);
});
