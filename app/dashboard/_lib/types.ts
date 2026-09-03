import type { PanelItem, StatusKey } from "@/lib/status";

export interface DashboardEngine {
  _id: string;
  name: string;
  hours: number;
  load_kw?: number;
}

export interface PanelResponse {
  items: PanelItem[];
  engines: DashboardEngine[];
}

export interface DashboardAssistantAnswer {
  question: string;
  title: string;
  summary: string;
  error?: boolean;
}

export interface DashboardHealthRow {
  engine: DashboardEngine;
  score: number;
  status: StatusKey;
  attention: number;
}

export const ENGINE_STATUS_PRIORITY: StatusKey[] = ["gecikmis", "kritik", "yaklasiyor", "normal"];
export const ENGINE_STATUS_VIEW: Record<StatusKey, { label: string; dot: string; bar: string; text: string }> = {
  gecikmis: { label: "Gecikmiş", dot: "bg-red", bar: "from-red to-red", text: "text-red" },
  kritik: { label: "Kritik", dot: "bg-orange", bar: "from-orange to-orange", text: "text-orange" },
  yaklasiyor: { label: "Yaklaşıyor", dot: "bg-amber", bar: "from-amber to-amber", text: "text-amber" },
  normal: { label: "Normal", dot: "bg-green", bar: "from-green to-green", text: "text-green" },
};

export const DASHBOARD_ASSISTANT_QUICK_QUESTIONS = [
  "Bu ay kaç bakım yapıldı?",
  "Hangi bakımlar gecikmiş?",
  "Bakım istatistiklerinin özeti nedir?",
  "Dış servisten hizmet alınan motorlar ve bakımlar hangileri?",
];

export function engineStatus(items: PanelItem[]): StatusKey {
  return ENGINE_STATUS_PRIORITY.find((status) => items.some((item) => item.status === status)) || "normal";
}

export function healthCardId(engineId: string): string {
  return `motor-health-${engineId.replace(/[^a-zA-Z0-9_-]/gu, "-")}`;
}

export function greetingPresentation(hour: number) {
  if (hour < 6 || hour >= 20) {
    return { title: "İyi geceler", icon: "🌙", description: "Gece bakım durumunu sakin bir özetle kontrol et.", panelClass: "border-teal/30 bg-panel2", iconClass: "border-teal/30 bg-teal/10 text-teal", titleClass: "text-teal" };
  }
  if (hour < 12) {
    return { title: "Günaydın", icon: "☀️", description: "Bugünkü bakım planına hızlıca göz at.", panelClass: "border-amber/30 bg-panel2", iconClass: "border-amber/30 bg-amber/10 text-amber", titleClass: "text-amber" };
  }
  if (hour < 18) {
    return { title: "İyi günler", icon: "☀️", description: "Motor ve bakım durumlarını güncel tut.", panelClass: "border-teal/30 bg-panel2", iconClass: "border-teal/30 bg-teal/10 text-teal", titleClass: "text-teal" };
  }
  return { title: "İyi akşamlar", icon: "🌆", description: "Günün bakım durumunu gözden geçir.", panelClass: "border-amber/30 bg-panel2", iconClass: "border-amber/30 bg-amber/10 text-amber", titleClass: "text-amber" };
}
