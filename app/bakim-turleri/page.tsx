"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import GaugeCardList from "@/components/GaugeCardList";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey, type PanelItem, type StatusKey } from "@/lib/status";
import type { Engine, MaintenanceType } from "@/lib/types";

const STATUS_MAP: Record<string, StatusKey> = {
  "Gecikmiş": "gecikmis", "Kritik": "kritik", "Yaklaşıyor": "yaklasiyor", "Normal": "normal",
};

interface EngineRowState { last: string; period: string; }

export default function BakimTurleriPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [items, setItems] = useState<PanelItem[]>([]);
  const [types, setTypes] = useState<MaintenanceType[]>([]);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");

  // ➕ Yeni tür formu
  const [showAdd, setShowAdd] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addDefault, setAddDefault] = useState("500");
  const [addRows, setAddRows] = useState<Record<string, EngineRowState>>({});
  const [savingAdd, setSavingAdd] = useState(false);

  // ✏️ Düzenleme formu
  const [showEdit, setShowEdit] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editDefault, setEditDefault] = useState("");
  const [editRows, setEditRows] = useState<Record<string, EngineRowState>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  const isAdmin = user?.role === "yonetici";

  async function load() {
    const res = await fetch("/api/maintenance-types/panel");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setItems(data.items);
    setTypes(data.types);
    setEngines(data.engines || []);
    setLoading(false);
    if (data.types.length) setSelectedKey([...data.types].sort((a: any, b: any) => a.label.localeCompare(b.label, "tr"))[0].key);
  }

  useEffect(() => { load(); }, []);

  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.label.localeCompare(b.label, "tr")), [types]);
  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  const rows = useMemo(() => {
    let list = items.filter((i) => i.type_key === selectedKey);
    if (statusFilter !== "Tümü") list = list.filter((i) => i.status === STATUS_MAP[statusFilter]);
    return [...list].sort((a, b) => a.remaining - b.remaining);
  }, [items, selectedKey, statusFilter]);

  const selectedType = types.find((t) => t.key === selectedKey);

  // ---------- ➕ YENİ TÜR ----------
  function openAdd() {
    const r: Record<string, EngineRowState> = {};
    sortedEngines.forEach((e) => { r[e._id] = { last: String(e.hours ?? 0), period: "" }; });
    setAddRows(r);
    setAddLabel("");
    setAddDefault("500");
    setShowAdd(true);
    setShowEdit(false);
  }

  function setAddRow(id: string, field: keyof EngineRowState, value: string) {
    setAddRows((prev) => ({ ...prev, [id]: { last: "", period: "", ...prev[id], [field]: value } }));
  }

  async function submitAdd() {
    if (!addLabel.trim()) { toast.error("Bakım türü adı gerekli."); return; }
    setSavingAdd(true);
    const defPeriod = Number(addDefault) || 0;
    const engine_states: Record<string, { last_maintenance_hour: number; period_hours: number }> = {};
    sortedEngines.forEach((e) => {
      const row = addRows[e._id];
      engine_states[e._id] = {
        last_maintenance_hour: row && row.last !== "" ? Number(row.last) || 0 : (e.hours ?? 0),
        period_hours: row && row.period !== "" ? Number(row.period) || 0 : defPeriod,
      };
    });
    try {
      const res = await fetch("/api/maintenance-types", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: addLabel.trim(), default_period_hours: defPeriod, engine_states }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Eklenemedi."); return; }
      toast.success("Bakım türü eklendi! ✅");
      setShowAdd(false);
      load();
    } catch {
      toast.error("Sunucu hatası.");
    } finally {
      setSavingAdd(false);
    }
  }

  // ---------- ✏️ DÜZENLE ----------
  function openEdit() {
    if (!selectedType) return;
    setEditLabel(selectedType.label);
    setEditDefault(String(selectedType.default_period_hours ?? 0));
    const r: Record<string, EngineRowState> = {};
    sortedEngines.forEach((e) => {
      const st = (selectedType.engine_states || {})[e._id];
      r[e._id] = {
        last: st ? String(st.last_maintenance_hour ?? "") : "",
        period: st ? String(st.period_hours ?? "") : "",
      };
    });
    setEditRows(r);
    setShowEdit(true);
    setShowAdd(false);
  }

  function setEditRow(id: string, field: keyof EngineRowState, value: string) {
    setEditRows((prev) => ({ ...prev, [id]: { last: "", period: "", ...prev[id], [field]: value } }));
  }

  async function submitEdit() {
    if (!selectedType) return;
    setSavingEdit(true);
    const engine_states: Record<string, { period_hours?: number; last_maintenance_hour?: number }> = {};
    sortedEngines.forEach((e) => {
      const row = editRows[e._id];
      if (!row) return;
      const st: { period_hours?: number; last_maintenance_hour?: number } = {};
      if (row.period !== "") st.period_hours = Number(row.period) || 0;
      if (row.last !== "") st.last_maintenance_hour = Number(row.last) || 0;
      if (Object.keys(st).length) engine_states[e._id] = st;
    });
    try {
      const res = await fetch(`/api/maintenance-types/${selectedType.key}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim(), default_period_hours: Number(editDefault) || 0, engine_states }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Güncellenemedi."); return; }
      toast.success("Bakım türü güncellendi! ✅");
      setShowEdit(false);
      load();
    } catch {
      toast.error("Sunucu hatası.");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Türleri" subtitle="" />
        <div className="px-4 py-4">
          <div className="flex flex-wrap gap-2 mb-3">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Skeleton className="h-24 rounded-card" />
            <Skeleton className="h-24 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Türleri" subtitle={selectedType ? `${selectedType.label} · ${rows.length} motor` : ""} />
      <div className="px-4 py-4">
        {/* 🛠️ Yönetici araçları */}
        {isAdmin && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={openAdd}
              className="flex-1 py-2.5 rounded-xl bg-amber text-[#161006] text-[12.5px] font-bold shadow-lg hover:brightness-110 active:scale-[.98] transition"
            >
              ➕ Yeni Bakım Türü
            </button>
            {selectedType && (
              <button
                onClick={openEdit}
                className="flex-1 py-2.5 rounded-xl bg-panel2 border border-border text-[12.5px] font-bold text-muted hover:text-text hover:border-borderlt transition"
              >
                ✏️ Düzenle
              </button>
            )}
          </div>
        )}

        {/* ➕ Yeni tür paneli */}
        {showAdd && (
          <div className="bg-panel border border-amber/40 rounded-card p-3.5 mb-4 animate-fade-in">
            <div className="text-[13px] font-bold text-text mb-2">➕ Yeni Bakım Türü</div>
            <input
              placeholder="Bakım türü adı (örn. Hava Filtresi Değişimi)"
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
            <input
              type="number"
              placeholder="Varsayılan periyot (saat)"
              value={addDefault}
              onChange={(e) => setAddDefault(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
            <div className="grid grid-cols-3 gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
              <span>Motor</span><span>İlk Bakım Saati</span><span>Periyot</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1 mb-3">
              {sortedEngines.map((e) => (
                <div key={e._id} className="grid grid-cols-3 gap-1.5 items-center">
                  <span className="text-[11.5px] font-semibold text-text">{e.name}</span>
                  <input
                    type="number"
                    placeholder={String(e.hours ?? 0)}
                    value={addRows[e._id]?.last ?? ""}
                    onChange={(ev) => setAddRow(e._id, "last", ev.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                  />
                  <input
                    type="number"
                    placeholder={addDefault || "0"}
                    value={addRows[e._id]?.period ?? ""}
                    onChange={(ev) => setAddRow(e._id, "period", ev.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-faint mb-3">Boş bırakılan satırlar: mevcut motor saati + varsayılan periyot kullanılır.</p>
            <div className="flex gap-2">
              <button
                onClick={submitAdd}
                disabled={savingAdd}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[12.5px] disabled:opacity-50 hover:brightness-110 transition"
              >
                {savingAdd ? "Kaydediliyor..." : "💾 Kaydet"}
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2.5 rounded-xl bg-panel2 border border-border text-[12.5px] font-bold text-muted hover:text-text transition"
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}

        {/* ✏️ Düzenleme paneli */}
        {showEdit && selectedType && (
          <div className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
            <div className="text-[13px] font-bold text-text mb-2">✏️ Düzenle: {selectedType.label}</div>
            <input
              placeholder="Bakım türü adı"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
            <input
              type="number"
              placeholder="Varsayılan periyot (saat)"
              value={editDefault}
              onChange={(e) => setEditDefault(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-3 outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
            />
            <div className="grid grid-cols-3 gap-1.5 text-[10px] text-faint font-bold uppercase mb-1 px-0.5">
              <span>Motor</span><span>Son Bakım Saati</span><span>Periyot</span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1 mb-3">
              {sortedEngines.map((e) => (
                <div key={e._id} className="grid grid-cols-3 gap-1.5 items-center">
                  <span className="text-[11.5px] font-semibold text-text">{e.name}</span>
                  <input
                    type="number"
                    placeholder="—"
                    value={editRows[e._id]?.last ?? ""}
                    onChange={(ev) => setEditRow(e._id, "last", ev.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                  />
                  <input
                    type="number"
                    placeholder="—"
                    value={editRows[e._id]?.period ?? ""}
                    onChange={(ev) => setEditRow(e._id, "period", ev.target.value)}
                    className="bg-panel2 border border-border rounded-lg px-2 py-1.5 text-[12px] outline-none focus:border-teal transition"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-faint mb-3">Yalnızca değiştirdiğin alanlar kaydedilir — boş bırakılanlar korunur.</p>
            <div className="flex gap-2">
              <button
                onClick={submitEdit}
                disabled={savingEdit}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[12.5px] disabled:opacity-50 hover:brightness-110 transition"
              >
                {savingEdit ? "Kaydediliyor..." : "💾 Kaydet"}
              </button>
              <button
                onClick={() => setShowEdit(false)}
                className="px-4 py-2.5 rounded-xl bg-panel2 border border-border text-[12.5px] font-bold text-muted hover:text-text transition"
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}

        {/* Bakım türü çipleri */}
        <div className="flex flex-wrap gap-2 mb-3">
          {sortedTypes.map((t) => {
            const count = items.filter((i) => i.type_key === t.key).length;
            return (
              <button
                key={t.key}
                onClick={() => setSelectedKey(t.key)}
                className={`px-4 py-2 rounded-full text-[12.5px] font-bold transition-all ${
                  selectedKey === t.key
                    ? "bg-amber text-[#161006] shadow-lg"
                    : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"
                }`}
              >
                {t.label}
                <span className={`ml-1.5 text-[10px] ${selectedKey === t.key ? "opacity-70" : "text-faint"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        {/* Durum çipleri */}
        <div className="flex flex-wrap gap-2 mb-4">
          {["Tümü", "Gecikmiş", "Kritik", "Yaklaşıyor", "Normal"].map((o) => (
            <button
              key={o}
              onClick={() => setStatusFilter(o)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-bold transition-all ${
                statusFilter === o
                  ? "bg-teal text-[#06181b] shadow-lg"
                  : "bg-panel2 text-muted border border-border hover:text-text hover:border-borderlt"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {rows.length > 0 && (
          <div className="text-[11px] text-muted mb-2">
            <b className="text-text">{rows.length}</b> motor gösteriliyor
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card animate-fade-in">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-sm text-muted">Bu filtre için kayıt bulunamadı.</p>
            <button
              onClick={() => setStatusFilter("Tümü")}
              className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel transition"
            >
              Filtreyi Temizle
            </button>
          </div>
        ) : (
          <div className="animate-fade-in">
            <GaugeCardList rows={rows.map((r) => ({
              key: r.engine_id,
              title: r.engine_name,
              subtitle: `Motor saati ${r.engine_hours.toLocaleString("tr-TR")} sa · Son bakım ${r.last_hour.toLocaleString("tr-TR")} sa · Çalışılan ${(r.engine_hours - r.last_hour).toLocaleString("tr-TR")} sa`,
              status: r.status, remaining: r.remaining, period: r.period,
              valueLabel: (r.remaining <= 0 ? "+" : "") + Math.abs(Math.round(r.remaining)).toLocaleString("tr-TR"),
              unitLabel: r.remaining <= 0 ? "SAAT GECİKME" : "SAAT KALDI",
              badgeName: r.engine_name,
            }))} />
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
