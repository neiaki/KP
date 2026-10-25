#!/usr/bin/env node
/*
 * Smoke render halaman publik terhadap production build LOKAL.
 *
 * `npm run smoke:render`. Prasyarat: `npm run build` sudah menghasilkan
 * .next/BUILD_ID. Skrip menyalakan `next start` di port 3299, mem-fetch
 * halaman publik utama, memeriksa status 200 + konten kunci per halaman
 * (bukan cuma /api/health), lalu mematikan server. Tidak butuh kredensial
 * apa pun: tanpa env, halaman publik merender dengan seed demo.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = 3299;
const BASE = `http://127.0.0.1:${PORT}`;

const HALAMAN = [
  { path: "/id", kunci: ["At Cell", "Serpong"] },
  { path: "/en", kunci: ["At Cell", "Serpong"] },
  { path: "/id/catalog", kunci: ["At Cell"] },
  { path: "/id/tracking", kunci: ["SRV-"] },
  { path: "/id/trade-in", kunci: ["At Cell"] },
];

if (!existsSync(".next/BUILD_ID")) {
  console.error("Build belum ada. Jalankan `npm run build` dulu.");
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  detached: true,
});

async function tungguSehat(timeoutMs = 30000) {
  const mulai = Date.now();
  while (Date.now() - mulai < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health/live`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server tidak siap");
}

let gagal = 0;
try {
  await tungguSehat();
  console.log(`Server siap ${BASE}; merender ${HALAMAN.length} halaman...`);
  for (const { path, kunci } of HALAMAN) {
    const res = await fetch(`${BASE}${path}`);
    const html = await res.text();
    const hilang = kunci.filter((k) => !html.includes(k));
    const ok = res.status === 200 && hilang.length === 0;
    if (!ok) gagal++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${path} status=${res.status} ukuran=${Math.round(html.length / 1024)}KB${hilang.length ? ` konten hilang: ${hilang.join(",")}` : ""}`
    );
  }
  console.log(gagal === 0 ? "SMOKE-RENDER: SEMUA PASS" : `SMOKE-RENDER: ${gagal} GAGAL`);
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { try { server.kill("SIGTERM"); } catch {} }
}
process.exit(gagal === 0 ? 0 : 1);
