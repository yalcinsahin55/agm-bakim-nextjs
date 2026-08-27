import type { QueuedMedia } from "@/lib/offlineQueue";

export interface CompletionSubmitResponse {
  completed: string[];
  confirmed?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface CompletionSubmitInput {
  payload: Record<string, unknown>;
  offlineMedia: QueuedMedia[];
  isOnline: boolean;
  queue: (payload: Record<string, unknown>, media: QueuedMedia[]) => Promise<string>;
  post: (payload: Record<string, unknown>) => Promise<Response>;
}

export type CompletionSubmitResult =
  | { kind: "queued"; shouldSync: boolean }
  | { kind: "submitted"; data: CompletionSubmitResponse }
  | { kind: "rejected"; error: string };

export async function submitCompletion(input: CompletionSubmitInput): Promise<CompletionSubmitResult> {
  if (!input.isOnline || input.offlineMedia.length > 0) {
    await input.queue(input.payload, input.offlineMedia);
    return { kind: "queued", shouldSync: input.isOnline };
  }

  const response = await input.post(input.payload);
  const data = await response.json().catch(() => ({})) as CompletionSubmitResponse;
  if (response.ok) return { kind: "submitted", data };
  return { kind: "rejected", error: data.error || "Kayıt sırasında bir hata oluştu." };
}
