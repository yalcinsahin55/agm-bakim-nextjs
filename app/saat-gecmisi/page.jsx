"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

function MiniLineChart({ points }) {
  if (points.length < 2) return null;
  const w = 300, h = 130, pad = 10;
  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const path = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.y - minY) / range) * (h - pad * 2);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="bg-panel border border-border rounded-card">
      <path d={path} fill="none" stroke="#e8952f" strokeWidth="2.5" />
    </svg>
  );
}

export default function SaatGecmisiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");

  const [editingIdx, setEditingIdx] = useState(null);
  const [editDate, setEditDate] = useState("");
  const [editHours, setEditHours] = useState("");
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  async function load() {
    const res = await fetch("/api/engines");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setEngines(data);
    setLoading(false);
    if (data.length && !selected) setSelected([...data].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name))[0]._id);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const engine = engines.find((e) => e._id === selected);
  const history = useMemo(() => {
    if (!engine) return [];
    return [...(engine.history || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [engine]);

  const totalDelta = history.length >= 2 ? history[history.length - 1].hours - history[0].hours : 0;
  const spanMs = history.length >= 2 ? (new Date(history[history.length - 1].date) - new Date(history[0].date)) : 0;
  const spanDaysPrecise = history.length >= 2 ? Math.max(spanMs / 86400000, 1 / 24) : 0;
  const avgPerDay = history.length >= 2 ? Math.min(totalDelta / spanDaysPrecise, 24) : 0;

  const canEdit = user && ["yonetici", "planlamaci"].includes(user.role);

  function startEdit(realIdx) {
    const h = history[realIdx];
    setEditingIdx(realIdx);
    setEditDate(new Date(h.date).toISOString().slice(0, 10));
    setEditHours(h.hours);
    setConfirmDeleteIdx(null);
    setMessage(null);
  }

  async function saveHistory(newHistory) {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/engines/${selected}/history`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: newHistory }),
    });
    setSaving(false);
    if (res.ok) {
      setEditingIdx(null); setConfirmDeleteIdx(null);
      await load();
    } else {
      const data = await res.json();
      setMessage({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  function saveEdit(realIdx) {
    const newHistory = history.map((h, i) => (
      i === realIdx ? { date: new Date(editDate).toISOString(), hours: Number(editHours) } : h
    ));
    saveHistory(newHistory);
  }

  function deleteEntry(realIdx) {
    const newHistory = history.filter((_, i) => i !== realIdx);
    saveHistory(newHistory);
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Saat Geçmişi" />
      <div className="px-4 py-4">
        <select value={selected} onChange={(e) => { setSelected(e.target.value); setEditingIdx(null); setConfirmDeleteIdx(null); }} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-4">
          {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        {history.length < 2 ? (
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Bu motor için henüz yeterli geçmiş kaydı yok.</div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Toplam Artış</div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">{totalDelta.toLocaleString("tr-TR")} sa</div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Günlük Ort.</div>
                <div className="font-mono text-[15px] font-bold text-amber mt-1">{avgPerDay.toFixed(1)} sa</div>
              </div>
              <div className="bg-panel border border-border rounded-card p-2.5">
                <div className="text-[9px] text-faint uppercase font-bold">Kayıt Sayısı</div>
                <div className="font-mono text-[15px] font-bold text-text mt-1">{history.length}</div>
              </div>
            </div>

            <div className="mb-4">
              <MiniLineChart points={history.map((h) => ({ y: h.hours }))} />
            </div>

            {message && <div className="text-[12px] text-red mb-2">{message.text}</div>}

            <div className="flex flex-col gap-1.5">
              {[...history].reverse().map((h, idx) => {
                const realIdx = history.length - 1 - idx;
                const prev = history[realIdx - 1];
                const delta = prev ? h.hours - prev.hours : null;
                const isEditing = editingIdx === realIdx;

                if (isEditing) {
                  return (
                    <div key={realIdx} className="bg-panel border border-teal/40 rounded-xl px-3 py-2.5 flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="date" value={editDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEditDate(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px]" />
                        <input type="number" value={editHours} onChange={(e) => setEditHours(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] font-mono" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingIdx(null)} className="flex-1 py-1.5 rounded-lg border border-border text-muted font-bold text-[11.5px]">Vazgeç</button>
                        <button onClick={() => saveEdit(realIdx)} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-teal text-[#06181b] font-bold text-[11.5px] disabled:opacity-50">💾 Kaydet</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={realIdx} className="flex items-center gap-2 bg-panel border border-border rounded-xl px-3 py-2.5">
                    <span className="text-[12px] text-text flex-shrink-0">{new Date(h.date).toLocaleDateString("tr-TR")}</span>
                    <span className="font-mono text-[12.5px] font-semibold text-text flex-1 text-center">{h.hours.toLocaleString("tr-TR")}</span>
                    <span className="font-mono text-[11.5px] text-teal flex-shrink-0">{delta === null ? "İlk kayıt" : `+${delta.toLocaleString("tr-TR")}`}</span>
                    {canEdit && (
                      confirmDeleteIdx === realIdx ? (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => deleteEntry(realIdx)} disabled={saving} className="text-[10px] font-bold text-[#1a1206] bg-red rounded-md px-1.5 py-1">Evet</button>
                          <button onClick={() => setConfirmDeleteIdx(null)} className="text-[10px] font-bold text-muted border border-border rounded-md px-1.5 py-1">Vazgeç</button>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => startEdit(realIdx)} className="text-[11px] text-teal px-1">✏️</button>
                          <button onClick={() => setConfirmDeleteIdx(realIdx)} className="text-[11px] text-red px-1">🗑️</button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
