import { appRoutes, authRoutes, expect, publicRoutes, signedOut, test, testClientIp } from "./fixtures";

/**
 * The public website (Phase 9a, CLAUDE.md §12, D-114 to D-119): readable
 * without JavaScript, indexed only where it should be, and never covered by
 * the app lock.
 */

test.use({ storageState: signedOut });

/** Draft articles (D-120): kept in the repo for review, never on the site. */
const draftArticles = [
  "/articles/how-to-quit-porn-as-a-christian",
  "/articles/what-does-the-bible-say-about-lust",
  "/articles/how-to-help-a-friend-who-is-struggling",
];

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("every public page has its heading, landmarks and copy in the server HTML", async ({ page }) => {
    for (const route of publicRoutes) {
      const response = await page.goto(route);
      expect(response!.status(), route).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
      await expect(page.getByRole("main"), route).toHaveCount(1);
      await expect(page.getByRole("contentinfo"), route).toHaveCount(1);
    }
  });

  test("the scroll story reads in order, and its calls to action work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Freedom grows one day at a time" })).toBeVisible();
    const headings = await page.locator("[data-story] h2").allInnerTexts();
    expect(headings).toEqual([
      "Many of us carry something we’ve never told anyone.",
      "You are not your worst day.",
      "One honest answer a day",
      "Together, not alone",
    ]);
    await page.getByRole("link", { name: "See how it works" }).click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByRole("heading", { level: 1, name: "How it works" })).toBeVisible();
  });

  test("the phone menu opens without JavaScript", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const faq = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "FAQ" });
    await expect(faq).toBeHidden();
    await page.getByText("Menu", { exact: true }).click();
    await expect(faq).toBeVisible();
    await faq.click();
    await expect(page).toHaveURL(/\/faq$/);
  });

  test("the FAQ is complete", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(11);
  });

  test("draft articles aren't published anywhere (D-120)", async ({ page, request }) => {
    for (const path of ["/articles", ...draftArticles]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    await page.goto("/");
    await expect(page.locator('a[href^="/articles"]')).toHaveCount(0);
  });

  test("the Scripture guides show today’s verse and day one of a plan", async ({ page }) => {
    await page.goto("/scripture");
    await expect(page.getByRole("heading", { name: "Verse for today" })).toBeVisible();
    await page.getByRole("link", { name: "Free in Christ" }).click();
    await expect(page).toHaveURL(/\/scripture\/7-days$/);
    await expect(page.getByRole("heading", { name: "Romans 6" })).toBeVisible();
    // Never a way into the signed-in reading pages.
    await expect(page.locator('a[href^="/reading"]')).toHaveCount(0);
  });
});

test.describe("indexing", () => {
  test("public pages are indexable", async ({ request }) => {
    for (const route of publicRoutes) {
      const response = await request.get(route);
      const header = response.headers()["x-robots-tag"];
      const html = await response.text();
      expect(header, route).toBeUndefined();
      expect(html, route).toContain('<meta name="robots" content="index, follow"/>');
      expect(html, route).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+"\/>/);
      expect(html, route).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/api\/og\/[a-z0-9-]+"\/>/);
    }
  });

  test("every app and auth page says noindex in its headers", async ({ request }) => {
    for (const route of [
      ...appRoutes,
      ...authRoutes.filter((r) => !["/privacy", "/terms", "/your-data"].includes(r)),
    ]) {
      const response = await request.get(route, { maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) continue; // the redirect to sign-in
      expect(response.headers()["x-robots-tag"], route).toBe("noindex");
    }
    const unknown = await request.get("/no-such-page");
    expect(unknown.headers()["x-robots-tag"]).toBe("noindex");
  });

  test("the sitemap lists only pages that answer 200 and may be indexed", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    expect(urls.length).toBeGreaterThanOrEqual(13);
    for (const path of urls) {
      expect([
        ...appRoutes,
        ...authRoutes.filter((r) => !["/privacy", "/terms", "/your-data"].includes(r)),
      ]).not.toContain(path);
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["x-robots-tag"], path).toBeUndefined();
    }
    for (const article of ["/articles", ...draftArticles]) expect(urls).not.toContain(article);
  });

  test("robots.txt, llms.txt and security.txt", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const agent of ["*", "GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      expect(robots).toContain(`User-Agent: ${agent}`);
    }
    expect(robots).toContain("Disallow: /home");
    expect(robots).toContain("Disallow: /join");
    expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);

    const llms = await request.get("/llms.txt");
    expect(llms.headers()["content-type"]).toContain("text/plain");
    expect(await llms.text()).toMatch(/^# Holy Auramaxing\n/);

    const security = await (await request.get("/.well-known/security.txt")).text();
    expect(security).toMatch(/^Contact: mailto:/m);
    expect(security).toMatch(/^Expires: \d{4}-/m);
  });

  test("card pictures are PNGs", async ({ request }) => {
    for (const name of ["site"]) {
      const response = await request.get(`/api/og/${name}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
    }
  });
});

test.describe("structured data", () => {
  const expected: Record<string, string[]> = {
    "/": ["Organization", "WebSite", "WebApplication"],
    "/how-it-works": ["WebApplication", "BreadcrumbList"],
    "/faq": ["FAQPage", "BreadcrumbList"],
    "/scripture/7-days": ["BreadcrumbList"],
  };

  for (const [route, types] of Object.entries(expected)) {
    test(`${route} carries valid JSON-LD: ${types.join(", ")}`, async ({ page }) => {
      await page.goto(route);
      const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
      const found = blocks.flatMap((text) => {
        const data = JSON.parse(text) as Record<string, unknown> | Array<Record<string, unknown>>;
        return (Array.isArray(data) ? data : [data]).map((d) => d["@type"]);
      });
      for (const type of types) expect(found, route).toContain(type);
    });
  }
});

test("public pages are never covered by the app lock", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: signedOut,
    extraHTTPHeaders: { "x-forwarded-for": testClientIp() },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("[data-lockable]")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await context.close();
});
