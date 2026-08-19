import "@/app/globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "AGM Motor Bakım Merkezi",
  description: "Profesyonel motor bakım takip sistemi",
  manifest: "/manifest.json",
  themeColor: "#f0a23f",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AGM Bakım",
  },
};

export const viewport = {
  themeColor: "#f0a23f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AGM Bakım" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        <div className="min-h-screen flex flex-col max-w-5xl mx-auto bg-white shadow-2xl">
          {children}
        </div>
        <Toaster 
          position="top-right" 
          richColors 
          expand={false}
          closeButton
        />
      </body>
    </html>
  );
}
