"use client";

import { memo, useMemo, useState, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  accessor?: (row: T) => string | number | Date | null | undefined;
  sortable?: boolean;
  filterable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  empty?: ReactNode;
  pageSize?: number;
  pageSizeOptions?: number[];
  filterPlaceholder?: string;
}

type SortState = { key: string; direction: "asc" | "desc" } | null;

function normalize(value: string | number | Date | null | undefined): string | number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return String(value ?? "").toLocaleLowerCase("tr-TR");
}

function DataTableInner<T>({ rows, columns, getRowKey, empty = "Kayıt bulunamadı.", pageSize = 10, pageSizeOptions = [10, 25, 50], filterPlaceholder = "Kolonda filtrele..." }: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);

  const filteredRows = useMemo(() => rows.filter((row) => columns.every((column) => {
    const query = filters[column.key]?.trim().toLocaleLowerCase("tr-TR");
    if (!query || !column.filterable || !column.accessor) return true;
    return String(column.accessor(row) ?? "").toLocaleLowerCase("tr-TR").includes(query);
  })), [columns, filters, rows]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column?.accessor) return filteredRows;
    return [...filteredRows].sort((left, right) => {
      const a = normalize(column.accessor?.(left));
      const b = normalize(column.accessor?.(right));
      const result = a < b ? -1 : a > b ? 1 : 0;
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, filteredRows, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / currentPageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = sortedRows.slice((safePage - 1) * currentPageSize, safePage * currentPageSize);

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortable || !column.accessor) return;
    setPage(1);
    setSort((current) => current?.key !== column.key ? { key: column.key, direction: "asc" } : current.direction === "asc" ? { key: column.key, direction: "desc" } : null);
  }

  function updateFilter(key: string, value: string) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-panel2 text-[10px] uppercase tracking-wide text-muted">
            <tr>{columns.map((column) => <th key={column.key} className={`px-3 py-2 font-bold ${column.className || ""}`}>
              <button type="button" onClick={() => toggleSort(column)} disabled={!column.sortable || !column.accessor} className={`inline-flex items-center gap-1 text-left ${column.sortable && column.accessor ? "cursor-pointer hover:text-text" : "cursor-default"}`}>
                {column.header}
                {sort?.key === column.key && <span aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span>}
              </button>
              {column.filterable && column.accessor && <input value={filters[column.key] || ""} onChange={(event) => updateFilter(column.key, event.target.value)} placeholder={filterPlaceholder} aria-label={`${String(column.header)} filtrele`} className="mt-1 block min-w-20 w-full rounded border border-border bg-panel px-1.5 py-1 text-[10px] font-normal normal-case tracking-normal text-text outline-none focus:border-teal" />}
            </th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => <tr key={getRowKey(row, (safePage - 1) * currentPageSize + index)} className="border-t border-border transition-colors hover:bg-panel2/70">{columns.map((column) => <td key={column.key} className={`px-3 py-2.5 text-text ${column.className || ""}`}>{column.render(row, (safePage - 1) * currentPageSize + index)}</td>)}</tr>)}
          </tbody>
        </table>
        {visibleRows.length === 0 && <div className="p-8 text-center text-sm text-muted">{empty}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>{sortedRows.length} kayıt · Sayfa {safePage}/{totalPages}</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">Sayfa boyutu<select value={currentPageSize} onChange={(event) => { setCurrentPageSize(Number(event.target.value)); setPage(1); }} className="rounded border border-border bg-panel2 px-1.5 py-1 text-[11px] text-text"><option value={currentPageSize}>{currentPageSize}</option>{pageSizeOptions.filter((size) => size !== currentPageSize).map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} className="rounded border border-border px-2 py-1 disabled:opacity-40">←</button>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="rounded border border-border px-2 py-1 disabled:opacity-40">→</button>
        </div>
      </div>
    </div>
  );
}

const DataTable = memo(DataTableInner) as typeof DataTableInner;
export default DataTable;
