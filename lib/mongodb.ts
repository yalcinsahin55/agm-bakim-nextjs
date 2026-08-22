import { MongoClient, type Db } from "mongodb";

// Serverless ortamda (Vercel) her fonksiyon çağrısında yeni bağlantı açmamak için
// global önbellek kullanılır — MongoDB Atlas'ın önerdiği standart yöntemdir.

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "agm_bakim";

if (!uri) {
  throw new Error("MONGO_URI ortam değişkeni tanımlı değil. Vercel > Settings > Environment Variables kısmından ekleyin.");
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (!global._mongoClientPromise) {
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    serverSelectionTimeoutMS: 8000,
  });

  global._mongoClientPromise = client.connect();
}

const clientPromise = global._mongoClientPromise;

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
}
