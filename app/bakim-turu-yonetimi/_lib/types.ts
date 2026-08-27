import type { WorkDomain } from "@/lib/types";

export interface EngineRowState {
  last: string;
  period: string;
  included: boolean;
}

export const WORK_DOMAINS: WorkDomain[] = ["mechanical", "electrical", "commissioning"];
