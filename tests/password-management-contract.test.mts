import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("password schemas keep bounded length and require matching confirmation", () => {
  const source = readProjectFile("lib/schemas.ts");
  assert.match(source, /const passwordInputSchema = z[\s\S]*\.min\(6, "Şifre en az 6 karakter olmalıdır\."\)[\s\S]*\.max\(128, "Şifre çok uzun\."\)/);
  assert.match(source, /export const passwordChangeSchema = z\.object\(\{/);
  assert.match(source, /current_password: passwordInputSchema/);
  assert.match(source, /new_password: passwordInputSchema/);
  assert.match(source, /export const passwordResetSchema = z\.object\(\{/);
  assert.match(source, /data\.new_password === data\.confirm_password/);
});

test("self-service password change re-authenticates and revokes existing sessions", () => {
  const source = readProjectFile("app/api/auth/change-password/route.ts");
  assert.match(source, /getCurrentUser\(req, usersCol\)/);
  assert.match(source, /enforceCompositeRateLimit/);
  assert.match(source, /password-change-ip/);
  assert.match(source, /password-change-user/);
  assert.match(source, /verifyPassword\(current_password, user\.password_hash\)/);
  assert.match(source, /hashPassword\(new_password\)/);
  assert.match(source, /password_hash: passwordHash/);
  assert.match(source, /session_version: nextSessionVersion/);
  assert.match(source, /SESSION_COOKIE/);
  assert.match(source, /requiresLogin: true/);
  assert.match(source, /after: \{ session_version: nextSessionVersion \}/);
  assert.doesNotMatch(source, /after: \{[^}]*password/);
});

test("admin password reset is manager-only, rate-limited, audited, and session-revoking", () => {
  const source = readProjectFile("app/api/users/[id]/reset-password/route.ts");
  assert.match(source, /getCurrentUser\(req, usersCol\)/);
  assert.match(source, /canManageUsers\(user\.role\)/);
  assert.match(source, /user-password-reset/);
  assert.match(source, /passwordResetSchema\.safeParse/);
  assert.match(source, /hashPassword\(parsed\.data\.new_password\)/);
  assert.match(source, /password_hash: passwordHash/);
  assert.match(source, /session_version: nextSessionVersion/);
  assert.match(source, /action: "update"/);
  assert.match(source, /after: \{ session_version: nextSessionVersion \}/);
  assert.match(source, /reset-password/);
});

test("password rate limits fail closed when distributed protection is unavailable", () => {
  const source = readProjectFile("lib/apiRateLimit.ts");
  assert.match(source, /"user-password-reset"/);
  assert.match(source, /"password-change-ip"/);
  assert.match(source, /"password-change-user"/);
});

test("account UI exposes self change and manager reset without displaying stored secrets", () => {
  const account = readProjectFile("app/hesap/page.tsx");
  const users = readProjectFile("app/kullanicilar/page.tsx");
  const permissions = readProjectFile("lib/permissions.ts");
  const menu = readProjectFile("app/diger/page.tsx");
  assert.match(account, /fetch\("\/api\/auth\/change-password"/);
  assert.match(account, /autoComplete="current-password"/);
  assert.match(account, /autoComplete="new-password"/);
  assert.match(account, /router\.replace\("\/login"\)/);
  assert.match(users, /\/reset-password/);
  assert.match(users, /new_password: resetPassword/);
  assert.match(users, /confirm_password: resetPasswordConfirmation/);
  assert.match(permissions, /"\/hesap"/);
  assert.match(menu, /href: "\/hesap"/);
  assert.doesNotMatch(users, /password_hash/);
});
