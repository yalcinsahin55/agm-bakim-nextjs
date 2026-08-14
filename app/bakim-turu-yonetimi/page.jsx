"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";

export default function BakimTuruYonetimiPage() {
  const router = useRouter();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPeriod, setNewPeriod] = useState(1000);
  const [applyAll, setApplyAll] = useState(true);
  const [addMsg, setAddMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editPeriod, setEditPeriod] = useState(0);
  const [editApplyAll, setEditApplyAll] = useState(false);

  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);

  async function load() {
    const res = await fetch("/api/maintenance-types");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    setTypes(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addType() {
    setSaving(true);
    setAddMsg(null);
    const res = await fetch("/api/maintenance-types", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, default_period_hours: Number(newPeriod), apply_to_all: applyAll }),
    });
    setSaving(false);
    if (res.ok) {
      setAddMsg({ ok: true, text: `'${newLabel}' bakım türü eklendi.` });
      setNewLabel(""); setNewPeriod(1000); setShowAdd(false);
      load();
    } else {
      const data = await res.json();
      setAddMsg({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  function startEdit(t) {
    setEditingKey(t.key); setEditLabel(t.label); setEditPeriod(t.default_period_hours); setEditApplyAll(false);
  }

  async function saveEdit(key) {
    await fetch(`/api/maintenance-types/${key}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel, default_period_hours: Number(editPeriod), apply_period_to_all: editApplyAll }),
    });
    setEditingKey(null);
    load();
  }

  async function doDelete(key) {
    await fetch(`/api/maintenance-types/${key}`, { method: "DELETE" });
    setConfirmDeleteKey(null);
    load();
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  if (forbidden) {
    return (
      <div>
        <TopBar title="Bakım Türü Yönetimi" />
        <div className="px-4 py-4">
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Bu sayfa yalnızca yöneticiler içindir.</div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Türü Yönetimi" />
      <div className="px-4 py-4">
        <button onClick={() => setShowAdd((s) => !s)} className="w-full py-3 rounded-xl border border-teal/40 bg-teal/10 text-teal font-bold text-[13px] mb-3">
          {showAdd ? "Kapat" : "➕ Yeni Bakım Türü Ekle"}
        </button>

        {showAdd && (
          <div className="bg-panel border border-border rounded-card p-3.5 mb-4 flex flex-col gap-2">
            <input placeholder="Bakım türü adı (örn. Egzoz Valfi Kontrolü)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm" />
            <input type="number" placeholder="Periyodik bakım saati" value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm" />
            <label className="flex items-center gap-2 text-[12px] text-muted">
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              Şimdi tüm motorlara uygula (motorların güncel saatini başlangıç kabul eder)
            </label>
            {addMsg && <div className={`text-[12px] ${addMsg.ok ? "text-green" : "text-red"}`}>{addMsg.text}</div>}
            <button onClick={addType} disabled={saving || !newLabel.trim()} className="py-3 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13.5px] disabled:opacity-50">
              {saving ? "Ekleniyor..." : "Bakım Türünü Ekle"}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {types.sort((a, b) => a.label.localeCompare(b.label, "tr")).map((t) => {
            const engineCount = Object.keys(t.engine_states || {}).length;
            return (
              <div key={t.key} className="bg-panel border border-border rounded-card p-3.5">
                <div className="text-[13px] font-bold text-text">{t.label}</div>
                <div className="text-[11px] text-faint mb-2">{engineCount} motorda tanımlı · Varsayılan periyot: {t.default_period_hours} sa</div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(t)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5">✏️ Düzenle</button>
                  {confirmDeleteKey === t.key ? (
                    <>
                      <button onClick={() => doDelete(t.key)} className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-1.5">⚠️ Emin misiniz?</button>
                      <button onClick={() => setConfirmDeleteKey(null)} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5">Vazgeç</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteKey(t.key)} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5">🗑️ Sil</button>
                  )}
                </div>

                {editingKey === t.key && (
                  <div className="mt-2 pt-2 border-t border-border flex flex-col gap-2">
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm" />
                    <input type="number" value={editPeriod} onChange={(e) => setEditPeriod(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm" />
                    <label className="flex items-center gap-2 text-[11px] text-muted">
                      <input type="checkbox" checked={editApplyAll} onChange={(e) => setEditApplyAll(e.target.checked)} />
                      Bu periyodu, bu türü zaten kullanan tüm motorlara da uygula
                    </label>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingKey(null)} className="flex-1 py-2 rounded-lg border border-border text-muted font-bold text-[12px]">Vazgeç</button>
                      <button onClick={() => saveEdit(t.key)} className="flex-1 py-2 rounded-lg bg-teal text-[#06181b] font-bold text-[12px]">💾 Kaydet</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
