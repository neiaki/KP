"use server";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { profiles, serviceTicketAudit, unitStatusAudit } from "@/db/schema";
import type { RepairStatus, UnitStatus } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  toISO,
  type ActionResult,
} from "./_helpers";

/**
 * Pembacaan audit trail (NFR-07).
 *
 * Penulisannya dilakukan trigger database, bukan kode di sini. File ini
 * hanya membaca, dan tidak menyediakan jalur tulis karena audit bersifat
 * append-only: tidak ada action yang bisa mengubah atau menghapus riwayat.
 */

export type UnitAuditEntry = {
  id: number;
  unitId: number;
  oldStatus: UnitStatus | null;
  newStatus: UnitStatus;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
};

export type TicketAuditEntry = {
  id: number;
  ticketId: number;
  oldStatus: RepairStatus | null;
  newStatus: RepairStatus;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
};

/**
 * Riwayat status satu unit. Admin dan staf boleh melihat; policy RLS
 * service_ticket_audit / unit_status_audit juga membatasi baris yang sampai.
 */
export async function listUnitAudit(
  unitId: number,
  limit = 50
): Promise<ActionResult<UnitAuditEntry[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const rows = await db
      .select({
        id: unitStatusAudit.id,
        unitId: unitStatusAudit.unitId,
        oldStatus: unitStatusAudit.oldStatus,
        newStatus: unitStatusAudit.newStatus,
        createdAt: unitStatusAudit.createdAt,
        actorName: profiles.fullName,
        actorRole: profiles.role,
      })
      .from(unitStatusAudit)
      .leftJoin(profiles, eq(unitStatusAudit.actorId, profiles.id))
      .where(eq(unitStatusAudit.unitId, unitId))
      .orderBy(desc(unitStatusAudit.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    return ok(
      rows.map((r) => ({
        id: r.id,
        unitId: r.unitId,
        oldStatus: r.oldStatus,
        newStatus: r.newStatus,
        actorName: r.actorName ?? null,
        actorRole: r.actorRole ?? null,
        createdAt: toISO(r.createdAt),
      }))
    );
  } catch {
    return fail("Riwayat audit unit tidak dapat dimuat.");
  }
}

/** Riwayat status satu tiket servis, untuk penelusuran perbaikan. */
export async function listTicketAudit(
  ticketId: number,
  limit = 50
): Promise<ActionResult<TicketAuditEntry[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  try {
    const rows = await db
      .select({
        id: serviceTicketAudit.id,
        ticketId: serviceTicketAudit.ticketId,
        oldStatus: serviceTicketAudit.oldStatus,
        newStatus: serviceTicketAudit.newStatus,
        createdAt: serviceTicketAudit.createdAt,
        actorName: profiles.fullName,
        actorRole: profiles.role,
      })
      .from(serviceTicketAudit)
      .leftJoin(profiles, eq(serviceTicketAudit.actorId, profiles.id))
      .where(eq(serviceTicketAudit.ticketId, ticketId))
      .orderBy(desc(serviceTicketAudit.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
    return ok(
      rows.map((r) => ({
        id: r.id,
        ticketId: r.ticketId,
        oldStatus: r.oldStatus,
        newStatus: r.newStatus,
        actorName: r.actorName ?? null,
        actorRole: r.actorRole ?? null,
        createdAt: toISO(r.createdAt),
      }))
    );
  } catch {
    return fail("Riwayat audit tiket tidak dapat dimuat.");
  }
}
