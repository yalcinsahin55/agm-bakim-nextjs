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
  const [sidebarCollapsed] = useSidebarCollapsed();

  return (
    <>
      {!isPublicRoute && <Sidebar />}
      <div className={isPublicRoute ? "min-h-screen" : `min-h-screen transition-[margin] duration-200 ${sidebarCollapsed ? "md:ml-[76px]" : "md:ml-64 md:max-xl:ml-[76px]"}`}>
        <div className={isPublicRoute ? "w-full" : "app-shell-content mx-auto w-full max-w-[1600px] md:border-x md:border-border"}>
          <RoleGuard>{children}</RoleGuard>
        </div>
      </div>
      {!isPublicRoute && <ScrollToTop />}
      {!isPublicRoute && <KeyboardShortcuts />}
    </>
  );
}
