import { expect, test, type Page } from "@playwright/test";

type JsonResult = {
  status: number;
  body: unknown;
};

function requireFixture(): { engineId: string; typeKey: string } {
  const engineId = process.env.E2E_FIXTURE_ENGINE_ID?.trim();
  const typeKey = process.env.E2E_FIXTURE_TYPE_KEY?.trim();
  if (!engineId || !typeKey) {
    test.skip(true, "Mutation/export E2E testleri için izole fixture engine/type env değerleri gerekir.");
  }
  return { engineId: engineId || "", typeKey: typeKey || "" };
}

async function login(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submitButton = page.getByRole("button", { name: "Giriş Yap" });
  await expect(page.locator('form[data-login-hydrated="true"]')).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await page.getByPlaceholder("05xx xxx xx xx").fill(identifier);
  await page.locator('input[type="password"]').fill(password);
  await page.waitForTimeout(100);
  const [loginResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/auth/login") && response.request().method() === "POST", { timeout: 15_000 }),
    submitButton.click(),
  ]);
  const loginBody = await loginResponse.text();
  expect(loginResponse.ok(), `Login failed with ${loginResponse.status()}: ${loginBody.slice(0, 240)}`).toBeTruthy();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function loginViaFixtureApi(page: Page, identifier: string, password: string): Promise<void> {
  // Local E2E fallback keeps an in-memory IP quota for the whole server process.
  // Separate reserved TEST-NET addresses keep admin/viewer fixture retries isolated
  // without changing the production limiter or trusting this header in production.
  const fixtureIp = identifier === process.env.E2E_VIEWER_IDENTIFIER ? "203.0.113.11" : "203.0.113.10";
  const response = await page.context().request.post("/api/auth/login", {
    headers: { "x-forwarded-for": fixtureIp },
    data: { identifier, password },
  });
  const loginBody = await response.text();
  expect(response.ok(), `Fixture login failed with ${response.status()}: ${loginBody.slice(0, 240)}`).toBeTruthy();
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function fetchJson(page: Page, url: string, options: { method?: string; body?: unknown } = {}): Promise<JsonResult> {
  return page.evaluate(async ({ url: requestUrl, method, body }) => {
    const response = await fetch(requestUrl, {
      method,
      ...(body === undefined ? {} : {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = raw;
    }
    return { status: response.status, body: parsed };
  }, { url, method: options.method || "GET", body: options.body });
}

function uniqueRequestId(testTitle: string, retry: number): string {
  const safeTitle = testTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 35);
  return `e2e-${safeTitle}-${retry}-${Date.now()}`;
}

function maintenancePayload(engineId: string, typeKey: string, clientRequestId: string): Record<string, unknown> {
  return {
    client_request_id: clientRequestId,
    engine_id: engineId,
    type_key: typeKey,
    type_label: "E2E 1000H Bakım",
    hour_at_completion: 1_010,
    technician_source: "internal",
    responsible_technician_duration: 60,
    time_tracking_version: 2,
    maintenance_start_at: "2026-08-26T08:00:00.000Z",
    maintenance_end_at: "2026-08-26T09:00:00.000Z",
    technician_note: "P1 izole idempotency fixture",
  };
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
  test.describe.configure({ mode: "serial" });
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
    await loginViaFixtureApi(page, process.env.E2E_VIEWER_IDENTIFIER!, process.env.E2E_VIEWER_PASSWORD!);
    const result = await fetchJson(page, "/api/records", { method: "POST", body: {} });
    expect(result.status).toBe(403);
    expect(result.body).toMatchObject({
      error: expect.stringMatching(/görüntüleyici|viewer/i),
    });
  });

  test("admin record create is idempotent for the same client request", async ({ page }, testInfo) => {
    test.skip(
      !process.env.E2E_IDENTIFIER || !process.env.E2E_PASSWORD,
      "Idempotency E2E testi yalnızca izole test kullanıcısı ile çalıştırılmalı.",
    );
    const { engineId, typeKey } = requireFixture();
    await loginViaFixtureApi(page, process.env.E2E_IDENTIFIER!, process.env.E2E_PASSWORD!);
    const clientRequestId = uniqueRequestId(testInfo.title, testInfo.retry);
    const payload = maintenancePayload(engineId, typeKey, clientRequestId);

    const first = await fetchJson(page, "/api/records", { method: "POST", body: payload });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ok: true, completed: ["E2E 1000H Bakım"], confirmed: true });

    const second = await fetchJson(page, "/api/records", { method: "POST", body: payload });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, duplicate: true, completed: ["E2E 1000H Bakım"] });

    const listed = await fetchJson(page, `/api/records?engine_id=${encodeURIComponent(engineId)}&page_size=50`);
    expect(listed.status).toBe(200);
    const records = (listed.body && typeof listed.body === "object" && !Array.isArray(listed.body) && Array.isArray((listed.body as { records?: unknown }).records))
      ? (listed.body as { records: Array<Record<string, unknown>> }).records
      : [];
    const matching = records.filter((record) => record.client_request_id === clientRequestId);
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({
      engine_id: engineId,
      type_key: typeKey,
      manager_confirmation_status: "confirmed",
      maintenance_duration_minutes: 60,
    });
    expect(matching[0]?.technician_contributions).toEqual([
      expect.objectContaining({ contribution_role: "responsible", duration_minutes: 60 }),
    ]);
  });

  test("offline report attachment is rejected before record mutation", async ({ page }, testInfo) => {
    test.skip(
      !process.env.E2E_IDENTIFIER || !process.env.E2E_PASSWORD,
      "Offline attachment E2E testi yalnızca izole test kullanıcısı ile çalıştırılmalı.",
    );
    const { engineId, typeKey } = requireFixture();
    await loginViaFixtureApi(page, process.env.E2E_IDENTIFIER!, process.env.E2E_PASSWORD!);
    const clientRequestId = uniqueRequestId(testInfo.title, testInfo.retry);
    const payload = {
      ...maintenancePayload(engineId, typeKey, clientRequestId),
      report_attachments: [{
        id: "e2e-offline-attachment",
        url: "offline:pending-upload",
        filename: "e2e.pdf",
        mime: "application/pdf",
        size: 128,
        uploaded_at: "2026-08-26T08:00:00.000Z",
      }],
    };

    const rejected = await fetchJson(page, "/api/records", { method: "POST", body: payload });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      error: expect.stringMatching(/senkronize edilmedi|bağlantısını kontrol/i),
    });

    const listed = await fetchJson(page, `/api/records?engine_id=${encodeURIComponent(engineId)}&page_size=50`);
    expect(listed.status).toBe(200);
    const records = (listed.body && typeof listed.body === "object" && !Array.isArray(listed.body) && Array.isArray((listed.body as { records?: unknown }).records))
      ? (listed.body as { records: Array<Record<string, unknown>> }).records
      : [];
    expect(records.some((record) => record.client_request_id === clientRequestId)).toBe(false);
  });

  test("viewer can read the scoped engine report without write access", async ({ page }) => {
    test.skip(
      !process.env.E2E_VIEWER_IDENTIFIER || !process.env.E2E_VIEWER_PASSWORD,
      "Read-only export E2E testi yalnızca izole viewer kullanıcısı ile çalıştırılmalı.",
    );
    const { engineId } = requireFixture();
    await loginViaFixtureApi(page, process.env.E2E_VIEWER_IDENTIFIER!, process.env.E2E_VIEWER_PASSWORD!);
    const result = await fetchJson(page, `/api/reports/engine/${encodeURIComponent(engineId)}?all=1&type_label=${encodeURIComponent("E2E 1000H Bakım")}`);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ all: true, truncated: false });
    const body = result.body as { records?: Array<Record<string, unknown>>; total?: number; summary?: Record<string, unknown> };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.records?.[0]).toMatchObject({ engine_id: engineId, type_label: "E2E 1000H Bakım" });
    expect(body.summary).toMatchObject({ total_duration_minutes: expect.any(Number) });
  });
});
