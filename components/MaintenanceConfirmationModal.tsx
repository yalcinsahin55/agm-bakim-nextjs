"use client";

import { formatMaintenanceDuration } from "@/lib/maintenanceTime";
import { TECHNICIAN_TYPE_LABELS } from "@/lib/technicians";
import type { TechnicianType } from "@/lib/types";

export interface ConfirmationRecordSummary {
  _id: string;
  engine_id: string;
  engine_name: string;
  type_label: string;
  hour_at_completion: number;
  maintenance_duration_minutes?: number;
  technician_id: string;
  technician_source?: "internal" | "external_service";
}

export interface ConfirmationContributionRow {
  id: string;
  full_name: string;
  technician_type?: TechnicianType;
  contribution_role: "responsible" | "support";
  duration_minutes?: number;
}

export interface ConfirmationEngineOption {
  _id: string;
  name: string;
}

interface MaintenanceConfirmationModalProps {
  record: ConfirmationRecordSummary;
  engines: readonly ConfirmationEngineOption[];
  rows: readonly ConfirmationContributionRow[];
  engineId: string;
  durationInputs: Record<string, string>;
  totalMinutes: number;
  isExternalService: boolean;
  confirming: boolean;
  onEngineChange: (engineId: string) => void;
  onDurationChange: (technicianId: string, value: string) => void;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function MaintenanceConfirmationModal({
  record,
  engines,
  rows,
  engineId,
  durationInputs,
  totalMinutes,
  isExternalService,
  confirming,
  onEngineChange,
  onDurationChange,
  onClose,
  onCancel,
  onConfirm,
}: MaintenanceConfirmationModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-sm md:items-center md:p-4" role="dialog" aria-modal="true" aria-label="Kişi bazlı çalışma süresi teyidi">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-panel p-4 shadow-2xl md:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3 border-b border-border pb-3">
          <div className="min-w-0">
            <div className="text-base font-extrabold text-text">Teyit öncesi çalışma süreleri</div>
            <div className="mt-0.5 truncate text-[11px] text-muted">{record.engine_name} · {record.type_label}</div>
          </div>
          <button type="button" onClick={onClose} className="h-8 w-8 flex-shrink-0 rounded-full border border-border bg-panel2 text-text hover:bg-red hover:text-white" aria-label="Teyit penceresini kapat">✕</button>
        </div>
        <div className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-[11px] leading-relaxed text-amber"><b>Önemli:</b> Toplam bakım süresi ile kişi katkı süresi aynı olmak zorunda değildir. Çok günlük bakım ve mesai durumlarında her çalışan için gerçek toplam süreyi ayrı girin. Değerler saat cinsindendir; örnek: <b>8,5</b> = 8 saat 30 dakika.</div>
        <div className="mt-3 rounded-xl border border-purple-400/30 bg-purple-400/5 p-3">
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted">Bakımın bağlı olduğu motor</label>
          <p className="mt-0.5 text-[10px] leading-relaxed text-faint">Teknisyen yanlış motora bakım yaptıysa doğru motoru seçin. Yönetici teyit ettiğinde aynı gruptaki tüm bakım türleri yeni motora taşınır ve eski motorun bakım takibi yeniden hesaplanır.</p>
          <select value={engineId} onChange={(event) => onEngineChange(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm outline-none focus:border-purple-300" aria-label="Bakım motoru">
            {!engines.some((engine) => engine._id === record.engine_id) && <option value={record.engine_id}>{record.engine_name} (mevcut)</option>}
            {engines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}
          </select>
          {engineId !== record.engine_id && <div className="mt-2 rounded-lg bg-purple-400/10 px-2 py-1.5 text-[10px] text-purple-100">Motor değişikliği seçildi: <b>{record.engine_name}</b> → <b>{engines.find((engine) => engine._id === engineId)?.name || "Yeni motor"}</b>.</div>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Motor saati</div><div className="mt-0.5 font-mono font-bold text-amber">{record.hour_at_completion.toLocaleString("tr-TR")} sa</div></div>
          <div className="rounded-lg bg-panel2 p-2"><div className="text-faint">Geçen bakım süresi</div><div className="mt-0.5 font-bold text-teal">{formatMaintenanceDuration(record.maintenance_duration_minutes)}</div></div>
        </div>
        {isExternalService ? (
          <div className="mt-3 rounded-xl border border-purple-400/30 bg-purple-400/10 p-3 text-[11px] text-purple-100"><b>Dış hizmet kaydı</b><div className="mt-1 text-[10.5px] text-purple-200">Bu kayıtta kayıtlı personel bulunmadığı için kişi bazlı çalışma süresi girilmeyecek. Kontrol ettikten sonra teyit edebilirsin.</div></div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {rows.map((row) => <label key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-panel2 px-3 py-2.5"><span className="min-w-0"><span className="block truncate text-[12px] font-bold text-text">{row.full_name}</span><span className="mt-0.5 block text-[10px] text-faint">{row.contribution_role === "responsible" ? "Sorumlu" : "Destek"} · {TECHNICIAN_TYPE_LABELS[row.technician_type || "mekanik"] || "Mekanik teknisyen"}</span></span><span className="flex flex-shrink-0 items-center gap-1.5 text-[10px] text-muted"><input type="number" min="0.25" max={366 * 24} step="0.25" required value={durationInputs[row.id] || ""} onChange={(event) => onDurationChange(row.id, event.target.value)} className="w-24 rounded-lg border border-border bg-panel px-2 py-2 text-right font-mono text-[12px] text-text outline-none focus:border-amber" aria-label={`${row.full_name} çalışma süresi (saat)`} /> saat</span></label>)}
          </div>
        )}
        {!isExternalService && <div className="mt-3 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-[10.5px] text-teal">Toplam kişi katkısı: <b>{formatMaintenanceDuration(totalMinutes)}</b> · Mesai ve farklı günlerdeki çalışma bu toplamda birlikte tutulur.</div>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-[12px] font-bold text-muted hover:bg-panel2">Vazgeç</button>
          <button type="button" onClick={onConfirm} disabled={confirming} className="flex-1 rounded-xl bg-green py-2.5 text-[12px] font-bold text-[#071a12] disabled:opacity-50">{confirming ? "Teyit ediliyor..." : "✓ Süreleri kontrol et ve teyit et"}</button>
        </div>
      </div>
    </div>
  );
}
