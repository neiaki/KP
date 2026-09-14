import { formatIDR, formatDate } from "./utils";
import type { ServiceTicket } from "@/types";

/* Cetak nota lewat jendela print khusus agar pagination pas 1 halaman.
   window.print() langsung di halaman utama mencetak seluruh situs
   (plus halaman kosong), jadi setiap tombol cetak memakai helper ini. */

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const NOTA_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; background: #fff; }
  .nota { max-width: 72mm; margin: 0 auto; }
  .nota .center { text-align: center; }
  .nota h1 { font-size: 16px; margin-bottom: 2px; }
  .nota .sub { font-size: 11px; color: #333; }
  .nota hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
  .nota table { width: 100%; border-collapse: collapse; }
  .nota td { padding: 2px 0; vertical-align: top; }
  .nota td:last-child { text-align: right; font-weight: bold; }
  .nota .mono { font-family: "Courier New", monospace; }
  .nota .total td { font-size: 14px; padding-top: 6px; }
  .nota .foot { margin-top: 8px; font-size: 11px; text-align: center; }
`;

/* Cetak nota TANPA pindah tab: HTML nota ditulis ke iframe tersembunyi
   lalu dialog print dipanggil dari iframe tersebut. window.print()
   langsung di halaman utama mencetak seluruh situs (plus halaman kosong),
   jadi setiap tombol cetak memakai helper ini. */

let printFrame: HTMLIFrameElement | null = null;

function fallbackPopup(title: string, fullHtml: string) {
  const win = window.open("", "_blank", "width=720,height=800");
  if (!win) {
    window.print();
    return;
  }
  win.document.write(fullHtml);
  win.document.close();
}

function notaDocument(title: string, bodyHtml: string) {
  return (
    "<!DOCTYPE html><html lang=\"id\"><head><meta charset=\"utf-8\"><title>" +
    esc(title) +
    "</title><style>" +
    NOTA_CSS +
    "</style></head><body><div class=\"nota\">" +
    bodyHtml +
    "</div><scr" +
    "ipt>window.onload=function(){window.print();};</scr" +
    "ipt></body></html>"
  );
}

export function printNota(title: string, bodyHtml: string) {
  try {
    if (!printFrame || !printFrame.isConnected) {
      printFrame = document.createElement("iframe");
      printFrame.setAttribute("aria-hidden", "true");
      printFrame.setAttribute("tabindex", "-1");
      printFrame.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(printFrame);
    }
    const doc = printFrame.contentDocument;
    const win = printFrame.contentWindow;
    if (!doc || !win) {
      fallbackPopup(title, notaDocument(title, bodyHtml));
      return;
    }
    doc.open();
    doc.write(notaDocument(title, bodyHtml));
    doc.close();
    win.focus();
    window.setTimeout(() => {
      try {
        win.print();
      } catch {
        fallbackPopup(title, notaDocument(title, bodyHtml));
      }
    }, 60);
  } catch {
    fallbackPopup(title, notaDocument(title, bodyHtml));
  }
}

/* Nama lama, dipertahankan sebagai alias. */
export const openNotaPrintWindow = printNota;

function storeHead(storeName: string, address: string, phone: string) {
  return (
    "<div class=\"center\"><h1>" +
    esc(storeName) +
    "</h1><div class=\"sub\">" +
    esc(address) +
    "<br>" +
    esc(phone) +
    "</div></div><hr>"
  );
}

export function buildPosNotaHtml(params: {
  storeName: string;
  address: string;
  phone: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  unitModel: string;
  imei: string;
  warrantyMonths: number;
  tradeInModel?: string;
  tradeInDeduction?: number;
  paymentMethod: string;
  total: number;
}) {
  const tradeInRow =
    params.tradeInModel && (params.tradeInDeduction ?? 0) > 0
      ? "<tr><td>Potongan trade-in (" +
        esc(params.tradeInModel) +
        ")</td><td>-" +
        esc(formatIDR(params.tradeInDeduction ?? 0)) +
        "</td></tr>"
      : "";
  return (
    storeHead(params.storeName, params.address, params.phone) +
    "<div class=\"center\"><strong>NOTA PEMBELIAN</strong><br><span class=\"mono\">" +
    esc(params.invoiceNo) +
    " / " +
    esc(params.date) +
    "</span></div><hr>" +
    "<table>" +
    "<tr><td>Pelanggan</td><td>" +
    esc(params.customerName) +
    "</td></tr>" +
    "<tr><td>Unit</td><td>" +
    esc(params.unitModel) +
    "</td></tr>" +
    "<tr><td>IMEI</td><td class=\"mono\">" +
    esc(params.imei) +
    "</td></tr>" +
    "<tr><td>Garansi toko</td><td>" +
    esc(params.warrantyMonths) +
    " bulan</td></tr>" +
    tradeInRow +
    "<tr><td>Bayar via</td><td>" +
    esc(params.paymentMethod.toUpperCase()) +
    "</td></tr>" +
    "<tr class=\"total\"><td>TOTAL</td><td>" +
    esc(formatIDR(params.total)) +
    "</td></tr>" +
    "</table><hr>" +
    "<p class=\"foot\">Simpan nota ini sebagai bukti garansi.<br>IMEI di unit wajib sama dengan di nota.</p>"
  );
}

export function buildServiceNotaHtml(params: {
  ticket: ServiceTicket;
  storeName: string;
  address: string;
  phone: string;
}) {
  const ticket = params.ticket;
  const imei = ticket.imei_or_sn || ticket.imei || "-";
  const costs = (ticket.cost_breakdown || [])
    .map(
      (c) =>
        "<tr><td>" +
        esc(c.name) +
        "</td><td>" +
        esc(formatIDR(c.cost)) +
        "</td></tr>"
    )
    .join("");
  return (
    storeHead(params.storeName, params.address, params.phone) +
    "<div class=\"center\"><strong>NOTA TERIMA SERVIS</strong><br><span class=\"mono\">" +
    esc(ticket.ticket_code) +
    " / " +
    esc(formatDate(ticket.created_at)) +
    "</span></div><hr>" +
    "<table>" +
    "<tr><td>Pelanggan</td><td>" +
    esc(ticket.customer_name) +
    "</td></tr>" +
    "<tr><td>Unit</td><td>" +
    esc(ticket.device_model) +
    "</td></tr>" +
    "<tr><td>IMEI/SN</td><td class=\"mono\">" +
    esc(imei) +
    "</td></tr>" +
    "<tr><td>Keluhan</td><td>" +
    esc(ticket.issue_notes || ticket.problem_description || "-") +
    "</td></tr>" +
    costs +
    "<tr class=\"total\"><td>TOTAL</td><td>" +
    esc(formatIDR(ticket.total_fee)) +
    "</td></tr>" +
    "<tr><td>Garansi servis</td><td>" +
    esc(ticket.warranty_days || 30) +
    " hari</td></tr>" +
    "</table><hr>" +
    "<p class=\"foot\">Tunjukkan kode nota untuk mengambil unit.<br>Lacak progres di halaman Lacak Servis.</p>"
  );
}

export function buildWarrantyCardHtml(params: {
  storeName: string;
  address: string;
  phone: string;
  buyerName: string;
  items: Array<{
    brandModel: string;
    imei: string;
    purchaseDate: string;
    warrantyMonths: number;
    active: boolean;
  }>;
}) {
  const rows = params.items
    .map(
      (it) =>
        "<tr><td>" +
        esc(it.brandModel) +
        "<br><span class=\"mono\">" +
        esc(it.imei) +
        "</span><br>Beli " +
        esc(formatDate(it.purchaseDate)) +
        " · Garansi " +
        esc(it.warrantyMonths) +
        " bln · " +
        (it.active ? "AKTIF" : "HABIS") +
        "</td></tr>"
    )
    .join("");
  return (
    storeHead(params.storeName, params.address, params.phone) +
    "<div class=\"center\"><strong>KARTU GARANSI</strong><br>" +
    esc(params.buyerName) +
    "</div><hr>" +
    "<table>" +
    rows +
    "</table><hr>" +
    "<p class=\"foot\">Klaim di konter dengan membawa nota dan unit.<br>Segel toko yang rusak membatalkan garansi.</p>"
  );
}
