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
} from "@/types";
import { getPortalSnapshot, type PortalSnapshot } from "@/lib/actions/portal";
import { getPublicSnapshot, type PublicSnapshot } from "@/lib/actions/public";
import { resolveSeed } from "@/lib/public-seed";
import { createProduct as createProductAction, updateProduct as updateProductAction } from "@/lib/actions/products";
import { registerUnits, updateUnitStatus as updateUnitStatusAction } from "@/lib/actions/inventory";
import { executeSale as executeSaleAction } from "@/lib/actions/pos";
import {
  createTicket as createTicketAction,
  updateTicket as updateTicketAction,
} from "@/lib/actions/service";
import {
  demoAddInventoryUnits,
  demoAddProduct,
  demoAddStaff,
  demoCreateServiceTicket,
  demoExecutePosSale,
  demoInitialState,
  demoResetToDefault,
  demoUpdateProduct,
  demoUpdateRole,
  demoUpdateServiceTicket,
  demoUpdateStoreSettings,
  demoUpdateUnitStatus,
  hydrateDemoFromLocalStorage,
  type DemoPosSaleParams,
  type DemoTicketData,
} from "./store-demo.ts";
import { updateStoreSettings as updateStoreSettingsAction } from "@/lib/actions/settings";
import { inviteStaff as inviteStaffAction } from "@/lib/actions/auth";

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

/*
 * publicSeed diisi layout area publik dengan hasil getPublicSnapshot di server,
 * supaya render pertama sudah berisi etalase. Tanpa itu, useState di bawah
 * selalu mulai dari kosong di mode live dan loadLiveData baru mengisi layar
 * setelah useEffect jalan, sehingga HTML yang dikirim ke crawler kosong
 * ("0 unit ada di toko", jam buka dan telepon kosong).
 *
 * Seed hanya berisi data yang memang sudah publik: purchase_cost sudah
 * dinolkan dan IMEI sudah disensor oleh getPublicSnapshot. Portal tidak
 * mengirim seed, jadi ia tetap pakai getPortalSnapshot yang butuh sesi.
 */
