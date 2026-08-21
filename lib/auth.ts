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

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;

export async function getCurrentUser(
  req: CookieReadableRequest,
  usersCol: Collection<User>
): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  const user = await usersCol.findOne({ _id: userId });
  if (!user || user.active === false) return null;

  return user;
}
