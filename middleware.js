import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Korunacak sayfalar (public olanlar hariç)
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/me",
  "/api/create-indexes",
  "/api/setup-yag-esanjoru",
];

// Statik dosyalar ve API dışındaki public rotalar
const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/icon", "/manifest"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Public rotaları atla
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Session cookie'sini kontrol et
  const token = req.cookies.get("session_token")?.value;

  if (!token) {
    return redirectToLogin(req);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch (err) {
    // Token geçersiz veya süresi dolmuş
    const response = redirectToLogin(req);
    // Geçersiz cookie'yi temizle
    response.cookies.delete("session_token");
    return response;
  }
}

function redirectToLogin(req) {
  const loginUrl = new URL("/login", req.url);
  // Kullanıcıyı, erişmeye çalıştığı sayfaya geri yönlendirmek için
  if (req.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
