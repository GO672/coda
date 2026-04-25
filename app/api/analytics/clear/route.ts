import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set");
    _client = await new MongoClient(uri).connect();
  }
  return _client.db();
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomCode = searchParams.get("room");
  if (!roomCode) {
    return NextResponse.json({ error: "room param required" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const col = db.collection("analytics_events");
    const r = await col.deleteMany({
      $or: [{ roomCode }, { mainRoom: roomCode }],
    });
    return NextResponse.json({ ok: true, deleted: r.deletedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
