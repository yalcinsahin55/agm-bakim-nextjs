"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ComponentName, ComponentTransferDraft } from "@/lib/componentTransfers";
import { COMPONENT_TRANSFER_MAX_COUNT, createComponentTransferDraft } from "@/lib/componentTransfers";

export interface ComponentTransferEngineOption { _id: string; name: string; }

type Props = {
  componentName: ComponentName | null;
  transfers: ComponentTransferDraft[];
  setTransfers: Dispatch<SetStateAction<ComponentTransferDraft[]>>;
  disabled?: boolean;
};

export default function ComponentTransferSection({ componentName, transfers, setTransfers, disabled = false }: Props) {
  const [enabled, setEnabled] = useState(transfers.length > 0);

  useEffect(() => {
    setEnabled(transfers.length > 0);
  }, [componentName, transfers.length]);

  if (!componentName) return null;
  const selectedComponent = componentName;

  function toggle(enabledNext: boolean) {
    setEnabled(enabledNext);
    if (enabledNext) {
      setTransfers((current) => current.length ? current : [{ ...createComponentTransferDraft(), component_name: selectedComponent }]);
    } else {
      setTransfers([]);
    }
  }

  const update = (id: string, patch: Partial<ComponentTransferDraft>) => setTransfers((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  return (
    <section className="rounded-xl border border-cyan-400/30 bg-cyan-400/5 p-3" aria-labelledby="component-transfer-heading">
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-cyan-300/25 bg-panel2 px-3 py-2.5">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => toggle(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
        <span><span className="block text-[11px] font-extrabold text-text">Daha önceden çalışmış parça kullanıldı</span><span className="mt-0.5 block text-[10px] text-muted">{componentName} bakımı için çıkma parça bilgisi ekle</span></span>
      </label>
      {enabled && <div className="mt-3" aria-labelledby="component-transfer-heading">
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">{componentName}</div><h2 id="component-transfer-heading" className="mt-1 text-sm font-extrabold text-text">Parça çalışma saati</h2><p className="mt-1 text-[10px] leading-relaxed text-muted">Yeni veya daha önce çalışmış olduğunu belirtin. Motorun toplam saati değişmez.</p></div>
          <button type="button" disabled={disabled || transfers.length >= COMPONENT_TRANSFER_MAX_COUNT} onClick={() => setTransfers((current) => [...current, { ...createComponentTransferDraft(), component_name: selectedComponent }])} className="shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2.5 py-2 text-[10px] font-bold text-cyan-200 disabled:opacity-40">+ Parça ekle</button>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {transfers.map((transfer, index) => <div key={transfer.id} className="rounded-lg border border-border bg-panel2 p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] font-bold text-cyan-200">{componentName} {index + 1}</span>{transfers.length > 1 && <button type="button" disabled={disabled} onClick={() => setTransfers((current) => current.filter((item) => item.id !== transfer.id))} className="text-[10px] font-bold text-red-300 hover:text-red-200">Kaldır</button>}</div><div className="grid gap-2"><label className="text-[10px] font-bold text-muted">Parçanın önceki toplam çalışma saati<input disabled={disabled} required type="number" min="0" step="0.1" value={transfer.source_hours} onChange={(event) => update(transfer.id, { source_hours: event.target.value, condition: "used" })} placeholder="Örn. 2000" className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm font-mono text-text outline-none focus:border-cyan-300" /></label><div className="rounded-lg bg-cyan-400/10 px-2.5 py-2 text-[10px] text-cyan-100">Takıldığı motor saati, yukarıdaki motor çalışma saati alanından otomatik alınır.</div><label className="text-[10px] font-bold text-muted">Açıklama (isteğe bağlı)<input disabled={disabled} value={transfer.note} onChange={(event) => update(transfer.id, { note: event.target.value })} placeholder="Sökülen parçanın yerine takıldı..." className="mt-1 w-full rounded-lg border border-border bg-panel2 px-2.5 py-2 text-sm text-text outline-none focus:border-cyan-300" maxLength={500} /></label></div></div>)}
        </div>
      </div>}
    </section>
  );
}
