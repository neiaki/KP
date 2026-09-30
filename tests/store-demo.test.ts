import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DATA_VERSION,
  STORAGE_KEYS,
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
} from "../src/lib/store-demo.ts";
import type {
  InventoryUnit,
  Product,
  Profile,
  ServiceTicket,
  StoreSettings,
  Transaction,
  UserRole,
} from "../src/types/index.ts";

/*
 * Mesin mode demo diuji tanpa React dan tanpa browser.
 *
 * src/lib/store-demo.ts sengaja ditulis sebagai fungsi murni ditambah
 * localStorage: tidak ada hooks, tidak ada Server Action, tidak ada impor
 * "@/...". Itu yang membuat berkas ini bisa diimpor runner node, dan test
 * di bawah mengunci tiga hal yang tidak bisa dijaga test lain:
 *
 * 1. Setiap mutasi demo tetap menulis kunci localStorage yang sama, karena
 *    data pengguna yang sudah tersimpan harus tetap terbaca setelah update.
 * 2. Penjaga bisnis demo (anti double-sell, IMEI 15 digit, alur servis)
 *    tetap menolak seperti semula, karena portal demo dipakai tanpa backend
 *    dan satu-satunya yang mencegah stok ganda adalah kode ini.
 * 3. src/lib/store.ts tidak lagi menyentuh localStorage maupun mock-data
 *    secara langsung, supaya bundle production tidak ikut memuat jalur demo.
 */

// localStorage tidak ada di node. Stub ini meniru API yang dipakai modul:
// getItem, setItem, removeItem. JSON.parse/stringify tetap yang asli.
function pasangStorageAwal(): Map<string, string> {
  const isi = new Map<string, string>();
  const stub = {
    getItem: (kunci: string) => (isi.has(kunci) ? isi.get(kunci)! : null),
    setItem: (kunci: string, nilai: string) => {
      isi.set(kunci, String(nilai));
    },
    removeItem: (kunci: string) => {
      isi.delete(kunci);
    },
    clear: () => isi.clear(),
    get length() {
      return isi.size;
    },
    key: (i: number) => [...isi.keys()][i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: stub,
    writable: true,
    configurable: true,
  });
  return isi;
}

/** Setter React tiruan: menampung nilai terakhir, mendukung updater function. */
function penampung<T>(awal: T): {
  nilai: () => T;
  set: (v: T | ((sebelum: T) => T)) => void;
} {
  let sekarang = awal;
  return {
    nilai: () => sekarang,
    set: (v) => {
      sekarang = typeof v === "function" ? (v as (s: T) => T)(sekarang) : v;
    },
  };
}

