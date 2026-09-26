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

type TicketUpdateResult =
  | { error: string; updated?: never }
  | { error?: never; updated: ServiceTicketRow };

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
  try {
    // ticketCode dikosongkan: kolomnya tidak punya DEFAULT di DB, jadi nilai
    // kosong dikirim eksplisit dan trigger SQL yang menggantinya dengan
    // SRV-YYYYMMDD-XXXX secara atomik.
    const [created] = await db
      .insert(serviceTickets)
      .values({
        ticketCode: "",
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
  } catch {
    return fail("Gagal membuat tiket servis. Coba lagi.");
  }
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

  try {
    const result = (await db.transaction(async (tx) => {
      // Lock baris sampai update selesai. Dua teknisi tidak dapat membaca
      // status lama lalu menimpa perubahan satu sama lain.
      const [current] = await tx
        .select({
          status: serviceTickets.repairStatus,
          sparepart: serviceTickets.sparepartFee,
          labor: serviceTickets.laborFee,
        })
        .from(serviceTickets)
        .where(eq(serviceTickets.id, v.ticketId))
        .for("update");
      if (!current) return { error: "Tiket tidak ditemukan." } as const;

      const from = current.status as RepairStatus;
      if (v.repairStatus !== from && !isAllowedTransition(from, v.repairStatus)) {
        return {
          error: `Transisi ${from} ke ${v.repairStatus} tidak diizinkan. Ikuti alur reparasi resmi.`,
        } as const;
      }
      // Hanya teknisi/admin yang boleh mengubah biaya dan status pengerjaan.
      if (
        guard.profile.role === "sales" &&
        (v.sparepartFee !== undefined || v.laborFee !== undefined || v.repairStatus !== from)
      ) {
        return {
          error: "Peran sales hanya boleh mencatat tiket masuk, bukan biaya/status pengerjaan.",
        } as const;
      }

      const sparepart = v.sparepartFee ?? toNumber(current.sparepart);
      const labor = v.laborFee ?? toNumber(current.labor);
      const [updated] = await tx
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
      if (!updated) return { error: "Tiket tidak ditemukan." } as const;
      return { updated } as const;
    })) as TicketUpdateResult;
    if (result.error || !result.updated) {
      return fail(result.error ?? "Tiket tidak ditemukan.");
    }
    revalidatePath("/portal/service");
    revalidatePath("/portal/dashboard");
    return ok(mapTicket(result.updated));
  } catch {
    return fail("Gagal memperbarui tiket servis. Coba lagi.");
  }
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
  try {
    const rows = await db
      .select()
      .from(serviceTickets)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(serviceTickets.updatedAt))
      .limit(opts?.limit ?? 200);
    return ok(rows.map(mapTicket));
  } catch {
    return fail("Gagal memuat tiket servis. Coba lagi.");
  }
}

/**
 * Pelacakan mandiri TANPA login (halaman /[locale]/tracking).
 * Hanya status, model, dan identifier masked yang dikembalikan. Data PII,
 * keluhan, foto, dan biaya tidak boleh keluar dari boundary publik.
 * PRD Bab 7 poin 4.
 */
type PublicTicketRow = {
  ticketCode: string;
  deviceModel: string;
  imeiOrSn: string;
  repairStatus: RepairStatus;
  warrantyDays: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type PublicTrackingResult = {
  ticket_code: string;
  device_model: string;
  imei_or_sn: string;
  repair_status: RepairStatus;
  warranty_days: number;
  created_at: string;
  updated_at: string;
};

export async function trackTicketPublic(rawCode: string): Promise<
  ActionResult<PublicTrackingResult>
> {
  const parsed = ticketCodeSchema.safeParse(rawCode);
  if (!parsed.success) return fail("Format kode tiket salah. Contoh: SRV-20260913-0001.");
  const db = getDb();
  if (!db) return fail("Backend Supabase belum dikonfigurasi. Coba lagi nanti.");
  let t: PublicTicketRow | undefined;
  try {
    [t] = await db
      .select({
        ticketCode: serviceTickets.ticketCode,
        deviceModel: serviceTickets.deviceModel,
        imeiOrSn: serviceTickets.imeiOrSn,
        repairStatus: serviceTickets.repairStatus,
        warrantyDays: serviceTickets.warrantyDays,
        createdAt: serviceTickets.createdAt,
        updatedAt: serviceTickets.updatedAt,
      })
      .from(serviceTickets)
      .where(eq(serviceTickets.ticketCode, parsed.data.toUpperCase()));
  } catch {
    return fail("Layanan pelacakan sedang tidak dapat dihubungi. Coba lagi sebentar.");
  }
  if (!t) return fail("Tiket tidak ditemukan. Periksa lagi kode resinya.");
  return ok({
    ticket_code: t.ticketCode,
    device_model: t.deviceModel,
    imei_or_sn: t.imeiOrSn ? `****${t.imeiOrSn.slice(-4)}` : "",
    repair_status: t.repairStatus,
    warranty_days: t.warrantyDays,
    created_at: toISO(t.createdAt),
    updated_at: toISO(t.updatedAt),
  });
}
