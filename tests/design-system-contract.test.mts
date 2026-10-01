import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globals = new URL("../app/globals.css", import.meta.url);
const tailwind = new URL("../tailwind.config.ts", import.meta.url);
const sidebar = new URL("../components/Sidebar.tsx", import.meta.url);
const bottomNav = new URL("../components/BottomNav.tsx", import.meta.url);
const otherMenus = new URL("../app/diger/page.tsx", import.meta.url);
const dataQuality = new URL("../app/veri-kalitesi/page.tsx", import.meta.url);
const topBar = new URL("../components/TopBar.tsx", import.meta.url);
const completionSubmitBar = new URL("../app/tamamla/_components/CompletionSubmitBar.tsx", import.meta.url);
const recordCard = new URL("../components/MaintenanceRecordCard.tsx", import.meta.url);
const pwaRegister = new URL("../components/PwaRegister.tsx", import.meta.url);
const notificationBell = new URL("../components/NotificationBell.tsx", import.meta.url);
const sidebarSource = new URL("../components/Sidebar.tsx", import.meta.url);
const globalsSource = new URL("../app/globals.css", import.meta.url);
const lightbox = new URL("../components/Lightbox.tsx", import.meta.url);
const keyboardHook = new URL("../lib/useKeyboardOpen.ts", import.meta.url);
const scrollToTop = new URL("../components/ScrollToTop.tsx", import.meta.url);
const dashboardPage = new URL("../app/dashboard/page.tsx", import.meta.url);
const appShell = new URL("../components/AppShell.tsx", import.meta.url);
const detailsModal = new URL("../components/MaintenanceRecordDetailsModal.tsx", import.meta.url);
const recordFilters = new URL("../app/kayitlar/_components/RecordFilters.tsx", import.meta.url);
const themeToggle = new URL("../components/ThemeToggle.tsx", import.meta.url);
const completionHeader = new URL("../app/tamamla/_components/CompletionWorkspaceHeader.tsx", import.meta.url);
const completionDraft = new URL("../app/tamamla/_hooks/useCompletionDraft.ts", import.meta.url);
const recordsHook = new URL("../app/kayitlar/_hooks/useRecordsPageData.ts", import.meta.url);
const recordsQuery = new URL("../app/api/records/_lib/recordsQuery.ts", import.meta.url);
const dialogA11y = new URL("../lib/useDialogA11y.ts", import.meta.url);

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

test("Data Quality lives under Other Menus and uses the shared shell once", async () => {
  const [sidebarText, otherMenusText, dataQualityText] = await Promise.all([text(sidebar), text(otherMenus), text(dataQuality)]);
  assert.doesNotMatch(sidebarText, /href: "\/veri-kalitesi"/);
  assert.match(otherMenusText, /href: "\/veri-kalitesi"/);
  assert.match(dataQualityText, /<TopBar/);
  assert.doesNotMatch(dataQualityText, /import Sidebar/);
  assert.doesNotMatch(dataQualityText, /<Sidebar\s*\/>/);
  assert.match(dataQualityText, /max-w-5xl/);
});

test("mobile surfaces preserve touch targets and avoid bottom navigation overlap", async () => {
  const [topBarText, bottomNavText, submitBarText, recordCardText] = await Promise.all([text(topBar), text(bottomNav), text(completionSubmitBar), text(recordCard)]);
  assert.match(topBarText, /max-w-\[48vw\]/);
  assert.match(bottomNavText, /min-h-20/);
  assert.match(bottomNavText, /aria-label="Mobil ana navigasyon"/);
  assert.match(submitBarText, /bottom-24/);
  assert.match(submitBarText, /ui-button-primary/);
  assert.match(recordCardText, /ui-button min-h-10/);
  assert.match(recordCardText, /min-h-10/);
});

test("mobile loading avoids duplicate auth work, hidden polling, and duplicate image priority", async () => {
  const [pwaText, notificationText, sidebarText, globalsText] = await Promise.all([text(pwaRegister), text(notificationBell), text(sidebarSource), text(globalsSource)]);
  assert.match(pwaText, /cachedFetch<AuthMeResponse>\("\/api\/auth\/me", 5_000\)/);
  assert.match(notificationText, /visibilitychange/);
  assert.doesNotMatch(sidebarText, /app-icon\.png[^\n]+priority/);
  assert.match(globalsText, /\.mobile-render-defer/);
  assert.match(globalsText, /content-visibility: auto/);
});

