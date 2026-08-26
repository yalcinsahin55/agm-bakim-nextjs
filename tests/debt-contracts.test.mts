import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string): Promise<string> => readFile(path.join(root, relativePath), "utf8");

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

test("sensitive read routes keep user-scoped rate limits", async () => {
  const routes = await Promise.all([
    source("app/api/audit-logs/route.ts"),
    source("app/api/media/file/route.ts"),
    source("app/api/oil-analyses/[id]/file/route.ts"),
    source("app/api/records/route.ts"),
    source("app/api/records/interval-summary/route.ts"),
    source("app/api/reports/engine/[id]/route.ts"),
    source("app/api/users/technicians/route.ts"),
    source("app/api/engines/route.ts"),
    source("app/api/maintenance-types/panel/route.ts"),
  ]);
  for (const route of routes) assert.match(route, /enforceApiRateLimit\(/);
  assert.match(routes[0], /audit-log-read/);
  assert.match(routes[1], /media-read/);
  assert.match(routes[2], /oil-analysis-file-read/);
  assert.match(routes[3], /records-read/);
  assert.match(routes[4], /records-interval-summary-read/);
  assert.match(routes[5], /engine-report-read/);
  assert.match(routes[6], /technician-list-read/);
  assert.match(routes[7], /engine-list-read/);
  assert.match(routes[8], /maintenance-panel-read/);
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
  assert.match(engineHours, /writeAuditLog/);
  assert.match(importHours, /enginesCol\.bulkWrite/);
  assert.match(importHours, /writeAuditLog/);
  assert.match(importHours, /if \(!hoursChanged && !loadChanged\) continue/);
});

test("TypeScript strictness, npm tooling, and CI lint gate stay explicit", async () => {
  const tsconfig = JSON.parse(await source("tsconfig.json"));
  const packageJson = JSON.parse(await source("package.json"));
  const ci = await source(".github/workflows/ci.yml");
  const eslintConfig = await source("eslint.config.ts");
  const serviceWorker = await source("lib/serviceWorker.ts");
  const postcssConfig = await source("postcss.config.js");
  const globalsCss = await source("app/globals.css");
  const gitignore = await source(".gitignore");
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.allowJs, false);
  assert.equal(packageJson.scripts.lint, "NODE_OPTIONS=--experimental-strip-types eslint --flag unstable_native_nodejs_ts_config app components lib");
  assert.match(packageJson.devDependencies.jiti, /^\^2\./);
  assert.match(ci, /name: ESLint/);
  assert.match(ci, /run: npm run lint/);
  assert.match(eslintConfig, /FlatCompat/);
  assert.match(eslintConfig, /next\/core-web-vitals/);
  assert.match(packageJson.scripts.lint, /--flag unstable_native_nodejs_ts_config/);
  assert.match(packageJson.scripts["build:service-worker"], /lib\/serviceWorker\.ts/);
  assert.match(packageJson.scripts.predev, /build:service-worker/);
  assert.match(packageJson.scripts.prebuild, /build:service-worker/);
  assert.match(gitignore, /\/public\/sw\.js/);
  assert.match(serviceWorker, /CACHE_NAME/);
  assert.match(postcssConfig, /module\.exports/);
  assert.match(postcssConfig, /tailwindcss/);
  assert.match(globalsCss, /@tailwind base/);
  assert.match(globalsCss, /@tailwind components/);
  assert.match(globalsCss, /@tailwind utilities/);
  await assert.rejects(source("next.config.js"));
  await assert.rejects(source("postcss.config.ts"));
  await assert.rejects(source("tailwind.config.js"));
  await assert.rejects(source("eslint.config.mjs"));
  await assert.rejects(source("jsconfig.json"));
  await assert.rejects(source("pnpm-lock.yaml"));
  await assert.rejects(source("pnpm-workspace.yaml"));
});

test("successful login is audited without blocking session creation", async () => {
  const login = await source("app/api/auth/login/route.ts");
  assert.match(login, /action: "login"/);
  assert.match(login, /entity: "user"/);
  assert.match(login, /Giriş audit kaydı yazılamadı/);
});

