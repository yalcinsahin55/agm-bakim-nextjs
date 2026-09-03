import { memo, type ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T, index: number) => string;
  empty?: ReactNode;
}

function DataTableInner<T>({ rows, columns, getRowKey, empty = "Kayıt bulunamadı." }: DataTableProps<T>) {
  if (rows.length === 0) return <div className="rounded-card border border-dashed border-border p-8 text-center text-sm text-muted">{empty}</div>;

  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-panel2 text-[10px] uppercase tracking-wide text-muted">
          <tr>{columns.map((column) => <th key={column.key} className={`px-3 py-2 font-bold ${column.className || ""}`}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => <tr key={getRowKey(row, index)} className="border-t border-border transition-colors hover:bg-panel2/70">{columns.map((column) => <td key={column.key} className={`px-3 py-2.5 text-text ${column.className || ""}`}>{column.render(row, index)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

const DataTable = memo(DataTableInner) as typeof DataTableInner;
export default DataTable;
