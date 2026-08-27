export interface HistoryEntry {
  date: string;
  hours: number;
  load_kw?: number;
}

export interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

export interface HistorySummary {
  first: HistoryEntry | null;
  last: HistoryEntry | null;
  has_load: boolean;
}

export interface HistoryResponse {
  history: HistoryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: HistorySummary;
}

export interface ChartPoint {
  y: number;
  label: string;
}

export const HISTORY_PAGE_SIZE = 250;
