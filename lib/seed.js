import seedData from "./seed_data.json";
import karterHistory from "./karter_history.json";

/**
 * Veritabanı boşsa (veya kısmen doluysa) V10 dosyasından çıkarılan gerçek
 * verilerle motorları ve bakım türlerini doldurur. Var olan kayıtların
 * üzerine yazmaz — güvenle tekrar tekrar çağrılabilir.
 *
 * 🚀 OPTİMİZE: İlk çağrıda seed yapar, sonraki çağrılarda atlar.
 * Böylece her request'te boşuna DB sorgusu yapılmaz.
 */
export async function seedIfEmpty(db) {
  // ⚡ Performans: Bir kez çalıştırıldıysa atla
  if (global._seeded) return;

  const enginesCol = db.collection("engines");
  const typesCol = db.collection("maintenance_types");
  const pressureCol = db.collection("pressure_readings");

  const engineCount = await enginesCol.countDocuments();
  if (engineCount < Object.keys(seedData.engines).length) {
    const now = new Date();
    const ops = Object.entries(seedData.engines).map(([name, info]) => ({
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

  const expectedTypeCount = 1 + seedData.maintTypes.length; // +1 = yağ
  const typeCount = await typesCol.countDocuments();
  if (typeCount < expectedTypeCount) {
    const oilStates = {};
    Object.entries(seedData.oil).forEach(([name, rec]) => {
      oilStates[name] = { last_maintenance_hour: rec.changeHour, period_hours: rec.maxHours };
    });
    await typesCol.updateOne(
      { _id: "oil" },
      { $setOnInsert: { key: "oil", label: "Yağ Değişimi", default_period_hours: 700, engine_states: oilStates } },
      { upsert: true }
    );

    for (const mt of seedData.maintTypes) {
      const states = {};
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
  if (pressureCount === 0 && Array.isArray(karterHistory) && karterHistory.length) {
    const docs = karterHistory.map((r) => ({
      engine_id: r.engine, engine_name: r.engine, reading_date: new Date(r.date),
      load_kw: r.load, pressure_bar: r.pressure, status: r.status || null,
      new_type: !!r.new_type, note: null, uploaded_by: "V10 içe aktarma", created_at: new Date(),
    }));
    await pressureCol.insertMany(docs);
  }

  // ✅ Seed tamamlandı, sonraki çağrılarda atla
  global._seeded = true;
}
