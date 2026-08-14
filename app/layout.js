import "./globals.css";

export const metadata = {
  title: "AGM Motor Bakım Merkezi",
  description: "Profesyonel motor bakım takip ve saha yönetim sistemi",
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body className="min-h-screen font-body">
        <div className="max-w-lg mx-auto min-h-screen relative bg-bg">
          {children}
        </div>
      </body>
    </html>
  );
}
