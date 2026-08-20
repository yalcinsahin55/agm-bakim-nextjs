import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "agm_session";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/_next", "/icon", "/manifest"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Herkese açık yollar
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Dosya uzantılı statik istekler (svg, png, webmanifest...)
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) {
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

function unauthorized(req, pathname) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Giriş gerekli" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
