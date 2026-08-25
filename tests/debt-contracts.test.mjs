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

test("sensitive read routes keep user-scoped rate limits", async () => {
  const routes = await Promise.all([
    source("app/api/audit-logs/route.ts"),
    source("app/api/media/file/route.ts"),
    source("app/api/oil-analyses/[id]/file/route.ts"),
    source("app/api/records/route.ts"),
    source("app/api/records/interval-summary/route.ts"),
    source("app/api/reports/engine/[id]/route.ts"),
    source("app/api/users/technicians/route.ts"),
  ]);
  for (const route of routes) assert.match(route, /enforceApiRateLimit\(/);
  assert.match(routes[0], /audit-log-read/);
  assert.match(routes[1], /media-read/);
  assert.match(routes[2], /oil-analysis-file-read/);
  assert.match(routes[3], /records-read/);
  assert.match(routes[4], /records-interval-summary-read/);
  assert.match(routes[5], /engine-report-read/);
  assert.match(routes[6], /technician-list-read/);
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

test("notification page is GET-first and the bell uses a lightweight unread count", async () => {
  const notificationsGet = await source("app/api/notifications/route.ts");
  const notificationsRefresh = await source("app/api/notifications/refresh/route.ts");
  const unreadCount = await source("app/api/notifications/unread-count/route.ts");
  const notificationsPage = await source("app/bildirimler/page.tsx");
  const notificationBell = await source("components/NotificationBell.tsx");
  assert.match(notificationsGet, /Bildirim yenileme için POST/);
  assert.match(notificationsRefresh, /export async function POST/);
  assert.match(unreadCount, /notifications-unread-count/);
  assert.match(unreadCount, /countDocuments\(\{ user_id: user\._id, read_at: null \}\)/);
  assert.match(notificationsPage, /fetch\("\/api\/notifications\?limit=500", \{ cache: "no-store" \}\)/);
  assert.match(notificationsPage, /fetch\("\/api\/notifications\/refresh", \{ method: "POST"/);
  assert.match(notificationBell, /UNREAD_COUNT_URL = "\/api\/notifications\/unread-count"/);
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
  const clientUpload = await source("app/api/blob/upload-client/route.ts");
  const presignedUpload = await source("app/api/blob/upload-presigned/route.ts");
  const uploadHelper = await source("lib/reportAttachmentUpload.ts");
  const schema = await source("lib/schemas.ts");
  const create = await source("app/api/records/route.ts");
  const update = await source("app/api/records/[id]/route.ts");
  const fileRoute = await source("app/api/records/[id]/attachments/[attachmentId]/route.ts");
  const oilFileRoute = await source("app/api/oil-analyses/[id]/file/route.ts");
  const pdfSecurity = await source("lib/pdfSecurity.ts");
  const blobStorage = await source("lib/blobStorage.ts");
  const nextConfig = await source("next.config.js");
  const mediaUpload = await source("lib/mediaUpload.ts");
  const uploadPresigned = await source("app/api/blob/upload-presigned/route.ts");
  const mediaUrls = await source("lib/mediaUrls.ts");
  const mediaRoute = await source("app/api/media/file/route.ts");
  const chunkUpload = await source("lib/chunkUpload.ts");
  const queue = await source("lib/offlineQueue.ts");
  const complete = await source("app/tamamla/page.tsx");
  const records = await source("app/kayitlar/page.tsx");
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
  assert.match(clientUpload, /handleUpload/);
  assert.match(clientUpload, /REPORT_UPLOAD_PREFIX/);
  assert.match(clientUpload, /REPORT_UPLOAD_TOKEN = process\.env\.BLOB_READ_WRITE_TOKEN \|\| process\.env\.MEDIA_READ_WRITE_TOKEN/);
  assert.match(clientUpload, /token: REPORT_UPLOAD_TOKEN/);
  assert.match(clientUpload, /maximumSizeInBytes: REPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(presignedUpload, /issueSignedToken/);
  assert.match(presignedUpload, /presignUrl/);
  assert.match(presignedUpload, /BLOB_READ_WRITE_TOKEN \|\| process\.env\.MEDIA_READ_WRITE_TOKEN/);
  assert.match(presignedUpload, /BLOB_STORE_ID \|\| process\.env\.MEDIA_STORE_ID/);
  assert.match(presignedUpload, /REPORT_ATTACHMENT_MAX_BYTES/);
  assert.match(uploadHelper, /REPORT_UPLOAD_ENDPOINT = "\/api\/blob\/upload-presigned"/);
  assert.match(uploadHelper, /uploadPresigned/);
  assert.match(uploadHelper, /multipart: file\.size >= REPORT_UPLOAD_MULTIPART_THRESHOLD_BYTES/);
  assert.match(uploadHelper, /REPORT_UPLOAD_TIMEOUT_MS/);
  assert.match(uploadHelper, /abortSignal: abortController\.signal/);
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
  assert.match(fileRoute, /Content-Disposition/);
  assert.match(fileRoute, /Cache-Control.*private, no-store/);
  assert.match(oilFileRoute, /fetchStoredBlob/);
  assert.match(pdfSecurity, /\.private\.blob\.vercel-storage\.com/);
  assert.match(pdfSecurity, /\.blob\.vercel-storage\.com/);
  assert.match(blobStorage, /from "@vercel\/blob"/);
  assert.match(blobStorage, /MEDIA_READ_WRITE_TOKEN/);
  assert.match(blobStorage, /BLOB_READ_WRITE_TOKEN/);
  assert.match(blobStorage, /access: "private"/);
  assert.match(nextConfig, /source: "\/api\/oil-analyses\/:id\/file"/);
  assert.match(nextConfig, /X-Frame-Options.*SAMEORIGIN/);
  assert.match(oilFileRoute, /"X-Frame-Options": "SAMEORIGIN"/);
  assert.match(mediaUpload, /uploadPresigned/);
  assert.match(mediaUpload, /maintenance-photo/);
  assert.match(mediaUpload, /maintenance-video/);
  assert.match(mediaUpload, /multipart: kind === "video"/);
  assert.match(uploadPresigned, /maintenance-photo/);
  assert.match(uploadPresigned, /maintenance-video/);
  assert.match(uploadPresigned, /video\/\*/);
  assert.match(uploadPresigned, /maximumSizeInBytes: VIDEO_MAX_BYTES/);
  assert.match(chunkUpload, /uploadMaintenanceMedia\(file, "video"\)/);
  assert.match(mediaUrls, /api\/media\/file\?kind=\$\{kind\}&url=/);
  assert.match(mediaUrls, /private\.blob\.vercel-storage\.com/);
  assert.match(mediaRoute, /fetchStoredBlob/);
  assert.match(mediaRoute, /Giriş gerekli/);
  assert.match(mediaRoute, /Content-Disposition.*inline/);
  assert.match(queue, /kind: "photo" \| "video" \| "report"/);
  assert.match(queue, /job\.payload\.report_attachments/);
  assert.match(queue, /uploadReportAttachment/);
  assert.match(complete, /<ReportAttachmentPicker/);
  assert.match(records, /<ReportAttachmentPicker/);
  assert.doesNotMatch(complete, /\/api\/blob\/upload-server/);
  assert.doesNotMatch(records, /\/api\/blob\/upload-server/);
  assert.doesNotMatch(oilPage, /\/api\/blob\/upload-server/);
  assert.match(complete, /getMediaDisplayUrl/);
  assert.match(records, /getMediaDisplayUrl/);
  assert.match(records, /\/api\/records\/\$\{selectedRecord\._id\}\/attachments\/\$\{encodeURIComponent\(attachment\.id\)\}/);
});


test("assistant engine history and maintenance health expose filtered reports and work metrics", async () => {
  const policy = await source("lib/assistantPolicy.ts");
  const tools = await source("lib/assistantTools.ts");
  const assistantPage = await source("app/asistan/page.tsx");
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
  assert.match(assistantPage, /Rapor ekleri:/);
  assert.match(assistantPage, /Son bakımdan beri motor çalışması/);
  assert.match(assistantPage, /maintenance_health/);
});


test("assistant exports preserve report filenames and maintenance work metrics", async () => {
  const exportLib = await source("lib/assistantExport.ts");
  const assistantPage = await source("app/asistan/page.tsx");
  assert.match(exportLib, /worked_hours/);
  assert.match(exportLib, /attachments: "Rapor ekleri"/);
  assert.match(exportLib, /report_attachments/);
  assert.match(exportLib, /maintenance_health: \[.*worked_hours.*duration/);
  assert.match(assistantPage, /maintenance_health/);
});


test("engine reassignment stays manager-only and repairs grouped maintenance tracking", async () => {
  const update = await source("app/api/records/[id]/route.ts");
  const confirm = await source("app/api/records/[id]/confirm/route.ts");
  const helper = await source("lib/reassignMaintenanceEngine.ts");
  const schemas = await source("lib/schemas.ts");
  const recordsPage = await source("app/kayitlar/page.tsx");
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
  assert.match(recordsPage, /Bakımın bağlı olduğu motor/);
  assert.match(recordsPage, /Bakım motoru/);
  assert.match(recordsPage, /engine_id: isAdmin \? engineId/);
  assert.match(recordsPage, /selectedEngineId/);
  assert.match(recordsPage, /engines=\{sortedEngines\}/);
});
