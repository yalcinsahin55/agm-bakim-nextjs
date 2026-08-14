"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import EngineBadge from "@/components/EngineBadge";
import { engineSortKey } from "@/lib/status";

export default function SaatGuncellePage() {
  const router = useRouter();
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch("/api/engines").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setEngines(data);
      const d = {};
      data.forEach((e) => { d[e._id] = { hours: e.hours, load_kw: e.load_kw || 0 }; });
      setDraft(d);
      setLoading(false);
    });
  }, [router]);

  const sorted = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);

  const dirtyCount = useMemo(() => {
    let n = 0;
    engines.forEach((e) => {
      const d = draft[e._id];
      if (!d) return;
      if (Number(d.hours) !== e.hours || Number(d.load_kw) !== (e.load_kw || 0)) n++;
    });
    return n;
  }, [draft, engines]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const updates = engines.map((e) => ({
      engine_id: e._id, hours: Number(draft[e._id]?.hours), load_kw: Number(draft[e._id]?.load_kw),
    }));
    const res = await fetch("/api/engines/hours", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMessage({ ok: true, text: `${data.changed} motor güncellendi.` });
      const res2 = await fetch("/api/engines");
      const fresh = await res2.json();
      setEngines(fresh);
    } else {
      setMessage({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Saat / Yük Güncelle" subtitle="Bu ekrandan güncellediğiniz saatler tüm bakım hesaplarını otomatik yeniler" />
      <div className="px-4 py-4">
        <div className="flex flex-col gap-2 mb-24">
          {sorted.map((e) => (
            <div key={e._id} className="bg-panel border border-border rounded-card p-3 flex items-center gap-3">
              <EngineBadge name={e.name} />
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9.5px] text-faint uppercase tracking-wide mb-0.5">{e.name} · Saat</div>
                  <input
                    type="number" value={draft[e._id]?.hours ?? ""}
                    onChange={(ev) => setDraft((d) => ({ ...d, [e._id]: { ...d[e._id], hours: ev.target.value } }))}
                    className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono font-bold text-amber"
                  />
                </div>
                <div>
                  <div className="text-[9.5px] text-faint uppercase tracking-wide mb-0.5">Yük (kW)</div>
                  <input
                    type="number" value={draft[e._id]?.load_kw ?? ""}
                    onChange={(ev) => setDraft((d) => ({ ...d, [e._id]: { ...d[e._id], load_kw: ev.target.value } }))}
                    className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono font-bold text-teal"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-24 left-0 right-0 z-20 px-4">
        <div className="max-w-lg mx-auto">
          {message && (
            <div className={`text-center text-[12px] mb-2 ${message.ok ? "text-green" : "text-red"}`}>{message.text}</div>
          )}
          <button
            onClick={save} disabled={saving || dirtyCount === 0}
            className="w-full py-3.5 rounded-xl font-extrabold text-[14.5px] shadow-lg disabled:opacity-50"
            style={{ background: dirtyCount ? "linear-gradient(180deg,#f0a23f,#e8952f)" : "#1f2730", color: dirtyCount ? "#1a1206" : "#5b6572" }}
          >
            {saving ? "Kaydediliyor..." : dirtyCount ? `💾 ${dirtyCount} motor için kaydet` : "Değişiklik yok"}
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
