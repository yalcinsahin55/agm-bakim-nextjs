"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { engineSortKey } from "@/lib/status";

function compressImage(file, maxDim = 720, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_VIDEO_MB = 15;
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function EditForm({ record, onCancel, onSaved }) {
  const [hours, setHours] = useState(record.hour_at_completion);
  const [note, setNote] = useState(record.note || "");
  const [techNote, setTechNote] = useState(record.technician_note || "");
  const [pressure, setPressure] = useState(record.pressure_reading ?? "");
  const [photos, setPhotos] = useState(record.photos_b64 || []);
  const [videos, setVideos] = useState(record.videos || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function addPhotos(e) {
    const files = Array.from(e.target.files || []);
    const encoded = [];
    for (const f of files) { try { encoded.push(await compressImage(f)); } catch {} }
    setPhotos((p) => [...p, ...encoded]);
    e.target.value = "";
  }

  async function addVideos(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) { setMsg({ ok: false, text: `'${f.name}' ${MAX_VIDEO_MB}MB sınırını aşıyor.` }); continue; }
      const data_b64 = await fileToBase64(f);
      setVideos((v) => [...v, { data_b64, filename: f.name, mime: f.type || "video/mp4" }]);
    }
    e.target.value = "";
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/records/${record._id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hour_at_completion: Number(hours), note, technician_note: techNote,
        photos_b64: photos, videos, pressure_reading: pressure !== "" ? Number(pressure) : undefined,
      }),
    });
    setBusy(false);
    if (res.ok) onSaved();
    else { const d = await res.json(); setMsg({ ok: false, text: d.error || "Hata oluştu." }); }
  }

  return (
    <div className="mt-2 pt-2 border-t border-border flex flex-col gap-2">
      <label className="text-[10.5px] font-bold text-muted uppercase">Motor Çalışma Saati</label>
      <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono" />
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ölçüm / Teknik Açıklama" rows={2} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
      <textarea value={techNote} onChange={(e) => setTechNote(e.target.value)} placeholder="Bakımcı Notu" rows={2} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm resize-none" />
      {(record.type_key === "krank" || record.type_key === "intercooler" || record.pressure_reading != null) && (
        <input type="number" step="0.1" value={pressure} onChange={(e) => setPressure(e.target.value)} placeholder="Fark Basıncı (bar)" className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono" />
      )}

      {photos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {photos.map((p, idx) => (
            <div key={idx} className="relative">
              <img src={`data:image/jpeg;base64,${p}`} className="w-12 h-12 rounded-lg object-cover border border-border" alt="" />
              <button onClick={() => setPhotos((ph) => ph.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-panel2 border border-border text-[9px]">✕</button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer">
        📷 Fotoğraf ekle <input type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
      </label>

      {videos.length > 0 && (
        <div className="flex flex-col gap-1">
          {videos.map((v, idx) => (
            <div key={idx} className="flex items-center justify-between bg-panel2 rounded-lg px-2.5 py-1.5 text-[11px] text-muted">
              🎬 {v.filename}
              <button onClick={() => setVideos((vs) => vs.filter((_, i) => i !== idx))} className="text-red">✕</button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer">
        🎬 Video ekle (en fazla {MAX_VIDEO_MB}MB) <input type="file" accept="video/*" multiple onChange={addVideos} className="hidden" />
      </label>

      {msg && <div className="text-[11.5px] text-red">{msg.text}</div>}
      <div className="flex gap-2 mt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-muted font-bold text-[12px]">Vazgeç</button>
        <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50">
          {busy ? "..." : "💾 Kaydet"}
        </button>
      </div>
    </div>
  );
}

export default function KayitlarPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [engines, setEngines] = useState([]);
  const [types, setTypes] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState("Tümü");
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function load() {
    const params = new URLSearchParams();
    if (engineFilter !== "Tümü") params.set("engine_id", engineFilter);
    if (typeFilter !== "Tümü") params.set("type_label", typeFilter);
    const [engRes, typeRes, recRes] = await Promise.all([
      fetch("/api/engines"), fetch("/api/maintenance-types"), fetch(`/api/records?${params}`),
    ]);
    if (engRes.status === 401) { router.push("/login"); return; }
    setEngines(await engRes.json());
    setTypes(await typeRes.json());
    setRecords(await recRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [engineFilter, typeFilter]); // eslint-disable-line

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const typeLabels = useMemo(() => [...types].map((t) => t.label).sort((a, b) => a.localeCompare(b, "tr")), [types]);

  async function doDelete(id) {
    await fetch(`/api/records/${id}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    load();
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Bakım Kayıtları" subtitle={`${records.length} kayıt`} />
      <div className="px-4 py-4">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px]">
            <option value="Tümü">Tüm Motorlar</option>
            {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px]">
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {records.length === 0 ? (
          <div className="text-center text-muted text-sm py-10 bg-panel border border-border rounded-card">Kayıt bulunamadı.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {records.map((r) => {
              const photos = r.photos_b64 || [];
              const canEdit = user && (["yonetici", "planlamaci"].includes(user.role) || user.id === r.technician_id);
              return (
                <div key={r._id} className="bg-panel border border-border rounded-card p-3.5">
                  {photos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {photos.map((p, idx) => <img key={idx} src={`data:image/jpeg;base64,${p}`} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />)}
                    </div>
                  )}
                  {(r.videos || []).map((v, idx) => (
                    <video key={idx} controls className="w-full rounded-lg mb-2 border border-border">
                      <source src={`data:${v.mime};base64,${v.data_b64}`} />
                    </video>
                  ))}
                  <div className="text-[13px] font-bold text-text">
                    {r.type_label} · {r.engine_name} {r.backdated && <span className="text-faint font-normal">· 📅 geçmişe dönük</span>}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    {new Date(r.created_at).toLocaleDateString("tr-TR")} · {r.hour_at_completion.toLocaleString("tr-TR")} sa · {r.technician_name}
                  </div>
                  {r.pressure_reading != null && <div className="text-[11.5px] text-muted mt-1">📈 Fark Basıncı: {r.pressure_reading} bar</div>}
                  {r.note && <div className="text-[11.5px] text-muted mt-1">📝 {r.note}</div>}
                  {r.technician_note && <div className="text-[11.5px] text-muted mt-1">🗒️ {r.technician_note}</div>}

                  {canEdit && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setEditingId(editingId === r._id ? null : r._id)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5">✏️ Düzenle</button>
                      {confirmDeleteId === r._id ? (
                        <>
                          <button onClick={() => doDelete(r._id)} className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-1.5">Evet, Sil</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5">Vazgeç</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(r._id)} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5">🗑️ Sil</button>
                      )}
                    </div>
                  )}

                  {editingId === r._id && (
                    <EditForm record={r} onCancel={() => setEditingId(null)} onSaved={() => { setEditingId(null); load(); }} />
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
