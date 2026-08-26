import { MongoClient, type Db } from "mongodb";

// Vercel serverless function instance'ları arasında mümkün olduğunca aynı pool'u
// paylaşır; ancak bağlantı module import aşamasında başlatılmaz. Böylece geçici
// TLS/Atlas hatası reddedilmiş bir promise olarak warm instance'a kilitlenmez.
const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "agm_bakim";
if (!uri) {
  throw new Error("MONGO_URI ortam değişkeni tanımlı değil. Vercel > Settings > Environment Variables kısmından ekleyin.");
}
const mongoUri: string = uri;

declare global {
  var _mongoClient: MongoClient | undefined;
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const clientOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
};

function clearFailedConnection(client: MongoClient, promise: Promise<MongoClient>): void {
  if (global._mongoClientPromise === promise) global._mongoClientPromise = undefined;
  if (global._mongoClient === client) global._mongoClient = undefined;
  void client.close().catch(() => undefined);
}

function createClientPromise(): Promise<MongoClient> {
  const client = new MongoClient(mongoUri, clientOptions);
  let connectionPromise: Promise<MongoClient>;
  connectionPromise = client.connect()
    .then(() => {
      global._mongoClient = client;
      return client;
    })
    .catch((error: unknown) => {
      clearFailedConnection(client, connectionPromise);
      throw error;
    });
  global._mongoClientPromise = connectionPromise;
  return connectionPromise;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (global._mongoClient) return global._mongoClient;
  return global._mongoClientPromise ?? createClientPromise();
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
