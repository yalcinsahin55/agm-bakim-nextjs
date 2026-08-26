import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  calculateMaintenanceDurationFromDates,
  calculateMaintenanceDurationMinutes,
  hoursInputToMinutes,
  normalizeTechnicianContributionDuration,
} from "../lib/maintenanceTime.ts";
import { canAccessRoute, canManageUsers, canWriteMaintenance, defaultRouteForRole, hasPermission, normalizeRole } from "../lib/permissions.ts";
import {
  isAllowedReportAttachmentUrl,
  isReportAttachmentId,
  normalizeReportAttachments,
  resolveReportAttachmentMime,
  sanitizeReportAttachmentFilename,
} from "../lib/reportAttachments.ts";
import { addRows, worksheetToGrid, worksheetToObjects } from "../lib/excel.ts";
import { looksLikePdf, readPdfResponse } from "../lib/pdfSecurity.ts";
import { statusFor } from "../lib/status.ts";
import { parseJsonBodyLimited, readRequestTextLimited, RequestBodyTooLargeError } from "../lib/requestLimits.ts";
import { checkDistributedRateLimit } from "../lib/redisRateLimit.ts";

test("E2E local rate-limit fallback requires the complete isolated fixture contract", async () => {
  const keys = [
    "NODE_ENV",
    "VERCEL_ENV",
    "MONGO_DB_NAME",
    "E2E_SEED",
    "E2E_ALLOW_LOCAL_RATE_LIMIT",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ] as const;
  const env = process.env as Record<string, string | undefined>;
  const previous = new Map<string, string | undefined>(keys.map((key) => [key, env[key]]));

  try {
    env.NODE_ENV = "production";
    env.VERCEL_ENV = "preview";
    env.MONGO_DB_NAME = "agm_bakim_e2e";
    env.E2E_SEED = "1";
    env.E2E_ALLOW_LOCAL_RATE_LIMIT = "1";
    delete env.UPSTASH_REDIS_REST_URL;
    delete env.UPSTASH_REDIS_REST_TOKEN;
    delete env.KV_REST_API_URL;
    delete env.KV_REST_API_TOKEN;

    const isolated = await checkDistributedRateLimit({
      scope: "test-isolated-e2e",
      identifier: "isolated-fixture",
      limit: 2,
      windowMs: 60_000,
    }, "fail-closed");
    assert.equal(isolated.degraded, true);
    assert.equal(isolated.infrastructureFailure, false);

    for (const [key, value] of [
      ["E2E_ALLOW_LOCAL_RATE_LIMIT", "0"],
      ["E2E_SEED", "0"],
      ["MONGO_DB_NAME", "agm_bakim"],
    ] as const) {
      env.E2E_ALLOW_LOCAL_RATE_LIMIT = "1";
      env.E2E_SEED = "1";
      env.MONGO_DB_NAME = "agm_bakim_e2e";
      env[key] = value;
      const productionLike = await checkDistributedRateLimit({
        scope: `test-fail-closed-${key.toLowerCase()}`,
        identifier: "production-like-fixture",
        limit: 2,
        windowMs: 60_000,
      }, "fail-closed");
      assert.equal(productionLike.degraded, false, key);
      assert.equal(productionLike.infrastructureFailure, true, key);
    }
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
});
test("bounded request body reader rejects oversized chunked bodies", async () => {
  const normalPayload = JSON.stringify({ question: "AGM 8 bakımları" });
  const normal = new Request("http://localhost", { method: "POST", body: normalPayload });
  assert.equal(await readRequestTextLimited(normal, 10_000), normalPayload);

  const oversizedRequestInit = {
    method: "POST",
    duplex: "half",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    }),
  } as unknown as RequestInit;
  const oversized = new Request("http://localhost", oversizedRequestInit);
  await assert.rejects(() => readRequestTextLimited(oversized, 10), (error: unknown) => error instanceof RequestBodyTooLargeError);
});

test("bounded JSON parser distinguishes valid, invalid, and oversized bodies", async () => {
  const valid = await parseJsonBodyLimited(new Request("http://localhost", { method: "POST", body: JSON.stringify({ ok: true }) }), 1_000);
  assert.deepEqual(valid, { ok: true, value: { ok: true } });
  const invalid = await parseJsonBodyLimited(new Request("http://localhost", { method: "POST", body: "not-json" }), 1_000);
  assert.deepEqual(invalid, { ok: false, tooLarge: false });
  const oversized = await parseJsonBodyLimited(new Request("http://localhost", { method: "POST", body: "12345678901" }), 10);
  assert.deepEqual(oversized, { ok: false, tooLarge: true });
});

test("maintenance duration handles overnight, multi-day, and invalid intervals", () => {
  assert.equal(calculateMaintenanceDurationMinutes("08:00", "17:00"), 540);
  assert.equal(calculateMaintenanceDurationMinutes("23:00", "01:00"), 120);
  assert.equal(calculateMaintenanceDurationMinutes("08:00", "08:00"), null);
  assert.equal(calculateMaintenanceDurationMinutes("25:00", "26:00"), null);
  assert.equal(calculateMaintenanceDurationFromDates("2026-08-18T07:00:00.000Z", "2026-08-24T13:00:00.000Z"), 9_000);
  assert.equal(calculateMaintenanceDurationFromDates("2026-08-24T13:00:00.000Z", "2026-08-18T07:00:00.000Z"), null);
});

