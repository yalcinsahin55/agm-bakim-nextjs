"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import { engineSortKey } from "@/lib/status";

const INFO_FIELDS = [
  ["kaver_tipi", "Kaver Tipi"],
  ["hava_filtresi", "Hava Filtresi"],
  ["krankcase", "Krankcase"],
  ["esanjor_tipi", "Eşanjör Tipi"],
  ["dungs", "Dungs"],
  ["radyator_tipi", "Radyatör Tipi"],
];

export default function RaporPage() {
  const router = useRouter();
  const [engines, setEngines] = useState([]);
  const [infoList, setInfoList] = useState([]);
  const [records, setRecords] = useState([]);
  const [engineId, setEngineId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/engines"), fetch("/api/equipment-info")]).then(async ([engRes, infoRes]) => {
      if (engRes.status === 401) { router.push("/login"); return; }
      const eng = await engRes.json();
      const info = infoRes.ok ? await infoRes.json() : [];
      const sortedEng = [...(Array.isArray(eng) ? eng : [])].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name));
      setEngines(sortedEng);
      setInfoList(Array.isArray(info) ? info : []);
      if (sortedEng.length) setEngineId(sortedEng[0]._id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!engineId) return;
    setLoadingRecords(true);
    fetch(`/api/records?engine_id=${encodeURIComponent(engineId)}&limit=1000`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(Array.isArray(data) ? data : []);
        setLoadingRecords(false);
      })
      .catch(() => setLoadingRecords(false));
  }, [engineId]);

  const engine = engines.find((e) => e._id === engineId);
  const info = infoList.find((i) => i.engine_name === engine?.name);

  const stats = useMemo(() => {
    const sorted = [...records].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let totalDays = 0;
    let intervals = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalDays += (new Date(sorted[i].created_at) - new Date(sorted[i - 1].created_at)) / 86400000;
      intervals++;
    }
    return {
      total: sorted.length,
      last: sorted.length ? sorted[sorted.length - 1] : null,
      avgDays: intervals ? Math.round(totalDays / intervals) : 0,
      sortedDesc: [...sorted].reverse(),
    };
  }, [records]);

  if (loading) {
    return (
      <div>
        <TopBar title="Motor Bakım Raporu" />
        <div className="px-4 py-4">
          <Skeleton className="h-12 w-full rounded-xl mb-4" />
          <Skeleton className="h-96 rounded-card" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div>
      {/* Yazdırma stilleri: menüleri gizle, kağıdı tam sayfa yap */}
      <style>{`
        @media print {
          aside, header, nav, .print-hide { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          body { background: #fff !important; }
          #rapor { border: none !important; box-shadow: none !important; border-radius: 0 !important; }
        }
        @page { margin: 12mm; }
      `}</style>

      <div className="print-hide">
        <TopBar title="Motor Bakım Raporu" subtitle="Yazdırılabilir bakım geçmişi" />
      </div>

      {/* Kontrol paneli (yazdırmada gizlenir) */}
      <div className="px-4 py-4 print-hide">
        <div className="flex gap-2">
          <select
            value={engineId}
            onChange={(e) => setEngineId(e.target.value)}
            className="flex-1 bg-panel2 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal transition"
          >
            {engines.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
          </select>
          <button
            onClick={() => window.print()}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-b from-[#f0a23f] to-amber text-[#1a1206] font-extrabold text-[13px] hover:brightness-110 active:scale-[.98] transition"
          >
            🖨️ Yazdır / PDF
          </button>
        </div>
        <p className="text-[10.5px] text-faint mt-2">💡 Yazdırma penceresinde "PDF olarak kaydet" seçersen rapor dosya olarak iner.</p>
      </div>

      {/* 📄 Rapor Kağıdı */}
      <div className="px-4 pb-8">
        {loadingRecords ? (
          <div className="text-center py-16 text-muted text-sm">Kayıtlar yükleniyor...</div>
        ) : (
          <div id="rapor" className="bg-white text-gray-900 rounded-xl border border-gray-300 shadow-xl p-6 md:p-8">
            {/* Başlık */}
            <div className="text-center border-b-2 border-gray-800 pb-4 mb-5">
              <div className="text-[18px] font-extrabold uppercase tracking-wide">Avcıkoru Santrali Bakım Merkezi</div>
              <div className="text-[12px] text-gray-600 mt-1">Motor Bakım Raporu</div>
              <div className="text-[10px] text-gray-500 mt-1">
                Rapor Tarihi: {new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            </div>

            {/* Motor bilgisi */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 text-[11px]">
              <div className="border border-gray-300 rounded p-2">
                <div className="text-gray-500 text-[9px] uppercase font-bold">Motor</div>
                <div className="font-bold text-[13px]">{engine?.name || "—"}</div>
              </div>
              <div className="border border-gray-300 rounded p-2">
                <div className="text-gray-500 text-[9px] uppercase font-bold">Güncel Saat</div>
                <div className="font-bold font-mono text-[13px]">{(engine?.hours || 0).toLocaleString("tr-TR")} sa</div>
              </div>
              <div className="border border-gray-300 rounded p-2">
                <div className="text-gray-500 text-[9px] uppercase font-bold">Yük</div>
                <div className="font-bold font-mono text-[13px]">{(engine?.load_kw || 0).toLocaleString("tr-TR")} kW</div>
              </div>
              <div className="border border-gray-300 rounded p-2">
                <div className="text-gray-500 text-[9px] uppercase font-bold">Toplam Bakım</div>
                <div className="font-bold font-mono text-[13px]">{stats.total}</div>
              </div>
            </div>

            {/* Teknik bilgi kartı */}
            {info && (
              <div className="mb-5">
                <div className="text-[11px] font-extrabold uppercase tracking-wide border-b border-gray-400 pb-1 mb-2">Teknik Bilgiler</div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[10.5px]">
                  {INFO_FIELDS.map(([key, label]) => info[key] ? (
                    <div key={key}><span className="text-gray-500">{label}:</span> <b>{info[key]}</b></div>
                  ) : null)}
                  {info.not && <div className="col-span-2 md:col-span-3"><span className="text-gray-500">Not:</span> {info.not}</div>}
                </div>
              </div>
            )}

            {/* Özet */}
            <div className="mb-5 text-[10.5px] text-gray-700">
              <div className="text-[11px] font-extrabold uppercase tracking-wide border-b border-gray-400 pb-1 mb-2">Özet</div>
              {stats.last ? (
                <p>
                  Bu motor için kayıtlı <b>{stats.total}</b> bakım bulunmaktadır.
                  Son bakım <b>{new Date(stats.last.created_at).toLocaleDateString("tr-TR")}</b> tarihinde
                  (<b>{stats.last.type_label}</b>) yapılmıştır.
                  Bakımlar arası ortalama süre <b>{stats.avgDays} gün</b>dür.
                </p>
              ) : (
                <p>Bu motor için henüz bakım kaydı bulunmamaktadır.</p>
              )}
            </div>

            {/* Bakım geçmişi tablosu */}
            <div className="text-[11px] font-extrabold uppercase tracking-wide border-b border-gray-400 pb-1 mb-2">Bakım Geçmişi</div>
            {stats.sortedDesc.length === 0 ? (
              <p className="text-[10.5px] text-gray-500">Gösterilecek kayıt yok.</p>
            ) : (
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-1.5 py-1 text-left">#</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Tarih</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Bakım Türü</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-right">Saat</th>
                    <th className="border border-gray-300 px-1.5 py-1 text-left">Teknisyen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sortedDesc.map((r, idx) => (
                    <tr key={r._id} className={idx % 2 === 1 ? "bg-gray-50" : ""}>
                      <td className="border border-gray-300 px-1.5 py-1 text-gray-500">{idx + 1}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{new Date(r.created_at).toLocaleDateString("tr-TR")}</td>
                      <td className="border border-gray-300 px-1.5 py-1 font-semibold">{r.type_label}</td>
                      <td className="border border-gray-300 px-1.5 py-1 text-right font-mono">{r.hour_at_completion.toLocaleString("tr-TR")}</td>
                      <td className="border border-gray-300 px-1.5 py-1">{r.technician_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* İmza alanı */}
            <div className="grid grid-cols-2 gap-8 mt-10 text-[10px] text-gray-600">
              <div className="border-t border-gray-400 pt-1 text-center">Hazırlayan</div>
              <div className="border-t border-gray-400 pt-1 text-center">Onaylayan</div>
            </div>
          </div>
        )}
      </div>

      <div className="print-hide">
        <BottomNav />
      </div>
    </div>
  );
}
