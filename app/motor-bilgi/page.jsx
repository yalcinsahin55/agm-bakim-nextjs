"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FIELDS = [
  ["kaver_tipi", "Kaver Tipi"], ["hava_filtresi", "Hava Filtresi"], ["krankcase", "Krankcase"],
  ["esanjor_tipi", "Eşanjör Tipi"], ["dungs", "Dungs"], ["radyator_tipi", "Radyatör Tipi"], ["not", "Not"],
];

export default function MotorBilgiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);

  async function load() {
    const res = await fetch("/api/equipment-info");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const rows = useMemo(() => {
    const filtered = items.filter((i) => i.engine_name.toLowerCase().includes(query.toLowerCase()));
    return filtered.sort((a, b) => engineSortKey(a.engine_name) - engineSortKey(b.engine_name));
  }, [items, query]);

  async function doImport() {
    if (!importFile) return;
    setImporting(true);
    setImportMsg(null);
    const file_b64 = await fileToBase64(importFile);
    const res = await fetch("/api/equipment-info/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_b64 }),
    });
    setImporting(false);
    const data = await res.json();
    if (res.ok) { setImportMsg({ ok: true, text: `${data.updated} motor için bilgi güncellendi.` }); load(); }
    else setImportMsg({ ok: false, text: data.error || "Dosya okunamadı." });
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  const canImport = user && ["yonetici", "planlamaci"].includes(user.role);

  return (
    <div>
      <TopBar title="Motor Bilgi Kartı" subtitle="Kaver, filtre, eşanjör ve radyatör tipleri — referans amaçlıdır" />
      <div className="px-4 py-4">
        {canImport && (
          <>
            <button onClick={() => setShowImport((s) => !s)} className="w-full py-2.5 rounded-xl border border-teal/40 bg-teal/10 text-teal font-bold text-[12.5px] mb-3">
              {showImport ? "Kapat" : "📥 Excel'den Güncelle"}
            </button>
            {showImport && (
              <div className="bg-panel border border-border rounded-card p-3.5 mb-4">
                <p className="text-[11.5px] text-muted mb-2 leading-relaxed">
                  'Motor No', 'Kaver Tipi', 'Hava Filtresi', 'Krankcase', 'Eşanjör Tipi', 'Dungs', 'Radyatör Tipi', 'Not' sütunlarını içeren bir dosya yükleyin.
                </p>
                <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted cursor-pointer mb-2">
                  📊 {importFile ? importFile.name : "Excel dosyası seç"}
                  <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" />
                </label>
                {importMsg && <div className={`text-[12px] mb-2 ${importMsg.ok ? "text-green" : "text-red"}`}>{importMsg.text}</div>}
                <button onClick={doImport} disabled={importing || !importFile} className="w-full py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50">
                  {importing ? "İçe aktarılıyor..." : "İçe Aktar"}
                </button>
              </div>
            )}
          </>
        )}

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Motor ara..." className="w-full bg-panel2 border border-border rounded-xl px-4 py-2.5 text-sm mb-3" />

        {rows.length === 0 ? (
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Henüz motor bilgisi eklenmemiş.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r._id} className="bg-panel border border-border rounded-card p-3.5">
                <div className="text-[13.5px] font-bold text-text mb-1.5">{r.engine_name}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {FIELDS.map(([key, label]) => r[key] ? (
                    <div key={key} className="text-[11px]">
                      <span className="text-faint">{label}: </span>
                      <span className="text-muted">{r[key]}</span>
                    </div>
                  ) : null)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
