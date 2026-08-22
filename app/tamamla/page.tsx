// @ts-nocheck
"use client";
// JavaScript kaynak dosyasından TypeScript'e taşındı; dinamik API/form verileri çalışma zamanında doğrulanıyor.
// @ts-nocheck

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { uploadVideoChunked } from "@/lib/chunkUpload";
import { getPendingOfflineCount, queueRecord, syncOfflineQueue, type QueuedMedia } from "@/lib/offlineQueue";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import Lightbox from "@/components/Lightbox";
import { STATUS_LABELS } from "@/lib/status";

const CHECKLIST_TEMPLATES = {
  yag: ["Yağ seviyesi ve kaçak kontrolü", "Filtre ve bağlantı kontrolü", "Çalışma sonrası tekrar kontrol"],
  krank: ["Fark basıncı ölçümü", "Filtre yüzeyi kontrolü", "Bağlantı ve kaçak kontrolü"],
  intercooler: ["Fark basıncı ölçümü", "Hortum ve kelepçe kontrolü", "Soğutucu yüzey kontrolü"],
  alternator: ["Kablo ve bağlantı kontrolü", "Görsel hasar kontrolü", "Çalışma testi"],
  default: ["Görsel genel kontrol", "Bakım işlemi tamamlandı", "Çalışma sonrası kontrol"],
};

function checklistForType(typeKey, label) {
  const normalized = `${typeKey} ${label || ""}`.toLocaleLowerCase("tr");
  if (normalized.includes("yağ")) return CHECKLIST_TEMPLATES.yag;
  if (normalized.includes("krank")) return CHECKLIST_TEMPLATES.krank;
  if (normalized.includes("intercooler")) return CHECKLIST_TEMPLATES.intercooler;
  if (normalized.includes("alternat")) return CHECKLIST_TEMPLATES.alternator;
  return CHECKLIST_TEMPLATES.default;
}

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
        if (!ctx) return reject(new Error("Fotoğraf işlenemedi."));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error("Fotoğraf sıkıştırılamadı."));
          resolve(blob);
        }, "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Fotoğraf okunamadı."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Fotoğraf okunamadı."));
    reader.readAsDataURL(file);
  });
}


function getPhotoSrc(photo, previews = {}) {
  if (photo.startsWith("offline:")) return previews[photo.slice("offline:".length)] || "";
  return photo.startsWith("http://") || photo.startsWith("https://") || photo.startsWith("data:")
    ? photo
    : `data:image/jpeg;base64,${photo}`;
}

