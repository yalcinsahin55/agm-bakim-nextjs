export type AnalysisResult = "İyi" | "Dikkat" | "Kötü";

export interface Engine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

export interface OilAnalysis {
  _id: string;
  engine_id: string;
  engine_name: string;
  analysis_date: string;
  result: string;
  note?: string;
  pdf_url?: string;
  pdf_b64?: string;
  pdf_filename: string;
  uploaded_by: string;
  uploaded_by_id: string;
  created_at: string;
}
