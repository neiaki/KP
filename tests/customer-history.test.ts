import test from "node:test";
import assert from "node:assert/strict";
import type { ServiceTicket, Transaction } from "../src/types/index.ts";
import {
  filterCustomerTickets,
  filterCustomerTransactions,
} from "../src/lib/customer-history.ts";

/*
 * Filter ini menjaga satu hal yang mudah lolos di mode demo: halaman
 * /portal/account membaca seluruh transaksi dan tiket dari localStorage.
 * Tanpa filter, pelanggan melihat faktur pelanggan lain. Data live sudah
 * difilter server, jadi test ini fokus pada jalur demo dan transaksi lama
 * yang belum punya customer_id.
 */

const anisa = {
  id: "prof-cust-01",
  full_name: "Anisa Rahmawati",
  phone_number: "082155667788",
};

const budi = {
  id: "prof-cust-02",
  full_name: "Budi Hartono",
  phone_number: "081200000002",
};

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    customer_name: "Anisa Rahmawati",
    customer_phone: "082155667788",
    sales_id: "prof-sales-01",
    total_amount: 1000000,
    final_payment: 1000000,
    final_paid_amount: 1000000,
    payment_method: "cash",
    created_at: "2026-10-24T00:00:00.000Z",
    items: [],
    ...overrides,
  } as Transaction;
}

function ticket(overrides: Partial<ServiceTicket>): ServiceTicket {
  return {
    id: 1,
    ticket_code: "SRV-20261024-0001",
    customer_name: "Anisa Rahmawati",
    customer_phone: "082155667788",
    device_model: "iPhone 12",
    repair_status: "received",
    created_at: "2026-10-24T00:00:00.000Z",
    updated_at: "2026-10-24T00:00:00.000Z",
    ...overrides,
  } as ServiceTicket;
}

test("transaksi dengan customer_id hanya terlihat oleh pemiliknya", () => {
  const own = transaction({ id: 1, customer_id: anisa.id });
  const other = transaction({
    id: 2,
    customer_id: budi.id,
    customer_name: budi.full_name,
    customer_phone: budi.phone_number,
  });

  assert.deepEqual(
    filterCustomerTransactions([own, other], anisa).map((item) => item.id),
    [1]
  );
});

test("transaksi lama tanpa customer_id cocok lewat nomor HP", () => {
  const legacy = transaction({
    id: 3,
    customer_id: null,
    customer_phone: anisa.phone_number,
  });
  const other = transaction({
    id: 4,
    customer_id: null,
    customer_name: budi.full_name,
    customer_phone: budi.phone_number,
  });

  assert.deepEqual(
    filterCustomerTransactions([legacy, other], anisa).map((item) => item.id),
    [3]
  );
});

test("tanpa profil aktif tidak ada transaksi yang ditampilkan", () => {
  assert.deepEqual(
    filterCustomerTransactions([transaction({ id: 1 })], null),
    []
  );
});

test("tiket dengan customer_id hanya terlihat oleh pemiliknya", () => {
  const own = ticket({ id: 1, customer_id: anisa.id });
  const other = ticket({
    id: 2,
    customer_id: budi.id,
    customer_name: budi.full_name,
    customer_phone: budi.phone_number,
  });

  assert.deepEqual(
    filterCustomerTickets([own, other], anisa).map((item) => item.id),
    [1]
  );
});

test("tiket lama cocok lewat nomor HP atau nama yang sama", () => {
  const byPhone = ticket({
    id: 3,
    customer_phone: anisa.phone_number,
  });
  const byName = ticket({
    id: 4,
    customer_name: "anisa rahmawati",
    customer_phone: "",
  });
  const other = ticket({
    id: 5,
    customer_name: budi.full_name,
    customer_phone: budi.phone_number,
  });

  assert.deepEqual(
    filterCustomerTickets([byPhone, byName, other], anisa).map(
      (item) => item.id
    ),
    [3, 4]
  );
});

test("tanpa profil aktif tidak ada tiket yang ditampilkan", () => {
  assert.deepEqual(filterCustomerTickets([ticket({ id: 1 })], null), []);
});
