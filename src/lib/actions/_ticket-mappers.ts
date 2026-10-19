// Adapter Drizzle/Supabase ke satu pemetaan tiket domain.
// Modul ini tidak memakai alias bundler agar dapat diuji langsung oleh Node.
import type { ServiceTicketRow } from "../../db/schema.ts";
import type { RepairStatus, ServiceCostItem, ServiceTicket } from "../../types/index.ts";
import { toISO, toNumber } from "./_value-mappers.ts";

type SupabaseServiceTicketRow = {
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
  photo_urls: string[] | null;
  sparepart_fee: unknown;
  labor_fee: unknown;
  total_fee: unknown;
  warranty_days: number;
  cost_breakdown: ServiceCostItem[] | null;
  created_at: string;
  updated_at: string;
  picked_up_at: string | null;
};

type NormalizedServiceTicketRow = {
  id: number;
  ticketCode: string;
  customerId: string | null;
  technicianId: string | null;
  customerName: string;
  customerPhone: string;
  deviceModel: string;
  deviceName: string | null;
  imeiOrSn: string;
  issueNotes: string;
  problemDescription: string | null;
  technicianNotes: string | null;
  repairStatus: RepairStatus;
  photoUrls: string[] | null;
  sparepartFee: unknown;
  laborFee: unknown;
  totalFee: unknown;
  warrantyDays: number;
  costBreakdown: ServiceCostItem[] | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  pickedUpAt: Date | string | null;
};

function mapNormalizedServiceTicket(row: NormalizedServiceTicketRow): ServiceTicket {
  return {
    id: row.id,
    ticket_code: row.ticketCode,
    customer_id: row.customerId,
    technician_id: row.technicianId,
    customer_name: row.customerName,
    customer_phone: row.customerPhone,
    device_model: row.deviceModel,
    device_name: row.deviceName ?? row.deviceModel,
    imei_or_sn: row.imeiOrSn,
    imei: row.imeiOrSn,
    issue_notes: row.issueNotes,
    problem_description: row.problemDescription ?? row.issueNotes,
    technician_notes: row.technicianNotes ?? undefined,
    repair_status: row.repairStatus,
    photo_urls: row.photoUrls ?? [],
    sparepart_fee: toNumber(row.sparepartFee),
    labor_fee: toNumber(row.laborFee),
    total_fee: toNumber(row.totalFee),
    warranty_days: row.warrantyDays,
    cost_breakdown: row.costBreakdown ?? [],
    created_at: toISO(row.createdAt),
    updated_at: toISO(row.updatedAt),
    picked_up_at: row.pickedUpAt ? toISO(row.pickedUpAt) : null,
  };
}

export function mapDrizzleServiceTicket(row: ServiceTicketRow): ServiceTicket {
  return mapNormalizedServiceTicket({
    id: row.id,
    ticketCode: row.ticketCode,
    customerId: row.customerId,
    technicianId: row.technicianId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deviceModel: row.deviceModel,
    deviceName: row.deviceName,
    imeiOrSn: row.imeiOrSn,
    issueNotes: row.issueNotes,
    problemDescription: row.problemDescription,
    technicianNotes: row.technicianNotes,
    repairStatus: row.repairStatus,
    photoUrls: row.photoUrls,
    sparepartFee: row.sparepartFee,
    laborFee: row.laborFee,
    totalFee: row.totalFee,
    warrantyDays: row.warrantyDays,
    costBreakdown: row.costBreakdown,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pickedUpAt: row.pickedUpAt,
  });
}

export function mapSupabaseServiceTicket(row: SupabaseServiceTicketRow): ServiceTicket {
  return mapNormalizedServiceTicket({
    id: row.id,
    ticketCode: row.ticket_code,
    customerId: row.customer_id,
    technicianId: row.technician_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    deviceModel: row.device_model,
    deviceName: row.device_name,
    imeiOrSn: row.imei_or_sn,
    issueNotes: row.issue_notes,
    problemDescription: row.problem_description,
    technicianNotes: row.technician_notes,
    repairStatus: row.repair_status,
    photoUrls: row.photo_urls,
    sparepartFee: row.sparepart_fee,
    laborFee: row.labor_fee,
    totalFee: row.total_fee,
    warrantyDays: row.warranty_days,
    costBreakdown: row.cost_breakdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pickedUpAt: row.picked_up_at,
  });
}
