"use client";

import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types";

/* Badge peran di header tiap halaman portal.
   Sebelumnya tiap halaman menulis label peran secara hardcoded
   ("ADMIN ROLE", "TECHNICIAN ROLE", "ADMIN EXCLUSIVE"). Akibatnya sales
   dan teknisi yang membuka halaman dashboard atau produk diberi label
   "admin" padahal mereka bukan admin, dan penjelasannya berbohong.

   Sekarang label diambil dari currentRole di store, jadi selalu cocok dengan
   sesi yang benar-benar sedang masuk. */

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Khusus Admin",
  sales: "Peran Sales",
  technician: "Peran Teknisi",
  customer: "Peran Pelanggan",
};

/* Badge di sidebar memakai bentuk lebih pendek karena ruangnya sempit. */
export const ROLE_LABEL_SHORT: Record<UserRole, string> = {
  admin: "Admin",
  sales: "Sales",
  technician: "Teknisi",
  customer: "Pelanggan",
};

/* admin dan customer memakai warna aksen yang sama supaya tidak ada warna
   baru; sales dan technisi tetap memakai warna status yang sudah ada. */
function variantFor(role: UserRole) {
  if (role === "sales") return "success" as const;
  if (role === "technician") return "warning" as const;
  return "info" as const;
}

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge variant={variantFor(role)} className="font-mono text-xs">
      {ROLE_LABEL[role]}
    </Badge>
  );
}
