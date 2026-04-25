import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { verifyAuthToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: { status?: number }) {
  const res = NextResponse.json(body, { status: init?.status });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function POST(req: Request) {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, description, language } = await req.json();
    if (!name || !description) {
      return jsonNoStore({ error: "Missing fields" }, { status: 400 });
    }

    const trimmedName = String(name).trim();
    const trimmedDesc = String(description).trim();
    if (!trimmedName || !trimmedDesc) {
      return jsonNoStore({ error: "Missing fields" }, { status: 400 });
    }

    const db = await getDb();
    const rooms = db.collection("rooms");

    let code = generateInviteCode();
    for (let i = 0; i < 5; i++) {
      const existing = await rooms.findOne({ code });
      if (!existing) break;
      code = generateInviteCode();
    }

    const now = new Date();
    const trimmedLang = String(language || "javascript").trim().toLowerCase();

    const doc = {
      code,
      name: trimmedName,
      description: trimmedDesc,
      language: trimmedLang,
      createdBy: verified.payload.sub,
      createdAt: now,
      updatedAt: now,
      stats: {
        totalStudents: 0,
        handsRaised: 0,
        submitted: 0,
      },
    };

    await rooms.insertOne(doc);

    return jsonNoStore(
      {
        ok: true,
        room: {
          code: doc.code,
          name: doc.name,
          description: doc.description,
          language: doc.language,
          stats: doc.stats,
        },
      },
      { status: 201 },
    );
  } catch {
    return jsonNoStore({ error: "Internal Server Error" }, { status: 500 });
  }
}