export function useAtCellStore(publicSeed?: PublicSnapshot | null) {
  const pathname = usePathname() ?? "/";
  // Mode demo sudah ditangani resolveSeed dari argumen liveBackend, jadi seed
  // tidak perlu difilter lagi di sini: jepit yang sama dua kali hanya
  // membuat aturan ini terlihat seperti dua aturan terpisah.
  const seed = publicSeed;
  const [mounted, setMounted] = useState(false);
  const [isHydrating, setIsHydrating] = useState(liveBackendEnabled);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>(
    liveBackendEnabled ? "customer" : "admin"
  );
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(
    liveBackendEnabled ? null : demoInitialState.profile
  );
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(
    resolveSeed(
      seed,
      liveBackendEnabled,
      (s) => s.storeSettings,
      emptyStoreSettings,
      demoInitialState.storeSettings
    )
  );
  const [products, setProducts] = useState<Product[]>(
    resolveSeed(seed, liveBackendEnabled, (s) => s.products, [], demoInitialState.products)
  );
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>(
    resolveSeed(seed, liveBackendEnabled, (s) => s.inventoryUnits, [], demoInitialState.inventoryUnits)
  );
  const [transactions, setTransactions] = useState<Transaction[]>(
    liveBackendEnabled ? [] : demoInitialState.transactions
  );
  const [serviceTickets, setServiceTickets] = useState<ServiceTicket[]>(
    liveBackendEnabled ? [] : demoInitialState.serviceTickets
  );
  const [profiles, setProfiles] = useState<Profile[]>(
    liveBackendEnabled ? [] : demoInitialState.profiles
  );
  const loadRequestId = useRef(0);

  /*
   * Yang menentukan hasil loadLiveData hanya dua hal: apakah halaman ini
   * halaman login, dan apakah ini area portal. Keduanya dihitung di luar
   * callback supaya identity useCallback tidak ikut berubah setiap kali
   * pathname berubah.
   *
   * Sebelumnya dependensinya `pathname` mentah, jadi effect di bawah ikut
   * jalan lagi pada setiap perpindahan halaman, termasuk saat hanya segmen
   * locale yang berubah dari /id ke /en. Snapshot publik maupun portal tidak
   * punya parameter bahasa sama sekali, sehingga hasil bacaannya untuk kedua
   * locale itu identik byte per byte, jadi pemanggilan ulang hanya mengulang
   * query yang jawabannya sudah ada: satu permintaan jaringan dan satu putaran
   * tiga query Postgres yang tidak menghasilkan apa pun.
   */
  const isLoginPath = pathname.endsWith("/login") || pathname === "/portal/login";
  const isPortalPath = pathname.startsWith("/portal");

  const loadLiveData = useCallback(async () => {
    if (!liveBackendEnabled) return;
    const requestId = ++loadRequestId.current;

    setIsHydrating(true);
    setBackendError(null);

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

    const bacaSnapshotPortal = isPortalPath || isPortalHost;
    let result: SnapshotResult;
    try {
      result = bacaSnapshotPortal ? await getPortalSnapshot() : await getPublicSnapshot();
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
  }, [isLoginPath, isPortalPath]);

  useEffect(() => {
    if (liveBackendEnabled) {
      const liveFrame = window.requestAnimationFrame(() => {
        void loadLiveData();
      });
      return () => window.cancelAnimationFrame(liveFrame);
    }

    const frame = window.requestAnimationFrame(() => {
      hydrateDemoFromLocalStorage({
        setCurrentRole,
        setStoreSettings,
        setProducts,
        setInventoryUnits,
        setTransactions,
        setServiceTickets,
        setProfiles,
        setMounted,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loadLiveData]);

  const refresh = useCallback(async () => {
    if (liveBackendEnabled) await loadLiveData();
  }, [loadLiveData]);

  const updateRole = (newRole: UserRole) => {
    if (liveBackendEnabled) return;
    demoUpdateRole(profiles, newRole, setCurrentRole, setCurrentProfile);
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
          owner_name: newSettings.owner_name,
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

    return demoUpdateStoreSettings(storeSettings, newSettings, setStoreSettings);
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

    return demoAddProduct(newProduct, setProducts);
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

    return demoUpdateProduct(id, updates, setProducts);
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

    return demoAddInventoryUnits(
      inventoryUnits,
      productId,
      condition,
      purchaseCost,
      sellingPrice,
      imeis,
      setInventoryUnits
    );
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

    return demoUpdateUnitStatus(inventoryUnits, unitId, status, setInventoryUnits);
  };

  const executePosSale = async (params: DemoPosSaleParams): Promise<Transaction> => {
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

    return demoExecutePosSale(inventoryUnits, params, setInventoryUnits, setTransactions);
  };

  const createServiceTicket = async (
    ticketData: DemoTicketData
  ): Promise<ServiceTicket> => {
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

    return demoCreateServiceTicket(serviceTickets, ticketData, setServiceTickets);
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
          // Opsional di updateTicketSchema, jadi undefined berarti "jangan
          // sentuh kolom ini" dan tiket lama yang belum punya rincian tetap
          // bisa diperbarui tanpa mengirim apa pun.
          costBreakdown: updates.cost_breakdown,
          photoUrls: updates.photo_urls,
        })
      );
      setServiceTickets((prev) =>
        prev.map((ticket) => (String(ticket.id) === String(ticketId) ? updated : ticket))
      );
      return;
    }

    return demoUpdateServiceTicket(serviceTickets, ticketId, updates, setServiceTickets);
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

    return demoAddStaff(name, role, phone, email, password, username, setProfiles);
  };

  const resetToDefault = () => {
    if (liveBackendEnabled) return;
    demoResetToDefault({
      setCurrentRole,
      setCurrentProfile,
      setStoreSettings,
      setProducts,
      setInventoryUnits,
      setTransactions,
      setServiceTickets,
      setProfiles,
    });
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
