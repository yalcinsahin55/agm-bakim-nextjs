export const KRITIK_ESIK = 100;
export const YAKLASIYOR_ESIK = 250;

export const STATUS_LABELS = {
  gecikmis: "Gecikmiş",
  kritik: "Kritik",
  yaklasiyor: "Yaklaşıyor",
  normal: "Normal",
};

export const STATUS_COLORS = {
  gecikmis: "#ef4a52",
  kritik: "#f2994a",
  yaklasiyor: "#f0c93d",
  normal: "#33c98a",
};

export const ROLE_LABELS = {
  yonetici: "Yönetici",
  planlamaci: "Planlamacı",
  teknisyen: "Teknisyen",
  goruntuleyici: "Görüntüleyici",
};

export function remainingHours(engineHours, lastHour, period) {
  return period - (engineHours - lastHour);
}

export function statusFor(remaining) {
  if (remaining <= 0) return "gecikmis";
  if (remaining <= KRITIK_ESIK) return "kritik";
  if (remaining <= YAKLASIYOR_ESIK) return "yaklasiyor";
  return "normal";
}

export function engineSortKey(name) {
  const digits = (name.match(/\d+/) || ["0"])[0];
  return parseInt(digits, 10);
}

export function sortEngineNames(names) {
  return [...names].sort((a, b) => engineSortKey(a) - engineSortKey(b));
}

/** Motor + bakım türü verilerinden düz bir liste (dashboard/motorlar/bakım türleri
 * sayfalarının ortak veri kaynağı) üretir. */
export function buildItems(engines, types) {
  const items = [];
  const engineMap = {};
  engines.forEach((e) => { engineMap[e._id] = e; });

  types.forEach((t) => {
    const states = t.engine_states || {};
    const applicable = Object.keys(states).length ? Object.keys(states) : Object.keys(engineMap);
    applicable.forEach((engineId) => {
      const engine = engineMap[engineId];
      if (!engine) return;
      const state = states[engineId] || {};
      const lastHour = state.last_maintenance_hour ?? 0;
      const period = state.period_hours ?? t.default_period_hours;
      const remaining = remainingHours(engine.hours, lastHour, period);
      items.push({
        engine_id: engineId,
        engine_name: engine.name,
        type_key: t.key,
        type_label: t.label,
        engine_hours: engine.hours,
        last_hour: lastHour,
        period,
        remaining,
        status: statusFor(remaining),
      });
    });
  });

  return items;
}
