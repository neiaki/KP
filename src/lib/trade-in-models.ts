/* Sumber tunggal untuk model dan basis taksiran tukar tambah.
   Dipakai halaman trade-in publik dan form trade-in di POS supaya staff
   memakai daftar yang sama dengan yang dilihat pelanggan. */

/* Tukar tambah saat ini hanya menerima iPhone 11 ke atas. Lineup per seri
   lengkap dengan basis taksiran (rupiah) tiap varian. Bukan harga final,
   hanya titik awal sebelum cek fisik di konter. */
export const IPHONE_LINEUP: Array<{
  series: string;
  storage: number[];
  models: Array<{ value: string; base: number }>;
}> = [
  {
    series: "17",
    storage: [256, 512, 1024],
    models: [
      { value: "iPhone 17", base: 15000000 },
      { value: "iPhone 17 Pro", base: 18000000 },
      { value: "iPhone 17 Pro Max", base: 20000000 },
    ],
  },
  {
    series: "16",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 16e", base: 9000000 },
      { value: "iPhone 16", base: 13500000 },
      { value: "iPhone 16 Plus", base: 14000000 },
      { value: "iPhone 16 Pro", base: 16000000 },
      { value: "iPhone 16 Pro Max", base: 17500000 },
    ],
  },
  {
    series: "15",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 15", base: 12000000 },
      { value: "iPhone 15 Plus", base: 12500000 },
      { value: "iPhone 15 Pro", base: 14000000 },
      { value: "iPhone 15 Pro Max", base: 15500000 },
    ],
  },
  {
    series: "14",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 14", base: 9500000 },
      { value: "iPhone 14 Plus", base: 10000000 },
      { value: "iPhone 14 Pro", base: 11000000 },
      { value: "iPhone 14 Pro Max", base: 12000000 },
    ],
  },
  {
    series: "13",
    storage: [128, 256, 512, 1024],
    models: [
      { value: "iPhone 13 mini", base: 6000000 },
      { value: "iPhone 13", base: 7500000 },
      { value: "iPhone 13 Pro", base: 8500000 },
      { value: "iPhone 13 Pro Max", base: 9500000 },
    ],
  },
  {
    series: "12",
    storage: [64, 128, 256, 512],
    models: [
      { value: "iPhone 12 mini", base: 4500000 },
      { value: "iPhone 12", base: 5500000 },
      { value: "iPhone 12 Pro", base: 6500000 },
      { value: "iPhone 12 Pro Max", base: 7500000 },
    ],
  },
  {
    series: "11",
    storage: [64, 128, 256, 512],
    models: [
      { value: "iPhone 11", base: 3500000 },
      { value: "iPhone 11 Pro", base: 4000000 },
      { value: "iPhone 11 Pro Max", base: 4500000 },
    ],
  },
];

/** Semua model dalam bentuk datar, untuk dropdown tanpa pengelompokan. */
export const TRADE_IN_MODELS: string[] = IPHONE_LINEUP.flatMap((s) =>
  s.models.map((m) => m.value)
);

export function storageFactor(gb: number): number {
  if (gb >= 1024) return 1.3;
  if (gb >= 512) return 1.2;
  if (gb >= 256) return 1.1;
  if (gb <= 64) return 0.9;
  return 1;
}

export function storageLabel(gb: number): string {
  return gb >= 1024 ? `${Math.round(gb / 1024)}TB` : `${gb}GB`;
}

export function seriesOf(model: string) {
  return IPHONE_LINEUP.find((s) => s.models.some((m) => m.value === model)) ?? IPHONE_LINEUP[1];
}

/** Basis taksiran rupiah untuk sebuah model, lintas semua seri. */
export function basePriceOf(model: string): number {
  for (const s of IPHONE_LINEUP) {
    const found = s.models.find((m) => m.value === model);
    if (found) return found.base;
  }
  return 3500000;
}
