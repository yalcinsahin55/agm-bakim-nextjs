import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Collection } from "mongodb";
import type { User } from "./types";

// GÜVENLİK: JWT_SECRET eksikse uygulama varsayılan/güvensiz değerle başlamasın.
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET ortam değişkeni tanımlı değil! Lütfen .env dosyanızı kontrol edin.");
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const COOKIE_NAME = "agm_session";

type CookieReadableRequest = {
  cookies: {
    get: (name: string) => { value: string } | undefined;
  };
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function normalizeSessionVersion(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : 0;
}

export interface VerifiedSession {
  userId: string;
  sessionVersion?: number;
}

export async function createSessionToken(userId: string, sessionVersion = 0): Promise<string> {
  return new SignJWT({ sub: userId, session_version: normalizeSessionVersion(sessionVersion) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifySessionTokenDetails(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (typeof payload.sub !== "string") return null;
    if (payload.session_version === undefined) return { userId: payload.sub };
    if (typeof payload.session_version !== "number" || !Number.isInteger(payload.session_version) || payload.session_version < 0) return null;
    return { userId: payload.sub, sessionVersion: payload.session_version };
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string): Promise<string | null> {
  const session = await verifySessionTokenDetails(token);
  return session?.userId || null;
}

export const SESSION_COOKIE = COOKIE_NAME;

export async function getCurrentUser(
  req: CookieReadableRequest,
  usersCol: Collection<User>
): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await verifySessionTokenDetails(token);
  if (!session) return null;

  const user = await usersCol.findOne({ _id: session.userId });
  // Eski kullanıcı belgelerinde approved alanı yoksa mevcut hesaplar geriye dönük onaylı kabul edilir.
  if (!user || user.active === false || user.approved === false) return null;

  const currentVersion = normalizeSessionVersion(user.session_version);
  // Version alanı olmayan eski JWT’ler, kullanıcı version’ı ilk kez artırılana kadar çalışır.
  // Böylece deploy anında toplu logout olmaz; erişim/kimlik değişikliğinden sonra eski token geçersizleşir.
  if ((session.sessionVersion ?? 0) !== currentVersion) return null;

  return user;
}
