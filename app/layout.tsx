import "@/app/globals.css";
import { Toaster } from "sonner";
import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";

export const metadata = {
  title: "Avcıkoru Santrali Motor Bakım Merkezi",
  description: "Profesyonel motor bakım takip sistemi",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#0f1319",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <link rel="icon" href="icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Avcıkoru Bakım" />
      </head>
      <body className="antialiased">
        {/* PC için yan menü - sadece md+ ekranlarda görünür */}
        <Sidebar />
        
        {/* Ana içerik - PC'de sidebar'ın sağına kaydırılır */}
        <div className="min-h-screen md:ml-64">
          <div className="max-w-5xl mx-auto md:border-x md:border-border">
            {children}
          </div>
        </div>
        
        {/* Mobil alt menü - sadece mobilde görünür */}
        <BottomNav />
        
        <Toaster position="top-center" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
