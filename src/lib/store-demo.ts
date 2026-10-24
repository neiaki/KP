/*
 * Mesin mode demo (localStorage) untuk useAtCellStore.
 *
 * Modul ini murni: tidak memakai hooks, tidak menyentuh jaringan, dan tidak
 * mengimpor Server Action apa pun. Isinya adalah cabang `else` dari setiap
 * mutasi di src/lib/store.ts yang dipindahkan ke sini tanpa mengubah satu
 * pun perilaku: kunci localStorage yang sama, ID dari Date.now() yang sama,
 * dan pesan error yang sama persis.
 *
 * Kenapa dipisah: src/lib/store.ts sebelumnya memuat dua aplikasi dalam
 * satu berkas, mode live (Supabase) dan mode demo (localStorage), dengan
 * belasan `if (liveBackendEnabled)`. Akibatnya bundle production yang
 * dikirim ke setiap pengunjung ikut memuat seluruh data mock dan seluruh
 * jalur demo, padahal tidak satu pun yang pernah berjalan di produksi.
 * Setelah pemisahan, store.ts memanggil modul ini lewat import() dinamis
 * (loadDemoModule), jadi bundler memecahnya ke chunk terpisah yang hanya
 * diunduh saat mode demo benar-benar aktif. store.ts tetap tidak menyentuh
 * localStorage maupun data mock secara langsung; tests/store-demo.test.ts
 * mengunci bentuk impor itu, dan kembalinya satu impor statis akan
 * menggagalkan test sebelum datanya ikut ke bundle pengunjung.
 *
 * Ekstensi .ts ditulis eksplisit supaya modul ini bisa diimpor test node
 * tanpa Next.js, sama seperti src/db/client.ts. Runner test tidak bisa
 * resolve alias "@/", jadi semua impor runtime di sini relatif.
 */

import type { Dispatch, SetStateAction } from "react";
import {
  initialInventoryUnits,
  initialProducts,
  initialProfiles,
  initialServiceTickets,
  initialStoreSettings,
  initialTransactions,
} from "./mock-data.ts";
import {
  generateTicketSuffix,
  IMEI_PATTERN,
  isAllowedTransition,
  registerUnitsSchema,
} from "./validations.ts";
import { finalPaymentAmount, secondHandSellingPrice } from "./pricing.ts";
import type {
  InventoryUnit,
  PaymentMethod,
  Product,
  Profile,
  ServiceTicket,
  StoreSettings,
  TradeInRecord,
  Transaction,
  UnitCondition,
  UnitStatus,
  UserRole,
} from "@/types";

export type DemoSetter<T> = Dispatch<SetStateAction<T>>;

/*
 * Nilai awal state untuk mode demo.
 *
 * Objek ini satu-satunya yang boleh menyentuh initial* dari mock-data di
 * luar modul ini. src/lib/store.ts memakainya sebagai argumen demoFallback
 * untuk resolveSeed dan useState, jadi tidak ada lagi impor mock-data di
 * sana. Kalau suatu hari ada impor mock-data baru di jalur live, test di
 * tests/store-demo.test.ts akan menangkapnya sebelum bundle membesar lagi.
 */
export const demoInitialState = {
  role: "admin" as UserRole,
  profile: (initialProfiles[0] ?? null) as Profile | null,
  storeSettings: initialStoreSettings,
  products: initialProducts,
  inventoryUnits: initialInventoryUnits,
  transactions: initialTransactions,
  serviceTickets: initialServiceTickets,
  profiles: initialProfiles,
};

// Helper untuk local storage persistence. Data live tidak pernah ditulis ke
// localStorage karena browser adalah cache, bukan sumber kebenaran.
export const DATA_VERSION = "2";
const VERSION_KEY = "atcell_data_version";
export const STORAGE_KEYS = {
  CURRENT_ROLE: "atcell_current_role",
  STORE_SETTINGS: "atcell_store_settings",
  PRODUCTS: "atcell_products",
  INVENTORY: "atcell_inventory_units",
  TRANSACTIONS: "atcell_transactions",
  TICKETS: "atcell_service_tickets",
  PROFILES: "atcell_profiles",
} as const;

export function clearLocalData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

export type DemoStateSetters = {
  setCurrentRole: DemoSetter<UserRole>;
  setCurrentProfile: DemoSetter<Profile | null>;
  setStoreSettings: DemoSetter<StoreSettings>;
  setProducts: DemoSetter<Product[]>;
  setInventoryUnits: DemoSetter<InventoryUnit[]>;
  setTransactions: DemoSetter<Transaction[]>;
  setServiceTickets: DemoSetter<ServiceTicket[]>;
  setProfiles: DemoSetter<Profile[]>;
  setMounted: DemoSetter<boolean>;
};

