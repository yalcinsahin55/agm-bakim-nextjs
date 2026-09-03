import { Badge } from "@/components/ui";

interface CompletionWorkspaceHeaderProps {
  isOnline: boolean;
}

export default function CompletionWorkspaceHeader({ isOnline }: CompletionWorkspaceHeaderProps) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Kayıt çalışma alanı</div>
        <h1 className="text-xl font-extrabold tracking-tight text-text md:text-2xl">Bakım kaydını tamamla</h1>
        <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Motor, bakım zamanı, ekip katkısı ve kanıtları tek ekranda kontrol ederek kaydı güvenle tamamlayın.</p>
      </div>
      <Badge tone={isOnline ? "success" : "warning"} className="px-3 py-1.5 text-[10px]">
        {isOnline ? "ÇEVRİMİÇİ" : "ÇEVRİMDIŞI ÇALIŞMA"}
      </Badge>
    </div>
  );
}
