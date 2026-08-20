"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import Lightbox from "@/components/Lightbox";
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

function EditForm({ record, onCancel, onSaved, onPhotoClick }) {
  const [hours, setHours] = useState(record.hour_at_completion);
  const [techNote, setTechNote] = useState(record.technician_note || "");
  const [pressure, setPressure] = useState(record.pressure_reading ?? "");
  const [photos, setPhotos] = useState(record.photos_b64 || []);
  const [videos, setVideos] = useState(record.videos || []);
  const [busy, setBusy] = useState(false);

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
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) {
        toast.error(`'${f.name}' ${MAX_VIDEO_MB}MB sınırını aşıyor.`);
        continue;
      }
      const data_b64 = await fileToBase64(f);
      setVideos((v) => [...v, { data_b64, filename: f.name, mime: f.type || "video/mp4" }]);
    }
    e.target.value = "";
  }

  async function save() {
    setBusy(true);
    const loadingToast = toast.loading("Kayıt güncelleniyor...");
    try {
      const res = await fetch(`/api/records/${record._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hour_at_completion: Number(hours), technician_note: techNote,
          photos_b64: photos, videos, pressure_reading: pressure !== "" ? Number(pressure) : undefined,
        }),
      });
      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success("Kayıt güncellendi! ✅");
        onSaved();
      } else {
        const d = await res.json();
        toast.dismiss(loadingToast);
        toast.error(d.error || "Güncellenemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 pt-2 border-t border-border flex flex-col gap-2 animate-fade-in">
      <label className="text-[10.5px] font-bold text-muted uppercase">Motor Çalışma Saati</label>
      <input type="number" value={hours} onChange={(e) => setHours(e.target.value)} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition" />
      <textarea value={techNote} onChange={(e) => setTechNote(e.target.value)} placeholder="Bakımcı Notu" rows={2} className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm resize-none outline-none focus:border-teal transition" />
      {(record.type_key === "krank" || record.type_key === "intercooler" || record.pressure_reading != null) && (
        <input type="number" step="0.1" value={pressure} onChange={(e) => setPressure(e.target.value)} placeholder="Fark Basıncı (bar)" className="bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono outline-none focus:border-teal transition" />
      )}

      {photos.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {photos.map((p, idx) => (
            <div key={idx} className="relative">
              <button
                type="button"
                onClick={() => onPhotoClick && onPhotoClick(`data:image/jpeg;base64,${p}`)}
                className="block hover:scale-105 transition-transform"
                aria-label="Fotoğrafı büyüt"
              >
                <img src={`data:image/jpeg;base64,${p}`} className="w-12 h-12 rounded-lg object-cover border border-border" alt="" />
              </button>
              <button onClick={() => setPhotos((ph) => ph.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-panel2 border border-border text-[9px] hover:bg-red hover:text-white transition">✕</button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
        📷 Fotoğraf ekle <input type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
      </label>

      {videos.length > 0 && (
        <div className="flex flex-col gap-1">
          {videos.map((v, idx) => (
            <div key={idx} className="flex items-center justify-between bg-panel2 rounded-lg px-2.5 py-1.5 text-[11px] text-muted">
              🎬 {v.filename}
              <button onClick={() => setVideos((vs) => vs.filter((_, i) => i !== idx))} className="text-red hover:scale-110 transition">✕</button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-lg px-3 py-2 text-[11.5px] text-muted cursor-pointer hover:border-amber hover:bg-amber/5 transition">
        🎬 Video ekle (en fazla {MAX_VIDEO_MB}MB) <input type="file" accept="video/*" multiple onChange={addVideos} className="hidden" />
      </label>

      <div className="flex gap-2 mt-1">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-border text-muted font-bold text-[12px] hover:bg-panel2 transition">Vazgeç</button>
        <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-teal text-[#06181b] font-bold text-[12px] disabled:opacity-50 hover:brightness-110 transition">
          {busy ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-[#06181b]/40 border-t-[#06181b] rounded-full animate-spin" />
              Kaydediliyor...
            </span>
          ) : "💾 Kaydet"}
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
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

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

  useEffect(() => { load(); }, [engineFilter, typeFilter]);

  const sortedEngines = useMemo(() => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name)), [engines]);
  const typeLabels = useMemo(() => [...types].map((t) => t.label).sort((a, b) => a.localeCompare(b, "tr")), [types]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      (r.engine_name || "").toLowerCase().includes(q) ||
      (r.type_label || "").toLowerCase().includes(q) ||
      (r.technician_name || "").toLowerCase().includes(q)
    );
  }, [records, search]);

  async function doDelete(id) {
    const loadingToast = toast.loading("Kayıt siliniyor...");
    try {
      const res = await fetch(`/api/records/${id}`, { method: "DELETE" });
      toast.dismiss(loadingToast);
      if (res.ok) {
        toast.success("Kayıt silindi! 🗑️");
        setConfirmDeleteId(null);
        load();
      } else {
        toast.error("Kayıt silinemedi.");
      }
    } catch {
      toast.dismiss(loadingToast);
      toast.error("Sunucu hatası.");
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Kayıtları" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-3" />
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2">
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
            <Skeleton className="h-36 rounded-card" />
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Kayıtları" subtitle={`${filteredRecords.length} kayıt görüntüleniyor`} />
      <div className="px-4 py-4">
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Motor, tür veya teknisyen ara..."
            className="w-full bg-panel2 border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition">
            <option value="Tümü">Tüm Motorlar</option>
            {sortedEngines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="bg-panel2 border border-border rounded-xl px-2.5 py-2.5 text-[12.5px] outline-none focus:border-teal transition">
            <option value="Tümü">Tüm Türler</option>
            {typeLabels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 bg-panel border border-border rounded-card">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-sm text-muted">Kayıt bulunamadı.</p>
            {(search || engineFilter !== "Tümü" || typeFilter !== "Tümü") && (
              <button
                onClick={() => { setSearch(""); setEngineFilter("Tümü"); setTypeFilter("Tümü"); }}
                className="mt-3 px-4 py-2 bg-panel2 text-sm rounded-lg border border-border hover:bg-panel transition"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:grid md:grid-cols-2 gap-2 md:items-start">
            {filteredRecords.map((r) => {
              const photos = r.photos_b64 || [];
              const videos = r.videos || [];
              const showMedia = !r.group_id || photos.length > 0 || videos.length > 0;
              const canEdit = user && (["yonetici", "planlamaci"].includes(user.role) || user.id === r.technician_id);
              return (
                <div key={r._id} className="bg-panel border border-border rounded-card p-3.5 hover:border-borderlt transition-all">
                  {showMedia && photos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {photos.map((p, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedPhoto(`data:image/jpeg;base64,${p}`)}
                          className="hover:scale-105 transition-transform"
                          aria-label="Fotoğrafı büyüt"
                        >
                          <img src={`data:image/jpeg;base64,${p}`} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                  {showMedia && videos.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {videos.map((v, idx) => {
                        const videoSrc = `data:${v.mime || "video/mp4"};base64,${v.data_b64}`;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedVideo({ src: videoSrc, filename: v.filename || "Video" })}
                            className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-panel2 hover:scale-105 transition-transform"
                            aria-label={`${v.filename || "Video"} videosunu oynat`}
                          >
                            <video muted preload="metadata" className="w-full h-full object-cover pointer-events-none">
                              <source src={videoSrc} />
                            </video>
                            <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white text-xl">▶</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-[13px] font-bold text-text">
                    {r.type_label} · {r.engine_name}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    {new Date(r.created_at).toLocaleDateString("tr-TR")} · {r.hour_at_completion.toLocaleString("tr-TR")} sa · {r.technician_name}
                  </div>
                  {r.pressure_reading != null && <div className="text-[11.5px] text-muted mt-1">📈 Fark Basıncı: {r.pressure_reading} bar</div>}
                  {r.technician_note && <div className="text-[11.5px] text-muted mt-1">🗒️ {r.technician_note}</div>}

                  {canEdit && (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setEditingId(editingId === r._id ? null : r._id)} className="text-[11px] font-bold text-teal border border-teal/40 rounded-lg px-2.5 py-1.5 hover:bg-teal/10 transition">✏️ Düzenle</button>
                      {confirmDeleteId === r._id ? (
                        <>
                          <button onClick={() => doDelete(r._id)} className="text-[11px] font-bold text-[#1a1206] bg-red rounded-lg px-2.5 py-1.5 hover:brightness-110 transition">Evet, Sil</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-bold text-muted border border-border rounded-lg px-2.5 py-1.5 hover:bg-panel2 transition">Vazgeç</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDeleteId(r._id)} className="text-[11px] font-bold text-red border border-red/40 rounded-lg px-2.5 py-1.5 hover:bg-red/10 transition">🗑️ Sil</button>
                      )}
                    </div>
                  )}

                  {editingId === r._id && (
                    <EditForm
                      record={r}
                      onPhotoClick={setSelectedPhoto}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => { setEditingId(null); load(); }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Video Oynatıcı Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label={selectedVideo.filename}>
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setSelectedVideo(null)}
              className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-panel text-text text-lg hover:bg-red hover:text-white transition"
              aria-label="Videoyu kapat"
            >
              ✕
            </button>
            <video controls autoPlay className="w-full max-h-[80vh] rounded-xl border border-border bg-black">
              <source src={selectedVideo.src} />
            </video>
          </div>
        </div>
      )}

      {/* Resim Büyütme Penceresi */}
      <Lightbox src={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      <BottomNav />
    </div>
  );
}
