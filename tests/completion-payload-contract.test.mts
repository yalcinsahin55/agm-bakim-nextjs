import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("completion payload helper preserves grouped maintenance and contribution fields", () => {
  const helper = source("app/tamamla/_lib/completionPayload.ts");
  assert.match(helper, /export function buildCompletionPayload\(input: CompletionPayloadInput\)/);
  assert.match(helper, /type_key: input\.chosenType\.key/);
  assert.match(helper, /type_label: input\.chosenType\.label/);
  assert.match(helper, /time_tracking_version: 2/);
  assert.match(helper, /extraKeys\.flatMap/);
  assert.match(helper, /trackedKeys\.has\(key\) \? undefined : Number\(input\.extraPeriods\[key\]\)/);
  assert.match(helper, /other_technician_ids: input\.selectedSupportIds/);
  assert.match(helper, /other_technician_durations: Object\.fromEntries/);
  assert.match(helper, /normalizeTechnicianContributionDuration\(input\.otherTechnicianDurations\[id\]/);
  assert.match(helper, /checklistItems\.map/);
  assert.match(helper, /completion_confirmation: true/);
});

test("completion payload helper keeps external and internal technician fields separate", () => {
  const helper = source("app/tamamla/_lib/completionPayload.ts");
  assert.match(helper, /input\.technicianSource === "external_service"/);
  assert.match(helper, /input\.isManagerInternalRecord && input\.responsibleTechnicianId/);
  assert.match(helper, /input\.isManagerInternalRecord && input\.responsibleDurationMinutes !== null/);
  assert.match(helper, /responsible_technician_duration: input\.responsibleDurationMinutes/);
  assert.match(helper, /maintenance_start_at: new Date\(input\.maintenanceStartAt\)\.toISOString\(\)/);
  assert.match(helper, /maintenance_end_at: new Date\(input\.maintenanceEndAt\)\.toISOString\(\)/);
  assert.doesNotMatch(helper, /queueRecord|fetch\(|getDb\(|usersCollection/);
});

test("tamamla parent delegates payload construction without duplicating payload fields", () => {
  const page = source("app/tamamla/page.tsx");
  assert.match(page, /import \{ buildCompletionPayload \} from "\.\/\_lib\/completionPayload"/);
  assert.match(page, /const payload = buildCompletionPayload\(\{/);
  assert.match(page, /responsibleDurationMinutes,/);
  assert.doesNotMatch(page, /const extra_types = extraKeys\.flatMap/);
  assert.doesNotMatch(page, /completion_confirmation: true/);
});
