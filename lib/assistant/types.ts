import type { AssistantIntent, AssistantPeriod } from "@/lib/assistantPolicy";

export interface AssistantToolResponse {
  intent: AssistantIntent;
  period: AssistantPeriod;
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

export type MaintenanceWorkRow = {
  total_duration_minutes: number;
  last_duration_minutes: number;
  completed_count: number;
  last_completed_at: string | null;
};
