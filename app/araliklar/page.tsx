"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import Skeleton from "@/components/Skeleton";
import EngineBadge from "@/components/EngineBadge";
import { engineSortKey } from "@/lib/status";
import { ApiFetchError, cachedFetch } from "@/lib/apiCache";

interface SummaryEntry {
  _id: string;
  created_at: string | Date;
  hour_at_completion: number | string;
  technician_name?: string;
}

interface SummaryGroup {
  key: string;
  engine_id: string;
  engine_name: string;
  type_key: string;
  type_label: string;
  count: number;
  first: SummaryEntry;
  last: SummaryEntry;
  average_interval: number | null;
}

interface DetailRecord extends SummaryEntry {
  type_label: string;
}

interface GroupDetails {
  records: DetailRecord[];
  total: number;
  page: number;
  totalPages: number;
}

interface EngineSummary {
  _id: string;
  name: string;
  maintenance_count?: number;
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("tr-TR");
}

function formatDateTime(value: string | Date | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function formatHours(value: number | string | undefined): string {
  const hours = Number(value);
  return Number.isFinite(hours) ? hours.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "—";
}

function formatHourDelta(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} saat`;
}

function latestDate(groups: SummaryGroup[]): string {
  const latest = groups
    .map((group) => new Date(group.last?.created_at).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  return latest ? formatDate(new Date(latest)) : "—";
}

export default function AraliklarPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<SummaryGroup[]>([]);
  const [engines, setEngines] = useState<EngineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [engineFilter, setEngineFilter] = useState("");
  const [engineSearch, setEngineSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Tümü");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, GroupDetails>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      cachedFetch<{ groups: SummaryGroup[] }>("/api/records/interval-summary", 15_000),
      cachedFetch<EngineSummary[]>("/api/engines?include_maintenance_counts=true", 15_000),
    ])
      .then(([summary, engineData]) => {
        const loadedGroups = Array.isArray(summary.groups) ? summary.groups : [];
        const loadedEngines = Array.isArray(engineData) ? engineData : [];
        setGroups(loadedGroups);
        setEngines(loadedEngines);
        setEngineFilter(loadedEngines[0]?.name || "");
      })
      .catch((error) => {
        if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function loadDetails(group: SummaryGroup, page = 1) {
    setDetailLoading(group.key);
    try {
      const params = new URLSearchParams({
        engine_id: group.engine_id,
        type_key: group.type_key,
        sort: "asc",
        page: String(page),
        page_size: "50",
      });
      const res = await fetch(`/api/records?${params.toString()}`);
      if (!res.ok) throw new ApiFetchError(res.status);
      const data = await res.json() as { records: DetailRecord[]; total: number; page: number; totalPages: number };
      setDetails((current) => ({
        ...current,
        [group.key]: {
          records: data.records || [],
          total: data.total || 0,
          page: data.page || page,
          totalPages: data.totalPages || 1,
        },
      }));
    } catch (error) {
      if (error instanceof ApiFetchError && error.status === 401) router.push("/login");
    } finally {
      setDetailLoading(null);
    }
  }

  function toggleGroup(group: SummaryGroup) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(group.key)) next.delete(group.key);
      else next.add(group.key);
      return next;
    });
    if (!expandedKeys.has(group.key) && !details[group.key]) void loadDetails(group);
  }

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => engineSortKey(a.engine_name) - engineSortKey(b.engine_name) || a.type_label.localeCompare(b.type_label, "tr")),
    [groups],
  );
  const sortedEngines = useMemo(
    () => [...engines].sort((a, b) => engineSortKey(a.name) - engineSortKey(b.name) || a.name.localeCompare(b.name, "tr")),
    [engines],
  );
  const visibleEngines = useMemo(() => {
    const search = engineSearch.trim().toLocaleLowerCase("tr-TR");
    return search ? sortedEngines.filter((engine) => engine.name.toLocaleLowerCase("tr-TR").includes(search)) : sortedEngines;
  }, [engineSearch, sortedEngines]);
  const typeNames = useMemo(
    () => Array.from(new Set(groups.map((group) => group.type_label))).sort((a, b) => a.localeCompare(b, "tr")),
    [groups],
  );
  const filteredGroups = useMemo(
    () => sortedGroups.filter((group) => (!engineFilter || group.engine_name === engineFilter) && (typeFilter === "Tümü" || group.type_label === typeFilter)),
    [engineFilter, sortedGroups, typeFilter],
  );
  const selectedEngine = sortedEngines.find((engine) => engine.name === engineFilter);
  const selectedRecordTotal = filteredGroups.reduce((total, group) => total + Number(group.count || 0), 0);
  const selectedGroupCount = filteredGroups.length;

  if (loading) {
    return (
      <div className="min-h-screen pb-20">
        <TopBar title="Bakım Aralıkları" subtitle="Motor bakım geçmişi ve periyot analizi" />
        <main className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
          <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(400px,0.38fr)_minmax(0,0.62fr)]">
            <Skeleton className="min-h-[520px] rounded-2xl" />
            <Skeleton className="min-h-[520px] rounded-2xl" />
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <TopBar title="Bakım Aralıkları" subtitle={`${sortedEngines.length} motor · bakım aralıkları listeleniyor`} />
      <main className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
        <div className="mb-4 flex flex-col justify-between gap-3 border-b border-border pb-4 lg:flex-row lg:items-end">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">Kayıt analizi</div>
            <h1 className="text-xl font-extrabold tracking-tight text-text md:text-2xl">Bakım aralıklarını incele</h1>
            <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">Tüm motorları tek ekranda seçin; seçilen motorun bakım gruplarını, kayıt sayılarını ve saat farklarını hemen görüntüleyin.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="engine-search">Motor ara</label>
            <input id="engine-search" value={engineSearch} onChange={(event) => setEngineSearch(event.target.value)} placeholder="Motor ara..." className="w-full rounded-lg border border-border bg-panel2 px-3 py-2.5 text-[11px] text-text outline-none focus:border-amber sm:w-40" />
            <label className="sr-only" htmlFor="type-filter">Bakım türü filtrele</label>
            <select id="type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-border bg-panel2 px-3 py-2.5 text-[11px] text-text outline-none focus:border-amber">
              <option value="Tümü">Bakım türü: Tümü</option>
              {typeNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <button type="button" onClick={() => { setEngineFilter(""); setTypeFilter("Tümü"); }} className={`rounded-lg border px-3 py-2.5 text-[11px] font-bold transition ${!engineFilter && typeFilter === "Tümü" ? "border-amber bg-amber text-[#161006]" : "border-border bg-panel2 text-muted hover:border-amber/50 hover:text-text"}`}>Tüm motorlar</button>
          </div>
        </div>

        <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(400px,0.38fr)_minmax(0,0.62fr)]">
          <section className="min-w-0 rounded-2xl border border-border bg-panel p-4" aria-labelledby="engine-list-heading">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">Motor seçimi</div><h2 id="engine-list-heading" className="mt-1 text-base font-extrabold text-text">Motorlar</h2><p className="mt-1 text-[10px] text-muted">{visibleEngines.length} / {sortedEngines.length} motor görünür · seçim için tıklayın</p></div>
            </div>
            {visibleEngines.length > 0 ? <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-4">{visibleEngines.map((engine) => { const selected = engine.name === engineFilter; return <button type="button" key={engine._id} onClick={() => { setEngineFilter(engine.name); }} className={`min-w-0 rounded-lg border px-2 py-2.5 text-center leading-4 transition ${selected ? "border-amber bg-amber/10 text-amber" : "border-border bg-panel2 text-muted hover:border-amber/50 hover:text-text"}`} aria-label={`${engine.name} motorunu seç`} aria-pressed={selected}><span className="block whitespace-nowrap text-[10.5px] font-bold">{engine.name}</span><span className={`mt-0.5 block text-[8.5px] ${selected ? "text-amber/80" : "text-faint"}`}>{Number(engine.maintenance_count || 0)} kayıt</span></button>; })}</div> : <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-[10.5px] text-muted">Aramanızla eşleşen motor bulunamadı.</div>}
            {engineSearch && <button type="button" onClick={() => setEngineSearch("")} className="mt-3 text-[10px] font-bold text-amber hover:underline">Tüm motorları göster →</button>}
          </section>

          <section className="min-w-0 rounded-2xl border border-border bg-panel p-4" aria-labelledby="selected-engine-heading">
            <div className="flex flex-col justify-between gap-3 border-b border-border pb-3 sm:flex-row sm:items-start">
              <div className="flex items-start gap-2.5"><EngineBadge name={selectedEngine?.name || "Tümü"} size={34} /><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">{selectedEngine ? "Seçili motor" : "Tüm motorlar"}</div><h2 id="selected-engine-heading" className="mt-1 text-xl font-extrabold text-text">{selectedEngine?.name || "Tüm Motorlar"}</h2></div></div>
              <div className="flex flex-wrap justify-end gap-2 text-right"><div className="rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="text-[8.5px] uppercase tracking-wide text-faint">Bakım türü</div><div className="mt-1 font-mono text-base font-bold text-amber">{selectedGroupCount}</div></div><div className="rounded-lg border border-border bg-panel2 px-2.5 py-2"><div className="text-[8.5px] uppercase tracking-wide text-faint">Toplam kayıt</div><div className="mt-1 font-mono text-base font-bold text-amber">{selectedRecordTotal}</div></div><div className="hidden rounded-lg border border-border bg-panel2 px-2.5 py-2 sm:block"><div className="text-[8.5px] uppercase tracking-wide text-faint">Son kayıt</div><div className="mt-1 font-mono text-[11px] font-bold text-teal">{latestDate(filteredGroups)}</div></div></div>
            </div>

            <div className="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber">Bakım aralıkları</div><h3 className="mt-1 text-base font-extrabold text-text">Bakım türleri</h3></div><div className="text-[10px] text-faint">{typeFilter === "Tümü" ? "Tüm bakım türleri" : typeFilter}</div></div>
            {filteredGroups.length > 0 ? <div className="mt-3 overflow-x-auto rounded-xl border border-border"><div className="min-w-[860px]"><div className="grid grid-cols-[minmax(220px,1.7fr)_minmax(70px,0.55fr)_minmax(145px,0.95fr)_minmax(115px,0.8fr)_minmax(115px,0.8fr)] gap-2 bg-panel2 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-faint"><span className="whitespace-nowrap">Bakım türü</span><span className="whitespace-nowrap">Kayıt</span><span className="whitespace-nowrap">Ortalama aralık</span><span className="whitespace-nowrap">İlk kayıt</span><span className="whitespace-nowrap">Son kayıt</span></div>{filteredGroups.map((group) => { const groupDetails = details[group.key]; const expanded = expandedKeys.has(group.key); const entries = groupDetails?.records || []; return <div key={group.key} className="border-t border-border"><button type="button" onClick={() => toggleGroup(group)} className="grid w-full grid-cols-[minmax(220px,1.7fr)_minmax(70px,0.55fr)_minmax(145px,0.95fr)_minmax(115px,0.8fr)_minmax(115px,0.8fr)] gap-2 px-3 py-3 text-left transition hover:bg-panel2/70"><span className="min-w-0 whitespace-nowrap text-[10.5px] font-bold text-text">{group.type_label}</span><span className="whitespace-nowrap text-[10px] text-muted">{group.count}</span><span className="whitespace-nowrap font-mono text-[10px] text-amber">{group.average_interval === null ? "—" : `${group.average_interval.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} sa`}</span><span className="whitespace-nowrap text-[10px] text-muted">{formatDate(group.first?.created_at)}</span><span className="flex items-center justify-between gap-2 whitespace-nowrap text-[10px] text-muted"><span>{formatDate(group.last?.created_at)}</span><span className="text-amber">{expanded ? "⌃" : "⌄"}</span></span></button>{expanded && <div className="border-t border-border bg-panel2/40"><div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-wide text-amber">Kayıt ayrıntıları açık</span><button type="button" onClick={() => toggleGroup(group)} className="rounded-md border border-border px-2 py-1 text-[9px] font-bold text-muted hover:border-amber/50 hover:text-text">Ayrıntıyı kapat</button></div>{detailLoading === group.key ? <div className="px-3 py-3 text-[10.5px] text-muted">Kayıtlar yükleniyor...</div> : entries.length > 0 ? <>{entries.map((entry, index) => {
  const previous = index > 0 ? entries[index - 1] : null;
  const currentHours = Number(entry.hour_at_completion);
  const previousHours = previous ? Number(previous.hour_at_completion) : null;
  const delta = previous && Number.isFinite(currentHours) && previousHours !== null && Number.isFinite(previousHours)
    ? currentHours - previousHours
    : null;
  return (
    <div key={entry._id} className="grid grid-cols-[28px_1fr] items-start gap-3 border-t border-border/70 px-3 py-2.5 text-[10px]">
      <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green/10 font-mono text-[9px] font-bold text-green">{(groupDetails?.page ? (groupDetails.page - 1) * 50 : 0) + index + 1}</span>
      <div className="min-w-0">
        <div className="truncate text-muted">{formatDateTime(entry.created_at)}{entry.technician_name ? ` · ${entry.technician_name}` : ""}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
          <span className="font-bold text-text">Bu bakım: {formatHours(entry.hour_at_completion)} saat</span>
          <span className={delta === null ? "text-faint" : delta < 0 ? "font-bold text-red-300" : "font-bold text-teal"}>
            {delta === null ? "İlk kayıt · fark yok" : `Önceki bakıma göre: ${formatHourDelta(delta)}`}
          </span>
        </div>
      </div>
    </div>
  );
})}{groupDetails && groupDetails.totalPages > 1 && <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2"><button type="button" disabled={groupDetails.page <= 1} onClick={() => void loadDetails(group, groupDetails.page - 1)} className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted disabled:opacity-40">Önceki</button><span className="text-[10px] text-muted">Sayfa {groupDetails.page} / {groupDetails.totalPages}</span><button type="button" disabled={groupDetails.page >= groupDetails.totalPages} onClick={() => void loadDetails(group, groupDetails.page + 1)} className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-bold text-muted disabled:opacity-40">Sonraki</button></div>}</> : <div className="px-3 py-3 text-[10.5px] text-muted">Bu bakım grubunda görüntülenecek detay kaydı bulunamadı.</div>}</div>}</div>; })}</div></div> : <div className="mt-3 rounded-xl border border-dashed border-border px-3 py-12 text-center"><div className="text-sm font-bold text-muted">Bu seçimle eşleşen bakım aralığı bulunamadı.</div><p className="mt-1 text-[10px] text-faint">Bu motor için henüz tamamlanmış kayıt olmayabilir veya bakım türü filtresini değiştirebilirsiniz.</p></div>}
            <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-faint"><span>Bir bakım türünü seçerek kayıt ayrıntılarını ve saat farklarını görüntüleyin.</span><span className="hidden sm:inline">Motor değiştirmek için sol listeden seçim yapın.</span></div>
          </section>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-panel px-3 py-2.5 text-[10px] text-muted"><span><b className="text-amber">{selectedEngine?.name || "Tüm motorlar"}</b> seçili</span><span className="hidden sm:inline">Toplam {sortedEngines.length} motor · {groups.length} bakım türü kaydı</span></div>
      </main>
      <BottomNav />
    </div>
  );
}
