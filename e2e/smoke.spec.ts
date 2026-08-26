import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("05xx xxx xx xx").fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

test.describe("AGM Bakım browser smoke", () => {
  test("login ekranı gerçek browser’da render olur", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Avcıkoru Santrali Motor Bakım Merkezi/i);
    await expect(page.getByPlaceholder("05xx xxx xx xx")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Giriş Yap" })).toBeVisible();
  });

  test("korumalı Mongo health endpointi anonim isteği reddeder", async ({ request }) => {
    const response = await request.get("/api/health/mongodb");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/giriş gerekli|unauthorized/i),
    });
  });

  test("service worker login shell’ini offline açabilir", async ({ page, context }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    try {
      await page.reload({ waitUntil: "commit" });
    } catch (error) {
      if (!String(error).includes("ERR_ABORTED")) throw error;
    }
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

    await context.setOffline(true);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("button", { name: "Giriş Yap" })).toBeVisible();
    await expect(page.getByPlaceholder("05xx xxx xx xx")).toBeVisible();
  });
});

test.describe("AGM Bakım configured authentication", () => {
  test("configured test user can authenticate", async ({ page }) => {
    test.skip(
      !process.env.E2E_IDENTIFIER || !process.env.E2E_PASSWORD,
      "E2E_IDENTIFIER ve E2E_PASSWORD yalnızca izole staging test kullanıcısı için ayarlanmalı.",
    );

    await login(page, process.env.E2E_IDENTIFIER!, process.env.E2E_PASSWORD!);
  });

  test("viewer cannot create a maintenance record", async ({ page }) => {
    test.skip(
      !process.env.E2E_VIEWER_IDENTIFIER || !process.env.E2E_VIEWER_PASSWORD,
      "E2E_VIEWER_IDENTIFIER ve E2E_VIEWER_PASSWORD yalnızca izole staging viewer hesabı için ayarlanmalı.",
    );

    await login(page, process.env.E2E_VIEWER_IDENTIFIER!, process.env.E2E_VIEWER_PASSWORD!);
    const response = await page.request.post("/api/records", { data: {} });

    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/görüntüleyici|viewer/i),
    });
  });
});
