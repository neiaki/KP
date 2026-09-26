"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { serviceTickets, type ServiceTicketRow } from "@/db/schema";
import {
  TICKET_CODE_EXAMPLE,
  createTicketSchema,
  isAllowedTransition,
  ticketCodeSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "@/lib/validations";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { RepairStatus, ServiceTicket } from "@/types";
import {
  backendOffline,
  fail,
  ok,
  requireRole,
  setAuditActor,
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
    // SRV-YYYYMMDD-XXXXXXXX secara atomik.
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
      // Aktor ditulis ke transaction-local supaya trigger audit tahu siapa yang
      // mengubah status tiket (NFR-07). Harus di dalam transaction yang sama.
      await setAuditActor(tx, guard.profile.id);
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

/**
 * Lacak servis tanpa login. Endpoint ini terbuka untuk publik, jadi kuota
 * ditegakkan per IP dan juga global. Tanpa ini, siapa pun bisa menyapu seluruh
 * kode resi satu tanggal hanya dengan menebak.
 */
const TRACKING_PER_IP_LIMIT = 10;
const TRACKING_PER_IP_WINDOW_MS = 60_000;
/** Lapisan kedua untuk penyerang yang memakai banyak IP berbeda. */
const TRACKING_GLOBAL_LIMIT = 200;
const TRACKING_GLOBAL_WINDOW_MS = 60_000;

/**
 * Pembaca IP pengunjung untuk menjadi kunci rate limit. Traefik di Coolify
 * selalu menyetel X-Forwarded-For, jadi entri pertama adalah klien asli. Kalau
 * headernya hilang, semua permintaan digabung ke satu kunci global, yang
 * membuat batasnya lebih ketat, bukan lebih longgar.
 */
async function getTrackingClientId(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

export async function trackTicketPublic(rawCode: string): Promise<
  ActionResult<PublicTrackingResult>
> {
  const clientId = await getTrackingClientId();
  const perIp = consumeRateLimit(
    `track-ip:${clientId}`,
    TRACKING_PER_IP_LIMIT,
    TRACKING_PER_IP_WINDOW_MS
  );
  if (!perIp.allowed) {
    return fail(
      `Terlalu banyak percobaan. Coba lagi dalam ${perIp.retryAfterSeconds} detik.`
    );
  }
  const global = consumeRateLimit(
    "track-global",
    TRACKING_GLOBAL_LIMIT,
    TRACKING_GLOBAL_WINDOW_MS
  );
  if (!global.allowed) {
    return fail("Layanan sedang sibuk. Coba lagi sebentar.");
  }

  const parsed = ticketCodeSchema.safeParse(rawCode);
  if (!parsed.success) {
    return fail(`Format kode tiket salah. Contoh: ${TICKET_CODE_EXAMPLE}.`);
  }
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
      .where(eq(serviceTickets.ticketCode, parsed.data));
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