test("engine hours and maintenance type changes are audited with before/after data", async () => {
  const engines = await source("app/api/engines/route.ts");
  const engineHours = await source("app/api/engines/hours/route.ts");
  const importHours = await source("app/api/import/hours/route.ts");
  const maintenanceTypes = await source("app/api/maintenance-types/route.ts");
  const maintenanceTypeChange = await source("app/api/maintenance-types/[key]/route.ts");
  const auditPage = await source("app/audit-log/page.tsx");
  for (const content of [engines, engineHours, importHours, maintenanceTypes, maintenanceTypeChange]) assert.match(content, /writeAuditLog/);
  assert.match(engineHours, /before: \{ changes:/);
  assert.match(engineHours, /after: \{ changes:/);
  assert.match(importHours, /Excel ile güncellendi/);
  assert.match(maintenanceTypeChange, /beforeAudit/);
  assert.match(maintenanceTypeChange, /afterAudit/);
  assert.match(maintenanceTypeChange, /bakım türü silindi/);
  assert.match(auditPage, /maintenance_type: "Bakım türü"/);
});

test("records list does not reintroduce media payloads", async () => {
  const records = await source("app/api/records/route.ts");
  assert.match(records, /Liste endpointinde medya gönderilmez/);
  assert.match(records, /include_media/);
});

test("notification page is GET-first and the bell uses a lightweight unread count", async () => {
  const notificationsGet = await source("app/api/notifications/route.ts");
  const notificationsRefresh = await source("app/api/notifications/refresh/route.ts");
  const unreadCount = await source("app/api/notifications/unread-count/route.ts");
  const notificationsPage = await source("app/bildirimler/page.tsx");
  const notificationBell = await source("components/NotificationBell.tsx");
  const unreadCache = await source("lib/notificationUnreadCache.ts");
  assert.match(notificationsGet, /Bildirim yenileme için POST/);
  assert.match(notificationsRefresh, /export async function POST/);
  assert.match(unreadCount, /notifications-unread-count/);
  assert.match(unreadCount, /countDocuments\(\{ user_id: user\._id, read_at: null \}\)/);
  assert.match(unreadCount, /getCachedUnreadCount/);
  assert.match(unreadCount, /searchParams\.get\("fresh"\)/);
  assert.match(unreadCache, /CACHE_TTL_MS = 5_000/);
  assert.match(unreadCache, /MAX_CACHE_ENTRIES = 512/);
  assert.match(notificationsPage, /fetch\("\/api\/notifications\?limit=500", \{ cache: "no-store" \}\)/);
  assert.match(notificationsPage, /fetch\("\/api\/notifications\/refresh", \{ method: "POST"/);
  assert.match(notificationBell, /UNREAD_COUNT_URL = "\/api\/notifications\/unread-count"/);
  assert.match(notificationBell, /\?fresh=1/);
  assert.match(notificationBell, /fresh \? 0 : 5_000/);
  assert.doesNotMatch(notificationBell, /fetch\("\/api\/notifications\/refresh", \{ method: "POST"/);
  assert.doesNotMatch(notificationBell, /fetch\("\/api\/notifications"/);
});

test("notifications are ordered by their latest notification event", async () => {
  const notificationModule = await source("lib/notifications.ts");
  const notificationsPage = await source("app/bildirimler/page.tsx");
  assert.match(notificationModule, /last_notified_at/);
  assert.match(notificationModule, /\$ifNull: \["\$last_notified_at", "\$created_at"\]/);
  assert.match(notificationModule, /_notification_sort_at: -1, created_at: -1, _id: -1/);
  assert.match(notificationModule, /sort_at: isNewNotification/);
  assert.match(notificationsPage, /function sortNewestFirst\(notifications: Notification\[\]\)/);
  assert.match(notificationsPage, /last_notified_at \?\? notification\.created_at/);
  assert.match(notificationsPage, /Geldi: \{formatNotificationDate\(notification\)\}/);
  assert.match(await source("lib/dbIndexes.ts"), /notifications_user_sort_at_desc/);
});

test("backup and upload large-payload paths use bounded processing", async () => {
  const backupExport = await source("app/api/backups/export/route.ts");
  const backupRestore = await source("app/api/backups/restore/route.ts");
  const uploadChunk = await source("app/api/upload-chunk/route.ts");
  const assistant = await source("app/api/assistant/route.ts");
  const requestLimits = await source("lib/requestLimits.ts");
  assert.match(backupExport, /new ReadableStream/);
  assert.match(backupExport, /backup-export/);
  assert.match(backupRestore, /dry-run/);
  assert.match(backupRestore, /bulkWrite/);
  assert.match(assistant, /readRequestTextLimited/);
  assert.match(backupRestore, /readRequestTextLimited/);
  assert.match(requestLimits, /RequestBodyTooLargeError/);
  assert.match(uploadChunk, /Readable\.from/);
  assert.match(uploadChunk, /multipart: true/);
  assert.doesNotMatch(uploadChunk, /Buffer\.concat\(chunkBuffers/);
});

test("read-only smoke tooling never sends mutation methods", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const smoke = await source("scripts/smoke-readonly.mts");
  const runbook = await source("docs/staging-validation.md");
  assert.equal(packageJson.scripts["smoke:readonly"], "node --experimental-strip-types scripts/smoke-readonly.mts");
  assert.match(smoke, /method: "GET"/);
  assert.doesNotMatch(smoke, /method: "(POST|PUT|PATCH|DELETE)"/);
  assert.match(runbook, /Read-only smoke/);
  assert.match(runbook, /production’a yönelik otomatik smoke çalıştırılmamalıdır/);
});

test("backup export and restore share sanitized format helpers", async () => {
  const backupFormat = await source("lib/backupFormat.ts");
  const backupExport = await source("app/api/backups/export/route.ts");
  const backupRestore = await source("app/api/backups/restore/route.ts");
  assert.match(backupFormat, /EXPORT_BLOCKED_KEYS/);
  assert.match(backupFormat, /RESTORE_BLOCKED_KEYS/);
  assert.match(backupFormat, /function sanitizeBackupValue/);
  assert.match(backupFormat, /function cleanRestoredValue/);
  assert.match(backupExport, /sanitizeBackupValue/);
  assert.match(backupRestore, /cleanRestoredValue/);
  assert.match(backupRestore, /for \(const name of RESTORE_COLLECTIONS\)/);
});

test("large history and administrative list paths expose bounded reads", async () => {
  const pressure = await source("app/api/pressure-readings/route.ts");
  const summary = await source("app/api/backups/summary/route.ts");
  const maintenanceTypes = await source("app/api/maintenance-types/route.ts");
  const users = await source("app/api/users/route.ts");
  const engines = await source("app/api/engines/route.ts");
  const engineHistory = await source("app/api/engines/[id]/history/route.ts");
  assert.match(pressure, /page_size/);
  assert.match(pressure, /has_more/);
  assert.match(summary, /backup-summary/);
  assert.match(summary, /await ensureAppIndexes\(db\)/);
  assert.match(maintenanceTypes, /maintenance-type-list/);
  assert.match(users, /projection:/);
  assert.match(engines, /history: \{ \$slice: -250 \}/);
  assert.match(engineHistory, /engine-history-read/);
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

test("date candidate filtering preserves legacy date fallback", async () => {
  const dateQuery = await source("lib/maintenanceDateQuery.ts");
  const analytics = await source("app/api/analytics/summary/route.ts");
  const engineReport = await source("app/api/reports/engine/[id]/route.ts");
  assert.match(dateQuery, /maintenance_start_at: \{ \$type: "string" \}/);
  assert.match(dateQuery, /maintenance_start_at: \{ \$type: "number" \}/);
  assert.match(dateQuery, /created_at: range/);
  assert.match(analytics, /dateRangeStages/);
  assert.match(engineReport, /maintenanceDateCandidateMatch/);
  assert.match(engineReport, /\$convert/);
});

test("security headers include CSP without breaking same-origin oil PDF framing", async () => {
  const nextConfig = await source("next.config.ts");
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /default-src 'self'/);
  assert.match(nextConfig, /object-src 'none'/);
  assert.match(nextConfig, /https:\/\/\*\.blob\.vercel-storage\.com/);
  assert.match(nextConfig, /frame-ancestors 'self'/);
  assert.match(nextConfig, /X-Frame-Options.*SAMEORIGIN/);
});

test("maintenance status snapshot is shared and invalidated across read paths", async () => {
  const panelCache = await source("lib/maintenancePanelServer.ts");
  const panelRoute = await source("app/api/maintenance-types/panel/route.ts");
  const notifications = await source("lib/notifications.ts");
  const assistant = await source("lib/assistantTools.ts");
  const reportFilters = await source("lib/reportFilterQuery.ts");
  assert.match(panelCache, /PANEL_CACHE_TTL_MS = 10_000/);
  assert.match(panelCache, /getOrBuildMaintenancePanelServerPayload/);
  assert.match(panelCache, /invalidateMaintenancePanelServerCache\(\)/);
  assert.match(panelRoute, /getOrBuildMaintenancePanelServerPayload/);
  assert.match(notifications, /getOrBuildMaintenancePanelServerPayload/);
  assert.match(assistant, /getOrBuildMaintenancePanelServerPayload/);
  assert.match(reportFilters, /getOrBuildMaintenancePanelServerPayload/);
});

test("stable IDs are generated without replacing legacy natural keys", async () => {
  const userCreate = await source("app/api/users/route.ts");
  const bootstrap = await source("app/api/auth/register/route.ts");
  const engineCreate = await source("app/api/engines/route.ts");
  const equipmentCreate = await source("app/api/equipment-info/route.ts");
  const indexes = await source("lib/dbIndexes.ts");
  const migration = await source("scripts/migrate-stable-keys.mts");
  const legacyRoleMigration = await source("scripts/migrate-legacy-role.mts");
  const legacyMediaMigration = await source("scripts/migrate-legacy-media.mts");
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
  assert.match(legacyMediaMigration, /createHash\("sha256"\)/);
  assert.match(legacyMediaMigration, /legacyBlobPath/);
  assert.match(legacyMediaMigration, /addRandomSuffix: false/);
  assert.match(legacyMediaMigration, /allowOverwrite: true/);
  assert.doesNotMatch(legacyMediaMigration, /randomUUID()/);
});

test("repository exposes CI validation commands", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const workflow = await source(".github/workflows/ci.yml");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.test, "node --experimental-strip-types --test tests/*.test.mts");
  assert.match(workflow, /npm run typecheck/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v5/);
  assert.match(workflow, /node-version: 24/);
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
  assert.match(middleware, /\.well-known/);
  assert.match(permissions, /canAccessRoute/);
  assert.match(permissions, /normalizeRole/);
});

test("maintenance report attachments stay bounded, authenticated, and offline-safe", async () => {
  const helper = await source("lib/reportAttachments.ts");
  const upload = await source("app/api/blob/upload-server/route.ts");
  const clientUpload = await source("app/api/blob/upload-client/route.ts");
  const presignedUpload = await source("app/api/blob/upload-presigned/route.ts");
  const uploadHelper = await source("lib/reportAttachmentUpload.ts");
  const schema = await source("lib/schemas.ts");
  const create = await source("app/api/records/route.ts");
  const update = await source("app/api/records/[id]/route.ts");
  const fileRoute = await source("app/api/records/[id]/attachments/[attachmentId]/route.ts");
  const oilFileRoute = await source("app/api/oil-analyses/[id]/file/route.ts");
  const pdfSecurity = await source("lib/pdfSecurity.ts");
  const assistantExport = await source("app/api/assistant/export/route.ts");
  const blobStorage = await source("lib/blobStorage.ts");
  const nextConfig = await source("next.config.ts");
  const mediaUpload = await source("lib/mediaUpload.ts");
  const uploadPresigned = await source("app/api/blob/upload-presigned/route.ts");
  const mediaUrls = await source("lib/mediaUrls.ts");
  const mediaRoute = await source("app/api/media/file/route.ts");
  const chunkUpload = await source("lib/chunkUpload.ts");
  const queue = await source("lib/offlineQueue.ts");
  const complete = await source("app/tamamla/page.tsx");
  const records = await source("app/kayitlar/page.tsx");
  const recordMediaModals = await source("components/RecordMediaModals.tsx");
  const pdfPreview = await source("components/PdfPreview.tsx");
  const qrPage = await source("app/qr-etiketleri/page.tsx");
  const oilPage = await source("app/yag-analizleri/page.tsx");
  assert.match(helper, /REPORT_ATTACHMENT_MAX_BYTES = 20 \* 1024 \* 1024/);
  assert.match(helper, /\.xlsx/);
  assert.match(helper, /\.docx/);
  assert.match(helper, /DEFAULT_BLOB_HOST_SUFFIXES/);
  assert.match(helper, /\.blob\.vercel-storage\.com/);
  assert.match(helper, /\.public\.blob\.vercel-storage\.com/);
  assert.match(upload, /report-attachments/);
  assert.match(upload, /resolveReportAttachmentMime/);
  assert.match(upload, /storeId/);
  assert.match(upload, /videos/);
  assert.match(upload, /maxVideoSize/);
  assert.match(upload, /idempotency_key/);
  assert.match(upload, /allowOverwrite/);
  assert.match(clientUpload, /handleUpload/);
  assert.match(clientUpload, /REPORT_UPLOAD_PREFIX/);
  assert.match(clientUpload, /REPORT_UPLOAD_TOKEN = process\.env\.VERCEL/);
  assert.match(clientUpload, /BLOB_READ_WRITE_TOKEN \|\| process\.env\.MEDIA_READ_WRITE_TOKEN/);
  assert.match(clientUpload, /token: REPORT_UPLOAD_TOKEN/);
  assert.match(clientUpload, /maximumSizeInBytes: REPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(presignedUpload, /issueSignedToken/);
  assert.match(presignedUpload, /presignUrl/);
  assert.match(presignedUpload, /BLOB_READ_WRITE_TOKEN \|\| process\.env\.MEDIA_READ_WRITE_TOKEN/);
  assert.match(presignedUpload, /BLOB_STORE_ID \|\| process\.env\.MEDIA_STORE_ID/);
  assert.match(presignedUpload, /REPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(uploadHelper, /uploadFileThroughServer/);
  assert.match(uploadHelper, /"report-attachments"/);
  assert.doesNotMatch(uploadHelper, /uploadPresigned/);
  assert.match(uploadHelper, /REPORT_UPLOAD_TIMEOUT_MS/);
  assert.match(mediaUpload, /report-attachments/);
  assert.match(mediaUpload, /idempotencyKey/);
  assert.match(upload, /REPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(schema, /report_attachments/);
  assert.match(schema, /isAllowedReportAttachmentUrl/);
  assert.match(create, /normalizedReportAttachments/);
  assert.match(create, /buildExtraClientRequestId/);
  assert.match(create, /client_request_id: recordClientRequestId \|\| undefined/);
  assert.match(create, /buildExtraClientRequestId\(client_request_id, ex\.type_key\)/);
  assert.match(create, /report_attachments: isPrimary/);
  assert.match(update, /update\.report_attachments = normalizedReportAttachments/);
  assert.match(fileRoute, /record-attachment-read/);
  assert.match(fileRoute, /fetchStoredBlob/);
  assert.match(fileRoute, /readPdfResponse/);
  assert.match(fileRoute, /looksLikePdf/);
  assert.match(fileRoute, /Content-Length/);
  assert.match(fileRoute, /Content-Disposition/);
  assert.match(fileRoute, /const inline = !download && attachment\.mime === "application\/pdf"/);
  assert.match(fileRoute, /Cache-Control.*private, no-store/);
  assert.match(oilFileRoute, /fetchStoredBlob/);
  assert.match(pdfSecurity, /\.private\.blob\.vercel-storage\.com/);
  assert.match(pdfSecurity, /\.blob\.vercel-storage\.com/);
  assert.match(pdfSecurity, /readResponseBytes/);
  assert.match(assistantExport, /readResponseBytes/);
  assert.match(blobStorage, /from "@vercel\/blob"/);
  assert.match(blobStorage, /MEDIA_READ_WRITE_TOKEN/);
  assert.match(blobStorage, /BLOB_READ_WRITE_TOKEN/);
  assert.match(blobStorage, /access: "private"/);
  assert.match(nextConfig, /source: "\/api\/oil-analyses\/:id\/file"/);
  assert.match(nextConfig, /source: "\/api\/records\/:id\/attachments\/:attachmentId"/);
  assert.match(nextConfig, /X-Frame-Options.*SAMEORIGIN/);
  assert.match(oilFileRoute, /"X-Frame-Options": "SAMEORIGIN"/);
  assert.match(mediaUpload, /SERVER_UPLOAD_ENDPOINT/);
  assert.match(mediaUpload, /folder === "photos"/);
  assert.match(uploadPresigned, /maintenance-photo/);
  assert.match(uploadPresigned, /maintenance-photo-offline/);
  assert.match(uploadPresigned, /maintenance-report-offline/);
  assert.match(uploadPresigned, /maintenance-video/);
  assert.match(uploadPresigned, /maintenance-video-offline/);
  assert.match(uploadPresigned, /allowOverwrite: true/);
  assert.match(uploadPresigned, /video\/\*/);
  assert.match(uploadPresigned, /maximumSizeInBytes: VIDEO_MAX_BYTES/);
  assert.match(chunkUpload, /UPLOAD_ENDPOINT/);
  assert.match(mediaUpload, /idempotencyKey/);
  assert.match(uploadHelper, /idempotencyKey/);
  assert.match(queue, /\$\{job\.id\}-\$\{media\.id\}/);
  assert.match(mediaUrls, /api\/media\/file\?kind=\$\{kind\}&url=/);
  assert.match(mediaUrls, /private\.blob\.vercel-storage\.com/);
  assert.match(mediaRoute, /fetchStoredBlob/);
  const indexes = await source("lib/dbIndexes.ts");
  assert.match(indexes, /records_photos_media_url/);
  assert.match(indexes, /records_videos_legacy_media_url/);
  assert.match(indexes, /records_videos_url_media_url/);
  assert.match(mediaRoute, /Giriş gerekli/);
  assert.match(mediaRoute, /recordsCollection\(db\)\.findOne/);
  assert.match(mediaRoute, /kind === "image"/);
  assert.match(mediaRoute, /\{ photos: url \}/);
  assert.match(mediaRoute, /\{ videos: url \}/);
  assert.match(mediaRoute, /\{ "videos\.url": url \}/);
  assert.match(mediaRoute, /Medya kaydı bulunamadı/);
  assert.match(mediaRoute, /Content-Disposition.*inline/);
  assert.match(queue, /kind: "photo" \| "video" \| "report"/);
  assert.match(queue, /job\.payload\.report_attachments/);
  assert.match(queue, /uploadReportAttachment/);
  assert.match(complete, /<ReportAttachmentPicker/);
  assert.match(records, /<ReportAttachmentPicker/);
  assert.doesNotMatch(complete, /\/api\/blob\/upload-server/);
  assert.doesNotMatch(records, /\/api\/blob\/upload-server/);
  assert.doesNotMatch(oilPage, /\/api\/blob\/upload-server/);
  assert.doesNotMatch(complete, /getMediaDisplayUrl/);
  assert.match(records, /getMediaDisplayUrl/);
  assert.match(records, /selectedReportAttachment/);
  assert.match(records, /<RecordMediaModals/);
  assert.match(recordMediaModals, /<PdfPreview/);
  assert.match(pdfPreview, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(pdfPreview, /pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs/);
  assert.match(pdfPreview, /GlobalWorkerOptions\.workerSrc/);
  assert.match(pdfPreview, /getDocument\(\{ url: src, withCredentials: true \}\)/);
  assert.match(pdfPreview, /document\.createElement\("canvas"\)/);
  assert.match(pdfPreview, /page\.render\(/);
  assert.doesNotMatch(records, /<iframe[\s\S]*selectedReportAttachment/);
  assert.match(qrPage, /QRCode\.toDataURL\(buildLink\(item\)/);
  assert.match(qrPage, /width: 420/);
  assert.match(qrPage, /errorCorrectionLevel: "M"/);
  assert.match(qrPage, /engine_id=\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(qrPage, /type_key=\$\{encodeURIComponent\(item\.id\)\}/);
  assert.match(qrPage, /window\.print\(\)/);
  assert.match(records, /setSelectedReportAttachment\(\{ recordId: selectedRecord\._id, attachment \}\)/);
  assert.match(recordMediaModals, /reportAttachmentUrl\(selectedReportAttachment\.recordId, selectedReportAttachment\.attachment\.id\)/);
  assert.match(recordMediaModals, /reportAttachmentUrl\(selectedReportAttachment\.recordId, selectedReportAttachment\.attachment\.id, true\)/);
  assert.match(recordMediaModals, /download=\{selectedReportAttachment\.attachment\.filename\}/);
  assert.doesNotMatch(records, /target=["']_blank["']/);
  assert.doesNotMatch(records, /window\.open\(/);
  assert.doesNotMatch(records, /<iframe[\s\S]*selectedReportAttachment/);
});


test("assistant engine history and maintenance health expose filtered reports and work metrics", async () => {
  const policy = await source("lib/assistantPolicy.ts");
  const tools = await source("lib/assistantTools.ts");
  const assistantPage = await source("app/asistan/page.tsx");
  const assistantDetails = await source("components/AssistantResultDetails.tsx");
  assert.match(policy, /showAll\?: boolean/);
  assert.match(policy, /tüm\|bütün\|hepsi/);
  assert.match(policy, /asksEngineMaintenanceDuration/);
  assert.match(policy, /yearOnly/);
  assert.match(policy, /extractMaintenanceTypeQuery/);
  assert.match(tools, /safeReportAttachments/);
  assert.match(tools, /report_attachment_count/);
  assert.match(tools, /query\.showAll \? 500 : 20/);
  assert.match(tools, /worked_since_last_hours/);
  assert.match(tools, /worked_duration_minutes/);
  assert.match(tools, /worked_since_last_hours/);
  assert.match(tools, /buildRecordMatch\(db, query\)/);
  assert.match(tools, /mapWithConcurrency/);
  assert.match(tools, /mapWithConcurrency\(resultRows\.slice\(0, 12\), 4/);
  assert.match(assistantPage, /AssistantResultDetails/);
  assert.match(assistantDetails, /Rapor ekleri:/);
  assert.match(assistantDetails, /Son bakımdan beri motor çalışması/);
  assert.match(assistantDetails, /maintenance_health/);
});


test("assistant exports preserve report filenames and maintenance work metrics", async () => {
  const exportLib = await source("lib/assistantExport.ts");
  const assistantPage = await source("app/asistan/page.tsx");
  const assistantDetails = await source("components/AssistantResultDetails.tsx");
  assert.match(exportLib, /worked_hours/);
  assert.match(exportLib, /attachments: "Rapor ekleri"/);
  assert.match(exportLib, /report_attachments/);
  assert.match(exportLib, /maintenance_health: \[.*worked_hours.*duration/);
  assert.match(assistantDetails, /maintenance_health/);
});


test("all generated PDF and Excel reports use the shared Yeşil Global logo", async () => {
  const branding = await source("lib/exportBranding.ts");
  const assistantExport = await source("app/api/assistant/export/route.ts");
  const pdfExport = await source("app/api/export/pdf/route.ts");
  const excelExport = await source("app/api/export/excel/route.ts");
  assert.match(branding, /yesil-global-logo\.png/);
  assert.match(branding, /yesil-global-logo\.jpg/);
  assert.match(assistantExport, /loadDefaultExportLogo/);
  assert.doesNotMatch(assistantExport, /yesil-global-logo\.jpg/);
  assert.match(pdfExport, /loadDefaultExportLogo/);
  assert.match(pdfExport, /doc\.image\(logo\.buffer/);
  assert.match(excelExport, /loadDefaultExportLogo/);
  assert.match(excelExport, /workbook\.addImage/);
  assert.match(excelExport, /Yeşil Global Enerji · AGM Bakım Merkezi/);
});
test("engine reassignment stays manager-only and repairs grouped maintenance tracking", async () => {
  const update = await source("app/api/records/[id]/route.ts");
  const confirm = await source("app/api/records/[id]/confirm/route.ts");
  const helper = await source("lib/reassignMaintenanceEngine.ts");
  const schemas = await source("lib/schemas.ts");
  const recordsPage = await source("app/kayitlar/page.tsx");
  const confirmationModal = await source("components/MaintenanceConfirmationModal.tsx");
  assert.match(schemas, /recordConfirmationSchema = z\.object\(\{[\s\S]*engine_id/);
  assert.match(update, /engineChangeRequested/);
  assert.match(update, /Bakım kaydının motorunu yalnızca yöneticiler değiştirebilir/);
  assert.match(update, /reassignMaintenanceRecordEngine/);
  assert.match(update, /session\.withTransaction/);
  assert.match(update, /effectiveEngineId/);
  assert.match(confirm, /user\.role !== "yonetici"/);
  assert.match(confirm, /recordConfirmationSchema/);
  assert.match(confirm, /reassignMaintenanceRecordEngine/);
  assert.match(confirm, /moved_record_ids/);
  assert.match(helper, /group_id/);
  assert.match(helper, /recomputeLastMaintenance\(db, sourceEngineId, typeKey/);
  assert.match(helper, /recomputeLastMaintenance\(db, targetEngineId, typeKey/);
  assert.match(helper, /tracking_state_before/);
  assert.match(helper, /period_hours/);
  assert.match(helper, /tracking_source: "record"/);
  assert.match(confirmationModal, /Bakımın bağlı olduğu motor/);
  assert.match(confirmationModal, /Bakım motoru/);
  assert.match(recordsPage, /engine_id: isAdmin \? engineId/);
  assert.match(recordsPage, /selectedEngineId/);
  assert.match(recordsPage, /engines=\{sortedEngines\}/);
});

test("Android TWA asset links stay public and match the signed package", async () => {
  const assetLinks = await source("public/.well-known/assetlinks.json");
  const middleware = await source("middleware.ts");
  assert.match(assetLinks, /"package_name":\s*"com\.avcikoru\.bakim"/);
  assert.match(assetLinks, /3B:64:AC:01:49:D3:11:40:2D:C3:5D:74:E5:37:FF:2E:A5:3D:BA:4F:C7:B8:9B:FD:BA:A9:FE:70:C2:57:C9:0B/);
  assert.match(middleware, /\.well-known/);
});

test("service worker keeps push handling and closed-window metadata sync bounded", async () => {
  const serviceWorker = await source("lib/serviceWorker.ts");
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /addEventListener\("sync"/);
  assert.match(serviceWorker, /syncOfflineQueueInWorker/);
  assert.match(serviceWorker, /isMetadataOnlyOfflineJob/);
  assert.match(serviceWorker, /value\.media\.length === 0/);
  assert.match(serviceWorker, /client_request_id/);
});

test("push subscription endpoints keep request bodies bounded and typed", async () => {
  const pushRoute = await source("app/api/push/subscribe/route.ts");
  const limits = await source("lib/requestLimits.ts");
  assert.match(pushRoute, /readRequestTextLimited/);
  assert.match(pushRoute, /MAX_PUSH_SUBSCRIPTION_REQUEST_BYTES/);
  assert.match(pushRoute, /RequestBodyTooLargeError/);
  assert.doesNotMatch(pushRoute, /await req\.json\(\)/);
  assert.match(limits, /MAX_PUSH_SUBSCRIPTION_REQUEST_BYTES = 32 \* 1024/);
});

test("service worker updates bypass stale script caches", async () => {
  const serviceWorker = await source("lib/serviceWorker.ts");
  const pwaRegister = await source("components/PwaRegister.tsx");
  const pushToggle = await source("components/PushNotificationToggle.tsx");
  assert.match(serviceWorker, /agm-bakim-shell-v4/);
  assert.match(serviceWorker, /caches\.delete/);
  assert.match(pwaRegister, /updateViaCache: "none"/);
  assert.match(pwaRegister, /registration.update()/);
  assert.match(pwaRegister, /controllerchange/);
  assert.match(pushToggle, /updateViaCache: "none"/);
});

test("closed-window worker sync only targets bounded record jobs", async () => {
  const serviceWorker = await source("lib/serviceWorker.ts");
  assert.match(serviceWorker, /isAllowedOfflineEndpoint/);
  assert.match(serviceWorker, /\/\^\\\/api\\\/records\\\//);
  assert.match(serviceWorker, /MAX_WORKER_SYNC_BODY_BYTES = 512 \* 1024/);
  assert.match(serviceWorker, /credentials: "same-origin"/);
});

test("sidebar labels delayed maintenance separately from the unread bell", async () => {
  const sidebar = await source("components/Sidebar.tsx");
  const bell = await source("components/NotificationBell.tsx");
  assert.match(sidebar, /gecikmiş bakım/iu);
  assert.match(sidebar, /aria-label=\{`\$\{gecikmis\} gecikmiş bakım`\}/u);
  assert.match(bell, /\/api\/notifications\/unread-count/);
});

test("notification listing uses current panel statuses without requiring refresh mutation", async () => {
  const notificationsRoute = await source("app/api/notifications/route.ts");
  const notifications = await source("lib/notifications.ts");
  const notificationsPage = await source("app/bildirimler/page.tsx");
  assert.match(notificationsRoute, /listUserNotificationsWithCurrentStatuses/u);
  assert.match(notifications, /loadActionableItems/u);
  assert.match(notifications, /currentMaintenanceNotifications/u);
  assert.match(notifications, /read_at: now/u);
  assert.match(notificationsPage, /useEffect\(\(\) => \{ load\(\)/u);
});

test("public login route excludes protected navigation chrome", async () => {
  const appShell = await source("components/AppShell.tsx");
  assert.match(appShell, /isPublicRoute/u);
  assert.match(appShell, /\{!isPublicRoute && <Sidebar \/>\}/u);
  assert.match(appShell, /<RoleGuard>\{children\}<\/RoleGuard>/u);
});

test("notification refresh falls back to read-only listing on refresh failure", async () => {
  const notificationsPage = await source("app/bildirimler/page.tsx");
  assert.match(notificationsPage, /if \(!response\.ok && shouldRefresh\)/u);
  assert.match(notificationsPage, /\/api\/notifications\?limit=500/u);
});

test("notifications page retries transient initial load failures", async () => {
  const notificationsPage = await source("app/bildirimler/page.tsx");
  assert.match(notificationsPage, /Serverless cold start/u);
  assert.match(notificationsPage, /setTimeout\(resolve, 500\)/u);
  assert.match(notificationsPage, /data = await request\(false\)/u);
});

test("notification detail targets the selected dashboard motor health card", async () => {
  const notifications = await source("lib/notifications.ts");
  const dashboard = await source("app/dashboard/page.tsx");
  assert.match(notifications, /maintenanceDashboardHref/u);
  assert.match(notifications, /new URLSearchParams\(\{ engine: engineId, maintenance: typeKey \}\)/u);
  assert.match(dashboard, /new URLSearchParams\(window\.location\.search\)/u);
  assert.match(dashboard, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/u);
  assert.match(dashboard, /id=\{healthCardId\(engine\._id\)\}/u);
});

test("large JSON mutation routes enforce transport body limits", async () => {
  const limits = await source("lib/requestLimits.ts");
  const routePaths = [
    "app/api/auth/login/route.ts",
    "app/api/auth/register/route.ts",
    "app/api/records/route.ts",
    "app/api/records/[id]/route.ts",
    "app/api/equipment-info/import/route.ts",
    "app/api/import/hours/route.ts",
    "app/api/pressure-readings/import/route.ts",
    "app/api/oil-analyses/route.ts",
    "app/api/upload-chunk/route.ts",
  ];
  assert.match(limits, /parseJsonBodyLimited/u);
  assert.match(limits, /MAX_RECORD_REQUEST_BYTES = 16 \* 1024 \* 1024/u);
  assert.match(limits, /MAX_UPLOAD_CHUNK_REQUEST_BYTES = 4 \* 1024 \* 1024/u);
  for (const routePath of routePaths) assert.match(await source(routePath), /parseJsonBodyLimited/u);
});
