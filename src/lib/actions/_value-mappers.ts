/** Angka dari kolom NUMERIC kadang datang sebagai string; normalisasi ke number. */
export function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

/** Normalisasi timestamp Drizzle/Supabase ke ISO string untuk tipe domain. */
export function toISO(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}
