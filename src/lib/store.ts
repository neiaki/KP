"use client";

import { useState, useEffect } from "react";
import {
  Profile,
  StoreSettings,
  Product,
  InventoryUnit,
  Transaction,
  ServiceTicket,
  UserRole,
  RepairStatus,
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

// Helper for local storage persistence
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
};

export function useAtCellStore() {
  const [mounted, setMounted] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>("admin");
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(initialStoreSettings);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>(initialInventoryUnits);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>(initialServiceTickets);
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles);

  // Initialize from LocalStorage
  useEffect(() => {
    try {
      // Reset cache lama bila struktur/data bawaan berubah (mis. galeri foto
      // dikurasi ulang), agar browser tidak memakai data basi selamanya.
      if (localStorage.getItem(VERSION_KEY) !== DATA_VERSION) {
        Object.values(STORAGE_KEYS).forEach((k) => {
          if (k !== STORAGE_KEYS.CURRENT_ROLE) localStorage.removeItem(k);
        });
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
    } catch (e) {
      console.warn("Failed to read from localStorage:", e);
    } finally {
      setMounted(true);
    }
  }, []);

  // Update Helpers with auto-persist
  const updateRole = (newRole: UserRole) => {
    setCurrentRole(newRole);
    localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, newRole);
  };

  const updateStoreSettings = (newSettings: Partial<StoreSettings>) => {
    setStoreSettings((prev) => {
      const updated = { ...prev, ...newSettings, updated_at: new Date().toISOString() };
      localStorage.setItem(STORAGE_KEYS.STORE_SETTINGS, JSON.stringify(updated));
      return updated;
    });
  };

  // Product Management
  const addProduct = (newProduct: Omit<Product, "id" | "created_at">) => {
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

  const updateProduct = (id: number, updates: Partial<Product>) => {
    setProducts((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(updated));
      return updated;
    });
  };

  // Inventory & IMEI Unit Registration
  const addInventoryUnits = (
    productId: number,
    condition: UnitCondition,
    purchaseCost: number,
    sellingPrice: number,
    imeis: string[]
  ) => {
    const newUnits: InventoryUnit[] = imeis.map((imei, index) => ({
      id: Date.now() + index,
      product_id: productId,
      imei: imei.trim(),
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
  ) => {
    return addInventoryUnits(productId, condition, purchaseCost, sellingPrice, imeis);
  };

  const updateUnitStatus = (unitId: number, status: UnitStatus) => {
    setInventoryUnits((prev) => {
      const updated = prev.map((u) => (u.id === unitId ? { ...u, status } : u));
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(updated));
      return updated;
    });
  };

  // Point of Sale & Trade-In Transaction
  const executePosSale = (params: {
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
  }) => {
    const unit = inventoryUnits.find((u) => u.id === params.unitId);
    if (!unit) throw new Error("Unit fisik tidak ditemukan!");
    if (unit.status !== "available") {
      throw new Error(
        `Unit ${unit.imei} sudah berstatus "${unit.status}" dan tidak bisa dijual lagi. Pilih unit lain yang tersedia.`
      );
    }
    if (params.tradeIn) {
      if (!/^\d{15}$/.test(params.tradeIn.imei.trim())) {
        throw new Error("Nomor IMEI unit tukar tambah wajib tepat 15 digit angka!");
      }
      const duplicate = inventoryUnits.some((u) => u.imei === params.tradeIn!.imei.trim());
      if (duplicate) {
        throw new Error("IMEI unit tukar tambah sudah terdaftar di inventaris!");
      }
    }

    const tradeInVal = params.tradeIn?.offeredPrice || 0;
    const finalPayment = Math.max(0, unit.selling_price - tradeInVal);
    const transactionId = Date.now();

    // 1. Mark selected unit as sold
    let newResultingUnitId: number | undefined;
    const nextInventory = inventoryUnits.map((u) => {
      if (u.id === params.unitId) {
        return { ...u, status: "sold" as UnitStatus };
      }
      return u;
    });

    // 2. If trade-in, register old device as available second-hand unit
    let tradeInRecord: TradeInRecord | undefined;
    if (params.tradeIn) {
      newResultingUnitId = Date.now() + 99;
      const secondHandUnit: InventoryUnit = {
        id: newResultingUnitId,
        product_id: unit.product_id, // link or generic
        imei: params.tradeIn.imei,
        condition: "second",
        status: "available",
        purchase_cost: tradeInVal,
        selling_price: Math.round(tradeInVal * 1.25),
        created_at: new Date().toISOString(),
      };
      nextInventory.unshift(secondHandUnit);

      tradeInRecord = {
        id: Date.now() + 50,
        transaction_id: transactionId,
        resulting_unit_id: newResultingUnitId,
        original_brand_model: params.tradeIn.originalBrandModel,
        imei: params.tradeIn.imei,
        grading_details: params.tradeIn.gradingDetails,
        photo_urls: params.tradeIn.photoUrls,
        offered_price: tradeInVal,
        created_at: new Date().toISOString(),
      };
    }

    // 3. Create Transaction Record
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
          id: Date.now() + 1,
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

  // Service Tickets
  const createServiceTicket = (ticketData: {
    customerName: string;
    customerPhone: string;
    deviceModel: string;
    imeiOrSn: string;
    issueNotes: string;
    technicianId?: string;
    photoUrls?: string[];
  }) => {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const existingCodes = new Set(serviceTickets.map((t) => t.ticket_code));
    let ticketCode = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `SRV-${todayStr}-${Math.floor(1000 + Math.random() * 9000)}`;
      if (!existingCodes.has(candidate)) {
        ticketCode = candidate;
        break;
      }
    }
    if (!ticketCode) {
      throw new Error("Gagal membuat kode tiket unik, silakan coba lagi.");
    }

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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setServiceTickets((prev) => {
      const updated = [newTicket, ...prev];
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(updated));
      return updated;
    });

    return newTicket;
  };

  const updateServiceTicket = (
    ticketId: number | string,
    updates: Partial<ServiceTicket>
  ) => {
    setServiceTickets((prev) => {
      const updated = prev.map((t) => {
        if (String(t.id) === String(ticketId)) {
          const total_fee =
            (updates.sparepart_fee !== undefined ? updates.sparepart_fee : t.sparepart_fee) +
            (updates.labor_fee !== undefined ? updates.labor_fee : t.labor_fee);
          return {
            ...t,
            ...updates,
            total_fee,
            updated_at: new Date().toISOString(),
          };
        }
        return t;
      });
      localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(updated));
      return updated;
    });
  };

  // Staff management
  const addStaff = (name: string, role: UserRole, phone: string, email: string) => {
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
    localStorage.clear();
    setCurrentRole("admin");
    setStoreSettings(initialStoreSettings);
    setProducts(initialProducts);
    setInventoryUnits(initialInventoryUnits);
    setTransactions(initialTransactions);
    setServiceTickets(initialServiceTickets);
    setProfiles(initialProfiles);
  };

  return {
    mounted,
    currentRole,
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
