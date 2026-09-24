"use client";

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ComponentTransferDraft } from "@/lib/componentTransfers";
import { COMPONENT_TRANSFER_MAX_COUNT, createComponentTransferDraft } from "@/lib/componentTransfers";

export interface ComponentTransferEngineOption {
  _id: string;
  name: string;
}

type Props = {
  engines: ComponentTransferEngineOption[];
  transfers: ComponentTransferDraft[];
  setTransfers: Dispatch<SetStateAction<ComponentTransferDraft[]>>;
  disabled?: boolean;
};

export default function ComponentTransferSection({ engines, transfers, setTransfers, disabled = false }: Props) {
  const sortedEngines = useMemo(() => [...engines].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true })), [engines]);
  const update = (id: string, patch: Partial<ComponentTransferDraft>) => setTransfers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <section className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3" aria-labelledby="component-transfer-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">Çıkma / transfer parçası</div>
          <h2 id="component-transfer-heading" className="mt-1 text-sm font-extrabold text-text">Başka motordan takılan parça</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Motorun toplam saatini değiştirmeden parçanın hangi motordan geldiğini ve kendi çalışma saatini kaydedin.</p>
        </div>
        <button type="button" disabled={disabled || transfers.length >= COMPONENT_TRANSFER_MAX_COUNT} onClick={() => setTransfers((current) => [...current, createComponentTransferDraft()])} className="shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2.5 py-2 text-[10px] font-bold text-cyan-200 disabled:opacity-40">+ Parça ekle</button>
      </div>
      {transfers.length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[10px] text-faint">Bu bakımda başka motordan takılan parça yok.</div> : (
        <div className="mt-3 flex flex-col gap-3">
          {transfers.map((transfer, index) => (
            <div key={transfer.id} className="rounded-lg border border-border bg-panel2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-cyan-200">Parça {index + 1}</span><button type="button" disabled={disabled} onClick={() => setTransfers((current) => current.filter((item) => item.id !== transfer.id))} className="text-[10px] font-bold text-red-300 hover:text-red-200">Kaldır</button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-muted sm:col-span-2">Parça adı
                  <input disabled={disabled} value={transfer.component_name} onChange={(event) => update(transfer.id, { component_name: event.target.value })} placeholder="Örn. Intercooler, turbo" className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm text-text outline-none focus:border-cyan-300" maxLength={120} />
                </label>
                <label className="text-[10px] font-bold text-muted sm:col-span-2">Kaynak motor
                  <select disabled={disabled} value={transfer.source_engine_id} onChange={(event) => update(transfer.id, { source_engine_id: event.target.value })} className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm text-text outline-none focus:border-cyan-300"><option value="">Motor seçin</option>{sortedEngines.map((engine) => <option key={engine._id} value={engine._id}>{engine.name}</option>)}</select>
                </label>
                <label className="text-[10px] font-bold text-muted">Kaynak motordaki saat
                  <input disabled={disabled} type="number" min="0" step="0.1" value={transfer.source_hours} onChange={(event) => update(transfer.id, { source_hours: event.target.value })} placeholder="Örn. 2000" className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm font-mono text-text outline-none focus:border-cyan-300" />
                </label>
                <label className="text-[10px] font-bold text-muted">Takıldığı motordaki saat
                  <input disabled={disabled} type="number" min="0" step="0.1" value={transfer.installed_hours} onChange={(event) => update(transfer.id, { installed_hours: event.target.value })} placeholder="Örn. 8500" className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm font-mono text-text outline-none focus:border-cyan-300" />
                </label>
                <label className="text-[10px] font-bold text-muted sm:col-span-2">Açıklama (isteğe bağlı)
                  <input disabled={disabled} value={transfer.note} onChange={(event) => update(transfer.id, { note: event.target.value })} placeholder="Sökülen parçanın yerine takıldı..." className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm text-text outline-none focus:border-cyan-300" maxLength={500} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