/**
 * Baca seluruh state demo dari localStorage, atau tulis bawaan kalau
 * kuncinya belum ada.
 *
 * Dipanggil sekali dari useEffect di src/lib/store.ts, di dalam
 * requestAnimationFrame. State awal store sengaja kosong supaya bentuknya
 * sama dengan mode live, jadi di sinilah isi mode demo ditentukan:
 *
 * - Kalau versi data berubah, seluruh kunci lama dibuang dulu supaya bentuk
 *   lama tidak terbaca sebagai bentuk baru.
 * - Kunci yang hilang atau isinya rusak diisi data bawaan lalu ditulis
 *   kembali, jadi pengguna lama tidak melihat layar kosong permanen dan
 *   kunjungan pertama langsung punya data yang bisa diubah.
 * - currentProfile diisi dari daftar profiles yang cocok dengan role,
 *   sehingga portal demo punya profil aktif tanpa menunggu aksi pengguna.
 */
export type DemoHydrateSetters = DemoStateSetters;

export function hydrateDemoFromLocalStorage(setters: DemoHydrateSetters) {
  const {
    setCurrentRole,
    setCurrentProfile,
    setStoreSettings,
    setProducts,
    setInventoryUnits,
    setTransactions,
    setServiceTickets,
    setProfiles,
    setMounted,
  } = setters;
  try {
    if (localStorage.getItem(VERSION_KEY) !== DATA_VERSION) {
      clearLocalData();
      localStorage.setItem(VERSION_KEY, DATA_VERSION);
    }

    const savedRole = localStorage.getItem(STORAGE_KEYS.CURRENT_ROLE);
    const role = (savedRole as UserRole | null) ?? demoInitialState.role;
    if (!savedRole) localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, role);
    setCurrentRole(role);

    const profiles = readSeed(STORAGE_KEYS.PROFILES, demoInitialState.profiles);
    setProfiles(profiles);
    setCurrentProfile(
      profiles.find((profile) => profile.role === role) ?? profiles[0] ?? null
    );

    setStoreSettings(readSeed(STORAGE_KEYS.STORE_SETTINGS, demoInitialState.storeSettings));
    setProducts(readSeed(STORAGE_KEYS.PRODUCTS, demoInitialState.products));
    setInventoryUnits(readSeed(STORAGE_KEYS.INVENTORY, demoInitialState.inventoryUnits));
    setTransactions(readSeed(STORAGE_KEYS.TRANSACTIONS, demoInitialState.transactions));
    setServiceTickets(readSeed(STORAGE_KEYS.TICKETS, demoInitialState.serviceTickets));
  } catch (error) {
    console.warn("Gagal membaca data demo dari localStorage:", error);
  } finally {
    setMounted(true);
  }
}

/**
 * Baca satu kunci JSON dari localStorage. Kunci yang kosong atau isinya
 * rusak diganti nilai bawaan dan ditulis kembali, supaya panggilan
 * berikutnya membaca bentuk yang sama seperti yang dilihat pengguna.
 */
function readSeed<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Data rusak ditimpa bawaan di bawah; simpan gagalnya tidak fatal.
    }
  }
  localStorage.setItem(key, JSON.stringify(fallback));
  return fallback;
}

export function demoUpdateRole(
  profiles: Profile[],
  newRole: UserRole,
  setCurrentRole: DemoSetter<UserRole>,
  setCurrentProfile: DemoSetter<Profile | null>
) {
  setCurrentRole(newRole);
  setCurrentProfile(profiles.find((profile) => profile.role === newRole) ?? null);
  localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, newRole);
}

export function demoUpdateStoreSettings(
  storeSettings: StoreSettings,
  newSettings: Partial<StoreSettings>,
  setStoreSettings: DemoSetter<StoreSettings>
): StoreSettings {
  const updated: StoreSettings = {
    ...storeSettings,
    ...newSettings,
    updated_at: new Date().toISOString(),
  };
  setStoreSettings(updated);
  localStorage.setItem(STORAGE_KEYS.STORE_SETTINGS, JSON.stringify(updated));
  return updated;
}

