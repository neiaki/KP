"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Profile,
  StoreSettings,
  Product,
  InventoryUnit,
  Transaction,
  ServiceTicket,
  UserRole,
  UnitStatus,
  UnitCondition,
  PaymentMethod,
  TradeInRecord,
} from "@/types";
import {
  initialProfiles,
  initialStoreSettings,
  initialProducts,
  initialInventoryUnits,
  initialTransactions,
  initialServiceTickets,
} from "./mock-data";
import { getPortalSnapshot, type PortalSnapshot } from "@/lib/actions/portal";
import { getPublicSnapshot, type PublicSnapshot } from "@/lib/actions/public";
import { createProduct as createProductAction, updateProduct as updateProductAction } from "@/lib/actions/products";
import { registerUnits, updateUnitStatus as updateUnitStatusAction } from "@/lib/actions/inventory";
import { executeSale as executeSaleAction } from "@/lib/actions/pos";
import {
  createTicket as createTicketAction,
  updateTicket as updateTicketAction,
} from "@/lib/actions/service";
import {
  generateTicketSuffix,
  isAllowedTransition,
  registerUnitsSchema,
} from "@/lib/validations";
import { updateStoreSettings as updateStoreSettingsAction } from "@/lib/actions/settings";
import { inviteStaff as inviteStaffAction } from "@/lib/actions/auth";

// Helper untuk local storage persistence. Data live tidak pernah ditulis ke
// localStorage karena browser adalah cache, bukan sumber kebenaran.
const DATA_VERSION = "2";
const VERSION_KEY = "atcell_data_version";
const STORAGE_KEYS = {
  CURRENT_ROLE: "atcell_current_role",
  STORE_SETTINGS: "atcell_store_settings",
  PRODUCTS: "atcell_products",
  INVENTORY: "atcell_inventory_units",
  TRANSACTIONS: "atcell_transactions",
  TICKETS: "atcell_service_tickets",
  PROFILES: "atcell_profiles",
} as const;

const liveBackendEnabled =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const emptyStoreSettings: StoreSettings = {
  id: 1,
  store_name: "",
  description_id: "",
  description_en: "",
  address: "",
  latitude: 0,
  longitude: 0,
  phone_number: "",
  // Kosong berarti footer tidak menampilkan ikon platform itu.
  social_facebook: "",
  social_instagram: "",
  social_x: "",
  social_tiktok: "",
  opening_hours: {
    monday_friday: "",
    saturday_sunday: "",
  },
  updated_at: "",
};

type BackendResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type SnapshotResult =
  | Awaited<ReturnType<typeof getPortalSnapshot>>
  | Awaited<ReturnType<typeof getPublicSnapshot>>;

