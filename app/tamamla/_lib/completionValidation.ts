export interface CompletionValidationInput {
  chosenTypePresent: boolean;
  checklistComplete: boolean;
  timeTrackingReady: boolean;
  evidenceReady: boolean;
  isManagerInternalRecord: boolean;
  responsibleDurationMinutes: number | null;
  maintenanceDurationMinutes: number | null;
  selectedSupportDurations: number[];
}

export function getCompletionValidationError(input: CompletionValidationInput): string | null {
  if (!input.chosenTypePresent) return "Lütfen bir bakım türü seçin.";
  if (!input.checklistComplete) return "Bakımı tamamlamadan önce kontrol listesindeki tüm maddeleri işaretleyin.";
  if (!input.timeTrackingReady) return "Bakım başlangıç ve bitiş tarih-saatlerini geçerli şekilde girin.";
  if (!input.evidenceReady) return "Bakım kanıtı için en az bir not, fotoğraf veya video ekleyin.";
  if (input.isManagerInternalRecord && (!input.responsibleDurationMinutes || input.responsibleDurationMinutes <= 0)) {
    return "Sorumlu teknisyen için 0’dan büyük çalışma süresini saat ve dakika olarak girin.";
  }
  if (input.isManagerInternalRecord && input.maintenanceDurationMinutes !== null && input.responsibleDurationMinutes !== null && input.responsibleDurationMinutes > input.maintenanceDurationMinutes) {
    return "Sorumlu teknisyen süresi toplam bakım süresini aşamaz.";
  }
  if (input.isManagerInternalRecord && input.selectedSupportDurations.some((duration) => duration <= 0)) {
    return "Seçilen her destek teknisyeni için 0’dan büyük çalışma süresini saat ve dakika olarak girin.";
  }
  const maintenanceDurationMinutes = input.maintenanceDurationMinutes;
  if (input.isManagerInternalRecord && maintenanceDurationMinutes !== null && input.selectedSupportDurations.some((duration) => duration > maintenanceDurationMinutes)) {
    return "Destek teknisyeni süresi toplam bakım süresini aşamaz.";
  }
  return null;
}
