"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/config";
import {
  createTicketSchema,
  isAllowedTransition,
  ticketCodeSchema,
  updateTicketSchema,
  type CreateTicketInput,
  type UpdateTicketInput,
} from "@/lib/validations";
import type { Database } from "@/types/database";
import type { RepairStatus, ServiceTicket } from "@/types";
import { fail, ok, requireRole, toNumber, type ActionResult } from "./_helpers";

type TicketRow = {
  id: number;
  ticket_code: string;
  customer_id: string | null;
  technician_id: string | null;
  customer_name: string;
  customer_phone: string;
  device_model: string;
  device_name: string | null;
  imei_or_sn: string;
  issue_notes: string;
  problem_description: string | null;
  technician_notes: string | null;
  repair_status: RepairStatus;
  photo_urls: string[];
  sparepart_fee: unknown;
  labor_fee: unknown;
  total_fee: unknown;
  warranty_days: number;
  cost_breakdown: ServiceTicket["cost_breakdown"];
  created_at: string;
  updated_at: string;
};

function mapTicket(t: TicketRow): ServiceTicket {
  return {
    id: t.id,
    ticket_code: t.ticket_code,
    customer_id: t.customer_id,
    technician_id: t.technician_id,
    customer_name: t.customer_name,
    customer_phone: t.customer_phone,
    device_model: t.device_model,
    device_name: t.device_name ?? t.device_model,
    imei_or_sn: t.imei_or_sn,
    imei: t.imei_or_sn,
    issue_notes: t.issue_notes,
    problem_description: t.problem_description ?? t.issue_notes,
    technician_notes: t.technician_notes ?? undefined,
    repair_status: t.repair_status,
    photo_urls: t.photo_urls ?? [],
    sparepart_fee: toNumber(t.sparepart_fee),
    labor_fee: toNumber(t.labor_fee),
    total_fee: toNumber(t.total_fee),
    warranty_days: t.warranty_days,
    cost_breakdown: t.cost_breakdown ?? [],
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

/** Daftarkan tiket servis masuk (kasir/teknisi). Kode dibuat trigger DB. FR-B-01. */
export async function createTicket(raw: CreateTicketInput): Promise<ActionResult<ServiceTicket>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const parsed = createTicketSchema.safeParse(raw);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Input tiket tidak valid.");
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_tickets")
    .insert({
      customer_name: v.customerName,
      customer_phone: v.customerPhone,
      device_model: v.deviceModel,
      device_name: v.deviceName ?? v.deviceModel,
      imei_or_sn: v.imeiOrSn,
      issue_notes: v.issueNotes,
      problem_description: v.issueNotes,
      technician_id:
        v.technicianId ?? (guard.profile.role === "technician" ? guard.profile.id : null),
      photo_urls: v.photoUrls,
      sparepart_fee: 0,
      labor_fee: 0,
      total_fee: 0,
    })
    .select("*")
    .single();
  if (error || !data) return fail("Gagal membuat tiket: " + (error?.message ?? "unknown"));
  revalidatePath("/portal/service");
  return ok(mapTicket(data as TicketRow));
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
  const supabase = await createClient();
  const { data: current, error: curError } = await supabase
    .from("service_tickets")
    .select("repair_status,sparepart_fee,labor_fee")
    .eq("id", v.ticketId)
    .single();
  if (curError || !current) return fail("Tiket tidak ditemukan.");
  const from = current.repair_status as RepairStatus;
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
  const sparepart = v.sparepartFee ?? toNumber(current.sparepart_fee);
  const labor = v.laborFee ?? toNumber(current.labor_fee);
  const patch: Database["public"]["Tables"]["service_tickets"]["Update"] = {
    repair_status: v.repairStatus,
    sparepart_fee: sparepart,
    labor_fee: labor,
    total_fee: sparepart + labor,
  };
  if (v.technicianId !== undefined) patch.technician_id = v.technicianId;
  if (v.technicianNotes !== undefined) patch.technician_notes = v.technicianNotes;
  if (v.warrantyDays !== undefined) patch.warranty_days = v.warrantyDays;
  if (v.costBreakdown !== undefined) patch.cost_breakdown = v.costBreakdown;
  const { data, error } = await supabase
    .from("service_tickets")
    .update(patch)
    .eq("id", v.ticketId)
    .select("*")
    .single();
  if (error || !data) return fail("Gagal memperbarui tiket: " + (error?.message ?? "unknown"));
  revalidatePath("/portal/service");
  revalidatePath("/portal/dashboard");
  return ok(mapTicket(data as TicketRow));
}

/** Daftar tiket untuk meja kerja (filter status/teknisi opsional). */
export async function listTickets(opts?: {
  status?: RepairStatus;
  technicianId?: string;
  limit?: number;
}): Promise<ActionResult<ServiceTicket[]>> {
  const guard = await requireRole(["admin", "sales", "technician"]);
  if ("error" in guard) return fail(guard.error);
  const supabase = await createClient();
  let q = supabase
    .from("service_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(opts?.limit ?? 200);
  if (opts?.status) q = q.eq("repair_status", opts.status);
  if (opts?.technicianId) q = q.eq("technician_id", opts.technicianId);
  const { data, error } = await q;
  if (error) return fail("Gagal memuat tiket: " + error.message);
  return ok((data as TicketRow[]).map(mapTicket));
}

/**
 * Pelacakan mandiri TANPA login (halaman /[locale]/tracking).
 * Dieksekusi via service role tapi HANYA kolom aman yang dikembalikan:
 * tanpa customer_id, tanpa foto mentah berlebih. PRD Bab 7 poin 4.
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
  if (!isSupabaseConfigured()) {
    return fail("Backend Supabase belum dikonfigurasi. Coba lagi nanti.");
  }
  if (!isSupabaseAdminConfigured()) {
    return fail("Layanan pelacakan belum siap (service key belum diisi).");
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("service_tickets")
    .select(
      "ticket_code,device_model,repair_status,sparepart_fee,labor_fee,total_fee,warranty_days,created_at,updated_at"
    )
    .eq("ticket_code", parsed.data.toUpperCase())
    .single();
  if (error || !data) return fail("Tiket tidak ditemukan. Periksa lagi kode resinya.");
  return ok({
    ticket_code: data.ticket_code,
    device_model: data.device_model,
    repair_status: data.repair_status,
    sparepart_fee: toNumber(data.sparepart_fee),
    labor_fee: toNumber(data.labor_fee),
    total_fee: toNumber(data.total_fee),
    warranty_days: data.warranty_days,
    created_at: data.created_at,
    updated_at: data.updated_at,
  });
}
