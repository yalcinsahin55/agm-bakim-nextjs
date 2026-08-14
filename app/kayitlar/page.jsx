'use client';

import { useState, useEffect, useMemo } from 'react';

export default function KayitlarPage() {
  const [records, setRecords] = useState([]);
  const [engines, setEngines] = useState([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtreleme State'leri
  const [selectedEngine, setSelectedEngine] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal / Medya Önizleme State'leri
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Verileri API'den Çekme
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [recordsRes, enginesRes, typesRes] = await Promise.all([
        fetch('/api/records'),
        fetch('/api/engines'),
        fetch('/api/maintenance-types'),
      ]);

      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setRecords(data);
      }
      if (enginesRes.ok) {
        const data = await enginesRes.json();
        setEngines(data);
      }
      if (typesRes.ok) {
        const data = await typesRes.json();
        setMaintenanceTypes(data);
      }
    } catch (err) {
      console.error('Veriler yüklenirken hata oluştu:', err);
    } finally {
      setLoading(false);
    }
  };

  // Silme İşlemi
  const handleDeleteGroup = async (recordIds) => {
    if (!confirm('Bu bakım kaydını silmek istediğinize emin misiniz?')) return;

    try {
      setDeletingId(recordIds[0]);
      for (const id of recordIds) {
        await fetch(`/api/records/${id}`, { method: 'DELETE' });
      }
      fetchData();
    } catch (err) {
      alert('Silme işleminde hata oluştu.');
    } finally {
      setDeletingId(null);
    }
  };

  // 1. Arama ve Filtreleme İşlemi
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const matchEngine =
        selectedEngine === 'ALL' ||
        String(rec.engine_id || rec.engine) === String(selectedEngine);

      const matchType =
        selectedType === 'ALL' ||
        rec.maintenance_type === selectedType ||
        rec.type === selectedType;

      const searchLower = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        (rec.notes && rec.notes.toLowerCase().includes(searchLower)) ||
        (rec.engine_name && rec.engine_name.toLowerCase().includes(searchLower)) ||
        (rec.maintenance_type && rec.maintenance_type.toLowerCase().includes(searchLower));

      return matchEngine && matchType && matchSearch;
    });
  }, [records, selectedEngine, selectedType, searchTerm]);

  // 2. Aynı gün/saat ve aynı motor için ÇİFT KAYITLARI BİRLEŞTİRME (Gruplama)
  const groupedRecords = useMemo(() => {
    const groups = {};

    filteredRecords.forEach((record) => {
      const engineId = record.engine_id || record.engine || 'UNKNOWN';
      // Tarihi dakikalık hassasiyetle grupluyoruz (Aynı anda girilen bakımları birleştirir)
      const dateKey = record.date
        ? new Date(record.date).toISOString().slice(0, 16)
        : record._id;

      const groupKey = `${engineId}_${dateKey}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          ids: [record._id || record.id],
          engine_id: engineId,
          engine_name: record.engine_name || `Motor #${engineId}`,
          date: record.date,
          maintenance_types: record.maintenance_type || record.type ? [record.maintenance_type || record.type] : [],
          hours: record.hours || record.engine_hours || null,
          images: Array.from(new Set(record.images || record.photos || [])),
          videos: Array.from(new Set(record.videos || [])),
          notes: record.notes ? [record.notes] : [],
          performed_by: record.performed_by || record.user || null,
        };
      } else {
        groups[groupKey].ids.push(record._id || record.id);

        const typeName = record.maintenance_type || record.type;
        if (typeName && !groups[groupKey].maintenance_types.includes(typeName)) {
          groups[groupKey].maintenance_types.push(typeName);
        }

        const newImages = record.images || record.photos || [];
        if (newImages.length > 0) {
          groups[groupKey].images = Array.from(
            new Set([...groups[groupKey].images, ...newImages])
          );
        }

        const newVideos = record.videos || [];
        if (newVideos.length > 0) {
          groups[groupKey].videos = Array.from(
            new Set([...groups[groupKey].videos, ...newVideos])
          );
        }

        if (record.notes && !groups[groupKey].notes.includes(record.notes)) {
          groups[groupKey].notes.push(record.notes);
        }
      }
    });

    return Object.values(groups).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [filteredRecords]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 pb-24 md:p-6 space-y-6">
      {/* Üst Başlık */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bakım Kayıtları</h1>
          <p className="text-sm text-slate-400">
            Yapılan tüm bakım ve servis geçmişini görüntüleyin
          </p>
        </div>
        <div className="text-xs bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 self-start md:self-auto">
          Toplam Kayıt: <span className="font-semibold text-amber-400">{groupedRecords.length}</span>
        </div>
      </div>

      {/* Filtreleme Barları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Motor</label>
          <select
            value={selectedEngine}
            onChange={(e) => setSelectedEngine(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tüm Motorlar</option>
            {engines.map((e) => (
              <option key={e._id || e.id} value={e.engine_id || e.id}>
                {e.name || `Motor ${e.engine_id}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Bakım Türü</label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tüm Bakım Türleri</option>
            {maintenanceTypes.map((t, idx) => (
              <option key={idx} value={t.name || t.key || t}>
                {t.name || t.key || t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Arama</label>
          <input
            type="text"
            placeholder="Notlarda veya motorlarda ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Yükleniyor Veya Boş Liste Durumu */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Kayıtlar yükleniyor...</div>
      ) : groupedRecords.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-800 text-slate-400">
          Kriterlere uygun bakım kaydı bulunamadı.
        </div>
      ) : (
        /* Kayıt Kartları Listesi */
        <div className="space-y-4">
          {groupedRecords.map((item, index) => (
            <div
              key={index}
              className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-4 shadow-md hover:border-slate-600 transition-all space-y-3"
            >
              {/* Kart Üst Bilgisi */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-700/50 pb-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-lg text-amber-400">
                      {item.engine_name}
                    </span>
                    {item.hours && (
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                        {item.hours} Saat
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {item.date ? new Date(item.date).toLocaleString('tr-TR') : 'Tarih Belirtilmemiş'}
                    {item.performed_by && ` • Yapan: ${item.performed_by}`}
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteGroup(item.ids)}
                  disabled={deletingId === item.ids[0]}
                  className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1 rounded transition border border-rose-500/20"
                >
                  {deletingId === item.ids[0] ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>

              {/* Birleştirilmiş Bakım Türü Etiketleri */}
              <div className="flex flex-wrap gap-1.5">
                {item.maintenance_types.length > 0 ? (
                  item.maintenance_types.map((type, tIdx) => (
                    <span
                      key={tIdx}
                      className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs px-2.5 py-1 rounded-md font-medium"
                    >
                      {type}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">Bakım Türü Girilmemiş</span>
                )}
              </div>

              {/* Açıklama / Notlar */}
              {item.notes.length > 0 && (
                <div className="text-sm text-slate-300 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                  {item.notes.join(' | ')}
                </div>
              )}

              {/* Medya Galeri Alanı (Küçük Kare Resimler ve Videolar) */}
              {(item.images.length > 0 || item.videos.length > 0) && (
                <div className="pt-2">
                  <div className="text-xs font-semibold text-slate-400 mb-2">
                    Eklentiler ({item.images.length + item.videos.length})
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {/* Görseller (Küçük Kare) */}
                    {item.images.map((imgUrl, iIdx) => (
                      <div
                        key={iIdx}
                        onClick={() => setSelectedImage(imgUrl)}
                        className="w-20 h-20 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 cursor-pointer hover:opacity-80 transition relative shrink-0"
                      >
                        <img
                          src={imgUrl}
                          alt="Bakım Görseli"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}

                    {/* Videolar (Küçük Kare + Oynat İkonu) */}
                    {item.videos.map((videoUrl, vIdx) => (
                      <div
                        key={vIdx}
                        onClick={() => setSelectedVideo(videoUrl)}
                        className="relative w-20 h-20 bg-slate-950 rounded-lg overflow-hidden cursor-pointer border border-slate-700 hover:border-amber-500 transition group shrink-0 flex items-center justify-center"
                      >
                        <video
                          src={videoUrl}
                          className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition">
                          <div className="w-8 h-8 rounded-full bg-amber-500/90 text-slate-950 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                            ▶
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* BÜYÜK VİDEO OYNATICI MODAL */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-950">
              <span className="text-sm font-medium text-slate-300">Video Önizleme</span>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>
            <div className="p-2 bg-black flex items-center justify-center">
              <video
                src={selectedVideo}
                controls
                autoPlay
                className="max-h-[75vh] w-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* BÜYÜK RESİM İNCELEME MODAL */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 text-white bg-slate-900/80 hover:bg-slate-800 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border border-slate-700 z-10"
            >
              ✕
            </button>
            <div className="p-2 bg-black flex items-center justify-center">
              <img
                src={selectedImage}
                alt="Büyük Görsel"
                className="max-h-[80vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
