import AppIcon from "@/components/ui/AppIcon";

type HistoryEntry = { date: string; hours: number; load_kw?: number; source?: "excel" | "manual" | "record" };

interface HistoryRecordListProps {
  history: HistoryEntry[];
  historyLoading: boolean;
  editingIdx: number | null;
  editDate: string;
  editHours: string;
  editLoad: string;
  confirmDeleteIdx: number | null;
  saving: boolean;
  canEdit: boolean;
  historyPage: number;
  historyTotal: number;
  historyTotalPages: number;
  onEditDateChange: (value: string) => void;
  onEditHoursChange: (value: string) => void;
  onEditLoadChange: (value: string) => void;
  onStartEdit: (index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onRequestDelete: (index: number) => void;
  onCancelDelete: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export default function HistoryRecordList({
  history,
  historyLoading,
  editingIdx,
  editDate,
  editHours,
  editLoad,
  confirmDeleteIdx,
  saving,
  canEdit,
  historyPage,
  historyTotal,
  historyTotalPages,
  onEditDateChange,
  onEditHoursChange,
  onEditLoadChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRequestDelete,
  onCancelDelete,
  onPrevious,
  onNext,
}: HistoryRecordListProps) {
  return (
    <>
      {historyLoading && <div className="text-[11px] text-muted mb-2">Geçmiş yükleniyor...</div>}
      <div className="flex flex-col gap-1.5">
        {[...history].reverse().map((entry, index) => {
          const realIdx = history.length - 1 - index;
          const previous = history[realIdx - 1];
          const delta = previous ? entry.hours - previous.hours : null;
          const isEditing = editingIdx === realIdx;

          if (isEditing) {
            return (
              <div key={realIdx} className="bg-panel border border-teal/40 rounded-control px-3 py-2.5 flex flex-col gap-2 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input type="datetime-local" value={editDate} max={new Date().toISOString().slice(0, 16)} onChange={(event) => onEditDateChange(event.target.value)} className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal" />
                  <input type="number" value={editHours} onChange={(event) => onEditHoursChange(event.target.value)} placeholder="Saat" className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] font-mono outline-none focus:border-teal" />
                  <input type="number" value={editLoad} onChange={(event) => onEditLoadChange(event.target.value)} placeholder="Yük (kW)" className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] font-mono outline-none focus:border-teal" />
                </div>
                <div className="flex gap-2">
                  <button onClick={onCancelEdit} className="flex-1 py-1.5 rounded-lg border border-border text-muted font-bold text-[11.5px] hover:bg-panel2 transition">Vazgeç</button>
                  <button onClick={() => onSaveEdit(realIdx)} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-teal text-on-teal font-bold text-[11.5px] disabled:opacity-50 hover:brightness-110 transition"> Kaydet</button>
                </div>
              </div>
            );
          }

          return (
            <div key={realIdx} className="flex items-center gap-2 bg-panel border border-border rounded-control px-3 py-2.5 hover:border-borderlt transition-all hover:-translate-y-0.5 group">
              <span className="flex w-28 flex-shrink-0 flex-col text-[11px] text-text"><span>{new Date(entry.date).toLocaleDateString("tr-TR")}</span><span className="text-[9px] text-faint">{new Date(entry.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}{entry.source ? ` · ${entry.source === "excel" ? "Excel" : entry.source === "record" ? "Bakım" : "Manuel"}` : ""}</span></span>
              <span className="font-mono text-[12.5px] font-semibold text-text flex-1 text-center">
                {entry.hours.toLocaleString("tr-TR")} sa
                {typeof entry.load_kw === "number" && <span className="text-teal"> · {entry.load_kw.toLocaleString("tr-TR")} kW</span>}
              </span>
              <span className={`font-mono text-[11.5px] flex-shrink-0 ${delta !== null && delta < 0 ? "text-red" : "text-amber"}`}>{delta === null ? "İlk kayıt" : `${delta >= 0 ? "+" : ""}${delta.toLocaleString("tr-TR")}`}</span>
              {canEdit && (
                confirmDeleteIdx === realIdx ? (
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => onDelete(realIdx)} disabled={saving} className="text-[10px] font-bold text-on-amber bg-red rounded-md px-1.5 py-1 hover:brightness-110 transition">Evet</button>
                    <button onClick={onCancelDelete} className="text-[10px] font-bold text-muted border border-border rounded-md px-1.5 py-1 hover:bg-panel2 transition">Vazgeç</button>
                  </div>
                ) : (
                  <div className="flex gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition">
                    <button type="button" onClick={() => onStartEdit(realIdx)} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-teal px-1 hover:bg-teal/10 transition" aria-label="Saat kaydını düzenle"><AppIcon name="edit" size={15} /></button>
                    <button type="button" onClick={() => onRequestDelete(realIdx)} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-red px-1 hover:bg-red/10 transition" aria-label="Saat kaydını sil"><AppIcon name="trash" size={15} /></button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
      {historyTotal > history.length && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-control border border-border bg-panel px-3 py-2">
          <button
            type="button"
            disabled={historyPage <= 1 || historyLoading}
            onClick={onPrevious}
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted disabled:opacity-40"
          >Önceki</button>
          <span className="text-[11px] text-muted">Sayfa {historyPage} / {historyTotalPages} · {historyTotal} kayıt</span>
          <button
            type="button"
            disabled={historyPage >= historyTotalPages || historyLoading}
            onClick={onNext}
            className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted disabled:opacity-40"
          >Sonraki</button>
        </div>
      )}
    </>
  );
}
