const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("Usage: npm run smoke:deployment -- <base-url> [<base-url>]");
  process.exit(2);
}

const paths = [
  ["/api/health/live", "live"],
  ["/api/health/ready", "ready"],
  ["/id", "public-home"],
  ["/id/catalog", "public-catalog"],
  ["/id/tracking", "public-tracking"],
  ["/portal/login", "portal-login"],
];

let failed = false;

for (const target of targets) {
  const base = target.replace(/\/$/, "");
  console.log(`\n${base}`);
  for (const [path, label] of paths) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${base}${path}`, {
        redirect: "manual",
        signal: controller.signal,
      });
      const expectedReady = path !== "/api/health/ready" || process.env.SMOKE_REQUIRE_READY !== "0";
      const isRedirect = label === "portal-login" && response.status >= 300 && response.status < 400;
      const ok = isRedirect || (expectedReady ? response.status === 200 : response.status < 600);
      console.log(`${ok ? "PASS" : "FAIL"} ${label} ${response.status}`);
      if (!ok) failed = true;
    } catch (error) {
      console.log(`FAIL ${label} ${error instanceof Error ? error.message : "request failed"}`);
      failed = true;
    } finally {
      clearTimeout(timeout);
    }
  }
}

process.exit(failed ? 1 : 0);
