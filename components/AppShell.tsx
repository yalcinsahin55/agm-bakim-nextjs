"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import RoleGuard from "@/components/RoleGuard";

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const isPublicRoute = pathname === "/login";
  const isWideWorkspace = pathname === "/teknisyen-yetkilendirme";

  return (
    <>
      {!isPublicRoute && <Sidebar />}
      <div className={isPublicRoute ? "min-h-screen" : "min-h-screen md:ml-64"}>
        <div className={isWideWorkspace ? "w-full" : "mx-auto max-w-5xl md:border-x md:border-border"}>
          <RoleGuard>{children}</RoleGuard>
        </div>
      </div>
    </>
  );
}