export function demoAddProduct(
  newProduct: Omit<Product, "id" | "created_at">,
  setProducts: DemoSetter<Product[]>
): Product {
  const product: Product = {
    ...newProduct,
    id: Date.now(),
    created_at: new Date().toISOString(),
  };
  setProducts((prev) => {
    const updated = [product, ...prev];
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
    return updated;
  });
  return product;
}

export function demoUpdateProduct(
  id: number,
  updates: Partial<Product>,
  setProducts: DemoSetter<Product[]>
): Product | undefined {
  let updatedProduct: Product | undefined;
  setProducts((prev) => {
    const updated = prev.map((product) => {
      if (product.id !== id) return product;
      updatedProduct = { ...product, ...updates };
      return updatedProduct;
    });
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
    return updated;
  });
  return updatedProduct;
}

export function demoAddInventoryUnits(
  inventoryUnits: InventoryUnit[],
  productId: number,
  condition: UnitCondition,
  purchaseCost: number,
  sellingPrice: number,
  imeis: string[],
  setInventoryUnits: DemoSetter<InventoryUnit[]>
): InventoryUnit[] {
  const parsed = registerUnitsSchema.safeParse({
    productId,
    condition,
    purchaseCost,
    sellingPrice,
    imeis,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Data IMEI tidak valid.");
  }
  const normalizedImeis = parsed.data.imeis;
  const existingImeis = new Set(inventoryUnits.map((unit) => unit.imei));
  if (normalizedImeis.some((imei) => existingImeis.has(imei))) {
    throw new Error("IMEI sudah terdaftar di inventaris.");
  }

  const newUnits: InventoryUnit[] = normalizedImeis.map((imei, index) => ({
    id: Date.now() + index,
    product_id: productId,
    imei,
    condition,
    purchase_cost: purchaseCost,
    selling_price: sellingPrice,
    status: "available" as UnitStatus,
    created_at: new Date().toISOString(),
  }));

  setInventoryUnits((prev) => {
    const updated = [...newUnits, ...prev];
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(updated));
    return updated;
  });
  return newUnits;
}

export function demoUpdateUnitStatus(
  inventoryUnits: InventoryUnit[],
  unitId: number,
  status: UnitStatus,
  setInventoryUnits: DemoSetter<InventoryUnit[]>
): void {
  const current = inventoryUnits.find((unit) => unit.id === unitId);
  if (!current) throw new Error("Unit tidak ditemukan.");
  if (status === "sold") {
    throw new Error("Status sold hanya boleh lewat transaksi POS agar nota tercatat.");
  }
  if (current.status === "sold") {
    throw new Error("Unit sudah sold dan tidak dapat dikembalikan menjadi available.");
  }

  setInventoryUnits((prev) => {
    const updated = prev.map((unit) => (unit.id === unitId ? { ...unit, status } : unit));
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(updated));
    return updated;
  });
}

export type DemoPosSaleParams = {
  /**
   * Hanya dipakai mode lokal (localStorage) yang tidak punya sesi auth.
   * Di mode live purposefully diabaikan: executeSaleAction memakai
   * guard.profile.id, jadi penjual selalu akun yang benar-benar login
   * dan tidak bisa dipalsukan dari browser.
   */
  salesId?: string;
  customerId?: string | null;
  unitId: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: PaymentMethod;
  warrantyDurationMonths: number;
  tradeIn?: {
    originalBrandModel: string;
    imei: string;
    gradingDetails: TradeInRecord["grading_details"];
    offeredPrice: number;
    photoUrls: string[];
  };
};

