#!/usr/bin/env node
/*
 * Ukur Lighthouse (mobile) semua halaman utama pada production build lokal.
 *
 * Dijalankan lewat `npm run perf`. Prasyarat: `npm run build` sudah
 * menghasilkan .next/BUILD_ID. Skrip ini:
 *   1. menyalakan `next start` di port 3210,
 *   2. menjalankan Lighthouse headless (chromium sistem, via npx — tanpa
 *      menambah dependency ke package.json) 3x per halaman,
 *   3. mencetak tabel median (Performance/A11y/BestPractices/SEO,
 *      LCP/CLS/TBT) format Markdown untuk docs/LOOP_LOG.md.
 *
 * Server selalu dimatikan di finally, apa pun hasilnya.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3210;
const BASE = `http://127.0.0.1:${PORT}`;
const HALAMAN = ["/id", "/id/catalog", "/id/tracking", "/id/trade-in", "/en"];
const RUNS = 3;

if (!existsSync(".next/BUILD_ID")) {
  console.error("Build belum ada. Jalankan `npm run build` dulu.");
  process.exit(1);
}

const CHROME = ["/usr/sbin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) {
  console.error("Binary chromium tidak ditemukan.");
  process.exit(1);
}

function tungguSehat(timeoutMs = 30000) {
  const mulai = Date.now();
  return new Promise((resolve, reject) => {
    const coba = async () => {
      try {
        const r = await fetch(`${BASE}/api/health/live`);
        if (r.ok) return resolve();
      } catch {}
      if (Date.now() - mulai > timeoutMs) return reject(new Error("server tidak siap"));
      setTimeout(coba, 500);
    };
    coba();
  });
}

function lighthouseSekali(path, runKe, outDir) {
  const outFile = join(outDir, `lh-${path.replace(/\//g, "_")}-${runKe}.json`);
  const args = [
    "--yes", "lighthouse@12",
    `${BASE}${path}`,
    `--output=json`, `--output-path=${outFile}`,
    "--quiet",
    "--only-categories=performance,accessibility,best-practices,seo",
    "--form-factor=mobile",
    `--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage`,
  ];
  const hasil = spawnSync("npx", args, { encoding: "utf8", timeout: 120000 });
  if (hasil.status !== 0 || !existsSync(outFile)) {
    throw new Error(`lighthouse gagal utk ${path} run ${runKe} (status=${hasil.status}):
stdout: ${(hasil.stdout || "").slice(-500)}
stderr: ${(hasil.stderr || "").slice(-500)}`);
  }
  const laporan = JSON.parse(readFileSync(outFile, "utf8"));
  return {
    perf: Math.round(laporan.categories.performance.score * 100),
    a11y: Math.round(laporan.categories.accessibility.score * 100),
    bp: Math.round(laporan.categories["best-practices"].score * 100),
    seo: Math.round(laporan.categories.seo.score * 100),
    lcp: laporan.audits["largest-contentful-paint"].numericValue,
    cls: laporan.audits["cumulative-layout-shift"].numericValue,
    tbt: laporan.audits["total-blocking-time"].numericValue,
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  stdio: "ignore",
  detached: true,
});
const outDir = mkdtempSync(join(tmpdir(), "lh-atcell-"));

try {
  await tungguSehat();
  console.log(`Server siap di ${BASE}; chromium: ${CHROME}; halaman: ${HALAMAN.length}; run: ${RUNS}`);
  const baris = [];
  for (const p of HALAMAN) {
    const runs = [];
    for (let i = 1; i <= RUNS; i++) {
      const m = lighthouseSekali(p, i, outDir);
      runs.push(m);
      console.log(`  ${p} run ${i}: P${m.perf} A${m.a11y} BP${m.bp} SEO${m.seo} LCP=${(m.lcp / 1000).toFixed(2)}s CLS=${m.cls.toFixed(3)} TBT=${Math.round(m.tbt)}ms`);
    }
    baris.push({
      halaman: p,
      perf: median(runs.map((r) => r.perf)),
      a11y: median(runs.map((r) => r.a11y)),
      bp: median(runs.map((r) => r.bp)),
      seo: median(runs.map((r) => r.seo)),
      lcp: median(runs.map((r) => r.lcp)),
      cls: median(runs.map((r) => r.cls)),
      tbt: median(runs.map((r) => r.tbt)),
    });
  }
  console.log("\n| Halaman | Perf | A11y | BP | SEO | LCP | CLS | TBT |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const b of baris) {
    console.log(`| ${b.halaman} | ${b.perf} | ${b.a11y} | ${b.bp} | ${b.seo} | ${(b.lcp / 1000).toFixed(2)}s | ${b.cls.toFixed(3)} | ${Math.round(b.tbt)}ms |`);
  }
  const target = baris.every((b) => b.perf >= 90 && b.a11y >= 95 && b.bp >= 95 && b.seo >= 95 && b.lcp <= 2500 && b.cls <= 0.1 && b.tbt <= 200);
  console.log(`\nTARGET (P>=90 A>=95 BP>=95 SEO>=95 LCP<=2.5s CLS<=0.1 TBT<=200ms): ${target ? "LULUS SEMUA" : "ADA YANG DI BAWAH TARGET (lihat baris)"}`);
} finally {
  try { process.kill(-server.pid, "SIGTERM"); } catch { try { server.kill("SIGTERM"); } catch {} }
  console.error("server next start dimatikan");
}
