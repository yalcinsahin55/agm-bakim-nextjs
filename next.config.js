/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/assistant/export": ["./public/fonts/**/*", "./public/yesil-global-logo.jpg"],
    "/api/export/pdf": ["./public/fonts/**/*"],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY", // Clickjacking koruması
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff", // MIME sniffing koruması
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
      // API endpoint'leri için cache'i devre dışı bırak
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      // Yağ analiz PDF’si aynı-origin önizleme iframe’inde açılır; diğer tüm rotalarda DENY korunur.
      {
        source: "/api/oil-analyses/:id/file",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

module.exports = nextConfig;