export function demoExecutePosSale(
  inventoryUnits: InventoryUnit[],
  params: DemoPosSaleParams,
  setInventoryUnits: DemoSetter<InventoryUnit[]>,
  setTransactions: DemoSetter<Transaction[]>
): Transaction {
  const unit = inventoryUnits.find((u) => u.id === params.unitId);
  if (!unit) throw new Error("Unit fisik tidak ditemukan!");
  if (unit.is_demo) {
    throw new Error("Unit demo tidak bisa dijual lewat kasir. Pilih unit stok asli.");
  }
  if (unit.status !== "available") {
    throw new Error(
      `Unit ${unit.imei ?? "tanpa IMEI"} sudah berstatus "${unit.status}" dan tidak bisa dijual lagi. Pilih unit lain yang tersedia.`
    );
  }
  const tradeIn = params.tradeIn;
  if (tradeIn) {
    if (!IMEI_PATTERN.test(tradeIn.imei.trim())) {
      throw new Error("Nomor IMEI unit tukar tambah wajib tepat 15 digit angka!");
    }
    if (inventoryUnits.some((u) => u.imei === tradeIn.imei.trim())) {
      throw new Error("IMEI unit tukar tambah sudah terdaftar di inventaris!");
    }
  }

  const tradeInVal = params.tradeIn?.offeredPrice || 0;
  const finalPayment = finalPaymentAmount(unit.selling_price, tradeInVal);
  const transactionId = Date.now();
  let tradeInRecord: TradeInRecord | undefined;
  const nextInventory = inventoryUnits.map((u) =>
    u.id === params.unitId ? { ...u, status: "sold" as UnitStatus } : u
  );

  if (params.tradeIn) {
    const secondHandUnit: InventoryUnit = {
      id: transactionId + 99,
      // product_id null, sama seperti jalur live di src/lib/actions/pos.ts.
      // Menyalin unit.product_id mendaftarkan handset pelanggan ke katalog
      // unit baru, dan demo lalu menampilkan bug yang sudah diperbaiki.
      // Deskripsinya ada di trade_in_model supaya tabel inventaris tetap
      // bisa dibaca.
      product_id: null,
      trade_in_model: params.tradeIn.originalBrandModel,
      imei: params.tradeIn.imei,
      condition: "second",
      status: "available",
      purchase_cost: tradeInVal,
      selling_price: secondHandSellingPrice(tradeInVal),
      created_at: new Date().toISOString(),
    };
    nextInventory.unshift(secondHandUnit);
    tradeInRecord = {
      id: transactionId + 50,
      transaction_id: transactionId,
      resulting_unit_id: secondHandUnit.id,
      original_brand_model: params.tradeIn.originalBrandModel,
      imei: params.tradeIn.imei,
      grading_details: params.tradeIn.gradingDetails,
      photo_urls: params.tradeIn.photoUrls,
      offered_price: tradeInVal,
      created_at: new Date().toISOString(),
    };
  }

  const newTransaction: Transaction = {
    id: transactionId,
    sales_id: params.salesId ?? "local-sales",
    customer_id: params.customerId ?? null,
    customer_name: params.customerName,
    customer_phone: params.customerPhone,
    total_amount: unit.selling_price,
    trade_in_deduction: tradeInVal,
    final_payment: finalPayment,
    payment_method: params.paymentMethod,
    created_at: new Date().toISOString(),
    items: [
      {
        id: transactionId + 1,
        transaction_id: transactionId,
        unit_id: unit.id,
        unit_price: unit.selling_price,
        warranty_duration_months: params.warrantyDurationMonths,
        unit,
      },
    ],
    trade_in: tradeInRecord,
  };

  setInventoryUnits(nextInventory);
  localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(nextInventory));
  setTransactions((prev) => {
    const updated = [newTransaction, ...prev];
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
    return updated;
  });
  return newTransaction;
}

export type DemoTicketData = {
  customerName: string;
  customerPhone: string;
  deviceModel: string;
  imeiOrSn: string;
  issueNotes: string;
  technicianId?: string;
  photoUrls?: string[];
};

export function demoCreateServiceTicket(
  serviceTickets: ServiceTicket[],
  ticketData: DemoTicketData,
  setServiceTickets: DemoSetter<ServiceTicket[]>
): ServiceTicket {
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCodes = new Set(serviceTickets.map((ticket) => ticket.ticket_code));
  let ticketCode = "";
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `SRV-${todayStr}-${generateTicketSuffix()}`;
    if (!existingCodes.has(candidate)) {
      ticketCode = candidate;
      break;
    }
  }
  if (!ticketCode) throw new Error("Gagal membuat kode tiket unik, silakan coba lagi.");

  const now = new Date().toISOString();
  const newTicket: ServiceTicket = {
    id: Date.now(),
    ticket_code: ticketCode,
    customer_id: null,
    technician_id: ticketData.technicianId || "prof-tech-01",
    customer_name: ticketData.customerName,
    customer_phone: ticketData.customerPhone,
    device_model: ticketData.deviceModel,
    imei_or_sn: ticketData.imeiOrSn,
    issue_notes: ticketData.issueNotes,
    repair_status: "received",
    photo_urls: ticketData.photoUrls || [],
    sparepart_fee: 0,
    labor_fee: 100000,
    total_fee: 100000,
    warranty_days: 30,
    created_at: now,
    updated_at: now,
  };
  setServiceTickets((prev) => {
    const updated = [newTicket, ...prev];
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(updated));
    return updated;
  });
  return newTicket;
}

