"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Özet", icon: "📊" },
  { href: "/motorlar", label: "Motorlar", icon: "⚙️" },
  { href: "/tamamla", label: "Tamamla", icon: "✅" },
  { href: "/diger", label: "Diğer", icon: "☰" },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <div className="h-24" aria-hidden="true">
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="max-w-lg mx-auto bg-[#0f1319]/97 backdrop-blur-md border-t border-border flex px-1 pt-2 pb-5">
          {ITEMS.map((item) => {
            const active = pathname === item.href || (item.href === "/diger" && pathname.startsWith("/diger"));
            return (
              <Link
                key={item.href} href={item.href}
                className={`flex-1 flex flex-col items-center gap-1 ${active ? "text-amber" : "text-faint"}`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[9.5px] font-bold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
