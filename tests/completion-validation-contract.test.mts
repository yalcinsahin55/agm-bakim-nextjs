import test from "node:test";
import assert from "node:assert/strict";
import { getCompletionValidationError } from "../app/tamamla/_lib/completionValidation.ts";

test("completion validation keeps the existing first-error order", () => {
  const base = {
    chosenTypePresent: true,
    checklistComplete: true,
    timeTrackingReady: true,
    evidenceReady: true,
    isManagerInternalRecord: false,
    responsibleDurationMinutes: null,
    maintenanceDurationMinutes: null,
    selectedSupportDurations: [],
  };

  assert.equal(getCompletionValidationError({ ...base, chosenTypePresent: false }), "Lütfen bir bakım türü seçin.");
  assert.equal(getCompletionValidationError({ ...base, checklistComplete: false }), "Bakımı tamamlamadan önce kontrol listesindeki tüm maddeleri işaretleyin.");
  assert.equal(getCompletionValidationError({ ...base, timeTrackingReady: false }), "Bakım başlangıç ve bitiş tarih-saatlerini geçerli şekilde girin.");
  assert.equal(getCompletionValidationError({ ...base, evidenceReady: false }), "Bakım kanıtı için en az bir not, fotoğraf veya video ekleyin.");
  assert.equal(getCompletionValidationError(base), null);
});

test("completion validation preserves internal technician duration safeguards", () => {
  const base = {
    chosenTypePresent: true,
    checklistComplete: true,
    timeTrackingReady: true,
    evidenceReady: true,
    isManagerInternalRecord: true,
    responsibleDurationMinutes: 60,
    maintenanceDurationMinutes: 120,
    selectedSupportDurations: [60],
  };

  assert.equal(getCompletionValidationError({ ...base, responsibleDurationMinutes: 0 }), "Sorumlu teknisyen için 0’dan büyük çalışma süresini saat olarak girin.");
  assert.equal(getCompletionValidationError({ ...base, responsibleDurationMinutes: 180 }), "Sorumlu teknisyen süresi toplam bakım süresini aşamaz.");
  assert.equal(getCompletionValidationError({ ...base, selectedSupportDurations: [0] }), "Seçilen her destek teknisyeni için 0’dan büyük çalışma süresini saat olarak girin.");
  assert.equal(getCompletionValidationError({ ...base, selectedSupportDurations: [180] }), "Destek teknisyeni süresi toplam bakım süresini aşamaz.");
  assert.equal(getCompletionValidationError(base), null);
});
