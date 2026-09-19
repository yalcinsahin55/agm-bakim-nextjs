import type { ReactNode } from "react";
import Image from "next/image";
import NotificationBell from "@/components/NotificationBell";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";

interface TopBarProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

export default function TopBar({ title, subtitle, right }: TopBarProps) {
  return (
    <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur-md border-b border-border px-4 pt-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mobilde logo göster, PC'de sidebar'da zaten var */}
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-xl border border-border shadow">
            <Image src="/app-icon.png" alt="Avcıkoru Bakım" fill sizes="36px" className="object-cover" priority />
          </div>
          <div className="min-w-0">
            <div className="font-display text-xl font-bold uppercase tracking-wide truncate">{title}</div>
            {subtitle && <div className="text-[10.5px] text-faint mt-0.5 truncate">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          {right}
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
