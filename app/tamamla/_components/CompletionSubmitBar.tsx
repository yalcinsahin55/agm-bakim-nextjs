"use client";

type CompletionSubmitBarProps = {
  submitting: boolean;
  photoBusy: boolean;
  videoBusy: boolean;
  reportAttachmentBusy: boolean;
  hasChosenType: boolean;
  checklistComplete: boolean;
  timeTrackingReady: boolean;
  evidenceReady: boolean;
  onCancel: () => void;
};

export default function CompletionSubmitBar({
  submitting,
  photoBusy,
  videoBusy,
  reportAttachmentBusy,
  hasChosenType,
  checklistComplete,
  timeTrackingReady,
  evidenceReady,
  onCancel,
}: CompletionSubmitBarProps) {
  const disabled = submitting || photoBusy || videoBusy || reportAttachmentBusy || !hasChosenType || !checklistComplete || !timeTrackingReady || !evidenceReady;

  return (
    <div className="sticky bottom-24 z-20 -mx-1 flex scroll-mb-28 flex-col-reverse items-stretch justify-between gap-2 rounded-2xl border border-border bg-panel/95 p-3 shadow-xl backdrop-blur-md sm:static sm:mx-0 sm:flex-row sm:items-center sm:gap-3 sm:bg-panel sm:shadow-none sm:backdrop-blur-none">
      <div className="text-[10px] leading-relaxed text-faint">Kaydetmeden önce zaman, kontrol listesi ve kanıt alanlarını doğrulayın.</div>
      <div className="flex gap-2 sm:min-w-[320px] sm:justify-end">
        <button type="button" onClick={onCancel} className="ui-button ui-button-secondary min-h-11 flex-1 sm:flex-none">İptal</button>
        <button type="submit" disabled={disabled} className="ui-button ui-button-primary min-h-11 flex-1 sm:min-w-[220px]">{submitting ? "Kaydediliyor..." : "BAKIMI TAMAMLA"}</button>
      </div>
    </div>
  );
}