function profil(id: string, role: UserRole): Profile {
  return {
    id,
    full_name: id,
    role,
    phone_number: "",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function unit(
  id: number,
  imei: string,
  status: InventoryUnit["status"] = "available"
): InventoryUnit {
  return {
    id,
    product_id: 1,
    imei,
    condition: "new",
    status,
    purchase_cost: 800000,
    selling_price: 1000000,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function produk(id: number): Product {
  return {
    id,
    brand: "Apple",
    model_name: `Model ${id}`,
    specs: "",
    default_price: 1000000,
    image_url: "",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function tiket(id: number, status: ServiceTicket["repair_status"]): ServiceTicket {
  return {
    id,
    ticket_code: `SRV-20260101-TEST${String(id).padStart(4, "0")}`,
    customer_id: null,
    technician_id: null,
    customer_name: "Pelanggan",
    customer_phone: "",
    device_model: "Unit",
    imei_or_sn: "",
    issue_notes: "",
    repair_status: status,
    photo_urls: [],
    sparepart_fee: 0,
    labor_fee: 100000,
    total_fee: 100000,
    warranty_days: 30,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("pindah peran menyimpan peran dan profil yang cocok", () => {
  pasangStorageAwal();
  const daftar = [profil("a", "admin"), profil("s", "sales")];
  const peran = penampung<UserRole>("admin");
  const orang = penampung<Profile | null>(daftar[0]!);
  demoUpdateRole(daftar, "sales", peran.set, orang.set);
  assert.equal(peran.nilai(), "sales");
  assert.equal(orang.nilai()?.id, "s");
  assert.equal(
    globalThis.localStorage.getItem(STORAGE_KEYS.CURRENT_ROLE),
    "sales"
  );
});

test("pengaturan toko digabung dan bertahan di storage", () => {
  pasangStorageAwal();
  const awal: StoreSettings = { ...demoInitialState.storeSettings };
  const wadah = penampung<StoreSettings>(awal);
  const hasil = demoUpdateStoreSettings(
    awal,
    { store_name: "Toko Uji" },
    wadah.set
  );
  assert.equal(hasil.store_name, "Toko Uji");
  assert.equal(wadah.nilai().store_name, "Toko Uji");
  assert.ok(hasil.updated_at);
  const tersimpan = JSON.parse(
    globalThis.localStorage.getItem(STORAGE_KEYS.STORE_SETTINGS)!
  );
  assert.equal(tersimpan.store_name, "Toko Uji");
});

test("tambah dan ubah produk bertahan di storage", () => {
  pasangStorageAwal();
  const wadah = penampung<Product[]>([]);
  const dibuat = demoAddProduct(
    {
      brand: "Xiaomi",
      model_name: "Unit",
      specs: "",
      default_price: 2000000,
      image_url: "",
    },
    wadah.set
  );
  assert.ok(dibuat.id);
  assert.equal(wadah.nilai().length, 1);
  const ubah = demoUpdateProduct(dibuat.id, { specs: "Baru" }, wadah.set);
  assert.equal(ubah?.specs, "Baru");
  assert.equal(demoUpdateProduct(999999, {}, wadah.set), undefined);
});

test("registrasi IMEI menolak duplikat dan format salah", () => {
  pasangStorageAwal();
  const wadah = penampung<InventoryUnit[]>([unit(1, "350000000000001")]);
  assert.throws(
    () =>
      demoAddInventoryUnits(wadah.nilai(), 1, "new", 0, 0, ["350000000000001"], wadah.set),
    /sudah terdaftar/
  );
  assert.throws(
    () => demoAddInventoryUnits(wadah.nilai(), 1, "new", 0, 0, ["tidak-valid"], wadah.set),
    /IMEI/
  );
  const baru = demoAddInventoryUnits(wadah.nilai(), 1, "new", 800000, 1000000, ["350000000000002"], wadah.set);
  assert.equal(baru.length, 1);
  assert.equal(baru[0]!.status, "available");
  assert.equal(wadah.nilai().length, 2);
});

test("status sold hanya lewat POS, dan sold tidak bisa kembali", () => {
  pasangStorageAwal();
  const wadah = penampung<InventoryUnit[]>([unit(1, "350000000000001")]);
  assert.throws(() => demoUpdateUnitStatus(wadah.nilai(), 1, "sold", wadah.set), /POS/);
  assert.throws(() => demoUpdateUnitStatus(wadah.nilai(), 999, "reserved", wadah.set), /tidak ditemukan/);
  demoUpdateUnitStatus(wadah.nilai(), 1, "reserved", wadah.set);
  assert.equal(wadah.nilai()[0]!.status, "reserved");
  const wadahSold = penampung<InventoryUnit[]>([unit(2, "350000000000002", "sold")]);
  assert.throws(
    () => demoUpdateUnitStatus(wadahSold.nilai(), 2, "available", wadahSold.set),
    /tidak dapat dikembalikan/
  );
});

test("POS menolak double-sell dan mencatat nota", () => {
  pasangStorageAwal();
  const units = penampung<InventoryUnit[]>([unit(1, "350000000000001")]);
  const nota = penampung<Transaction[]>([]);
  const hasil = demoExecutePosSale(
    units.nilai(),
    {
      unitId: 1,
      customerName: "Budi",
      customerPhone: "0812",
      paymentMethod: "cash",
      warrantyDurationMonths: 3,
    },
    units.set,
    nota.set
  );
  assert.equal(hasil.final_payment, 1000000);
  assert.equal(hasil.items[0]!.warranty_duration_months, 3);
  // State yang dipakai pemanggilan kedua harus yang sudah terjual.
  assert.throws(
    () =>
      demoExecutePosSale(
        units.nilai(),
        {
          unitId: 1,
          customerName: "Budi",
          customerPhone: "0812",
          paymentMethod: "cash",
          warrantyDurationMonths: 3,
        },
        units.set,
        nota.set
      ),
    /tidak bisa dijual lagi/
  );
  assert.throws(
    () =>
      demoExecutePosSale(
        [unit(9, "350000000000009")],
        {
          unitId: 999,
          customerName: "Budi",
          customerPhone: "0812",
          paymentMethod: "cash",
          warrantyDurationMonths: 3,
        },
        units.set,
        nota.set
      ),
    /tidak ditemukan/
  );
});

test("POS trade-in mendaftarkan unit lama sebagai stok second", () => {
  pasangStorageAwal();
  const units = penampung<InventoryUnit[]>([unit(1, "350000000000001")]);
  const nota = penampung<Transaction[]>([]);
  const hasil = demoExecutePosSale(
    units.nilai(),
    {
      unitId: 1,
      customerName: "Budi",
      customerPhone: "0812",
      paymentMethod: "qris",
      warrantyDurationMonths: 3,
      tradeIn: {
        originalBrandModel: "Merek Lama",
        imei: "350000000000002",
        gradingDetails: {},
        offeredPrice: 400000,
        photoUrls: [],
      },
    },
    units.set,
    nota.set
  );
  assert.equal(hasil.final_payment, 600000);
  assert.equal(hasil.trade_in_deduction, 400000);
  const stok = units.nilai();
  assert.equal(stok.length, 2);
  const masuk = stok.find((u) => u.imei === "350000000000002")!;
  assert.equal(masuk.condition, "second");
  assert.equal(masuk.status, "available");
  assert.equal(masuk.product_id, null);
  assert.throws(
    () =>
      demoExecutePosSale(
        [unit(7, "350000000000007")],
        {
          unitId: 7,
          customerName: "Budi",
          customerPhone: "0812",
          paymentMethod: "cash",
          warrantyDurationMonths: 3,
          tradeIn: {
            originalBrandModel: "X",
            imei: "pendek",
            gradingDetails: {},
            offeredPrice: 1,
            photoUrls: [],
          },
        },
        units.set,
        nota.set
      ),
    /15 digit/
  );
});

test("kode tiket unik dan berformat resmi", () => {
  pasangStorageAwal();
  const wadah = penampung<ServiceTicket[]>([]);
  const a = demoCreateServiceTicket(
    wadah.nilai(),
    {
      customerName: "A",
      customerPhone: "",
      deviceModel: "Unit",
      imeiOrSn: "",
      issueNotes: "",
    },
    wadah.set
  );
  const b = demoCreateServiceTicket(
    wadah.nilai(),
    {
      customerName: "B",
      customerPhone: "",
      deviceModel: "Unit",
      imeiOrSn: "",
      issueNotes: "",
    },
    wadah.set
  );
  assert.match(a.ticket_code, /^SRV-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.notEqual(a.ticket_code, b.ticket_code);
  assert.equal(a.repair_status, "received");
});

test("transisi servis liar ditolak, yang sah menghitung ulang biaya", () => {
  pasangStorageAwal();
  const wadah = penampung<ServiceTicket[]>([tiket(1, "received")]);
  assert.throws(
    () => demoUpdateServiceTicket(wadah.nilai(), 1, { repair_status: "picked_up" }, wadah.set),
    /tidak diizinkan/
  );
  assert.throws(
    () => demoUpdateServiceTicket(wadah.nilai(), 999, {}, wadah.set),
    /tidak ditemukan/
  );
  demoUpdateServiceTicket(
    wadah.nilai(),
    1,
    { repair_status: "diagnosing", sparepart_fee: 50000 },
    wadah.set
  );
  const sesudah = wadah.nilai()[0]!;
  assert.equal(sesudah.repair_status, "diagnosing");
  assert.equal(sesudah.total_fee, 150000);
});

test("tambah staf demo mengembalikan profil dan bertahan", () => {
  pasangStorageAwal();
  const wadah = penampung<Profile[]>([]);
  const dibuat = demoAddStaff(
    "Staf",
    "sales",
    "0812",
    "staf@uji.id",
    undefined,
    undefined,
    wadah.set
  );
  assert.ok(dibuat?.id.startsWith("prof-"));
  assert.equal(wadah.nilai().length, 1);
});

test("reset mengembalikan data awal dan menandai versi", () => {
  const isi = pasangStorageAwal();
  isi.set(STORAGE_KEYS.PRODUCTS, JSON.stringify([produk(9)]));
  const peran = penampung<UserRole>("sales");
  const orang = penampung<Profile | null>(profil("x", "sales"));
  const pengaturan = penampung<StoreSettings>({ ...demoInitialState.storeSettings, store_name: "Ubah" });
  const barang = penampung<Product[]>([produk(9)]);
  const stok = penampung<InventoryUnit[]>([unit(9, "350000000000009")]);
  const nota = penampung<Transaction[]>([]);
  const servis = penampung<ServiceTicket[]>([tiket(9, "received")]);
  const staf = penampung<Profile[]>([profil("x", "sales")]);
  demoResetToDefault({
    setCurrentRole: peran.set,
    setCurrentProfile: orang.set,
    setStoreSettings: pengaturan.set,
    setProducts: barang.set,
    setInventoryUnits: stok.set,
    setTransactions: nota.set,
    setServiceTickets: servis.set,
    setProfiles: staf.set,
  });
  assert.equal(peran.nilai(), "admin");
  assert.equal(pengaturan.nilai().store_name, demoInitialState.storeSettings.store_name);
  assert.deepEqual(
    barang.nilai().map((p) => p.id),
    demoInitialState.products.map((p) => p.id)
  );
  assert.equal(isi.has(STORAGE_KEYS.PRODUCTS), false);
  assert.equal(isi.get("atcell_data_version"), DATA_VERSION);
});

test("hydrate membaca simpanan dan menandai mounted", () => {
  const isi = pasangStorageAwal();
  isi.set("atcell_data_version", DATA_VERSION);
  isi.set(STORAGE_KEYS.CURRENT_ROLE, "sales");
  isi.set(STORAGE_KEYS.PRODUCTS, JSON.stringify([produk(3)]));
  const peran = penampung<UserRole>("admin");
  const barang = penampung<Product[]>([]);
  const pasang = penampung<boolean>(false);
  hydrateDemoFromLocalStorage({
    setCurrentRole: peran.set,
    setStoreSettings: (() => {}) as never,
    setProducts: barang.set,
    setInventoryUnits: (() => {}) as never,
    setTransactions: (() => {}) as never,
    setServiceTickets: (() => {}) as never,
    setProfiles: (() => {}) as never,
    setMounted: pasang.set,
  });
  assert.equal(peran.nilai(), "sales");
  assert.equal(barang.nilai().length, 1);
  assert.equal(pasang.nilai(), true);
});

test("hydrate membuang data versi lama", () => {
  const isi = pasangStorageAwal();
  isi.set("atcell_data_version", "lama-sekali");
  isi.set(STORAGE_KEYS.PRODUCTS, JSON.stringify([produk(3)]));
  const barang = penampung<Product[]>([]);
  const pasang = penampung<boolean>(false);
  hydrateDemoFromLocalStorage({
    setCurrentRole: (() => {}) as never,
    setStoreSettings: (() => {}) as never,
    setProducts: barang.set,
    setInventoryUnits: (() => {}) as never,
    setTransactions: (() => {}) as never,
    setServiceTickets: (() => {}) as never,
    setProfiles: (() => {}) as never,
    setMounted: pasang.set,
  });
  assert.equal(barang.nilai().length, 0);
  assert.equal(isi.get("atcell_data_version"), DATA_VERSION);
});

test("store.ts tidak menyentuh localStorage maupun mock-data langsung", async () => {
  // Pemisahan ini yang membuat bundle production tidak ikut memuat jalur
  // demo. Kalau suatu hari ada yang mengimpor mock-data lagi dari store.ts,
  // seluruh data contoh ikut terkirim ke setiap pengunjung.
  const sumber = await readFile(new URL("../src/lib/store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(sumber, /localStorage/);
  assert.doesNotMatch(sumber, /mock-data/);
  // Jalur demo tetap ada, tapi lewat modulnya sendiri.
  assert.match(sumber, /store-demo\.ts/);
});
