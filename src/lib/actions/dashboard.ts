"use server";

import { desc, eq, gte, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryUnits, products, profiles, serviceTickets, transactions } from "@/db/schema";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  toISO,
  toNumber,
  type ActionResult,
} from "./_helpers";

export type BusinessSummary = {
  totalRevenue: number;
  transactionCount: number;
  activeTicketCount: number;
  revenueByDay: Array<{ date: string; revenue: number }>;
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** Ringkasan bisnis 30 hari terakhir untuk /portal/dashboard (FR-D-03). */
export async function getBusinessSummary(): Promise<ActionResult<BusinessSummary>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const txs = await db
    .select({ finalPayment: transactions.finalPayment, createdAt: transactions.createdAt })
    .from(transactions)
    .where(gte(transactions.createdAt, startOfDay(since)))
    .orderBy(transactions.createdAt);
  // Tiket aktif = status apa pun kecuali selesai/diambil/batal.
  const activeTickets = await db
    .select({ id: serviceTickets.id })
    .from(serviceTickets)
    .where(notInArray(serviceTickets.repairStatus, ["completed", "picked_up", "cancelled"]));
  const buckets = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  let totalRevenue = 0;
  for (const t of txs) {
    const day = toISO(t.createdAt).slice(0, 10);
    const amount = toNumber(t.finalPayment);
    totalRevenue += amount;
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + amount);
  }
  return ok({
    totalRevenue,
    transactionCount: txs.length,
    activeTicketCount: activeTickets.length,
    revenueByDay: [...buckets.entries()].map(([date, revenue]) => ({ date, revenue })),
  });
}

export type LowStockAlert = {
  productId: number;
  brand: string;
  modelName: string;
  availableCount: number;
  threshold: number;
};

/** Model dengan unit available di bawah ambang (default 3). FR-D-03. */
export async function getLowStockAlerts(
  threshold = 3
): Promise<ActionResult<LowStockAlert[]>> {
  const guard = await requireRole(["admin", "sales"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  const productRows = await db
    .select({ id: products.id, brand: products.brand, modelName: products.modelName })
    .from(products)
    .where(eq(products.isActive, true));
  const availableUnits = await db
    .select({ productId: inventoryUnits.productId })
    .from(inventoryUnits)
    .where(eq(inventoryUnits.status, "available"));
  const counts = new Map<number, number>();
  for (const u of availableUnits) counts.set(u.productId, (counts.get(u.productId) ?? 0) + 1);
  return ok(
    productRows
      .map((p) => ({
        productId: p.id,
        brand: p.brand,
        modelName: p.modelName,
        availableCount: counts.get(p.id) ?? 0,
        threshold,
      }))
      .filter((a) => a.availableCount < threshold)
      .sort((a, b) => a.availableCount - b.availableCount)
  );
}

export type TechnicianStat = {
  technicianId: string;
  fullName: string;
  completedCount: number;
  avgCompletionHours: number | null;
};

/** Laporan performa teknisi: tiket selesai + rata-rata durasi (FR-D-03). */
export async function getTechnicianPerformance(): Promise<ActionResult<TechnicianStat[]>> {
  const guard = await requireRole(["admin"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  const techs = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.role, "technician"));
  const done = await db
    .select({
      technicianId: serviceTickets.technicianId,
      createdAt: serviceTickets.createdAt,
      updatedAt: serviceTickets.updatedAt,
    })
    .from(serviceTickets)
    .where(eq(serviceTickets.repairStatus, "completed"))
    .orderBy(desc(serviceTickets.updatedAt));
  return ok(
    techs.map((t) => {
      const mine = done.filter((k) => k.technicianId === t.id);
      const durations = mine.map(
        (k) =>
          (new Date(toISO(k.updatedAt)).getTime() - new Date(toISO(k.createdAt)).getTime()) /
          3_600_000
      );
      return {
        technicianId: t.id,
        fullName: t.fullName,
        completedCount: mine.length,
        avgCompletionHours:
          durations.length > 0
            ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
            : null,
      };
    })
  );
}
