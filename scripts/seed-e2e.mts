import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const uri = process.env.MONGO_URI || "";
const dbName = process.env.MONGO_DB_NAME || "";

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
};

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 });
try {
  await client.connect();
  const users = client.db(dbName).collection<E2EUser>("users");
  await users.deleteMany({ _id: { $in: ["e2e-admin", "e2e-viewer"] } });
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
  console.log("E2E test users seeded in the isolated agm_bakim_e2e database.");
} finally {
  await client.close();
}
