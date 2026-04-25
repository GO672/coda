import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI as string;
if (!uri) {
  throw new Error("MONGODB_URI is not set");
}

let client: MongoClient | null = null;
let promise: Promise<MongoClient> | null = null;

export async function getMongoClient() {
  if (client) return client;
  if (!promise) {
    promise = new MongoClient(uri).connect().then((c: MongoClient) => {
      client = c;
      return c;
    });
  }
  return promise;
}

export async function getDb(dbName?: string) {
  const c = await getMongoClient();
  return c.db(dbName);
}