export function demoUpdateServiceTicket(
  serviceTickets: ServiceTicket[],
  ticketId: number | string,
  updates: Partial<ServiceTicket>,
  setServiceTickets: DemoSetter<ServiceTicket[]>,
  opts?: { notaConfirmed?: boolean }
): void {
  const current = serviceTickets.find((ticket) => String(ticket.id) === String(ticketId));
  if (!current) throw new Error("Tiket servis tidak ditemukan.");
  const target = updates.repair_status;
  const berpindah = target !== undefined && target !== current.repair_status;
  if (berpindah && !isAllowedTransition(current.repair_status, target)) {
    throw new Error(
      `Transisi ${current.repair_status} ke ${target} tidak diizinkan. Ikuti alur reparasi resmi.`
    );
  }
  // FR-B-04: mode demo menegakkan gerbang yang sama dengan jalur live, supaya
  // alur yang diuji staf di demo tidak meloloskan serah terima tanpa nota.
  if (berpindah && target === "picked_up" && opts?.notaConfirmed !== true) {
    throw new Error("Centang konfirmasi nota servis sebelum menyerahkan unit ke pelanggan.");
  }

  setServiceTickets((prev) => {
    const updated = prev.map((ticket) => {
      if (String(ticket.id) !== String(ticketId)) return ticket;
      const totalFee =
        (updates.sparepart_fee ?? ticket.sparepart_fee) +
        (updates.labor_fee ?? ticket.labor_fee);
      return {
        ...ticket,
        ...updates,
        // FR-B-04: stempel waktu serah terima sekali saja, sejalan dengan
        // coalesce di trigger database.
        ...(berpindah && updates.repair_status === "picked_up"
          ? { picked_up_at: ticket.picked_up_at ?? new Date().toISOString() }
          : {}),
        total_fee: totalFee,
        updated_at: new Date().toISOString(),
      };
    });
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(updated));
    return updated;
  });
}

export function demoAddStaff(
  name: string,
  role: UserRole,
  phone: string,
  email: string,
  _password: string | undefined,
  _username: string | undefined,
  setProfiles: DemoSetter<Profile[]>
): Profile | undefined {
  // Kata sandi dan username tidak dipakai di mode demo: tidak ada sesi auth,
  // jadi tidak ada yang perlu diverifikasi. Parameternya tetap ada supaya
  // tanda tangan sama dengan dispatcher di src/lib/store.ts.
  void _password;
  void _username;
  const newStaff: Profile = {
    id: `prof-${Date.now()}`,
    full_name: name,
    role,
    phone_number: phone,
    email,
    created_at: new Date().toISOString(),
  };
  setProfiles((prev) => {
    const updated = [...prev, newStaff];
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));
    return updated;
  });
  return newStaff;
}

export function demoAddCustomer(
  name: string,
  phone: string,
  _password: string,
  username: string,
  setProfiles: DemoSetter<Profile[]>
): Profile | undefined {
  void _password;
  const newCustomer: Profile = {
    id: `prof-cust-${Date.now()}`,
    full_name: name,
    role: "customer",
    phone_number: phone,
    username,
    created_at: new Date().toISOString(),
  };
  setProfiles((prev) => {
    const updated = [...prev, newCustomer];
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));
    return updated;
  });
  return newCustomer;
}

export type DemoResetSetters = {
  setCurrentRole: DemoSetter<UserRole>;
  setCurrentProfile: DemoSetter<Profile | null>;
  setStoreSettings: DemoSetter<StoreSettings>;
  setProducts: DemoSetter<Product[]>;
  setInventoryUnits: DemoSetter<InventoryUnit[]>;
  setTransactions: DemoSetter<Transaction[]>;
  setServiceTickets: DemoSetter<ServiceTicket[]>;
  setProfiles: DemoSetter<Profile[]>;
};

/** Kembalikan seluruh state demo ke data awal bawaan. */
export function demoResetToDefault(setters: DemoResetSetters) {
  clearLocalData();
  localStorage.setItem(VERSION_KEY, DATA_VERSION);
  setters.setCurrentRole("admin");
  setters.setCurrentProfile(initialProfiles[0] ?? null);
  setters.setStoreSettings(initialStoreSettings);
  setters.setProducts(initialProducts);
  setters.setInventoryUnits(initialInventoryUnits);
  setters.setTransactions(initialTransactions);
  setters.setServiceTickets(initialServiceTickets);
  setters.setProfiles(initialProfiles);
}
