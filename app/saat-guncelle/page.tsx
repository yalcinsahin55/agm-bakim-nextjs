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
import type { Engine } from "@/lib/types";

type EngineRow = Pick<Engine, "_id" | "name" | "hours" | "load_kw">;
type EngineEditValue = { hours?: string; load_kw?: string };

export default function SaatGuncellePage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState<EngineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, EngineEditValue>>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const canEdit = user?.role === "yonetici";

  async function load() {
    try {
      const res = await fetch("/api/engines", { cache: "no-store" });
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        setEngines([]);
        setLoadError(data?.error || "Motor listesi yüklenemedi.");
        return;
      }
      setLoadError("");
      setEngines(data as EngineRow[]);
    } catch {
      setEngines([]);
      setLoadError("Motor listesi yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const sorted = useMemo(
    () => [...engines].sort((a: EngineRow, b: EngineRow) => engineSortKey(a.name) - engineSortKey(b.name)),
    [engines]
  );

  function setValue(id: string, field: keyof EngineEditValue, val: string): void {
    setValues((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: val } }));
  }

  const changedEngines = sorted.filter((e) => {
    const v = values[e._id];
    if (!v) return false;
    const hoursChanged = v.hours !== undefined && v.hours !== "" && Number(v.hours) !== e.hours;
    const loadChanged = v.load_kw !== undefined && v.load_kw !== "" && Number(v.load_kw) !== (e.load_kw || 0);
    return hoursChanged || loadChanged;
  });

  async function save() {
    if (changedEngines.length === 0) {
      toast.error("Değişiklik yapılmadı.");
      return;
    }
    setSaving(true);
    const loadingToast = toast.loading("Saatler güncelleniyor...");
    try {
      const updates = changedEngines.map((e) => {
        const v = values[e._id] || {};
        return {
          engine_id: e._id,
          hours: v.hours !== undefined && v.hours !== "" ? Number(v.hours) : undefined,
          load_kw: v.load_kw !== undefined && v.load_kw !== "" ? Number(v.load_kw) : undefined,
        };
      });
      const res = await fetch("/api/engines/hours", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.success(`${data.changed} motor güncellendi! 🕒`);
        window.dispatchEvent(new Event("notifications:refresh"));
        setValues({});
        load();
      } else {
        const data = await res.json();
        toast.dismiss(loadingToast);
        toast.error(data.error || "Güncellenemedi.");
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
        <TopBar title="Saat / Yük Güncelle" />
        <div className="px-4 py-4 flex flex-col gap-2">
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-24 rounded-card" />
          <Skeleton className="h-14 rounded-xl mt-2" />
        </div>
        <BottomNav />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <TopBar title="Saat / Yük Güncelle" />
        <div className="px-4 py-8 text-center">
          <div className="rounded-card border border-red/30 bg-panel p-6">
            <div className="text-4xl mb-3">⚠️</div>
            <p className="text-sm text-red">{loadError}</p>
            <button onClick={() => { setLoading(true); void load(); }} className="mt-4 rounded-xl border border-teal/40 bg-teal/10 px-4 py-2.5 text-sm font-bold text-teal">Tekrar dene</button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Saat / Yük Güncelle" subtitle="Toplu motor saati ve yük güncelleme" />
      <div className="px-4 py-4">
        {!canEdit && (
          <div className="bg-amber/10 border border-amber/30 rounded-xl px-3.5 py-3 mb-3 text-[11.5px] text-muted">
            ⚠️ Bu sayfada değişiklik yapma yetkiniz yok, sadece görüntüleyebilirsiniz.
          </div>
        )}

        <div className="flex flex-col gap-2 mb-24">
          {sorted.map((e) => {
            const v: EngineEditValue = values[e._id] || {};
            const isChanged = changedEngines.some((c) => c._id === e._id);
            return (
              <div
                key={e._id}
                className={`bg-panel border rounded-card p-3 transition-all ${isChanged ? "border-teal/50 shadow-lg" : "border-border hover:border-borderlt"}`}
              >
                <div className="flex items-center gap-3 mb-2.5">
                  <EngineBadge name={e.name} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-text truncate">{e.name}</div>
                    <div className="text-[10px] text-faint">
                      Şu an: <span className="font-mono text-amber">{(e.hours || 0).toLocaleString("tr-TR")} sa</span> · <span className="font-mono text-teal">{(e.load_kw || 0).toLocaleString("tr-TR")} kW</span>
                    </div>
                  </div>
                  {isChanged && <span className="text-[10px] font-bold text-teal animate-pulse">● Değişti</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9.5px] font-bold text-faint uppercase tracking-wide">Yeni Saat</label>
                    <input
                      type="number"
                      placeholder={String(e.hours || 0)}
                      value={v.hours ?? ""}
                      disabled={!canEdit}
                      onChange={(ev) => setValue(e._id, "hours", ev.target.value)}
                      className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-[9.5px] font-bold text-faint uppercase tracking-wide">Yeni Yük (kW)</label>
                    <input
                      type="number"
                      placeholder={String(e.load_kw || 0)}
                      value={v.load_kw ?? ""}
                      disabled={!canEdit}
                      onChange={(ev) => setValue(e._id, "load_kw", ev.target.value)}
                      className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="fixed bottom-24 left-0 right-0 z-20 px-4 md:left-64">
            <div className="max-w-lg mx-auto">
              <button
                onClick={save}
                disabled={saving || changedEngines.length === 0}
                className="w-full py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50 hover:brightness-110 active:scale-[.98] transition"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#1a1206]/40 border-t-[#1a1206] rounded-full animate-spin" />
                    Kaydediliyor...
                  </span>
                ) : changedEngines.length > 0 ? (
                  `💾 ${changedEngines.length} Motoru Güncelle`
                ) : (
                  "💾 Tümünü Kaydet"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
