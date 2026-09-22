"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { serviceTickets, type ServiceTicketRow } from "@/db/schema";
import {
  createTicketSchema,
  isAllowedTransition,
  ticketCodeSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "@/lib/validations";
import type { RepairStatus, ServiceTicket } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  toISO,
  toNumber,
  type ActionResult,
} from "./_helpers";

function mapTicket(t: ServiceTicketRow): ServiceTicket {
  return {
    id: t.id,
    ticket_code: t.ticketCode,
    customer_id: t.customerId,
    technician_id: t.technicianId,
    customer_name: t.customerName,
    customer_phone: t.customerPhone,
    device_model: t.deviceModel,
    device_name: t.deviceName ?? t.deviceModel,
    imei_or_sn: t.imeiOrSn,
    imei: t.imeiOrSn,
    issue_notes: t.issueNotes,
    problem_description: t.problemDescription ?? t.issueNotes,
    technician_notes: t.technicianNotes ?? undefined,
    repair_status: t.repairStatus,
    photo_urls: t.photoUrls ?? [],
    sparepart_fee: toNumber(t.sparepartFee),
    labor_fee: toNumber(t.laborFee),
    total_fee: toNumber(t.totalFee),
    warranty_days: t.warrantyDays,
    cost_breakdown: t.costBreakdown ?? [],
    created_at: toISO(t.createdAt),
    updated_at: toISO(t.updatedAt),
  };
}

/** Daftarkan tiket servis masuk (kasir/teknisi). Kode dibuat trigger DB. FR-B-01. */
export async function createTicket(raw: CreateTicketInput): Promise<ActionResult<ServiceTicket>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = createTicketSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input tiket tidak valid.");
  const v = parsed.data;
  const db = getDb();
  if (!db) return backendOffline();
  // ticketCode tidak diisi: biarkan default '' agar trigger SQL membuat
  // SRV-YYYYMMDD-XXXX secara atomik.
  const [created] = await db
    .insert(serviceTickets)
    .values({
      customerName: v.customerName,
      customerPhone: v.customerPhone,
      deviceModel: v.deviceModel,
      deviceName: v.deviceName ?? v.deviceModel,
      imeiOrSn: v.imeiOrSn,
      issueNotes: v.issueNotes,
      problemDescription: v.issueNotes,
      technicianId:
        v.technicianId ?? (guard.profile.role === "technician" ? guard.profile.id : null),
      photoUrls: v.photoUrls,
    })
    .returning();
  if (!created) return fail("Gagal membuat tiket.");
  revalidatePath("/portal/service");
  return ok(mapTicket(created));
}

/**
 * Update progres + biaya tiket. Transisi status divalidasi sesuai REPAIR_FLOW (FR-B-02);
 * total_fee selalu = sparepart + labor agar konsisten (FR-B-03).
 */
