import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// ✏️ DÜZELTME: Sistemin gerçek cookie adı "agm_session"
const COOKIE_NAME = "agm_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
];

const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/icon", "/manifest"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Let public routes through
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return redirectToLogin(req);
  }

  try {
    // Must use the same secret as lib/auth.js
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION"
    );
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (err) {
    // Token is invalid or expired
    const response = redirectToLogin(req);
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

function redirectToLogin(req) {
  const loginUrl = new URL("/login", req.url);
  if (req.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
