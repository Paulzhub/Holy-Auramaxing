import { appRoutes, expect, test } from "./fixtures";

test("pages send a nonce-based CSP that matches the page's scripts", async ({ page }) => {
  const response = await page.goto("/home");
  const csp = response!.headers()["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  expect(nonce).toBeTruthy();

  const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
  expect(scriptSrc).not.toContain("unsafe-inline");
  expect(scriptSrc).not.toContain("unsafe-eval");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");

  // Every inline/external script in the HTML carries this request's nonce.
  const scriptNonces = await page
    .locator("script")
    .evaluateAll((els) => els.map((el) => (el as HTMLScriptElement).nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  for (const n of scriptNonces) expect(n).toBe(nonce);
});

test("nonces differ between requests", async ({ request }) => {
  const a = (await request.get("/home")).headers()["content-security-policy"];
  const b = (await request.get("/home")).headers()["content-security-policy"];
  expect(a).not.toBe(b);
});

test("security headers are present on pages and API routes", async ({ request }) => {
  for (const path of ["/", "/home", "/api/health"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["strict-transport-security"], path).toContain("max-age=63072000");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
});

test("app pages are never indexed; the public page is", async ({ page }) => {
  for (const route of appRoutes) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]'), route).toHaveAttribute("content", /noindex/);
  }
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("tab titles stay neutral", async ({ page }) => {
  for (const route of ["/", ...appRoutes]) {
    await page.goto(route);
    const title = (await page.title()).toLowerCase();
    expect(title, route).toMatch(/aura/);
    for (const word of ["porn", "fap", "lust", "relapse", "addiction", "xxx"]) expect(title, route).not.toContain(word);
  }
});

test("health endpoint reports status without leaking configuration", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/http|key|sb_/i);
});