export async function updateTicket(raw: UpdateTicketInput): Promise<ActionResult<ServiceTicket>> {
  const guard = await requireRole(["admin", "technician", "sales"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = updateTicketSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input update tidak valid.");
  const v = parsed.data;
  const db = getDb();
  if (!db) return backendOffline();
  const [current] = await db
    .select({
      status: serviceTickets.repairStatus,
      sparepart: serviceTickets.sparepartFee,
      labor: serviceTickets.laborFee,
    })
    .from(serviceTickets)
    .where(eq(serviceTickets.id, v.ticketId));
  if (!current) return fail("Tiket tidak ditemukan.");
  const from = current.status as RepairStatus;
  if (v.repairStatus !== from && !isAllowedTransition(from, v.repairStatus)) {
    return fail(`Transisi ${from} ke ${v.repairStatus} tidak diizinkan. Ikuti alur reparasi resmi.`);
  }
  // Hanya teknisi/admin yang boleh mengubah biaya dan status pengerjaan.
  if (
    guard.profile.role === "sales" &&
    (v.sparepartFee !== undefined || v.laborFee !== undefined || v.repairStatus !== from)
  ) {
    return fail("Peran sales hanya boleh mencatat tiket masuk, bukan biaya/status pengerjaan.");
  }
  const sparepart = v.sparepartFee ?? toNumber(current.sparepart);
  const labor = v.laborFee ?? toNumber(current.labor);
  const [updated] = await db
    .update(serviceTickets)
    .set({
      repairStatus: v.repairStatus,
      sparepartFee: String(sparepart),
      laborFee: String(labor),
      totalFee: String(sparepart + labor),
      ...(v.technicianId !== undefined ? { technicianId: v.technicianId } : {}),
      ...(v.technicianNotes !== undefined ? { technicianNotes: v.technicianNotes } : {}),
      ...(v.warrantyDays !== undefined ? { warrantyDays: v.warrantyDays } : {}),
      ...(v.costBreakdown !== undefined ? { costBreakdown: v.costBreakdown } : {}),
    })
    .where(eq(serviceTickets.id, v.ticketId))
    .returning();
  if (!updated) return fail("Tiket tidak ditemukan.");
  revalidatePath("/portal/service");
  revalidatePath("/portal/dashboard");
  return ok(mapTicket(updated));
}

/** Daftar tiket untuk meja kerja (filter status/teknisi opsional). */
export async function listTickets(opts?: {
  status?: RepairStatus;
  technicianId?: string;
  limit?: number;
}): Promise<ActionResult<ServiceTicket[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const db = getDb();
  if (!db) return backendOffline();
  // Pola yang sama seperti inventory: kumpulkan filter yang diisi,
  // .where(undefined) artinya tanpa filter.
  const filters = [
    opts?.status ? eq(serviceTickets.repairStatus, opts.status) : undefined,
    opts?.technicianId ? eq(serviceTickets.technicianId, opts.technicianId) : undefined,
  ].filter((c) => c !== undefined);
  const rows = await db
    .select()
    .from(serviceTickets)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(serviceTickets.updatedAt))
    .limit(opts?.limit ?? 200);
  return ok(rows.map(mapTicket));
}

/**
 * Pelacakan mandiri TANPA login (halaman /[locale]/tracking).
 * Hanya kolom aman yang dipilih (tanpa customer_id); koneksi Drizzle memang
 * melewati RLS, jadi pembatasan kolom di sini adalah pengamannya.
 * PRD Bab 7 poin 4.
 */
export async function trackTicketPublic(rawCode: string): Promise<
  ActionResult<{
    ticket_code: string;
    device_model: string;
    repair_status: RepairStatus;
    sparepart_fee: number;
    labor_fee: number;
    total_fee: number;
    warranty_days: number;
    created_at: string;
    updated_at: string;
  }>
> {
  const parsed = ticketCodeSchema.safeParse(rawCode);
  if (!parsed.success) return fail("Format kode tiket salah. Contoh: SRV-20260913-0001.");
  const db = getDb();
  if (!db) return fail("Backend Supabase belum dikonfigurasi. Coba lagi nanti.");
  const [t] = await db
    .select({
      ticketCode: serviceTickets.ticketCode,
      deviceModel: serviceTickets.deviceModel,
      repairStatus: serviceTickets.repairStatus,
      sparepartFee: serviceTickets.sparepartFee,
      laborFee: serviceTickets.laborFee,
      totalFee: serviceTickets.totalFee,
      warrantyDays: serviceTickets.warrantyDays,
      createdAt: serviceTickets.createdAt,
      updatedAt: serviceTickets.updatedAt,
    })
    .from(serviceTickets)
    .where(eq(serviceTickets.ticketCode, parsed.data.toUpperCase()));
  if (!t) return fail("Tiket tidak ditemukan. Periksa lagi kode resinya.");
  return ok({
    ticket_code: t.ticketCode,
    device_model: t.deviceModel,
    repair_status: t.repairStatus,
    sparepart_fee: toNumber(t.sparepartFee),
    labor_fee: toNumber(t.laborFee),
    total_fee: toNumber(t.totalFee),
    warranty_days: t.warrantyDays,
    created_at: toISO(t.createdAt),
    updated_at: toISO(t.updatedAt),
  });
}