function makeOfflineId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withTimeout(promise, milliseconds, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
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
  const [techNote, setTechNote] = useState("");
  const [extraKeys, setExtraKeys] = useState([]);
  const [extraPeriods, setExtraPeriods] = useState({});
  const [checklist, setChecklist] = useState({});
  
  const [photos, setPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [videos, setVideos] = useState([]);
  const [videoBusy, setVideoBusy] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [offlineMedia, setOfflineMedia] = useState<QueuedMedia[]>([]);
  const [offlinePreviews, setOfflinePreviews] = useState({});
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  
  const [submitting, setSubmitting] = useState(false);

  async function loadPanel() {
    const res = await fetch("/api/maintenance-types/panel");
    if (res.status === 401) { router.push("/login"); return; }
    const data = await res.json();
    setItems(data.items);
    setEngines(data.engines);
    setTypes(data.types);
    setLoading(false);
  }

  useEffect(() => {
    loadPanel();
    setIsOnline(navigator.onLine);
    const updateConnection = () => setIsOnline(navigator.onLine);
    const updateQueue = (event?: Event) => {
      const remaining = (event as CustomEvent<{ remaining?: number }> | undefined)?.detail?.remaining;
      if (typeof remaining === "number") {
        setPendingOfflineCount(remaining);
        return;
      }
      void getPendingOfflineCount().then(setPendingOfflineCount).catch(() => {});
    };
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("offline-queue:changed", updateQueue);
    updateQueue();
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("offline-queue:changed", updateQueue);
    };
  }, []);

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
  const checklistItems = useMemo(() => checklistForType(typeKey, chosenType?.label), [typeKey, chosenType]);
  const isPrimaryNew = !!chosenType && !trackedKeys.has(typeKey);

  useEffect(() => {
    if (isPrimaryNew && chosenType) setPrimaryPeriod(chosenType.default_period_hours);
    setChecklist(Object.fromEntries(checklistItems.map((item) => [item, false])));
  }, [isPrimaryNew, chosenType, checklistItems]);

  const otherTypes = allTypesSorted.filter((t) => t.key !== typeKey);

  async function handlePhotos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoBusy(true);
    const uploaded = [];
    for (const f of files) {
      try {
        const compressed = await compressImage(f);
        const photoName = `${f.name.replace(/\.[^/.]+$/, "")}.jpg`;
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "photo", name: photoName, type: "image/jpeg", blob: compressed }]);
          setOfflinePreviews((current) => ({ ...current, [id]: URL.createObjectURL(compressed) }));
          uploaded.push(`offline:${id}`);
          continue;
        }
        const formData = new FormData();
        formData.append("file", new File([compressed], photoName, { type: "image/jpeg" }));
        formData.append("folder", "photos");
        const response = await withTimeout(
          fetch("/api/blob/upload-server", { method: "POST", body: formData }),
          60_000,
          "Fotoğraf yükleme zaman aşımına uğradı. İnternet bağlantınızı kontrol edip tekrar deneyin.",
        );
        const result = await response.json();
        if (!response.ok || !result.url) throw new Error(result.error || "Fotoğraf yüklenemedi.");
        uploaded.push(result.url);
      } catch (error) {
        if (!navigator.onLine) {
          try {
            const compressed = await compressImage(f);
            const id = makeOfflineId();
            const photoName = `${f.name.replace(/\.[^/.]+$/, "")}.jpg`;
            setOfflineMedia((current) => [...current, { id, kind: "photo", name: photoName, type: "image/jpeg", blob: compressed }]);
            setOfflinePreviews((current) => ({ ...current, [id]: URL.createObjectURL(compressed) }));
            uploaded.push(`offline:${id}`);
            continue;
          } catch {
            // Aşağıdaki genel hata kullanıcıya gösterilir.
          }
        }
        const message = error instanceof Error ? error.message : "Bilinmeyen hata";
        toast.error(`${f.name} yüklenemedi: ${message}`);
      }
    }
    setPhotos((prev) => [...prev, ...uploaded]);
    setPhotoBusy(false);
    e.target.value = "";
  }

  function removePhoto(idx) {
    const photo = photos[idx];
    if (photo && photo.startsWith("offline:")) {
      const id = photo.slice("offline:".length);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
      setOfflinePreviews((current) => {
        if (current[id]) URL.revokeObjectURL(current[id]);
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  // Videolar küçük parçalara bölünerek uygulama API’sine gönderilir ve Blob’a yazılır.
  async function handleVideos(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (videos.length + files.length > 5) {
      toast.warning("Toplamda en fazla 5 video ekleyebilirsiniz.");
      return;
    }

    setVideoBusy(true);
    try {
      for (const f of files) {
        if (f.size > 100 * 1024 * 1024) {
          toast.error(`${f.name} çok büyük (en fazla 100MB).`);
          continue;
        }
        if (!navigator.onLine) {
          const id = makeOfflineId();
          setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
          setOfflinePreviews((current) => ({ ...current, [id]: URL.createObjectURL(f) }));
          setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name }]);
          continue;
        }
        try {
          const url = await withTimeout(
            uploadVideoChunked(f),
            600_000,
            "Video yükleme zaman aşımına uğradı. Daha küçük bir dosya veya daha iyi bir bağlantı deneyin.",
          );
          setVideos((current) => [...current, { url, filename: f.name }]);
        } catch (err) {
          if (!navigator.onLine) {
            const id = makeOfflineId();
            setOfflineMedia((current) => [...current, { id, kind: "video", name: f.name, type: f.type || "video/mp4", blob: f }]);
            setOfflinePreviews((current) => ({ ...current, [id]: URL.createObjectURL(f) }));
            setVideos((current) => [...current, { url: `offline:${id}`, filename: f.name }]);
            continue;
          }
          console.error("Video yükleme hatası:", err);
          toast.error(`${f.name} yüklenemedi: ${err && err.message ? err.message.slice(0, 100) : "bilinmeyen hata"}`);
        }
      }
    } finally {
      setVideoBusy(false);
      e.target.value = "";
    }
  }

  function removeVideo(idx) {
    const video = videos[idx];
    if (video?.url?.startsWith("offline:")) {
      const id = video.url.slice("offline:".length);
      setOfflineMedia((current) => current.filter((media) => media.id !== id));
      setOfflinePreviews((current) => {
        if (current[id]) URL.revokeObjectURL(current[id]);
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleExtra(key, checked) {
    setExtraKeys((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
    if (checked && extraPeriods[key] === undefined) {
      const t = types.find((tt) => tt.key === key);
      setExtraPeriods((prev) => ({ ...prev, [key]: t ? t.default_period_hours : 1000 }));
    }
  }

  async function submit() {
    if (!chosenType) {
      toast.error("Lütfen bir bakım türü seçin.");
      return;
    }
    
    setSubmitting(true);
    
    const isBackdated = recordDate !== new Date().toISOString().slice(0, 10);

    const extra_types = extraKeys.map((k) => {
      const t = types.find((tt) => tt.key === k);
      const trackedForEngine = trackedKeys.has(k);
      return {
        type_key: k, type_label: t.label,
        period: trackedForEngine ? undefined : Number(extraPeriods[k]),
      };
    });

    const loadingToast = toast.loading("Bakım kaydı işleniyor...");
    const payload = {
      engine_id: engineId, type_key: chosenType.key, type_label: chosenType.label,
      hour_at_completion: Number(hours), technician_note: techNote,
      photos,
      videos,
      pressure_reading: pressure !== "" ? Number(pressure) : undefined,
      backdated: isBackdated, record_date: recordDate,
      period: isPrimaryNew ? Number(primaryPeriod) : undefined, extra_types,
      checklist: checklistItems.map((label) => ({ label, completed: checklist[label] === true })),
    };

    try {
      if (!navigator.onLine || offlineMedia.length > 0) {
        await queueRecord(payload, offlineMedia);
        toast.dismiss(loadingToast);
        toast.success(navigator.onLine ? "Kayıt senkronizasyon kuyruğuna alındı; gönderiliyor." : "İnternet yok. Kayıt güvenle kuyruğa alındı.");
        if (navigator.onLine) void syncOfflineQueue();
        router.push("/dashboard");
        return;
      }

      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast.dismiss(loadingToast);
        toast.success(`${data.completed.join(", ")} bakımı başarıyla kaydedildi! 🎉`);
        router.push("/dashboard");
      } else {
        toast.dismiss(loadingToast);
        toast.error(data.error || "Kayıt sırasında bir hata oluştu.");
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error("Sunucu bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <TopBar title="Bakım Tamamla" subtitle="Veriler yükleniyor..." />
        <div className="px-4 py-4 flex flex-col gap-1">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-16 w-full rounded-xl mb-2" />
          <Skeleton className="h-4 w-40 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-1" />
          <Skeleton className="h-3 w-3/4 mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-16 w-full rounded-xl mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-12 w-full rounded-xl mb-2" />
          <Skeleton className="h-14 w-full rounded-xl mt-2" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Bakım Tamamla" subtitle={engineId ? `${engines.find((e) => e._id === engineId)?.name || ""} için yeni kayıt` : ""} />
      <div className="px-4 py-4 flex flex-col gap-1">
        {(!isOnline || pendingOfflineCount > 0 || offlineMedia.length > 0) && (
          <div className="mb-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-[11px] text-amber" role="status">
            <div className="font-bold">{!isOnline ? "Çevrimdışı çalışma açık." : "Senkronizasyon bekleyen kayıt var."}</div>
            <div className="mt-0.5 text-[10px] text-muted">
              {!isOnline ? "Kayıt ve seçtiğiniz medya cihazda tutulur; bağlantı gelince gönderilir." : `${pendingOfflineCount} kayıt bağlantı üzerinden gönderilmeyi bekliyor.`}
            </div>
            {isOnline && pendingOfflineCount > 0 && <button type="button" onClick={() => { window.dispatchEvent(new Event("offline-queue:sync")); }} className="mt-2 rounded-lg border border-amber/40 px-2.5 py-1.5 text-[10px] font-bold text-amber">Şimdi senkronize et</button>}
          </div>
        )}
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

        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Bakımcı Notu</label>
        <textarea
          value={techNote} onChange={(e) => setTechNote(e.target.value)} rows={2}
          className="bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
        />

        <div className="mb-2 rounded-xl border border-border bg-panel p-3">
          <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-muted">Kontrol Listesi</div>
          <div className="mb-2 text-[10.5px] text-faint">Standart maddeleri işaretleyerek bakımın tamamlandığını doğrula.</div>
          <div className="flex flex-col gap-1.5">
            {checklistItems.map((item) => <label key={item} className="flex items-center gap-2 rounded-lg bg-panel2 px-2.5 py-2 text-[11.5px] text-text"><input type="checkbox" checked={checklist[item] === true} onChange={(e) => setChecklist((current) => ({ ...current, [item]: e.target.checked }))} />{item}</label>)}
          </div>
        </div>

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

        {/* Fotoğraf Bölümü */}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Fotoğraf</label>
        <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted mb-2 cursor-pointer">
          📷 {photoBusy ? "İşleniyor..." : "Fotoğraf ekle (birden fazla seçebilirsiniz)"}
          <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
        </label>
        {photos.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {photos.map((p, idx) => (
              <div key={idx} className="relative">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(getPhotoSrc(p, offlinePreviews))}
                  className="block hover:scale-105 transition-transform"
                  aria-label="Fotoğrafı büyüt"
                >
                  <img src={getPhotoSrc(p, offlinePreviews)} className="w-14 h-14 rounded-lg object-cover border border-border" alt="" />
                </button>
                <button onClick={() => removePhoto(idx)} className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-panel2 border border-border text-[10px] leading-none p-0.5">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Video Bölümü — ✨ Blob'a yüklenir */}
        <label className="text-[11.5px] font-bold text-muted uppercase tracking-wide">Video</label>
        <label className="flex items-center gap-2 border border-dashed border-borderlt rounded-xl px-3 py-3 text-[12px] text-muted mb-2 cursor-pointer">
          🎥 {videoBusy ? "Yükleniyor..." : "Video ekle (Max 5 adet, her biri max 100MB)"}
          <input type="file" accept="video/*" multiple onChange={handleVideos} className="hidden" />
        </label>
        {videos.length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {videos.map((v, idx) => (
              <div key={idx} className="relative">
                <video src={v.url?.startsWith("offline:") ? offlinePreviews[v.url.slice("offline:".length)] : v.url} className="w-20 h-20 rounded-lg object-cover border border-border bg-black" controls={false} />
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

        <button
          onClick={submit} disabled={submitting || videoBusy || !chosenType}
          className="mt-2 py-3.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[14.5px] shadow-lg disabled:opacity-50"
        >
          {submitting ? "Kaydediliyor..." : "✅ Bakımı Tamamla"}
        </button>
      </div>

      <Lightbox src={selectedPhoto} onClose={() => setSelectedPhoto(null)} />

      <BottomNav />
    </div>
  );
}
