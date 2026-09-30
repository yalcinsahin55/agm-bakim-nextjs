"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import RoleGuard from "@/components/RoleGuard";
import ScrollToTop from "@/components/ScrollToTop";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import { useSidebarCollapsed } from "@/lib/useSidebarCollapsed";
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const isPublicRoute = pathname === "/login";
  const isWideWorkspace = pathname === "/teknisyen-yetkilendirme";
  const [sidebarCollapsed] = useSidebarCollapsed();

  return (
    <>
      {!isPublicRoute && <Sidebar />}
      <div className={isPublicRoute ? "min-h-screen" : `min-h-screen transition-[margin] duration-200 ${sidebarCollapsed ? "md:ml-[76px]" : "md:ml-64"}`}>
        <div className={isWideWorkspace ? "w-full" : "mx-auto max-w-5xl md:border-x md:border-border"}>
          <RoleGuard>{children}</RoleGuard>
        </div>
      </div>
      {!isPublicRoute && <ScrollToTop />}
      {!isPublicRoute && <KeyboardShortcuts />}
    </>
  );
}
