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
    <div className="flex flex-col-reverse items-stretch justify-between gap-3 rounded-2xl border border-border bg-panel p-3 sm:flex-row sm:items-center"><div className="text-[10px] text-faint">Kaydetmeden önce zaman, kontrol listesi ve kanıt alanlarını doğrulayın.</div><div className="flex gap-2 sm:min-w-[320px] sm:justify-end"><button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-border bg-panel2 px-4 py-3 text-[11px] font-bold text-muted transition hover:border-amber/50 hover:text-text sm:flex-none">İptal</button><button type="submit" disabled={disabled} className="flex-1 rounded-lg bg-amber px-5 py-3 text-[12px] font-extrabold text-[#1a1206] shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[220px]">{submitting ? "Kaydediliyor..." : "BAKIMI TAMAMLA"}</button></div></div>
  );
}
