import assert from "node:assert/strict";
import test from "node:test";
import { buildQuickMaintenanceLink } from "../lib/quickMaintenanceLink.ts";

test("engine quick link encodes the engine selector and fixed mode", () => {
  const link = buildQuickMaintenanceLink({ origin: "https://example.test", engineId: "engine/7?x=1" });
  assert.equal(link, "https://example.test/tamamla?engine_id=engine%2F7%3Fx%3D1&mode=quick&plant_id=avcikoru");
});

test("type quick link encodes the type selector without adding an engine", () => {
  const link = buildQuickMaintenanceLink({ origin: "https://example.test", typeKey: "yağ değişimi" });
  assert.equal(link, "https://example.test/tamamla?type_key=ya%C4%9F+de%C4%9Fi%C5%9Fimi&mode=quick&plant_id=avcikoru");
});

test("empty selectors are omitted while quick mode remains explicit", () => {
  assert.equal(buildQuickMaintenanceLink({ origin: "" }), "/tamamla?mode=quick&plant_id=avcikoru");
});
