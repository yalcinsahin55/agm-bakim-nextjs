import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const root = process.cwd();
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("protected APIs keep server-side authentication and role guards", async () => {
  const routePaths = [
    "app/api/records/route.ts",
    "app/api/users/route.ts",
    "app/api/backups/export/route.ts",
    "app/api/assistant/route.ts",
  ];
  const contents = await Promise.all(routePaths.map(source));
  for (const content of contents) {
    assert.match(content, /getCurrentUser\(/, "protected route must resolve the current user");
  }
  assert.match(await source("app/api/users/route.ts"), /canManageUsers\(user\.role\)/);
  assert.match(await source("app/api/backups/export/route.ts"), /canManageUsers\(user\.role\)/);
});

test("legacy media and oil PDF fallback remain bounded", async () => {
  const media = await source("lib/mediaValidation.ts");
  const oil = await source("app/api/oil-analyses/route.ts");
  assert.match(media, /MAX_LEGACY_MEDIA_BYTES/);
  assert.match(media, /LEGACY_MEDIA_LIMIT_LABEL = "8 MB"/);
  assert.match(oil, /10 \* 1024 \* 1024/);
  assert.match(oil, /data:application\/pdf;base64,/);
});

test("record date and bulk update safeguards stay in place", async () => {
  const records = await source("app/api/records/route.ts");
  const maintenanceTypes = await source("app/api/maintenance-types/[key]/route.ts");
  const engineHours = await source("app/api/engines/hours/route.ts");
  const importHours = await source("app/api/import/hours/route.ts");
  assert.match(records, /function parseDateOnly/);
  assert.match(records, /Geriye dönük bakım tarihi geçerli bir takvim tarihi olmalıdır/);
  assert.match(maintenanceTypes, /typesCol\.bulkWrite/);
  assert.match(engineHours, /enginesCol\.bulkWrite/);
  assert.match(importHours, /enginesCol\.bulkWrite/);
});

test("records list does not reintroduce media payloads", async () => {
  const records = await source("app/api/records/route.ts");
  assert.match(records, /Liste endpointinde medya gönderilmez/);
  assert.match(records, /include_media/);
});

test("notification refresh is POST-only and the page uses the mutation-safe route", async () => {
  const notificationsGet = await source("app/api/notifications/route.ts");
  const notificationsRefresh = await source("app/api/notifications/refresh/route.ts");
  const notificationsPage = await source("app/bildirimler/page.tsx");
  const notificationBell = await source("components/NotificationBell.tsx");
  assert.match(notificationsGet, /Bildirim yenileme için POST/);
  assert.match(notificationsRefresh, /export async function POST/);
  assert.match(notificationsPage, /fetch\("\/api\/notifications\/refresh", \{ method: "POST"/);
  assert.match(notificationBell, /fetch\("\/api\/notifications\/refresh", \{ method: "POST"/);
  assert.doesNotMatch(notificationBell, /notifications\?refresh=1/);
});

test("backup and upload large-payload paths use bounded processing", async () => {
  const backupExport = await source("app/api/backups/export/route.ts");
  const backupRestore = await source("app/api/backups/restore/route.ts");
  const uploadChunk = await source("app/api/upload-chunk/route.ts");
  assert.match(backupExport, /new ReadableStream/);
  assert.match(backupExport, /backup-export/);
  assert.match(backupRestore, /dry-run/);
  assert.match(backupRestore, /bulkWrite/);
  assert.match(uploadChunk, /Readable\.from/);
  assert.match(uploadChunk, /multipart: true/);
  assert.doesNotMatch(uploadChunk, /Buffer\.concat\(chunkBuffers/);
});

test("large history and administrative list paths expose bounded reads", async () => {
  const pressure = await source("app/api/pressure-readings/route.ts");
  const summary = await source("app/api/backups/summary/route.ts");
  const maintenanceTypes = await source("app/api/maintenance-types/route.ts");
  const users = await source("app/api/users/route.ts");
  assert.match(pressure, /page_size/);
  assert.match(pressure, /has_more/);
  assert.match(summary, /backup-summary/);
  assert.match(summary, /await ensureAppIndexes\(db\)/);
  assert.match(maintenanceTypes, /maintenance-type-list/);
  assert.match(users, /projection:/);
});

test("analytics cache and tracking updates are bounded against repeated work", async () => {
  const analytics = await source("app/api/analytics/summary/route.ts");
  const maintenance = await source("lib/maintenance.ts");
  const push = await source("lib/push.ts");
  assert.match(analytics, /ANALYTICS_CACHE_TTL_MS/);
  assert.match(analytics, /VALID_ENGINE_PERIODS/);
  assert.match(maintenance, /tracking_revision/);
  assert.match(maintenance, /matchedCount === 0/);
  assert.match(push, /workerCount = Math\.min\(4/);
});

test("stable IDs are generated without replacing legacy natural keys", async () => {
  const userCreate = await source("app/api/users/route.ts");
  const bootstrap = await source("app/api/auth/register/route.ts");
  const engineCreate = await source("app/api/engines/route.ts");
  const equipmentCreate = await source("app/api/equipment-info/route.ts");
  const indexes = await source("lib/dbIndexes.ts");
  const migration = await source("scripts/migrate-stable-keys.mjs");
  const legacyRoleMigration = await source("scripts/migrate-legacy-role.mjs");
  const legacyMediaMigration = await source("scripts/migrate-legacy-media.mjs");
  assert.match(userCreate, /stable_id: randomUUID\(\)/);
  assert.match(bootstrap, /stable_id: randomUUID\(\)/);
  assert.match(engineCreate, /stable_id: randomUUID\(\)/);
  assert.match(equipmentCreate, /stable_id: randomUUID\(\)/);
  assert.match(indexes, /users_stable_id_unique/);
  assert.match(indexes, /engines_stable_id_unique/);
  assert.match(indexes, /equipment_info_stable_id_unique/);
  assert.match(migration, /APPLY-STABLE-KEY-MIGRATION/);
  assert.match(migration, /dry-run/);
  assert.match(legacyRoleMigration, /APPLY-LEGACY-ROLE-MIGRATION/);
  assert.match(legacyRoleMigration, /ROLLBACK-LEGACY-ROLE-MIGRATION/);
  assert.match(legacyRoleMigration, /role: "planlamaci"/);
  assert.match(legacyMediaMigration, /APPLY-LEGACY-MEDIA-MIGRATION/);
  assert.match(legacyMediaMigration, /ROLLBACK-LEGACY-MEDIA-MIGRATION/);
  assert.match(legacyMediaMigration, /MAX_RECORD_MEDIA_BYTES/);
  assert.match(legacyMediaMigration, /max-changes/);
  assert.match(legacyMediaMigration, /state: "pending"/);
  assert.match(legacyMediaMigration, /candidateQuery/);
});

test("repository exposes CI validation commands", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const workflow = await source(".github/workflows/ci.yml");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.test, "node --test tests/*.test.mjs");
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
});

test("session identity stays stable across phone changes", async () => {
  const login = await source("app/api/auth/login/route.ts");
  const auth = await source("lib/auth.ts");
  assert.match(login, /phone_normalized/);
  assert.match(login, /createSessionToken\(user\._id\)/);
  assert.match(auth, /findOne\(\{ _id: userId \}\)/);
});

test("no protected UI route relies on middleware as its authorization boundary", async () => {
  const middleware = await source("middleware.ts");
  const permissions = await source("lib/permissions.ts");
  assert.match(middleware, /jwtVerify\(/);
  assert.match(permissions, /canAccessRoute/);
  assert.match(permissions, /normalizeRole/);
});

test("maintenance report attachments stay bounded, authenticated, and offline-safe", async () => {
  const helper = await source("lib/reportAttachments.ts");
  const upload = await source("app/api/blob/upload-server/route.ts");
  const schema = await source("lib/schemas.ts");
  const create = await source("app/api/records/route.ts");
  const update = await source("app/api/records/[id]/route.ts");
  const fileRoute = await source("app/api/records/[id]/attachments/[attachmentId]/route.ts");
  const queue = await source("lib/offlineQueue.ts");
  const complete = await source("app/tamamla/page.tsx");
  const records = await source("app/kayitlar/page.tsx");
  assert.match(helper, /REPORT_ATTACHMENT_MAX_BYTES = 20 \* 1024 \* 1024/);
  assert.match(helper, /\.xlsx/);
  assert.match(helper, /\.docx/);
  assert.match(upload, /report-attachments/);
  assert.match(upload, /resolveReportAttachmentMime/);
  assert.match(upload, /REPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(schema, /report_attachments/);
  assert.match(schema, /isAllowedReportAttachmentUrl/);
  assert.match(create, /normalizedReportAttachments/);
  assert.match(create, /report_attachments: isPrimary/);
  assert.match(update, /update\.report_attachments = normalizedReportAttachments/);
  assert.match(fileRoute, /record-attachment-read/);
  assert.match(fileRoute, /Content-Disposition/);
  assert.match(fileRoute, /Cache-Control.*private, no-store/);
  assert.match(queue, /kind: "photo" \| "video" \| "report"/);
  assert.match(queue, /job\.payload\.report_attachments/);
  assert.match(complete, /<ReportAttachmentPicker/);
  assert.match(records, /<ReportAttachmentPicker/);
  assert.match(records, /\/api\/records\/\$\{selectedRecord\._id\}\/attachments\/\$\{encodeURIComponent\(attachment\.id\)\}/);
});
