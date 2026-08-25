import { enginesCollection, maintenanceTypesCollection, pressureReadingsCollection } from "@/lib/dbCollections";
import type { Db } from "mongodb";
import { seedData, karterHistory } from "./seed_data";
import type { PressureReadingDocument } from "@/lib/dbTypes";

type SeedEngine = { hours: number; load?: number | null };
type SeedOil = { changeHour: number; maxHours: number; brand?: string };
type SeedMaintenanceType = { key: string; label: string; perEngine: Record<string, { lastHour: number; period: number }> };
type SeedDataShape = { engines: Record<string, SeedEngine>; oil: Record<string, SeedOil>; maintTypes: SeedMaintenanceType[] };
type SeedHistoryEntry = { date: string; engine: string; load: number | null; pressure: number | null; status?: string | null; new_type?: boolean };

declare global {
  var _seeded: boolean | undefined;
}

/**
 * Veritabanı boşsa (veya kısmen doluysa) V10 dosyasından çıkarılan gerçek
 * verilerle motorları ve bakım türlerini doldurur. Var olan kayıtların
 * üzerine yazmaz — güvenle tekrar tekrar çağrılabilir.
 *
 * 🚀 OPTİMİZE: İlk çağrıda seed yapar, sonraki çağrılarda atlar.
 */
export async function seedIfEmpty(db: Db): Promise<void> {
  if (global._seeded) return;

  const data = seedData as SeedDataShape;
  const history = karterHistory as SeedHistoryEntry[];

  //  _id alanları string olduğu için koleksiyonları gevşetiyoruz
  const enginesCol = enginesCollection(db);
  const typesCol = maintenanceTypesCollection(db);
  const pressureCol = pressureReadingsCollection(db);

  const engineCount = await enginesCol.countDocuments();
  if (engineCount < Object.keys(data.engines).length) {
    const now = new Date();
    const ops = Object.entries(data.engines).map(([name, info]) => ({
      updateOne: {
        filter: { _id: name },
        update: {
          $setOnInsert: {
            name,
            hours: info.hours,
            load_kw: info.load || 0,
            updated_at: now,
            history: [{ date: now.toISOString(), hours: info.hours, load_kw: info.load || 0 }],
          },
        },
        upsert: true,
      },
    }));
    if (ops.length) await enginesCol.bulkWrite(ops);
  }

  const expectedTypeCount = 1 + data.maintTypes.length; // +1 = yağ
  const typeCount = await typesCol.countDocuments();
  if (typeCount < expectedTypeCount) {
    const oilStates: Record<string, { last_maintenance_hour: number; period_hours: number }> = {};
    Object.entries(data.oil).forEach(([name, rec]) => {
      oilStates[name] = { last_maintenance_hour: rec.changeHour, period_hours: rec.maxHours };
    });
    await typesCol.updateOne(
      { _id: "oil" },
      { $setOnInsert: { key: "oil", label: "Yağ Değişimi", default_period_hours: 700, engine_states: oilStates } },
      { upsert: true }
    );

    for (const mt of data.maintTypes) {
      const states: Record<string, { last_maintenance_hour: number; period_hours: number }> = {};
      Object.entries(mt.perEngine).forEach(([name, rec]) => {
        states[name] = { last_maintenance_hour: rec.lastHour, period_hours: rec.period };
      });
      const defaultPeriod = Object.values(states)[0]?.period_hours || 0;
      await typesCol.updateOne(
        { _id: mt.key },
        { $setOnInsert: { key: mt.key, label: mt.label, default_period_hours: defaultPeriod, engine_states: states } },
        { upsert: true }
      );
    }
  }

  const pressureCount = await pressureCol.countDocuments();
  if (pressureCount === 0 && Array.isArray(history) && history.length) {
    const docs: Array<Omit<PressureReadingDocument, "_id">> = history.map((r) => ({
      engine_id: r.engine,
      engine_name: r.engine,
      reading_date: new Date(r.date),
      load_kw: r.load,
      pressure_bar: r.pressure,
      status: r.status || null,
      new_type: !!r.new_type,
      note: null,
      uploaded_by: "V10 içe aktarma",
      created_at: new Date(),
    }));
    await pressureCol.insertMany(docs);
  }

  // ✅ Seed tamamlandı, sonraki çağrılarda atla
  global._seeded = true;
}