test("mobile interactions provide reduced-motion-safe touch feedback and keyboard affordances", async () => {
  const [globalsText, bottomNavText, submitBarText, lightboxText, keyboardText, scrollText, cardText] = await Promise.all([
    text(globals), text(bottomNav), text(completionSubmitBar), text(lightbox), text(keyboardHook), text(scrollToTop), text(recordCard),
  ]);
  assert.match(globalsText, /touch-action: manipulation/);
  assert.match(globalsText, /skeleton-shimmer/);
  assert.match(globalsText, /mobile-nav-hidden/);
  assert.match(bottomNavText, /requestAnimationFrame/);
  assert.match(bottomNavText, /useKeyboardOpen/);
  assert.match(submitBarText, /keyboardOpen \? "bottom-0" : "bottom-24"/);
  assert.match(submitBarText, /triggerHaptic/);
  assert.match(lightboxText, /onPointerMove/);
  assert.match(lightboxText, /dragY > 80/);
  assert.match(keyboardText, /visualViewport/);
  assert.match(scrollText, /Sayfanın başına git/);
  assert.match(cardText, /İşlemler/);
});

test("desktop and cross-device refinement contracts stay present", async () => {
  const [dashboardText, shellText, sidebarText, modalText, filtersText, themeText, headerText, globalsText] = await Promise.all([
    text(dashboardPage), text(appShell), text(sidebar), text(detailsModal), text(recordFilters), text(themeToggle), text(completionHeader), text(globals),
  ]);
  assert.match(dashboardText, /Bugünün odağı/);
  assert.match(dashboardText, /StatCards/);
  assert.match(shellText, /md:ml-\[76px\]/);
  assert.match(sidebarText, /Kenar çubuğunu daralt/);
  assert.match(sidebarText, /data-collapsed/);
  assert.match(modalText, /md:ml-auto/);
  assert.match(modalText, /app:escape/);
  assert.match(filtersText, /Filtreleri/);
  assert.match(filtersText, /activeFilterCount/);
  assert.match(themeText, /prefers-color-scheme/);
  assert.match(headerText, /STEPS/);
  assert.match(globalsText, /report-desktop-table thead/);
});

test("drafts, advanced filters, and dialog accessibility contracts stay present", async () => {
  const [draftText, hookText, queryText, a11yText, detailsText] = await Promise.all([
    text(completionDraft), text(recordsHook), text(recordsQuery), text(dialogA11y), text(detailsModal),
  ]);
  assert.match(draftText, /localStorage/);
  assert.match(draftText, /savedAt/);
  assert.match(hookText, /technician_id/);
  assert.match(hookText, /from_date/);
  assert.match(hookText, /router.replace/);
  assert.match(queryText, /maintenanceDateQuery/);
  assert.match(queryText, /technicianId/);
  assert.match(a11yText, /focusables/);
  assert.match(a11yText, /previousFocusRef/);
  assert.match(detailsText, /aria-labelledby="maintenance-details-title"/);
});


test("Excel imports validate before writing and expose row-level preview results", async () => {
  const [routeText, pageText] = await Promise.all([text(new URL("../app/api/import/hours/route.ts", import.meta.url)), text(new URL("../app/excel/page.tsx", import.meta.url))]);
  assert.match(routeText, /preview === true/);
  assert.match(routeText, /errors/);
  assert.match(pageText, /Önizle ve doğrula/);
  assert.match(pageText, /Onayla ve içe aktar/);
  assert.match(pageText, /preview\.errors/);
});

test("delay reasons are typed, persisted, reported, and visible in completion UI", async () => {
  const [schemaText, payloadText, insertText, analyticsText, statsText, evidenceText] = await Promise.all([
    text(new URL("../lib/schemas.ts", import.meta.url)),
    text(new URL("../app/tamamla/_lib/completionPayload.ts", import.meta.url)),
    text(new URL("../app/api/records/_lib/recordCreateInsert.ts", import.meta.url)),
    text(new URL("../app/api/analytics/summary/route.ts", import.meta.url)),
    text(new URL("../app/istatistik/page.tsx", import.meta.url)),
    text(new URL("../app/tamamla/_components/CompletionEvidenceSection.tsx", import.meta.url)),
  ]);
  assert.match(schemaText, /delay_reason/);
  assert.match(payloadText, /delay_note/);
  assert.match(insertText, /delay_reason/);
  assert.match(analyticsText, /delayReasons/);
  assert.match(statsText, /Bakım gecikme nedenleri/);
  assert.match(evidenceText, /Gecikme nedeni/);
});

test("login exposes server failures to assistive technology", async () => {
  const [loginText, fieldErrorText] = await Promise.all([text(new URL("../app/login/page.tsx", import.meta.url)), text(new URL("../components/ui/FieldError.tsx", import.meta.url))]);
  assert.match(loginText, /aria-invalid/);
  assert.match(loginText, /aria-describedby/);
  assert.match(loginText, /<FieldError/);
  assert.match(fieldErrorText, /role="alert"/);
});
