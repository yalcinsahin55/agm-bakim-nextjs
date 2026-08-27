import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

test("technician navigation exposes the account and password page on desktop and mobile", () => {
  const sidebar = source("components/Sidebar.tsx");
  const bottomNav = source("components/BottomNav.tsx");
  const permissions = source("lib/permissions.ts");

  assert.match(sidebar, /const TECHNICIAN_ITEMS[\s\S]*href: "\/hesap", label: "Hesap ve Şifre"/);
  assert.match(bottomNav, /const TECHNICIAN_ITEMS[\s\S]*href: "\/hesap", label: "Şifre"/);
  assert.match(permissions, /const TECHNICIAN_ROUTES[\s\S]*"\/hesap"/);
});