test("technician contribution durations preserve zero and reject invalid input", () => {
  assert.equal(normalizeTechnicianContributionDuration(0, 60), 0);
  assert.equal(normalizeTechnicianContributionDuration("2.5", 60), 2.5);
  assert.equal(normalizeTechnicianContributionDuration("", 45), 45);
  assert.equal(normalizeTechnicianContributionDuration("not-a-number", 45), 45);
  assert.equal(hoursInputToMinutes("2.5"), 150);
  assert.equal(hoursInputToMinutes(-1), null);
});

test("maintenance status boundaries remain deterministic", () => {
  assert.equal(statusFor(-1), "gecikmis");
  assert.equal(statusFor(0), "gecikmis");
  assert.equal(statusFor(99), "kritik");
  assert.equal(statusFor(100), "kritik");
  assert.equal(statusFor(101), "yaklasiyor");
  assert.equal(statusFor(250), "yaklasiyor");
  assert.equal(statusFor(251), "normal");
});

test("role and route permissions keep technician, viewer, and manager boundaries", () => {
  assert.equal(normalizeRole("planlamaci"), "teknisyen");
  assert.equal(defaultRouteForRole("teknisyen"), "/tamamla");
  assert.equal(defaultRouteForRole("yonetici"), "/dashboard");
  assert.equal(canWriteMaintenance("teknisyen"), true);
  assert.equal(canManageUsers("teknisyen"), false);
  assert.equal(canManageUsers("yonetici"), true);
  assert.equal(hasPermission("goruntuleyici", "assistant:read"), true);
  assert.equal(hasPermission("goruntuleyici", "maintenance:write"), false);
  assert.equal(canAccessRoute("teknisyen", "/tamamla"), true);
  assert.equal(canAccessRoute("teknisyen", "/kayitlar"), true);
  assert.equal(canAccessRoute("teknisyen", "/asistan"), false);
  assert.equal(canAccessRoute("goruntuleyici", "/asistan"), true);
  assert.equal(canAccessRoute("goruntuleyici", "/kullanicilar"), false);
  assert.equal(canAccessRoute("yonetici", "/kullanicilar"), true);
});

test("report attachments enforce canonical MIME, safe IDs, and trusted storage hosts", () => {
  assert.equal(resolveReportAttachmentMime("application/octet-stream", "maintenance.pdf"), "application/pdf");
  assert.equal(resolveReportAttachmentMime(undefined, "maintenance.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(resolveReportAttachmentMime("image/png", "maintenance.pdf"), null);
  assert.equal(isReportAttachmentId("e7e047e5-7226-4ad9-8ed5-1a26bada24db"), true);
  assert.equal(isReportAttachmentId("short"), false);
  assert.equal(isAllowedReportAttachmentUrl("https://sample.public.blob.vercel-storage.com/maintenance.pdf"), true);
  assert.equal(isAllowedReportAttachmentUrl("https://evil.example/maintenance.pdf"), false);
  assert.equal(isAllowedReportAttachmentUrl("http://sample.public.blob.vercel-storage.com/maintenance.pdf"), false);
  assert.equal(sanitizeReportAttachmentFilename("../../maintenance report.pdf"), "..-..-maintenance-report.pdf");

  const normalized = normalizeReportAttachments([
    {
      id: "e7e047e5-7226-4ad9-8ed5-1a26bada24db",
      url: "https://sample.public.blob.vercel-storage.com/maintenance.pdf",
      filename: "maintenance report.pdf",
      mime: "application/pdf",
      size: 5_532_139,
      uploaded_at: "2026-08-25T00:00:00.000Z",
    },
    {
      id: "bad",
      url: "https://evil.example/maintenance.pdf",
      filename: "bad.pdf",
      mime: "application/pdf",
      size: 10,
      uploaded_at: "2026-08-25T00:00:00.000Z",
    },
  ], "user-1");
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.uploaded_by_id, "user-1");
});

test("PDF response validation accepts real signatures and rejects invalid signatures", async () => {
  const validPdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
  const invalidPdf = new Uint8Array([60, 104, 116, 109, 108, 62]);
  assert.equal(looksLikePdf(validPdf), true);
  assert.equal(looksLikePdf(invalidPdf), false);
  assert.deepEqual(await readPdfResponse(new Response(validPdf)), validPdf);
});

test("Excel helpers convert rows and preserve bounded export shape", () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Bakımlar");
  worksheet.addRow(["Motor", "Saat", "Not"]);
  worksheet.addRow(["AGM 8", 34_725, "Rapor ektedir"]);
  assert.deepEqual(worksheetToGrid(worksheet), [
    ["Motor", "Saat", "Not"],
    ["AGM 8", 34_725, "Rapor ektedir"],
  ]);
  assert.deepEqual(worksheetToObjects(worksheet), [{ Motor: "AGM 8", Saat: 34_725, Not: "Rapor ektedir" }]);

  const exportWorksheet = workbook.addWorksheet("Dışa Aktarım");
  addRows(exportWorksheet, [{ Motor: "AGM 8", Bakım: "18000H Bakım" }, { Motor: "AGM 9", Bakım: "Yağ Değişimi" }]);
  assert.deepEqual(worksheetToObjects(exportWorksheet), [
    { Motor: "AGM 8", Bakım: "18000H Bakım" },
    { Motor: "AGM 9", Bakım: "Yağ Değişimi" },
  ]);

  const tooWide = workbook.addWorksheet("Sınır");
  tooWide.getCell(1, 101).value = "fazla";
  assert.throws(() => worksheetToGrid(tooWide), /izin verilen boyutu aşıyor/);
});
