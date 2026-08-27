export const AUTH_CHANGED_EVENT = "agm-auth:changed";

export function notifyAuthChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
