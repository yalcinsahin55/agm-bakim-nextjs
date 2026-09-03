"use client";

import { Button, Card } from "@/components/ui";

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
    <Card className="flex flex-col-reverse items-stretch justify-between gap-3 rounded-2xl p-3 sm:flex-row sm:items-center"><div className="text-[10px] text-faint">Kaydetmeden önce zaman, kontrol listesi ve kanıt alanlarını doğrulayın.</div><div className="flex gap-2 sm:min-w-[320px] sm:justify-end"><Button type="button" onClick={onCancel} variant="secondary" size="lg" className="flex-1 sm:flex-none">İptal</Button><Button type="submit" disabled={disabled} size="lg" className="flex-1 shadow-lg sm:min-w-[220px]">{submitting ? "Kaydediliyor..." : "BAKIMI TAMAMLA"}</Button></div></Card>
  );
}
