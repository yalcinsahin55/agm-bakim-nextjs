"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useAbortableFetch } from "@/lib/useAbortableFetch";
import { engineSortKey } from "@/lib/status";
import { ApiFetchError, cachedFetch, invalidateCachedFetch } from "@/lib/apiCache";
import HistoryRecordList from "./_components/HistoryRecordList";
import HistorySummaryPanel from "./_components/HistorySummaryPanel";
import type { Engine, HistoryEntry, HistoryResponse, HistorySummary } from "./_lib/types";
import { HISTORY_PAGE_SIZE } from "./_lib/types";

export default function SaatGecmisiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { signal } = useAbortableFetch();
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [historySummary, setHistorySummary] = useState<HistorySummary>({ first: null, last: null, has_load: false });

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editHours, setEditHours] = useState("");
  const [editLoad, setEditLoad] = useState("");
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadEngines() {
    try {
      const data = await cachedFetch<Engine[]>("/api/engines", 15_000);
      setEngines(data);
      setLoading(false);
      if (data.length && !selected) {
        const sorted = [...data].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
        setSelected(sorted[0]._id);
      }
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      else setLoading(false);
    }
  }

  async function loadHistory(page = historyPage) {
    if (!selected) return;
    setHistoryLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE), page: String(page) });
      const res = await fetch(`/api/engines/${encodeURIComponent(selected)}/history?${query.toString()}`, { signal });
      if (!res.ok) throw new ApiFetchError(res.status);
      const data = await res.json() as HistoryResponse;
      setHistory(data.history || []);
      setHistoryTotal(data.total || 0);
      setHistoryTotalPages(data.totalPages || 0);
      setHistorySummary(data.summary || { first: null, last: null, has_load: false });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      else toast.error("Saat geçmişi yüklenemedi.");
    } finally {
      if (!signal.aborted) setHistoryLoading(false);
    }
  }

  useEffect(() => { if (!signal.aborted) void loadEngines(); }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!signal.aborted) void loadHistory(historyPage); }, [selected, historyPage, signal]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const engine = engines.find((e) => e._id === selected);
  const hasLoadData = historySummary.has_load || history.some((h) => typeof h.load_kw === "number");

  const firstHistory = historySummary.first;
  const lastHistory = historySummary.last;
  const totalDelta = firstHistory && lastHistory ? lastHistory.hours - firstHistory.hours : 0;
  const spanMs = firstHistory && lastHistory
    ? new Date(lastHistory.date).getTime() - new Date(firstHistory.date).getTime()
    : 0;
  const spanDaysPrecise = firstHistory && lastHistory ? Math.max(spanMs / 86400000, 1 / 24) : 0;
  const avgPerDay = firstHistory && lastHistory ? Math.min(totalDelta / spanDaysPrecise, 24) : 0;

  const canEdit = user?.role === "yonetici";

  function startEdit(realIdx: number) {
    const h = history[realIdx];
    setEditingIdx(realIdx);
    setEditDate(new Date(h.date).toISOString().slice(0, 10));
    setEditHours(String(h.hours));
    setEditLoad(typeof h.load_kw === "number" ? String(h.load_kw) : "");
    setConfirmDeleteIdx(null);
  }

  async function saveHistoryChange(body: Record<string, unknown>) {
    setSaving(true);
    const loadingToast = toast.loading("Kaydediliyor...");
    try {
      const res = await fetch(`/api/engines/${encodeURIComponent(selected)}/history`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kaydedilemedi.");
      }
      invalidateCachedFetch("/api/engines");
      toast.dismiss(loadingToast);
      toast.success("Kayıt güncellendi! ✅");
      setEditingIdx(null); setConfirmDeleteIdx(null);
      await loadHistory(historyPage);
      await loadEngines();
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(error instanceof Error ? error.message : "Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  function saveEdit(realIdx: number) {
    const globalIdx = (historyPage - 1) * HISTORY_PAGE_SIZE + realIdx;
    saveHistoryChange({
      entry_index: globalIdx,
      entry: {
        date: new Date(editDate).toISOString(),
        hours: Number(editHours),
        load_kw: editLoad !== "" ? Number(editLoad) : undefined,
      },
    });
  }

  function deleteEntry(realIdx: number) {
    const globalIdx = (historyPage - 1) * HISTORY_PAGE_SIZE + realIdx;
    saveHistoryChange({ entry_index: globalIdx, delete: true });
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Saat Geçmişi" subtitle="" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-4" />
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-36 w-full rounded-xl mb-4" />
          <Skeleton className="h-6 w-24 mb-2" />
          <Skeleton className="h-36 w-full rounded-xl mb-4" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Saat Geçmişi" subtitle={engine ? engine.name : ""} />
      <div className="px-4 py-4">
        <select 
          value={selected} 
          onChange={(e: ChangeEvent<HTMLSelectElement>) => { setSelected(e.target.value); setHistoryPage(1); setHistory([]); setHistorySummary({ first: null, last: null, has_load: false }); setEditingIdx(null); setConfirmDeleteIdx(null); }}
          className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4 focus:border-teal focus:ring-2 focus:ring-teal/20 outline-none transition"
        >
          {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        {historyTotal < 2 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm text-muted">Bu motor için henüz yeterli geçmiş kaydı yok.</p>
            <p className="text-xs text-faint mt-1">En az 2 kayıt gerekli.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <HistorySummaryPanel
              history={history}
              totalDelta={totalDelta}
              avgPerDay={avgPerDay}
              historyTotal={historyTotal}
              hasLoadData={hasLoadData}
            />

            <HistoryRecordList
              history={history}
              historyLoading={historyLoading}
              editingIdx={editingIdx}
              editDate={editDate}
              editHours={editHours}
              editLoad={editLoad}
              confirmDeleteIdx={confirmDeleteIdx}
              saving={saving}
              canEdit={canEdit}
              historyPage={historyPage}
              historyTotal={historyTotal}
              historyTotalPages={historyTotalPages}
              onEditDateChange={setEditDate}
              onEditHoursChange={setEditHours}
              onEditLoadChange={setEditLoad}
              onStartEdit={startEdit}
              onCancelEdit={() => setEditingIdx(null)}
              onSaveEdit={saveEdit}
              onDelete={deleteEntry}
              onRequestDelete={setConfirmDeleteIdx}
              onCancelDelete={() => setConfirmDeleteIdx(null)}
              onPrevious={() => { setEditingIdx(null); setConfirmDeleteIdx(null); setHistoryPage((page) => Math.max(1, page - 1)); }}
              onNext={() => { setEditingIdx(null); setConfirmDeleteIdx(null); setHistoryPage((page) => Math.min(historyTotalPages, page + 1)); }}
            />
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
