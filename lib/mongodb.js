import { MongoClient } from "mongodb";

// Serverless ortamda (Vercel) her fonksiyon çağrısında yeni bağlantı açmamak için
// global önbellek kullanılır — bu, MongoDB Atlas'ın önerdiği standart yöntemdir.

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "agm_bakim";

if (!uri) {
  throw new Error("MONGO_URI ortam değişkeni tanımlı değil. Vercel > Settings > Environment Variables kısmından ekleyin.");
}

let client;
let clientPromise;

// ✅ Düzeltilmiş
if (!global._mongoClientPromise) {
  client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 60000,
  });
  global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;

export async function getDb() {
  const client = await clientPromise;
  return client.db(dbName);
}
