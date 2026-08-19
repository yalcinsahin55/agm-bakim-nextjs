import "@/app/globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "AGM Motor Bakım Merkezi",
  description: "Profesyonel motor bakım takip sistemi",
  manifest: "/manifest.json",
  themeColor: "#0f1319",
};

export const viewport = {
  themeColor: "#0f1319",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AGM Bakım" />
      </head>
      <body className="antialiased">
        {/* PC'de ortalanmış, kenarları çizgili şık sütun; mobilde tam ekran */}
        <div className="min-h-screen max-w-5xl mx-auto md:border-x md:border-border">
          {children}
        </div>
        <Toaster position="top-center" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
