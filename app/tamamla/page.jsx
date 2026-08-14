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
  const [hours, setHours] = useState(0);
  const [backdated, setBackdated] = useState(false);
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [pressure, setPressure] = useState("");
  const [note, setNote] = useState("");
  const [techNote, setTechNote] = useState("");
  const [extraKeys, setExtraKeys] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch("/api/maintenance-types/panel").then(async (res) => {
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setItems(data.items);
      setEngines(data.engines);
      setTypes(data.types || []);
      setLoading(false);
    });
  }, [router]);

  const engineList = useMemo(
    () => [...engines].sort((a, b) => a.name.localeCompare(b.name, "tr", { numeric: true })),
    [engines]
  );

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

  useEffect(() => {
    if (engItems.length && !engItems.find((i) => i.type_key === typeKey)) {
      setTypeKey(engItems[0].type_key);
    }
  }, [engItems, typeKey]);

  const chosen = engItems.find((i) => i.type_key === typeKey);
  const otherItems = engItems.filter((i) => i.type_key !== typeKey);

  // Birlikte tamamlanan bakımlar: motora tanımlı olmayan bakım türlerini de göster
  const allOtherTypes = useMemo(() => {
    const engTypeKeys = new Set(engItems.map((i) => i.type_key));
    const unassigned = types
      .filter((t) => !engTypeKeys.has(t.key || t._id) && (t.key || t._id) !== typeKey)
      .map((t) => ({ type_key: t.key || t._id, type_label: t.label, unassigned: true }));
    const assigned = otherItems.map((i) => ({ type_key: i.type_key, type_label: i.type_label, unassigned: false }));
    return [...assigned, ...unassigned];
  }, [engItems, otherItems, types, typeKey]);

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

  async function submit() {
    if (!chosen) return;
    setSubmitting(true);
    setMessage(null);

    const extra_types = extraKeys.map((k) => {
      const it = engItems.find((i) => i.type_key === k);
      if (it) return { type_key: it.type_key, type_label: it.type_label };
      const t = types.find((t) => (t.key || t._id) === k);
      return { type_key: k, type_label: t ? t.label : k };
    });

    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine_id: engineId, type_key: chosen.type_key, type_label: chosen.type_label,
        hour_at_completion: Number(hours), note, technician_note: techNote,
        photos_b64: photos, pressure_reading: pressure !== "" ? Number(pressure) : undefined,
        backdated, record_date: backdated ? recordDate : undefined,
        period: chosen.period, extra_types,
      }),
    });

    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      setMessage({ ok: true, text: `${data.completed.join(", ")} bakımı kaydedildi.` });
      setNote(""); setTechNote(""); setPhotos([]); setExtraKeys([]); setPressure(""); setBackdated(false);
      // panel verisini tazele
      const panelRes = await fetch("/api/maintenance-types/panel");
      const panelData = await panelRes.json();
      setItems(panelData.items);
      setEngines(panelData.engines);
      setTypes(panelData.types || []);
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
          {engItems.map((i) => (
            <option key={i.type_key} value={i.type_key}>
              {i.type_label} · {STATUS_LABELS[i.status]} · {Math.round(i.remaining)} sa
            </option>
          ))}
        </select>

        {chosen && (
          <div className="bg-teal/10 border border-teal/30 rounded-xl px-3.5 py-3 mb-2 text-[11.5px] text-muted">
            Motor saati: {chosen.engine_hours.toLocaleString("tr-TR")} · Son bakım: {chosen.last_hour.toLocaleString("tr-TR")} · Periyot: {chosen.period.toLocaleString("tr-TR")} sa
          </div>
        )}

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">O Anki Motor Çalışma Saati</label>
        <input
          type="number" value={hours} onChange={(e) => setHours(e.target.value)}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm font-mono font-bold text-amber mb-1"
        />
        <p className="text-[11px] text-faint mb-2 leading-relaxed">
          Bu değer motorun güncel saatinden büyükse motorun güncel saatini de günceller; küçük veya eşitse yalnızca bu bakım kaydına yazılır.
        </p>

        <label className="flex items-center gap-2 text-[12.5px] mb-2 text-text">
          <input type="checkbox" checked={backdated} onChange={(e) => setBackdated(e.target.checked)} />
          📅 Geçmişe dönük kayıt (bu bakım geçmişte yapıldı)
        </label>
        {backdated && (
          <input
            type="date" value={recordDate} max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setRecordDate(e.target.value)}
            className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2"
          />
        )}

        {(chosen?.type_key === "krank" || chosen?.type_key === "intercooler") && (
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

        {allOtherTypes.length > 0 && (
          <>
            <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide mt-1">Birlikte Tamamlanan Diğer Bakımlar</label>
            <p className="text-[11px] text-faint mb-1.5">Bazen bir bakımı yaparken diğerlerini de yapmış oluyorsunuz. Varsa işaretleyin — hepsi aynı saat/tarihle kaydedilir.</p>
            <div className="flex flex-col gap-1.5 mb-2">
              {allOtherTypes.map((i) => (
                <label key={i.type_key} className={`flex items-center gap-2 bg-panel border border-border rounded-xl px-3 py-2.5 text-[12.5px] text-text ${i.unassigned ? "opacity-75" : ""}`}>
                  <input
                    type="checkbox" checked={extraKeys.includes(i.type_key)}
                    onChange={(e) => setExtraKeys((prev) => e.target.checked ? [...prev, i.type_key] : prev.filter((k) => k !== i.type_key))}
                  />
                  {i.type_label} {i.unassigned && <span className="text-[10px] text-faint">(bu motora tanımlı değil)</span>}
                </label>
              ))}
            </div>
          </>
        )}

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

        {message && (
          <div className={`text-[12.5px] mb-2 ${message.ok ? "text-green" : "text-red"}`}>{message.text}</div>
        )}

        <button
          onClick={submit} disabled={submitting || !chosen}
          className="mt-2 py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50"
        >
          {submitting ? "Kaydediliyor..." : "✅ Bakımı Tamamla"}
        </button>
      </div>
      <BottomNav />
    </div>
  );
}
