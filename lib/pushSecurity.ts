const DEFAULT_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
];

function allowedHosts(): string[] {
  return (process.env.PUSH_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const hostname = url.hostname.toLowerCase();
    const configured = allowedHosts();
    return DEFAULT_PUSH_HOSTS.includes(hostname)
      || hostname.endsWith(".notify.windows.com")
      || configured.includes(hostname);
  } catch {
    return false;
  }
}
