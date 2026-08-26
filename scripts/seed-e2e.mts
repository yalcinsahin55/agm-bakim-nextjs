import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const uri = process.env.MONGO_URI || "";
const dbName = process.env.MONGO_DB_NAME || "";
const fixtureEngineId = "e2e-engine-1";
const fixtureTypeKey = "e2e-type-1000h";

if (process.env.E2E_SEED !== "1") {
  throw new Error("E2E_SEED=1 olmadan test veritabanı seed edilemez.");
}
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/.test(uri)) {
  throw new Error("E2E seed yalnızca localhost/127.0.0.1 MongoDB bağlantısına izin verir.");
}
if (dbName !== "agm_bakim_e2e") {
  throw new Error("E2E seed yalnızca agm_bakim_e2e veritabanına izin verir.");
}

const adminIdentifier = process.env.E2E_IDENTIFIER || "e2e-admin@example.test";
const adminPassword = process.env.E2E_PASSWORD || "e2e-admin-password-123";
const viewerIdentifier = process.env.E2E_VIEWER_IDENTIFIER || "e2e-viewer@example.test";
const viewerPassword = process.env.E2E_VIEWER_PASSWORD || "e2e-viewer-password-123";

type E2EUser = {
  _id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: "yonetici" | "goruntuleyici";
  active: boolean;
  approved: boolean;
  created_at: Date;
  technician_type?: "mekanik";
  can_be_responsible?: boolean;
  can_be_support?: boolean;
  allowed_work_domains?: ["mechanical"];
};

type E2EEngine = {
  _id?: string;
  name: string;
  hours: number;
  load_kw: number;
  updated_at: Date;
  history: Array<{ date: string; hours: number; load_kw: number }>;
};

type E2EMaintenanceType = {
  _id?: string;
  key: string;
  label: string;
  default_period_hours: number;
  engine_scope: "explicit";
  work_domains: ["mechanical"];
  allow_electromechanical_support: false;
  allow_electromechanical_responsible: false;
  is_deleted: false;
  engine_states: Record<string, { last_maintenance_hour: number; period_hours: number; tracking_source: "manual" }>;
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
try {
  await client.connect();
  const db = client.db(dbName);
  const users = db.collection<E2EUser>("users");
  const engines = db.collection<E2EEngine>("engines");
  const maintenanceTypes = db.collection<E2EMaintenanceType>("maintenance_types");
  const records = db.collection("maintenance_records");

  await users.deleteMany({ _id: { $in: ["e2e-admin", "e2e-viewer"] } });
  await records.deleteMany({ engine_id: fixtureEngineId });
  const engineFixture: E2EEngine = {
    _id: fixtureEngineId,
    name: "E2E Motor 1",
    hours: 1_000,
    load_kw: 125,
    updated_at: new Date(),
    history: [],
  };
  const maintenanceTypeFixture: E2EMaintenanceType = {
    _id: fixtureTypeKey,
    key: fixtureTypeKey,
    label: "E2E 1000H Bakım",
    default_period_hours: 1_000,
    engine_scope: "explicit",
    work_domains: ["mechanical"],
    allow_electromechanical_support: false,
    allow_electromechanical_responsible: false,
    is_deleted: false,
    engine_states: {
      [fixtureEngineId]: {
        last_maintenance_hour: 0,
        period_hours: 1_000,
        tracking_source: "manual",
      },
    },
  };
  await engines.replaceOne({ _id: fixtureEngineId }, engineFixture, { upsert: true });
  await maintenanceTypes.replaceOne({ _id: fixtureTypeKey }, maintenanceTypeFixture, { upsert: true });
  await users.insertMany([
    {
      _id: "e2e-admin",
      full_name: "E2E Yönetici",
      email: adminIdentifier.toLowerCase(),
      password_hash: await bcrypt.hash(adminPassword, 4),
      role: "yonetici",
      active: true,
      approved: true,
      created_at: new Date(),
      technician_type: "mekanik",
      can_be_responsible: true,
      can_be_support: true,
      allowed_work_domains: ["mechanical"],
    },
    {
      _id: "e2e-viewer",
      full_name: "E2E Görüntüleyici",
      email: viewerIdentifier.toLowerCase(),
      password_hash: await bcrypt.hash(viewerPassword, 4),
      role: "goruntuleyici",
      active: true,
      approved: true,
      created_at: new Date(),
    },
  ]);
  console.log("E2E users and isolated engine/type fixtures seeded in agm_bakim_e2e.");
} finally {
  await client.close();
}
