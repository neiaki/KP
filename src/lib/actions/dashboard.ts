"use server";

import { createClient } from "@/lib/supabase/server";
import { fail, ok, requireRole, toNumber, type ActionResult } from "./_helpers";

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
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const { data: txs, error: txError } = await supabase
    .from("transactions")
    .select("final_payment,created_at")
    .gte("created_at", startOfDay(since).toISOString())
    .order("created_at", { ascending: true });
  if (txError) return fail("Gagal memuat ringkasan: " + txError.message);
  const { count: activeTickets, error: ticketError } = await supabase
    .from("service_tickets")
    .select("id", { count: "exact", head: true })
    .not("repair_status", "in", "(completed,picked_up,cancelled)");
  if (ticketError) return fail("Gagal memuat tiket aktif: " + ticketError.message);
  const buckets = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  let totalRevenue = 0;
  for (const t of txs ?? []) {
    const day = new Date(t.created_at).toISOString().slice(0, 10);
    const amount = toNumber(t.final_payment);
    totalRevenue += amount;
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + amount);
  }
  return ok({
    totalRevenue,
    transactionCount: txs?.length ?? 0,
    activeTicketCount: activeTickets ?? 0,
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
  const supabase = await createClient();
  const { data: products, error: pError } = await supabase
    .from("products")
    .select("id,brand,model_name")
    .eq("is_active", true);
  if (pError) return fail("Gagal memuat produk: " + pError.message);
  const { data: units, error: uError } = await supabase
    .from("inventory_units")
    .select("product_id")
    .eq("status", "available");
  if (uError) return fail("Gagal memuat stok: " + uError.message);
  const counts = new Map<number, number>();
  for (const u of units ?? []) counts.set(u.product_id, (counts.get(u.product_id) ?? 0) + 1);
  return ok(
    (products ?? [])
      .map((p) => ({
        productId: p.id,
        brand: p.brand,
        modelName: p.model_name,
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
  const supabase = await createClient();
  const { data: techs, error: tError } = await supabase
    .from("profiles")
    .select("id,full_name")
    .eq("role", "technician");
  if (tError) return fail("Gagal memuat teknisi: " + tError.message);
  const { data: tickets, error: tkError } = await supabase
    .from("service_tickets")
    .select("technician_id,created_at,updated_at")
    .eq("repair_status", "completed");
  if (tkError) return fail("Gagal memuat tiket: " + tkError.message);
  return ok(
    (techs ?? []).map((t) => {
      const done = (tickets ?? []).filter((k) => k.technician_id === t.id);
      const durations = done.map(
        (k) => (new Date(k.updated_at).getTime() - new Date(k.created_at).getTime()) / 3_600_000
      );
      return {
        technicianId: t.id,
        fullName: t.full_name,
        completedCount: done.length,
        avgCompletionHours:
          durations.length > 0
            ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
            : null,
      };
    })
  );
}
