"use client";

import { Badge, Button, Card } from "@/components/ui";

type CompletionQuickBannerProps = {
  isOnline: boolean;
  engineName: string;
  typeName: string;
  qrEngineId: string | null;
  qrTypeKey: string | null;
  onExitQuickMode: () => void;
};

export default function CompletionQuickBanner({
  isOnline,
  engineName,
  typeName,
  qrEngineId,
  qrTypeKey,
  onExitQuickMode,
}: CompletionQuickBannerProps) {
  return (
    <Card className="mb-3 border-teal/40 bg-gradient-to-br from-teal/10 via-panel to-panel p-4" role="status" aria-labelledby="quick-maintenance-heading" data-testid="quick-maintenance-banner">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal">01 · Saha başlangıcı</div>
          <h2 id="quick-maintenance-heading" className="mt-1 text-base font-extrabold text-text">Hızlı bakım akışı</h2>
          <p className="mt-1 max-w-2xl text-[10.5px] leading-4 text-muted">QR bağlantısı motoru veya bakım türünü önseçti. Başlamadan önce aşağıdaki bilgiyi ve bakım saatlerini kontrol edin; kaydetme işlemi mevcut onay, kanıt ve offline kurallarıyla devam eder.</p>
        </div>
        <Badge tone={isOnline ? "success" : "warning"} className="w-fit flex-shrink-0 px-2.5 py-1 text-[9px]">{isOnline ? "BAĞLANTI HAZIR" : "ÇEVRİMDIŞI KUYRUK"}</Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-teal/25 bg-panel2 px-3 py-2.5" data-testid="quick-maintenance-engine">
          <div className="text-[9px] font-bold uppercase tracking-wide text-faint">Motor</div>
          <div className="mt-1 truncate text-[12px] font-extrabold text-text">{engineName || "Motor seçilecek"}</div>
          <div className="mt-1 text-[9.5px] text-muted">{qrEngineId ? "QR ile önseçildi ve kilitlendi" : "Saha başlangıcında seçin"}</div>
        </div>
        <div className="rounded-xl border border-teal/25 bg-panel2 px-3 py-2.5" data-testid="quick-maintenance-type">
          <div className="text-[9px] font-bold uppercase tracking-wide text-faint">Bakım türü</div>
          <div className="mt-1 truncate text-[12px] font-extrabold text-text">{typeName || "Bakım türü seçilecek"}</div>
          <div className="mt-1 text-[9.5px] text-muted">{qrTypeKey ? "QR ile önseçildi ve kilitlendi" : "Saha başlangıcında seçin"}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-[10px] leading-4 text-muted sm:flex-row sm:items-center sm:justify-between">
        <span><strong className="text-teal">Sıradaki adım:</strong> bakım zamanı → ekip katkısı → kontrol listesi → kanıt → kaydet.</span>
        {(qrEngineId || qrTypeKey) && <Button type="button" onClick={onExitQuickMode} variant="secondary" size="sm" className="w-fit hover:border-teal/50" data-testid="quick-maintenance-exit">Manuel akışa geç</Button>}
      </div>
    </Card>
  );
}
