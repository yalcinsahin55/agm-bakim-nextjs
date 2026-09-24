"use client";

import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ComponentTransferDraft } from "@/lib/componentTransfers";
import { COMPONENT_TRANSFER_MAX_COUNT, createComponentTransferDraft } from "@/lib/componentTransfers";

export interface ComponentTransferEngineOption { _id: string; name: string; }

type Props = {
  engines: ComponentTransferEngineOption[];
  transfers: ComponentTransferDraft[];
  setTransfers: Dispatch<SetStateAction<ComponentTransferDraft[]>>;
  disabled?: boolean;
};

export default function ComponentTransferSection({ engines, transfers, setTransfers, disabled = false }: Props) {
  const destinationName = useMemo(() => engines.length ? "seçilen motora" : "bu motora", [engines.length]);
  const update = (id: string, patch: Partial<ComponentTransferDraft>) => setTransfers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <section className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3" aria-labelledby="component-transfer-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">Parça saati</div>
          <h2 id="component-transfer-heading" className="mt-1 text-sm font-extrabold text-text">Değişen parça bilgisi</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">Parçanın yeni mi yoksa daha önce çalışmış mı olduğunu belirtin. Motorun toplam saati değişmez; parça saati ayrı hesaplanır.</p>
        </div>
        <button type="button" disabled={disabled || transfers.length >= COMPONENT_TRANSFER_MAX_COUNT} onClick={() => setTransfers((current) => [...current, createComponentTransferDraft()])} className="shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2.5 py-2 text-[10px] font-bold text-cyan-200 disabled:opacity-40">+ Parça ekle</button>
      </div>
      {transfers.length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-2 text-[10px] text-faint">Bu bakımda değişen parça yok.</div> : (
        <div className="mt-3 flex flex-col gap-3">
          {transfers.map((transfer, index) => (
            <div key={transfer.id} className="rounded-lg border border-border bg-panel2 p-3">
              <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-cyan-200">Parça {index + 1}</span><button type="button" disabled={disabled} onClick={() => setTransfers((current) => current.filter((item) => item.id !== transfer.id))} className="text-[10px] font-bold text-red-300 hover:text-red-200">Kaldır</button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-muted sm:col-span-2">Parça adı
                  <input disabled={disabled} value={transfer.component_name} onChange={(event) => update(transfer.id, { component_name: event.target.value })} placeholder="Örn. Intercooler, turbo" className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm text-text outline-none focus:border-cyan-300" maxLength={120} />
                </label>
                <label className="text-[10px] font-bold text-muted">Parça durumu
                  <select disabled={disabled} value={transfer.condition} onChange={(event) => update(transfer.id, { condition: event.target.value as "new" | "used", ...(event.target.value === "new" ? { source_hours: "" } : {}) })} className="mt-1 w-full rounded-lg border border-border bg-panel px-2.5 py-2 text-sm text-text outline-none focus:border-cyan-300"><option value="new">Yeni parça</option><option value="used">Çıkma / daha önce çalışmış</option></select>
                </label>
                {transfer.condition === "used" ? <label className="text-[10px] font-bold text-muted">Önceki toplam çalışma saati
                  <input disabled={disabled} required type="number" min="0" step="0.1" value={transfer.source_hours} onChange={(event) => update(transfer.id, { source_hours: event.target.value })} placeholder="Örn. 2000" className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono text-text outline-none focus:border-cyan-300" />
                </label> : <div className="rounded-lg bg-green/10 px-2.5 py-2 text-[10px] text-green">Yeni parça: başlangıç saati otomatik 0.</div>}
                <label className="text-[10px] font-bold text-muted sm:col-span-2">{destinationName} takıldığı saat
                  <input disabled={disabled} required type="number" min="0" step="0.1" value={transfer.installed_hours} onChange={(event) => update(transfer.id, { installed_hours: event.target.value })} placeholder="Örn. 8500" className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono text-text outline-none focus:border-cyan-300" />
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
