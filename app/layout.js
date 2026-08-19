import "@/app/globals.css"; // Veya kullandığın css dosyasının adı neyse
import { Toaster } from "sonner";

export const metadata = {
  title: "AGM Motor Bakım Merkezi",
  description: "Profesyonel motor bakım takip sistemi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {/* PC'de ekranın ortasında, mobilde tam ekran durması için ana kapsayıcı */}
        <div className="min-h-screen flex flex-col max-w-5xl mx-auto bg-white shadow-2xl">
          {children}
        </div>
        
        {/* Modern Bildirimler (Toast) */}
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
