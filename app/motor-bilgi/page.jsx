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

function EmptyForm() {
  const f = {};
  FIELDS.forEach(([key]) => { f[key] = ""; });
  return f;
}

function FieldInputs({ values, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {FIELDS.map(([key, label]) => (
        <div key={key} className={key === "not" ? "col-span-2" : ""}>
          <label className="text-[9.5px] font-bold text-faint uppercase tracking-wide">{label}</label>
          <input
            value={values[key] || ""} onChange={(e) => onChange(key, e.target.value)}
            className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-[12.5px] mt-1"
          />
        </div>
      ))}
    </div>
  );
}

export default function MotorBilgiPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [items, setItems] = useState([]);
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newEngineName, setNewEngineName] = useState("");
  const [newFields, setNewFields] = useState(EmptyForm());
  const [addMsg, setAddMsg] = useState(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState(EmptyForm());
  const [saving, setSaving] = useState(false);
  const [editMsg, setEditMsg] = useState(null);

  async function load() {
    const [infoRes, engRes] = await Promise.all([fetch("/api/equipment-info"), fetch("/api/engines")]);
    if (infoRes.status === 401) { router.push("/login"); return; }
    setItems(await infoRes.json());
    setEngines(await engRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  const rows = useMemo(() => {
    const filtered = items.filter((i) => i.engine_name.toLowerCase().includes(query.toLowerCase()));
    return filtered.sort((a, b) => engineSortKey(a.engine_name) - engineSortKey(b.engine_name));
  }, [items, query]);

  const engineNamesWithoutCard = useMemo(() => {
    const existing = new Set(items.map((i) => i.engine_name));
    return [...engines].map((e) => e.name).filter((n) => !existing.has(n)).sort((a, b) => engineSortKey(a) - engineSortKey(b));
  }, [items, engines]);

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

  function startEdit(item) {
    setEditingId(item._id);
    const f = {};
    FIELDS.forEach(([key]) => { f[key] = item[key] || ""; });
    setEditFields(f);
    setEditMsg(null);
  }

  async function saveEdit(id) {
    setSaving(true);
    setEditMsg(null);
    const res = await fetch(`/api/equipment-info/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editFields),
    });
    setSaving(false);
    if (res.ok) { setEditingId(null); load(); }
    else { const d = await res.json(); setEditMsg({ ok: false, text: d.error || "Bir hata oluştu." }); }
  }

  async function addNew() {
    if (!newEngineName.trim()) { setAddMsg({ ok: false, text: "Lütfen bir motor seçin veya adı yazın." }); return; }
    setAdding(true);
    setAddMsg(null);
    const res = await fetch("/api/equipment-info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engine_name: newEngineName, ...newFields }),
    });
    setAdding(false);
    if (res.ok) {
      setAddMsg({ ok: true, text: "Motor bilgisi eklendi." });
      setNewEngineName(""); setNewFields(EmptyForm()); setShowAdd(false);
      load();
    } else {
      const d = await res.json();
      setAddMsg({ ok: false, text: d.error || "Bir hata oluştu." });
    }
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  const canEdit = user && ["yonetici", "planlamaci"].includes(user.role);

  return (
    <div>
      <TopBar title="Motor Bilgi Kartı" subtitle="Kaver, filtre, eşanjör ve radyatör tipleri — referans amaçlıdır" />
      <div className="px-4 py-4">
        {canEdit && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button onClick={() => { setShowAdd((s) => !s); setShowImport(false); }} className="py-2.5 rounded-xl border border-amber/40 bg-amber/10 text-amber font-bold text-[12px]">
                {showAdd ? "Kapat" : "➕ Yeni Motor Ekle"}
              </button>
              <button onClick={() => { setShowImport((s) => !s); setShowAdd(false); }} className="py-2.5 rounded-xl border border-teal/40 bg-teal/10 text-teal font-bold text-[12px]">
                {showImport ? "Kapat" : "📥 Excel'den Güncelle"}
              </button>
            </div>

            {showAdd && (
              <div className="bg-panel border border-border rounded-card p-3.5 mb-4">
                <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide">Motor</label>
                {engineNamesWithoutCard.length > 0 ? (
                  <select value={newEngineName} onChange={(e) => setNewEngineName(e.target.value)} className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mt-1 mb-3">
                    <option value="">Seçiniz...</option>
                    {engineNamesWithoutCard.map((n) => <option key={n} value={n}>{n}</option>)}
                    <option value="__custom__">Listede yok, adını yazacağım...</option>
                  </select>
                ) : null}
                {(engineNamesWithoutCard.length === 0 || newEngineName === "__custom__") && (
                  <input
                    value={newEngineName === "__custom__" ? "" : newEngineName}
                    onChange={(e) => setNewEngineName(e.target.value)}
                    placeholder="Motor adı (örn. AGM 40)"
                    className="w-full bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mt-1 mb-3"
                  />
                )}
                <FieldInputs values={newFields} onChange={(k, v) => setNewFields((prev) => ({ ...prev, [k]: v }))} />
                {addMsg && <div className={`text-[12px] mt-2 ${addMsg.ok ? "text-green" : "text-red"}`}>{addMsg.text}</div>}
                <button onClick={addNew} disabled={adding} className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] disabled:opacity-50">
                  {adding ? "Ekleniyor..." : "Motor Bilgisini Kaydet"}
                </button>
              </div>
            )}

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
            {rows.map((r) => {
              const isEditing = editingId === r._id;
              return (
                <div key={r._id} className="bg-panel border border-border rounded-card p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[13.5px] font-bold text-text">{r.engine_name}</div>
                    {canEdit && !isEditing && (
                      <button onClick={() => startEdit(r)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1">✏️ Düzenle</button>
                    )}
                  </div>

                  {isEditing ? (
                    <div>
                      <FieldInputs values={editFields} onChange={(k, v) => setEditFields((prev) => ({ ...prev, [k]: v }))} />
                      {editMsg && <div className="text-[12px] text-red mt-2">{editMsg.text}</div>}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => setEditingId(null)} className="flex-1 py-2 rounded-lg border border-border text-muted font-bold text-[12px]">Vazgeç</button>
                        <button onClick={() => saveEdit(r._id)} disabled={saving} className="flex-1 py-2 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50">
                          {saving ? "..." : "💾 Kaydet"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {FIELDS.map(([key, label]) => r[key] ? (
                        <div key={key} className="text-[11px]">
                          <span className="text-faint">{label}: </span>
                          <span className="text-muted">{r[key]}</span>
                        </div>
                      ) : null)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
