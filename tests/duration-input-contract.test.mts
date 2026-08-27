import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("duration input uses explicit hours and minutes", async () => {
  const component = await source("components/DurationInput.tsx");
  assert.match(component, /durationPartsToMinutes/);
  assert.match(component, /splitDurationMinutes/);
  assert.match(component, /aria-label=\{`\$\{label\} saat`\}/);
  assert.match(component, /aria-label=\{`\$\{label\} dakika`\}/);
  assert.match(component, /maxMinutesForSelectedHour/);
});

test("completion, edit, and confirmation surfaces use the shared duration input", async () => {
  const completion = await source("app/tamamla/_components/CompletionTechnicianSection.tsx");
  const completionPage = await source("app/tamamla/page.tsx");
  const editAdmin = await source("app/kayitlar/_components/RecordEditAdminSections.tsx");
  const editPage = await source("app/kayitlar/_components/MaintenanceRecordEditForm.tsx");
  const editSupport = await source("app/kayitlar/_components/RecordEditCollaborationSections.tsx");
  const confirmation = await source("components/MaintenanceConfirmationModal.tsx");
  const confirmationHook = await source("app/kayitlar/_hooks/useRecordConfirmation.ts");
  for (const content of [completion, editAdmin, editSupport, confirmation]) assert.match(content, /DurationInput/);
  assert.match(confirmationHook, /durationInputs: Record<string, number \| null>/);
  assert.match(confirmationHook, /duration_minutes: durationInputs\[row\.id\] \?\? -1/);
  assert.match(completionPage, /const responsibleDurationMinutes = isManagerInternalRecord \? responsibleTechnicianDurationMinutes : null/);
  assert.match(completionPage, /setResponsibleTechnicianDurationMinutes\(maintenanceDurationMinutes\)/);
  assert.match(editPage, /const responsibleDurationMinutes = isAdmin && technicianSource !== "external_service" \? responsibleTechnicianDurationMinutes : null/);
  assert.doesNotMatch(completion, /hoursInputToMinutes/);
  assert.doesNotMatch(editAdmin, /hoursInputToMinutes|minutesToHoursInput/);
  assert.doesNotMatch(editSupport, /hoursInputToMinutes|minutesToHoursInput/);
  assert.doesNotMatch(confirmation, /type="number"[^>]+step="0\.25"/);
});
