import type { NextConfig } from "next";

const commonContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.blob.vercel-storage.com",
  "media-src 'self' blob: https://*.blob.vercel-storage.com",
  "connect-src 'self' https://*.blob.vercel-storage.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'self'",
  "form-action 'self'",
].join('; ');

const oilAnalysisContentSecurityPolicy = `${commonContentSecurityPolicy}; frame-ancestors 'self'`;

const nextConfig: NextConfig = {
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
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: commonContentSecurityPolicy },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
      {
        source: "/api/oil-analyses/:id/file",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: oilAnalysisContentSecurityPolicy },
        ],
      },
      {
        source: "/api/records/:id/attachments/:attachmentId",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: oilAnalysisContentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
