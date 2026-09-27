import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";

/*
 * scripts/smoke-deployment.mjs adalah satu-satunya sinyal readiness otomatis
 * di docs/DEPLOYMENT-REDUNDANCY.md, jadi aturannya harus benar-benar bisa
 * gagal.
 *
 * Versi sebelumnya menulis:
 *   const ok = isRedirect || (expectedReady ? status === 200 : status < 600);
 * "status < 600" selalu benar untuk status HTTP apa pun, jadi begitu
 * SMOKE_REQUIRE_READY=0 diaktifkan, gerbang rilis tidak akan pernah gagal,
 * termasuk saat aplikasi membalas 404 atau 500. Escape hatch itu tidak
 * terdokumentasi di mana pun, jadi siapa pun yang menyetelnya tanpa membaca
 * kodenya akan mengira gerbang masih bekerja.
 *
 * src/app/api/health/ready hanya mengembalikan 200 (siap) atau 503 (belum
 * siap), jadi cabang longgar yang benar hanya boleh meloloskan 503.
 *
 * Test ini menjalankan skrip aslinya sebagai proses anak terhadap server HTTP
 * lokal yang statusnya kita tentukan, bukan menyalin aturan penilaiannya.
 * Menyalinnya pernah berarti test bisa lulus sementara skripnya sudah rusak.
 */

type Status = Record<string, number>;

function jalankanSmoke(status: Status, env: Record<string, string> = {}) {
  return new Promise<{ code: number; out: string }>((resolve, reject) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0];
      const code = status[path] ?? 200;
      res.writeHead(code, { "content-type": "text/plain" });
      res.end("ok");
    });
    server.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("server tidak dapat dibuat"));
        return;
      }
      const child = execFile(
        process.execPath,
        ["scripts/smoke-deployment.mjs", `http://127.0.0.1:${address.port}`],
        { env: { ...process.env, ...env } },
        (error, stdout, stderr) => {
          server.close();
          const code = error && typeof (error as { code?: number }).code === "number"
            ? ((error as { code?: number }).code as number)
            : 0;
          resolve({ code, out: `${stdout}${stderr}` });
        }
      );
      child.on("error", (error) => {
        server.close();
        reject(error);
      });
    });
  });
}

/** Status default yang membuat semua probe terlihat sehat. */
const SEHAT: Status = {
  "/api/health/live": 200,
  "/api/health/ready": 200,
  "/id": 200,
  "/id/catalog": 200,
  "/id/tracking": 200,
  "/portal/login": 307,
};

test("smoke lulus saat semua probe sehat", async () => {
  const { code, out } = await jalankanSmoke(SEHAT);
  assert.equal(code, 0, `harus exit 0, keluarannya:\n${out}`);
  assert.doesNotMatch(out, /FAIL/);
});

test("503 dari /api/health/ready menggagalkan smoke secara bawaan", async () => {
  // Readiness adalah syarat deploy. Melonggarnya harus disengaja.
  const { code, out } = await jalankanSmoke({ ...SEHAT, "/api/health/ready": 503 });
  assert.equal(code, 1, "harus gagal tanpa SMOKE_REQUIRE_READY");
  assert.match(out, /FAIL ready 503/);
});

test("SMOKE_REQUIRE_READY=0 meloloskan 503 karena itu arti 'belum siap'", async () => {
  const { code, out } = await jalankanSmoke(
    { ...SEHAT, "/api/health/ready": 503 },
    { SMOKE_REQUIRE_READY: "0" }
  );
  assert.equal(code, 0, `503 harus diloloskan, keluarannya:\n${out}`);
});

test("SMOKE_REQUIRE_READY=0 tidak meloloskan 404 dari readiness", async () => {
  // Inilah bug aslinya. Dengan "< 600" semua status ini dianggap PASS.
  const { code, out } = await jalankanSmoke(
    { ...SEHAT, "/api/health/ready": 404 },
    { SMOKE_REQUIRE_READY: "0" }
  );
  assert.equal(code, 1, "404 harus tetap gagal walau mode longgar aktif");
  assert.match(out, /FAIL ready 404/);
});

test("SMOKE_REQUIRE_READY=0 tidak meloloskan 500 maupun 502", async () => {
  for (const status of [500, 502, 503]) {
    const { code, out } = await jalankanSmoke(
      { ...SEHAT, "/api/health/ready": status },
      { SMOKE_REQUIRE_READY: "0" }
    );
    if (status === 503) {
      assert.equal(code, 0, "503 memang boleh lolos");
    } else {
      assert.equal(code, 1, `status ${status} harus gagal`);
      assert.match(out, new RegExp(`FAIL ready ${status}`));
    }
  }
});

test("halaman publik yang rusak menggagalkan smoke meski readiness longgar", async () => {
  const { code, out } = await jalankanSmoke(
    { ...SEHAT, "/id/catalog": 500 },
    { SMOKE_REQUIRE_READY: "0" }
  );
  assert.equal(code, 1);
  assert.match(out, /FAIL public-catalog 500/);
});

test("redirect 3xx di login portal tetap dianggap PASS", async () => {
  const { code, out } = await jalankanSmoke({ ...SEHAT, "/portal/login": 302 });
  assert.equal(code, 0, `login dialihkan boleh lolos, keluarannya:\n${out}`);
  assert.match(out, /PASS portal-login 302/);
});
