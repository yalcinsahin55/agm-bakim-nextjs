"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import EngineBadge from "@/components/EngineBadge";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

export default function MotorlarPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newLoad, setNewLoad] = useState("");
  const [saving, setSaving] = useState(false);

  const canAdd = user && ["yonetici", "planlamaci"].includes(user.role);

  async function load() {
    const [engRes, recRes] = await Promise.all([
      fetch("/api/engines"),
      fetch("/api/records?limit=1000"),
    ]);
    if (engRes.status === 401) { router.push("/login"); return; }
    setEngines(await engRes.json());
    setRecords(recRes.ok ? await recRes.json() : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const sorted = useMemo(
    () => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)),
    [engines]
  );

  const recordsByEngine = useMemo(() => {
    const map = {};
    records.forEach((r) => {
      (map[r.engine_id] = map[r.engine_id] || []).push(r);
    });
    return map;
  }, [records]);

  async function addEngine(e) {
    e.preventDefault();
    if (!newName.trim()) { toast.error("Motor adı gerekli."); return; }
    setSaving(true);
    const loadingToast = toast.loading("Motor ekleniyor...");
    try {
      const res = await fetch("/api/engines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          hours: Number(newHours) || 0,
          load_kw: Number(newLoad) || 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.name} eklendi! ⚙️`);
        setShowAdd(false);
        setNewName(""); setNewHours(""); setNewLoad("");
        load();
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Motor eklenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Motorlar" subtitle="Tüm motorların bakım geçmişi" />
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title="Motorlar"
        subtitle={`${sorted.length} motor listeleniyor`}
        right={canAdd ? (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="px-3 py-2 rounded-lg bg-amber text-[#161006] text-[12px] font-extrabold shadow hover:brightness-110 active:scale-95 transition"
          >
            {showAdd ? "✕ Vazgeç" : "＋ Yeni Motor"}
          </button>
        ) : undefined}
      />

      <div className="px-4 py-4">
        {showAdd && (
          <form onSubmit={addEngine} className="bg-panel border border-teal/40 rounded-card p-3.5 mb-4 animate-fade-in">
            <div className="text-[12px] font-bold text-teal mb-2">➕ Yeni Motor Ekle</div>
            <div className="flex flex-col gap-2">
              <input
                required placeholder="Motor adı (örn. Motor 7)" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" placeholder="Güncel saat" value={newHours}
                  onChange={(e) => setNewHours(e.target.value)}
                  className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
                />
                <input
                  type="number" placeholder="Yük (kW)" value={newLoad}
                  onChange={(e) => setNewLoad(e.target.value)}
                  className="bg-panel2 border border-border rounded-lg px-3 py-2.5 text-sm font-mono outline-none focus:border-teal transition"
                />
              </div>
              <button
                type="submit" disabled={saving}
                className="py-2.5 rounded-lg bg-teal text-[#06181b] text-[12.5px] font-extrabold disabled:opacity-50 hover:brightness-110 transition"
              >
                {saving ? "Ekleniyor..." : "💾 Kaydet"}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sorted.map((e) => {
            const recs = (recordsByEngine[e._id] || [])
              .slice()
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            const open = openId === e._id;
            return (
              <div
                key={e._id}
                className="bg-panel border border-border rounded-card overflow-hidden hover:border-borderlt transition-all"
              >
                <button
                  onClick={() => setOpenId(open ? null : e._id)}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <EngineBadge name={e.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold text-text truncate">{e.name}</div>
                    <div className="text-[10.5px] text-faint mt-0.5">
                      {recs.length} bakım kaydı
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-mono text-[13px] font-bold text-amber">
                      {(e.hours || 0).toLocaleString("tr-TR")}
                    </div>
                    <div className="text-[8.5px] text-faint tracking-wide">SAAT</div>
                  </div>
                  <span className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                </button>

                {open && (
                  <div className="border-t border-border bg-[#12161d] p-3 animate-fade-in">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-panel2 rounded-lg p-2 text-center">
                        <div className="text-[9px] text-faint uppercase font-bold">Yük</div>
                        <div className="font-mono text-[13px] font-bold text-teal mt-0.5">
                          {(e.load_kw || 0).toLocaleString("tr-TR")} kW
                        </div>
                      </div>
                      <div className="bg-panel2 rounded-lg p-2 text-center">
                        <div className="text-[9px] text-faint uppercase font-bold">Son Güncelleme</div>
                        <div className="text-[11px] font-bold text-text mt-0.5">
                          {e.updated_at ? new Date(e.updated_at).toLocaleDateString("tr-TR") : "-"}
                        </div>
                      </div>
                    </div>

                    {recs.length === 0 ? (
                      <div className="text-center text-[11px] text-faint py-4">
                        Henüz bakım kaydı yok.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                        {recs.slice(0, 20).map((r) => (
                          <div key={r._id?.toString?.() || r.group_id} className="flex items-center justify-between bg-panel rounded-lg px-2.5 py-2 border border-border">
                            <div className="min-w-0">
                              <div className="text-[11.5px] font-semibold text-text truncate">{r.type_label}</div>
                              <div className="text-[9.5px] text-faint">
                                {new Date(r.created_at).toLocaleDateString("tr-TR")} · {r.technician_name || ""}
                              </div>
                            </div>
                            <div className="font-mono text-[11px] text-amber flex-shrink-0">
                              {(r.hour_at_completion || 0).toLocaleString("tr-TR")} sa
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">⚙️</div>
            <p className="text-sm text-muted">Henüz motor eklenmemiş.</p>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
