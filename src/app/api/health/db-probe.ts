import { sql } from "drizzle-orm";
// Jalur relatif, bukan alias @/, supaya modul ini bisa diimpor juga oleh test
// node tanpa Next.js. Next.js tetap memperlakukannya seperti impor relatif
// biasa.
import { invalidateDb, type Db } from "../../../db/client.ts";

/**
 * Probe skema untuk readiness.
 *
 * Dipisah dari route handler supaya bisa dijalankan tanpa Next.js: test
 * memanggilnya dengan klien postgres sungguhan yang diarahkan ke server
 * tiruan, jadi perilaku "database mati tetap 503" dan "koneksi rusak membuat
 * cache klien dibangun ulang" benar-benar diuji, bukan hanya dibaca.
 */
type SchemaProbe = {
  profiles: boolean;
  store_settings: boolean;
  products: boolean;
  inventory_units: boolean;
  transactions: boolean;
  transaction_items: boolean;
  trade_in_records: boolean;
  service_tickets: boolean;
  v_public_inventory: boolean;
};

export type DatabaseProbe = {
  reachable: boolean;
  schemaReady: boolean;
  /**
   * True kalau probe tidak menjawab dalam deadline-nya.
   *
   * Bedanya penting: koneksi yang menggantung tidak melempar galat apa pun,
   * jadi tidak ada handler yang bisa mendeteksinya. Kalau tidak ditandai,
   * klien yang menggantung akan dipakai lagi oleh probe berikutnya selamanya,
   * dan itulah bentuk insiden 2026-09-27: container dibuang karena 503 yang
   * tidak pernah berubah jawaban.
   */
  timedOut: boolean;
};

/** Batas waktu probe, supaya health check tidak pernah menggantung sendiri. */
const PROBE_TIMEOUT_MS = 3000;

const GAGAL: DatabaseProbe = { reachable: false, schemaReady: false, timedOut: false };
const GAGAL_KADALUARSA: DatabaseProbe = { reachable: false, schemaReady: false, timedOut: true };

/**
 * Tanya apakah database terjangkau dan skemanya sudah utuh.
 *
 * Fail-closed di semua jalur: db null, query melempar, atau waktu habis,
 * semuanya menjawab tidak terjangkau. Tidak ada jalur yang mengarang
 * database hidup, karena jawaban ini adalah gerbang deploy dan health
 * check Coolify.
 *
 * Probe yang lewat deadline juga membuang klien yang dipakainya. Koneksi yang
 * menggantung tidak melempar galat apa pun, jadi tidak ada handler lain yang
 * bisa mendeteksinya, dan tanpa langkah ini klien itu akan dipakai lagi oleh
 * setiap probe berikutnya selamanya. Itu persis bentuk insiden 2026-09-27:
 * 503 yang tidak pernah berubah jawaban sampai container di-restart manual.
 * Probe yang sudah membalas 503 ini tetap 503, jadi gerbang deploy tidak ikut
 * dilonggarkan: yang dilonggarkan hanya jalan pulihnya.
 */
export async function probeSchema(db: Db | null): Promise<DatabaseProbe> {
  if (!db) return GAGAL;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<DatabaseProbe>((resolve) => {
      timer = setTimeout(() => resolve(GAGAL_KADALUARSA), PROBE_TIMEOUT_MS);
      // Timeout ini hanya menangkap jawaban yang telat, jadi tidak boleh
      // menahan event loop tetap hidup. Route ini runtime nodejs, jadi unref
      // selalu ada.
      timer.unref?.();
    });
    const hasil = await Promise.race<DatabaseProbe>([
      db
        .execute<SchemaProbe>(sql`
          select
            to_regclass('public.profiles') is not null as profiles,
            to_regclass('public.store_settings') is not null as store_settings,
            to_regclass('public.products') is not null as products,
            to_regclass('public.inventory_units') is not null as inventory_units,
            to_regclass('public.transactions') is not null as transactions,
            to_regclass('public.transaction_items') is not null as transaction_items,
            to_regclass('public.trade_in_records') is not null as trade_in_records,
            to_regclass('public.service_tickets') is not null as service_tickets,
            to_regclass('public.v_public_inventory') is not null as v_public_inventory
        `)
        .then((rows) => {
          const row = rows[0];
          return {
            reachable: true,
            schemaReady: Boolean(
              row &&
                row.profiles &&
                row.store_settings &&
                row.products &&
                row.inventory_units &&
                row.transactions &&
                row.transaction_items &&
                row.trade_in_records &&
                row.service_tickets &&
                row.v_public_inventory
            ),
            timedOut: false,
          };
        })
        .catch(() => GAGAL),
      deadline,
    ]);
    // Klien yang lewat deadline dibuang di sini, bukan di route, supaya satu
    // tempat saja yang memutuskan dan test bisa mengujinya tanpa Next.js.
    if (hasil.timedOut) invalidateDb();
    return hasil;
  } catch {
    return GAGAL;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