function unwrap<T>(result: BackendResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function clearLocalData() {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

function clearProtectedState(
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>,
  setInventoryUnits: React.Dispatch<React.SetStateAction<InventoryUnit[]>>,
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
  setServiceTickets: React.Dispatch<React.SetStateAction<ServiceTicket[]>>,
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>,
  setCurrentProfile: React.Dispatch<React.SetStateAction<Profile | null>>,
) {
  setProducts([]);
  setInventoryUnits([]);
  setTransactions([]);
  setServiceTickets([]);
  setProfiles([]);
  setCurrentProfile(null);
}

function applyPublicSnapshot(
  snapshot: PublicSnapshot,
  setStoreSettings: React.Dispatch<React.SetStateAction<StoreSettings>>,
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>,
  setInventoryUnits: React.Dispatch<React.SetStateAction<InventoryUnit[]>>,
  setCurrentProfile: React.Dispatch<React.SetStateAction<Profile | null>>,
) {
  setCurrentProfile(null);
  setStoreSettings(snapshot.storeSettings);
  setProducts(snapshot.products);
  setInventoryUnits(snapshot.inventoryUnits);
}

function applyPortalSnapshot(
  snapshot: PortalSnapshot,
  setCurrentRole: React.Dispatch<React.SetStateAction<UserRole>>,
  setCurrentProfile: React.Dispatch<React.SetStateAction<Profile | null>>,
  setStoreSettings: React.Dispatch<React.SetStateAction<StoreSettings>>,
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>,
  setInventoryUnits: React.Dispatch<React.SetStateAction<InventoryUnit[]>>,
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
  setServiceTickets: React.Dispatch<React.SetStateAction<ServiceTicket[]>>,
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>,
) {
  setCurrentRole(snapshot.profile.role);
  setCurrentProfile(snapshot.profile);
  setStoreSettings(snapshot.storeSettings);
  setProducts(snapshot.products);
  setInventoryUnits(snapshot.inventoryUnits);
  setTransactions(snapshot.transactions);
  setServiceTickets(snapshot.serviceTickets);
  setProfiles(snapshot.profiles);
}

export function useAtCellStore() {
  const pathname = usePathname() ?? "/";
  const [mounted, setMounted] = useState(false);
  const [isHydrating, setIsHydrating] = useState(liveBackendEnabled);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>(
    liveBackendEnabled ? "customer" : "admin"
  );
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(
    liveBackendEnabled ? null : initialProfiles[0] ?? null
  );
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(
    liveBackendEnabled ? emptyStoreSettings : initialStoreSettings
  );
  const [products, setProducts] = useState<Product[]>(
    liveBackendEnabled ? [] : initialProducts
  );
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>(
    liveBackendEnabled ? [] : initialInventoryUnits
  );
  const [transactions, setTransactions] = useState<Transaction[]>(
    liveBackendEnabled ? [] : initialTransactions
  );
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>(
    liveBackendEnabled ? [] : initialServiceTickets
  );
  const [profiles, setProfiles] = useState<Profile[]>(
    liveBackendEnabled ? [] : initialProfiles
  );
  const loadRequestId = useRef(0);

  const loadLiveData = useCallback(async () => {
    if (!liveBackendEnabled) return;
    const requestId = ++loadRequestId.current;

    setIsHydrating(true);
    setBackendError(null);

    const isLoginPath = pathname.endsWith("/login") || pathname === "/portal/login";
    const isPortalHost =
      typeof window !== "undefined" &&
      /^(login|portal)\./i.test(window.location.hostname);
    if (isLoginPath) {
      setCurrentRole("customer");
      setStoreSettings(emptyStoreSettings);
      clearProtectedState(setProducts, setInventoryUnits, setTransactions, setServiceTickets, setProfiles, setCurrentProfile);
      setMounted(true);
      setIsHydrating(false);
      return;
    }

    const isPortalPath = pathname.startsWith("/portal") || isPortalHost;
    let result: SnapshotResult;
    try {
      result = isPortalPath ? await getPortalSnapshot() : await getPublicSnapshot();
    } catch {
      if (requestId !== loadRequestId.current) return;
      setBackendError("Backend sedang tidak dapat dihubungi. Coba lagi sebentar.");
      setStoreSettings(emptyStoreSettings);
      clearProtectedState(setProducts, setInventoryUnits, setTransactions, setServiceTickets, setProfiles, setCurrentProfile);
      setMounted(true);
      setIsHydrating(false);
      return;
    }
    if (requestId !== loadRequestId.current) return;
    if (!result.ok) {
      setBackendError(result.error);
      setStoreSettings(emptyStoreSettings);
      clearProtectedState(setProducts, setInventoryUnits, setTransactions, setServiceTickets, setProfiles, setCurrentProfile);
      setMounted(true);
      setIsHydrating(false);
      return;
    }

    if (isPortalPath) {
      applyPortalSnapshot(
        result.data as PortalSnapshot,
        setCurrentRole,
        setCurrentProfile,
        setStoreSettings,
        setProducts,
        setInventoryUnits,
        setTransactions,
        setServiceTickets,
        setProfiles
      );
    } else {
      setCurrentRole("customer");
      applyPublicSnapshot(
        result.data as PublicSnapshot,
        setStoreSettings,
        setProducts,
        setInventoryUnits,
        setCurrentProfile
      );
      setTransactions([]);
      setServiceTickets([]);
      setProfiles([]);
    }

    setMounted(true);
    setIsHydrating(false);
  }, [pathname]);

  useEffect(() => {
    if (liveBackendEnabled) {
      const liveFrame = window.requestAnimationFrame(() => {
        void loadLiveData();
      });
      return () => window.cancelAnimationFrame(liveFrame);
    }

    const frame = window.requestAnimationFrame(() => {
      try {
        if (localStorage.getItem(VERSION_KEY) !== DATA_VERSION) {
          clearLocalData();
          localStorage.setItem(VERSION_KEY, DATA_VERSION);
        }
        const savedRole = localStorage.getItem(STORAGE_KEYS.CURRENT_ROLE);
        if (savedRole) setCurrentRole(savedRole as UserRole);

        const savedSettings = localStorage.getItem(STORAGE_KEYS.STORE_SETTINGS);
        if (savedSettings) setStoreSettings(JSON.parse(savedSettings));

        const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
        if (savedProducts) setProducts(JSON.parse(savedProducts));

        const savedInventory = localStorage.getItem(STORAGE_KEYS.INVENTORY);
        if (savedInventory) setInventoryUnits(JSON.parse(savedInventory));

        const savedTransactions = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (savedTransactions) setTransactions(JSON.parse(savedTransactions));

        const savedTickets = localStorage.getItem(STORAGE_KEYS.TICKETS);
        if (savedTickets) setServiceTickets(JSON.parse(savedTickets));

        const savedProfiles = localStorage.getItem(STORAGE_KEYS.PROFILES);
        if (savedProfiles) setProfiles(JSON.parse(savedProfiles));
      } catch (error) {
        console.warn("Gagal membaca data demo dari localStorage:", error);
      } finally {
        setMounted(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loadLiveData]);

  const refresh = useCallback(async () => {
    if (liveBackendEnabled) await loadLiveData();
  }, [loadLiveData]);

  const updateRole = (newRole: UserRole) => {
    if (liveBackendEnabled) return;
    setCurrentRole(newRole);
    setCurrentProfile(profiles.find((profile) => profile.role === newRole) ?? null);
    localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, newRole);
  };

  const updateStoreSettings = async (newSettings: Partial<StoreSettings>) => {
    if (liveBackendEnabled) {
      const updated = unwrap(
        await updateStoreSettingsAction({
          store_name: newSettings.store_name,
          description_id: newSettings.description_id,
          description_en: newSettings.description_en,
          address: newSettings.address,
          latitude: newSettings.latitude,
          longitude: newSettings.longitude,
          maps_url: newSettings.maps_url,
          phone_number: newSettings.phone_number,
          whatsapp_number: newSettings.whatsapp_number,
          // Tanpa empat baris ini, kolom sosmed tidak pernah dikirim ke
          // server action, jadi Admin mengisi form tapi tidak tersimpan.
          social_facebook: newSettings.social_facebook,
          social_instagram: newSettings.social_instagram,
          social_x: newSettings.social_x,
          social_tiktok: newSettings.social_tiktok,
          opening_hours: newSettings.opening_hours,
        })
      );
      setStoreSettings(updated);
      return updated;
    }

    const updated: StoreSettings = {
      ...storeSettings,
      ...newSettings,
      updated_at: new Date().toISOString(),
    };
    setStoreSettings(updated);
    localStorage.setItem(STORAGE_KEYS.STORE_SETTINGS, JSON.stringify(updated));
    return updated;
  };

  const addProduct = async (
    newProduct: Omit<Product, "id" | "created_at">
  ): Promise<Product> => {
    if (liveBackendEnabled) {
      const created = unwrap(
        await createProductAction({
          brand: newProduct.brand,
          model_name: newProduct.model_name,
          specs: newProduct.specs,
          default_price: newProduct.default_price,
          image_url: newProduct.image_url,
          official_images: newProduct.official_images ?? [],
          second_images: newProduct.second_images ?? [],
          is_active: true,
        })
      );
      setProducts((prev) => [created, ...prev]);
      return created;
    }

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
  };

  const updateProduct = async (
    id: number,
    updates: Partial<Product>
  ): Promise<Product | undefined> => {
    if (liveBackendEnabled) {
      const updated = unwrap(
        await updateProductAction(id, {
          brand: updates.brand,
          model_name: updates.model_name,
          specs: updates.specs,
          default_price: updates.default_price,
          image_url: updates.image_url,
          official_images: updates.official_images,
          second_images: updates.second_images,
        })
      );
      setProducts((prev) => prev.map((product) => (product.id === id ? updated : product)));
      return updated;
    }

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
  };

  const addInventoryUnits = async (
    productId: number,
    condition: UnitCondition,
    purchaseCost: number,
    sellingPrice: number,
    imeis: string[]
  ): Promise<InventoryUnit[]> => {
    if (liveBackendEnabled) {
      const created = unwrap(
        await registerUnits({
          productId,
          condition,
          purchaseCost,
          sellingPrice,
          imeis,
        })
      );
      setInventoryUnits((prev) => [...created, ...prev]);
      return created;
    }

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
  };

  const addBatchIMEI = (
    productId: number,
    imeis: string[],
    condition: UnitCondition,
    purchaseCost: number,
    sellingPrice: number
  ) => addInventoryUnits(productId, condition, purchaseCost, sellingPrice, imeis);

  const updateUnitStatus = async (
    unitId: number,
    status: UnitStatus
  ): Promise<void> => {
    if (liveBackendEnabled) {
      const updated = unwrap(await updateUnitStatusAction({ unitId, status }));
      setInventoryUnits((prev) => prev.map((unit) => (unit.id === unitId ? updated : unit)));
      return;
    }

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
  };

  const executePosSale = async (params: {
    salesId: string;
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
  }): Promise<Transaction> => {
    if (liveBackendEnabled) {
      const transaction = unwrap(
        await executeSaleAction({
          unitId: params.unitId,
          customerName: params.customerName,
          customerPhone: params.customerPhone,
          paymentMethod: params.paymentMethod,
          warrantyDurationMonths: params.warrantyDurationMonths,
          tradeIn: params.tradeIn
            ? {
                ...params.tradeIn,
                gradingDetails: params.tradeIn.gradingDetails ?? {},
              }
            : undefined,
        })
      );
      const tradeInImei = params.tradeIn?.imei.trim();
      setTransactions((prev) => [transaction, ...prev]);
      setInventoryUnits((prev) =>
        prev.map((unit) => {
          if (unit.id === params.unitId) return { ...unit, status: "sold" };
          if (tradeInImei && unit.imei === tradeInImei) return unit;
          return unit;
        })
      );
      await refresh();
      return transaction;
    }

    const unit = inventoryUnits.find((u) => u.id === params.unitId);
    if (!unit) throw new Error("Unit fisik tidak ditemukan!");
    if (unit.status !== "available") {
      throw new Error(
        `Unit ${unit.imei} sudah berstatus "${unit.status}" dan tidak bisa dijual lagi. Pilih unit lain yang tersedia.`
      );
    }
    const tradeIn = params.tradeIn;
    if (tradeIn) {
      if (!/^\d{15}$/.test(tradeIn.imei.trim())) {
        throw new Error("Nomor IMEI unit tukar tambah wajib tepat 15 digit angka!");
      }
      if (inventoryUnits.some((u) => u.imei === tradeIn.imei.trim())) {
        throw new Error("IMEI unit tukar tambah sudah terdaftar di inventaris!");
      }
    }

    const tradeInVal = params.tradeIn?.offeredPrice || 0;
    const finalPayment = Math.max(0, unit.selling_price - tradeInVal);
    const transactionId = Date.now();
    let tradeInRecord: TradeInRecord | undefined;
    const nextInventory = inventoryUnits.map((u) =>
      u.id === params.unitId ? { ...u, status: "sold" as UnitStatus } : u
    );

    if (params.tradeIn) {
      const secondHandUnit: InventoryUnit = {
        id: transactionId + 99,
        product_id: unit.product_id,
        imei: params.tradeIn.imei,
        condition: "second",
        status: "available",
        purchase_cost: tradeInVal,
        selling_price: Math.round(tradeInVal * 1.25),
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
      sales_id: params.salesId,
      customer_id: null,
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
  };

  const createServiceTicket = async (ticketData: {
    customerName: string;
    customerPhone: string;
    deviceModel: string;
    imeiOrSn: string;
    issueNotes: string;
    technicianId?: string;
    photoUrls?: string[];
  }): Promise<ServiceTicket> => {
    if (liveBackendEnabled) {
      const created = unwrap(
        await createTicketAction({
          customerName: ticketData.customerName,
          customerPhone: ticketData.customerPhone,
          deviceModel: ticketData.deviceModel,
          imeiOrSn: ticketData.imeiOrSn,
          issueNotes: ticketData.issueNotes,
          technicianId: ticketData.technicianId,
          photoUrls: ticketData.photoUrls ?? [],
        })
      );
      setServiceTickets((prev) => [created, ...prev]);
      return created;
    }

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
  };

  const updateServiceTicket = async (
    ticketId: number | string,
    updates: Partial<ServiceTicket>
  ): Promise<void> => {
    if (liveBackendEnabled) {
      const current = serviceTickets.find((ticket) => String(ticket.id) === String(ticketId));
      if (!current) throw new Error("Tiket servis tidak ditemukan.");
      const updated = unwrap(
        await updateTicketAction({
          ticketId: Number(ticketId),
          repairStatus: updates.repair_status ?? current.repair_status,
          sparepartFee: updates.sparepart_fee,
          laborFee: updates.labor_fee,
          technicianNotes: updates.technician_notes ?? updates.issue_notes,
        })
      );
      setServiceTickets((prev) =>
        prev.map((ticket) => (String(ticket.id) === String(ticketId) ? updated : ticket))
      );
      return;
    }

    const current = serviceTickets.find((ticket) => String(ticket.id) === String(ticketId));
    if (!current) throw new Error("Tiket servis tidak ditemukan.");
    if (
      updates.repair_status &&
      updates.repair_status !== current.repair_status &&
      !isAllowedTransition(current.repair_status, updates.repair_status)
    ) {
      throw new Error(
        `Transisi ${current.repair_status} ke ${updates.repair_status} tidak diizinkan. Ikuti alur reparasi resmi.`
      );
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
          total_fee: totalFee,
          updated_at: new Date().toISOString(),
        };
      });
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(updated));
      return updated;
    });
  };

  const addStaff = async (
    name: string,
    role: UserRole,
    phone: string,
    email: string,
    password?: string,
    username?: string
  ): Promise<Profile | undefined> => {
    if (liveBackendEnabled) {
      if (role === "customer") {
        throw new Error("Akun staf hanya dapat dibuat untuk admin, sales, atau teknisi.");
      }
      if (!password || password.length < 8) {
        throw new Error("Kata sandi staf minimal 8 karakter.");
      }
      // Login portal memakai username, jadi staf wajib punya username eksplisit.
      // Kalau form tidak mengirimnya, turunkan dari email seperti trigger.
      const finalUsername = (
        username ??
        email
          .trim()
          .toLowerCase()
          .split("@")[0]
          .replace(/[^a-z0-9._-]/g, "")
          .slice(0, 32)
      ).trim();
      if (finalUsername.length < 3) {
        throw new Error("Username staf minimal 3 karakter.");
      }
      const result = await inviteStaffAction({
        fullName: name,
        email,
        username: finalUsername,
        password,
        phoneNumber: phone,
        role,
      });
      if (!result.ok) throw new Error(result.error);
      await refresh();
      return undefined;
    }

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
  };

  const resetToDefault = () => {
    if (liveBackendEnabled) return;
    clearLocalData();
    localStorage.setItem(VERSION_KEY, DATA_VERSION);
    setCurrentRole("admin");
    setCurrentProfile(initialProfiles[0] ?? null);
    setStoreSettings(initialStoreSettings);
    setProducts(initialProducts);
    setInventoryUnits(initialInventoryUnits);
    setTransactions(initialTransactions);
    setServiceTickets(initialServiceTickets);
    setProfiles(initialProfiles);
  };

  return {
    mounted,
    isHydrating,
    backendError,
    isLiveBackend: liveBackendEnabled,
    refresh,
    currentRole,
    currentProfile,
    updateRole,
    switchRole: updateRole,
    storeSettings,
    updateStoreSettings,
    products,
    addProduct,
    updateProduct,
    inventoryUnits,
    addInventoryUnits,
    addBatchIMEI,
    updateUnitStatus,
    transactions,
    executePosSale,
    processSale: executePosSale,
    serviceTickets,
    createServiceTicket,
    updateServiceTicket,
    profiles,
    addStaff,
    resetToDefault,
    resetToInitialData: resetToDefault,
  };
}
