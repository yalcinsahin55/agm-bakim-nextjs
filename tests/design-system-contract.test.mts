import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globals = new URL("../app/globals.css", import.meta.url);
const tailwind = new URL("../tailwind.config.ts", import.meta.url);
const sidebar = new URL("../components/Sidebar.tsx", import.meta.url);
const bottomNav = new URL("../components/BottomNav.tsx", import.meta.url);

async function text(url: URL): Promise<string> {
  return readFile(url, "utf8");
}

test("design tokens expose semantic on-colors and reduced motion support", async () => {
  const css = await text(globals);
  assert.match(css, /--color-on-amber:\s*#/);
  assert.match(css, /--color-on-teal:\s*#/);
  assert.match(css, /--color-on-green:\s*#/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.ui-button-primary/);
});

test("Tailwind maps controls to CSS variables instead of hardcoded component colors", async () => {
  const config = await text(tailwind);
  assert.match(config, /"on-amber":\s*"var\(--color-on-amber\)"/);
  assert.match(config, /"amber-bright":\s*"var\(--color-amber-bright\)"/);
  assert.match(config, /control:\s*"12px"/);
});

test("primary navigation uses the shared SVG icon primitive", async () => {
  const [sidebarText, bottomNavText] = await Promise.all([text(sidebar), text(bottomNav)]);
  assert.match(sidebarText, /@\/components\/ui\/AppIcon/);
  assert.match(bottomNavText, /@\/components\/ui\/AppIcon/);
  assert.doesNotMatch(sidebarText, /📊|⚙️|✅|📋|🔧|🧪|✦|🔐|☰|🚪/);
  assert.doesNotMatch(bottomNavText, /📊|⚙️|✅|📋|🔧|🧪|✦|🔐|☰|🚪/);
});
