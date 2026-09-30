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
    <div className="sticky top-0 z-20 border-b border-border bg-bg/95 px-3 pb-2.5 pt-3 backdrop-blur-md sm:px-4 sm:pb-3 sm:pt-4">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* Mobilde logo göster, PC'de sidebar'da zaten var */}
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-xl border border-border shadow">
            <Image src="/app-icon.png" alt="Avcıkoru Bakım" fill sizes="36px" className="object-cover" priority />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-bold uppercase tracking-wide sm:text-xl">{title}</div>
            {subtitle && <div className="mt-0.5 max-w-[48vw] truncate text-[10px] text-faint sm:max-w-none sm:text-[10.5px]">{subtitle}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <NotificationBell />
          {right}
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
