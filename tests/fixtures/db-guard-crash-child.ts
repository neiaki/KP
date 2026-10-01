import net from "node:net";
import postgres from "postgres";
import { withConnectionGuard } from "../../src/db/client.ts";

/*
 * Harness untuk tests/db-client-guard-crash.test.ts, dijalankan sebagai proses
 * sendiri. Berkas ini bukan test: namanya sengaja tidak diakhiri .test.ts
 * supaya tidak ikut dijaring oleh `node --test tests/*.test.ts`.
 *
 * Yang diuji di sini adalah hal yang tidak bisa dibuktikan dari dalam satu
 * proses Node: apakah promise yang dibuang dengan `void` menghasilkan unhandled
 * rejection. Kalau iya, proses ini keluar dengan kode bukan nol, dan itulah
 * yang terjadi sebelum penjaganya diperbaiki.
 */

/** Port yang tidak ada yang listen, jadi connect-nya ditolak seketika. */
async function portTutup(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

const sql = postgres(`postgres://atcell:rahasia@127.0.0.1:${await portTutup()}/postgres`, {
  max: 1,
  connect_timeout: 1,
});

// Callback-nya sengaja melempar. Inilah yang dulu bisa mematikan proses:
// `void thenable.catch(...)` membuang promise yang dikembalikan .catch, dan
// penolakan dari callback yang melempar tidak punya catcher apa pun.
const dijaga = withConnectionGuard(sql, () => {
  throw new Error("onConnectionFailure sengaja melempar");
});

try {
  await dijaga`select 1`;
} catch {
  // Galatnya harus tetap sampai ke pemanggil; itu yang ditebak pemanggil.
}

// Dua putaran event loop, bukan jeda berbasis waktu. Callback penjaga
// terpasang saat tagged template dipanggil, jadi ia sudah berjalan di antrean
// microtask yang sama dengan penolakan aslinya; satu putaran setImmediate
// cukup untuk itu selesai, dan putaran kedua memberi kesempatan pemeriksaan
// unhandled rejection di Node untuk berjalan.
await new Promise<void>((resolve) => setImmediate(resolve));
await new Promise<void>((resolve) => setImmediate(resolve));

console.log("PROSES_SELAMAT");
