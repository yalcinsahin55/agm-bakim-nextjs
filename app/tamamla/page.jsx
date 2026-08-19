"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import { STATUS_LABELS } from "@/lib/status";

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

export default function TamamlaPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [engines, setEngines] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [engineId, setEngineId] = useState("");
  const [typeKey, setTypeKey] = useState("");
  const [primaryPeriod, setPrimaryPeriod] = useState(1000);
  const [hours, setHours] = useState(0);
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [pressure, setPressure] = useState("");
  const [note, setNote] = useState("");
  const [techNote, setTechNote] = useState("");
  const [extraKeys, setExtraKeys] = useState([]);
  const [extraPeriods, setExtraPeriods] = useState({});
  
  // Fotoğraf ve Video State'leri
  const [photos, setPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [videos, setVideos] = useState([]);
  const [videoBusy, setVideoBusy] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  async function loadPanel() {
    const res = await fetch("/api/maintenance-types/panel");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setItems(data.items);
    setEngines(data.engines);
    setTypes(data.types);
    setLoading(false);
  }

  useEffect(() => { loadPanel(); }, []); // eslint-disable-line

  const engineList = useMemo(
    () => [...engines].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true })),
    [engines]
  );
  const allTypesSorted = useMemo(() => [...types].sort((a, b) => a.label.localeCompare(b.label, "tr")), [types]);

  useEffect(() => {
    if (!engineId && engineList.length) setEngineId(engineList[0]._id);
  }, [engineList, engineId]);

  useEffect(() => {
    if (!engineId) return;
    const eng = engines.find((e) => e._id === engineId);
    if (eng) setHours(eng.hours);
  }, [engineId, engines]);

  const engItems = useMemo(
    () => items.filter((i) => i.engine_id === engineId).sort((a, b) => a.remaining - b.remaining),
    [items, engineId]
  );
  const trackedKeys = useMemo(() => new Set(engItems.map((i) => i.type_key)), [engItems]);

  useEffect(() => {
    if (allTypesSorted.length && !allTypesSorted.find((t) => t.key === typeKey)) {
      setTypeKey(allTypesSorted[0].key);
    }
  }, [allTypesSorted, typeKey]);

  const chosenItem = engItems.find((i) => i.type_key === typeKey);
  const chosenType = types.find((t) => t.key === typeKey);
  const isPrimaryNew = !!chosenType && !trackedKeys.has(typeKey);

  useEffect(() => {
    if (isPrimaryNew && chosenType) setPrimaryPeriod(chosenType.default_period_hours);
  }, [isPrimaryNew, chosenType]);

  const otherTypes = allTypesSorted.filter((t) => t.key !== typeKey);

  async function handlePhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoBusy(true);
    const encoded = [];
    for (const f of files) {
      try { encoded.push(await compressImage(f)); } catch { /* atla */ }
    }
    setPhotos((prev) => [...prev, ...encoded]);
    setPhotoBusy(false);
    e.target.value = "";
  }

  function removePhoto(idx) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  // --- YENİ: Video Yükleme Fonksiyonu ---
  async function handleVideos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (videos.length + files.length > 5) {
      alert("Toplamda en fazla 5 video ekleyebilirsiniz.");
      return;
    }

    setVideoBusy(true);
    const newVideos = [];
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB Sınırı

    for (const f of files) {
      if (f.size > MAX_SIZE) {
        alert(`${f.name} dosyası 20MB sınırını aşıyor. Lütfen daha kısa/küçük bir video seçin.`);
        continue;
      }
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
        newVideos.push(base64);
      } catch (err) {
        console.error("Video okuma hatası:", err);
      }
    }

    setVideos((prev) => [...prev, ...newVideos]);
    setVideoBusy(false);
    e.target.value = "";
  }

  function removeVideo(idx) {
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  }
  // --------------------------------------

  function toggleExtra(key, checked) {
    setExtraKeys((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
    if (checked && extraPeriods[key] === undefined) {
      const t = types.find((tt) => tt.key === key);
      setExtraPeriods((prev) => ({ ...prev, [key]: t ? t.default_period_hours : 1000 }));
    }
  }

  async function submit() {
    if (!chosenType) return;
    setSubmitting(true);
    setMessage(null);

    const isBackdated = recordDate !== new Date().toISOString().slice(0, 10);

    const extra_types = extraKeys.map((k) => {
      const t = types.find((tt) => tt.key === k);
      const trackedForEngine = trackedKeys.has(k);
      return {
        type_key: k, type_label: t.label,
        period: trackedForEngine ? undefined : Number(extraPeriods[k]),
      };
    });

    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine_id: engineId, type_key: chosenType.key, type_label: chosenType.label,
        hour_at_completion: Number(hours), note, technician_note: techNote,
        photos_b64: photos, 
        videos: videos, // --- YENİ: Videoları API'ye gönder ---
        pressure_reading: pressure !== "" ? Number(pressure) : undefined,
        backdated: isBackdated, record_date: recordDate,
        period: isPrimaryNew ? Number(primaryPeriod) : undefined, extra_types,
      }),
    });

    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      setMessage({ ok: true, text: `${data.completed.join(", ")} bakımı kaydedildi.` });
      
      // Formu sıfırla
      setNote(""); setTechNote(""); setPhotos([]); setVideos([]); // --- YENİ: Videoları sıfırla ---
      setExtraKeys([]); setExtraPeriods({}); setPressure(""); setRecordDate(new Date().toISOString().slice(0, 10));
      loadPanel();
    } else {
      const data = await res.json();
      setMessage({ ok: false, text: data.error || "Bir hata oluştu." });
    }
  }

  if (loading) return <div className="p-8 text-center text-muted text-sm">Yükleniyor...</div>;

  return (
    <div>
      <TopBar title="Bakım Tamamla" subtitle={engineId ? `${engines.find((e) => e._id === engineId)?.name || ""} için yeni kayıt` : ""} />
      <div className="px-4 py-4 flex flex-col gap-1">
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Motor</label>
        <select value={engineId} onChange={(e) => setEngineId(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2">
          {engineList.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
        </select>

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Bakım Türü</label>
        <select value={typeKey} onChange={(e) => setTypeKey(e.target.value)} className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2">
          {allTypesSorted.map((t) => {
            const it = engItems.find((i) => i.type_key === t.key);
            const label = it
              ? `${t.label} · ${STATUS_LABELS[it.status]} · ${Math.round(it.remaining)} sa`
              : `${t.label} · ⚪ Bu motor için tanımlı değil`;
            return <option key={t.key} value={t.key}>{label}</option>;
          })}
        </select>

        {chosenItem ? (
          <div className="bg-teal/10 border border-teal/30 rounded-xl px-3.5 py-3 mb-2 text-[11.5px] text-muted">
            Motor saati: {chosenItem.engine_hours.toLocaleString("tr-TR")} · Son bakım: {chosenItem.last_hour.toLocaleString("tr-TR")} · Periyot: {chosenItem.period.toLocaleString("tr-TR")} sa
          </div>
        ) : chosenType ? (
          <div className="bg-amber/10 border border-amber/30 rounded-xl px-3.5 py-3 mb-2">
            <div className="text-[11.5px] text-muted mb-2">
              <b className="text-amber">{chosenType.label}</b>, bu motor için tanımlı değildi. Bu kaydı eklersen yeni bir bakım takibi başlatılır.
            </div>
            <label className="text-[10.5px] font-bold text-muted uppercase tracking-wide">Periyodik bakım saati</label>
            <input
              type="number" value={primaryPeriod} onChange={(e) => setPrimaryPeriod(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-2 text-sm font-mono mt-1"
            />
          </div>
        ) : null}

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">O Anki Motor Çalışma Saati</label>
        <input
          type="number" value={hours} onChange={(e) => setHours(e.target.value)}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-amber mb-1"
        />
        <p className="text-[11px] text-faint mb-2 leading-relaxed">
          Bu değer motorun güncel saatinden büyükse motorun güncel saatini de günceller; küçük veya eşitse yalnızca bu bakım kaydına yazılır.
        </p>

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Bakım Tarihi</label>
        <input
          type="date" value={recordDate} max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setRecordDate(e.target.value)}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2"
        />

        {(typeKey === "krank" || typeKey === "intercooler") && (
          <>
            <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Fark Basıncı (bar)</label>
            <input
              type="number" step="0.1" value={pressure} onChange={(e) => setPressure(e.target.value)}
              className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-teal mb-2"
            />
          </>
        )}

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Ölçüm / Teknik Açıklama</label>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
        />

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Bakımcı Notu</label>
        <textarea
          value={techNote} onChange={(e) => setTechNote(e.target.value)} rows={2}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
        />

        {otherTypes.length > 0 && (
          <>
            <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide mt-1">Birlikte Tamamlanan Diğer Bakımlar</label>
            <p className="text-[11px] text-faint mb-1.5">
              Bazen bir bakımı yaparken diğerlerini de yapmış oluyorsunuz — motor için daha önce hiç tanımlı olmayan
              bir bakım türü de olsa, işaretleyip periyodunu girerek ekleyebilirsiniz. Hepsi aynı saat/tarihle kaydedilir.
            </p>
            <div className="flex flex-col gap-1.5 mb-2">
              {otherTypes.map((t) => {
                const tracked = trackedKeys.has(t.key);
                const checked = extraKeys.includes(t.key);
                return (
                  <div key={t.key} className="bg-panel border border-border rounded-xl px-3 py-2.5">
                    <label className="flex items-center gap-2 text-[12.5px] text-text">
                      <input type="checkbox" checked={checked} onChange={(e) => toggleExtra(t.key, e.target.checked)} />
                      {t.label}
                      {!tracked && <span className="text-[10px] text-faint">· ⚪ tanımlı değil</span>}
                    </label>
                    {checked && !tracked && (
                      <div className="mt-2 pl-6">
                        <label className="text-[10px] font-bold text-muted uppercase tracking-wide">Periyodik bakım saati</label>
                        <input
                          type="number" value={extraPeriods[t.key] ?? ""}
                          onChange={(e) => setExtraPeriods((prev) => ({ ...prev, [t.key]: e.target.value }))}
                          className="w-full bg-panel2 border border-border rounded-lg px-2.5 py-1.5 text-[12.5px] font-mono mt-1"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* --- YENİ: Fotoğraf Bölümü --- */}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Fotoğraf</label>
        <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted mb-2 cursor-pointer">
          📷 {photoBusy ? "İşleniyor..." : "Fotoğraf ekle (birden fazla seçebilirsiniz)"}
          <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
        </label>
        {photos.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {photos.map((p, idx) => (
              <div key={idx} className="relative">
                <img src={`data:image/jpeg;base64,${p}`} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />
                <button onClick={() => removePhoto(idx)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-panel2 border border-border text-[10px] leading-none p-0.5">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* --- YENİ: Video Bölümü --- */}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Video</label>
        <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted mb-2 cursor-pointer">
          🎥 {videoBusy ? "İşleniyor..." : "Video ekle (Max 5 adet, her biri max 20MB)"}
          <input type="file" accept="video/*" multiple onChange={handleVideos} className="hidden" />
        </label>
        {videos.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {videos.map((v, idx) => (
              <div key={idx} className="relative">
                <video src={v} className="w-20 h-20 rounded-lg object-cover border border-border bg-black" />
                <button 
                  onClick={() => removeVideo(idx)} 
                  className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-panel2 border border-border text-[10px] leading-none p-0.5 text-red"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {/* --------------------------- */}

        {message && (
          <div className={`text-[12.5px] mb-2 ${message.ok ? "text-green" : "text-red"}`}>{message.text}</div>
        )}

        <button
          onClick={submit} disabled={submitting || !chosenType}
          className="mt-2 py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50"
        >
          {submitting ? "Kaydediliyor..." : "✅ Bakımı Tamamla"}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
