import type { SVGProps } from "react";

export type AppIconName = "dashboard" | "check" | "records" | "engine" | "tool" | "chart" | "flask" | "assistant" | "menu" | "lock" | "logout" | "sun" | "moon" | "bell" | "clock" | "warning" | "hourglass";

const PATHS: Record<AppIconName, string> = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",
  check: "m5 12 4 4L19 6",
  records: "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 4h6M9 12h6M9 16h4",
  engine: "M7 7h10v10H7zM4 10h3m10 0h3M10 4v3m4-3v3m-4 10v3m4-3v3M9 10h6v4H9z",
  tool: "m14.7 6.3 3-3a6 6 0 0 0-7.8 7.8l-6.6 6.6a2.1 2.1 0 1 0 3 3l6.6-6.6a6 6 0 0 0 7.8-7.8l-3 3-2.7-.3-.3-2.7Z",
  chart: "M5 20V10m7 10V4m7 16v-7",
  flask: "M9 3h6m-5 0v6l-5.2 8.7A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.3L14 9V3m-5 10h6",
  assistant: "m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  lock: "M7 10V7a5 5 0 0 1 10 0v3m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z",
  logout: "M10 17l5-5-5-5m5 5H3m10-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5",
  sun: "M12 3v2m0 14v2M5.6 5.6 7 7m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  moon: "M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h6",
  clock: "M12 7v5l3 2m-3 5a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
  warning: "M12 4 3 20h18L12 4Zm0 6v4m0 3h.01",
  hourglass: "M6 3h12M6 21h12M8 3v4c0 2 4 3 4 5s-4 3-4 5v4m8-18v4c0 2-4 3-4 5s4 3 4 5v4",
};

export default function AppIcon({ name, size = 18, ...props }: { name: AppIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d={PATHS[name]} />
    </svg>
  );
}
