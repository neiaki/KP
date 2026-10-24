// Pemetaan hasil baca portal dipisah dari pengambilan data dan kebijakan query.
import type {
  InventoryUnit,
  Product,
  Profile,
  ServiceTicket,
  StoreSettings,
  Transaction,
} from "@/types";
import { toISO, toNumber } from "./_value-mappers";
import {
  mapTransaction,
  type TransactionRow,
} from "./_mappers";
import { mapSupabaseServiceTicket } from "./_ticket-mappers";

export type PortalSnapshot = {
  profile: Profile;
  storeSettings: StoreSettings;
  products: Product[];
  inventoryUnits: InventoryUnit[];
  transactions: Transaction[];
  serviceTickets: ServiceTicket[];
  profiles: Profile[];
};

type ProductDbRow = {
  id: number;
  brand: string;
  model_name: string;
  specs: string;
  default_price: unknown;
  image_url: string;
  official_images: string[] | null;
  second_images: string[] | null;
  created_at: string;
};

type ProfileDbRow = {
  id: string;
  full_name: string;
  role: Profile["role"];
  phone_number: string;
  username: string;
  created_at: string;
};

type ServiceTicketDbRow = Parameters<typeof mapSupabaseServiceTicket>[0];

function mapProduct(row: ProductDbRow): Product {
  return {
    id: Number(row.id),
    brand: row.brand,
    model_name: row.model_name,
    specs: row.specs,
    default_price: toNumber(row.default_price),
    image_url: row.image_url,
    official_images: row.official_images ?? [],
    second_images: row.second_images ?? [],
    created_at: toISO(row.created_at),
  };
}

function mapProfile(row: ProfileDbRow): Profile {
  return {
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    phone_number: row.phone_number,
    username: row.username,
    created_at: toISO(row.created_at),
  };
}

/**
 * Bentuk snapshot dari row yang sudah dibaca lewat query sesuai peran.
 * `inventoryUnits`, `transactions`, dan `serviceTicketRows` harus sudah
 * dibatasi oleh caller memakai policy/RLS yang sesuai dengan profil.
 */
export function assemblePortalSnapshot(input: {
  profile: Profile;
  storeSettings: StoreSettings;
  productRows: ProductDbRow[];
  inventoryUnits: InventoryUnit[];
  transactionRows: TransactionRow[];
  serviceTicketRows: ServiceTicketDbRow[];
  profileRows: ProfileDbRow[];
}): PortalSnapshot {
  const isCustomer = input.profile.role === "customer";
  // Email pelanggan adalah alamat sintetis internal yang dipakai Supabase Auth.
  // Jangan pernah mengirimkannya ke browser pelanggan; identitas login mereka
  // adalah username + nomor HP, dan email itu tidak boleh muncul di UI mana pun.
  const profile: Profile = { ...input.profile };
  if (isCustomer) delete profile.email;

  return {
    profile,
    storeSettings: input.storeSettings,
    products: input.productRows.map(mapProduct),
    inventoryUnits: input.inventoryUnits,
    transactions: input.transactionRows.map((row) => mapTransaction(row, !isCustomer)),
    serviceTickets: input.serviceTicketRows.map(mapSupabaseServiceTicket),
    profiles: isCustomer ? [profile] : input.profileRows.map(mapProfile),
  };
}
