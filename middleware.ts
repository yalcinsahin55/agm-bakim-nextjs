import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "agm_session";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/fonts", "/sw.js"];
// `/api/cron/refresh` session cookie değil, route içinde CRON_SECRET Bearer doğrulaması kullanır.
// Middleware yalnızca isteği route’a ulaştırır; secret kontrolü cron route’unda kalır.
const PUBLIC_EXACT_PATHS = new Set(["/icon.svg", "/manifest.json", "/manifest.webmanifest", "/api/cron/refresh"]);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function unauthorized(req: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Herkese açık yollar
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;

  // 🔐 Secret yoksa güvenli tarafı seç: kimseyi içeri alma
  if (!process.env.JWT_SECRET || !token) {
    return unauthorized(req, pathname);
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    return NextResponse.next();
  } catch {
    return unauthorized(req, pathname);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
