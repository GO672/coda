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

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await ctx.params;
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) {
      return jsonNoStore({ error: "Missing code" }, { status: 400 });
    }

    const db = await getDb();
    const rooms = db.collection("rooms");
    const room = await rooms.findOne<{ code: string; name: string; description: string; language?: string; stats?: any; codeContent?: string }>({ code: normalized });

    if (!room) {
      return jsonNoStore({ error: "Room not found" }, { status: 404 });
    }

    return jsonNoStore(
      {
        ok: true,
        room: {
          code: room.code,
          name: room.name,
          description: room.description,
          language: room.language ?? "javascript",
          codeContent: room.codeContent ?? "",
          stats: room.stats ?? { totalStudents: 0, handsRaised: 0, submitted: 0 },
        },
      },
      { status: 200 },
    );
  } catch {
    return jsonNoStore({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await ctx.params;
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) {
      return jsonNoStore({ error: "Missing code" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const name = body?.name;
    const description = body?.description;
    const language = body?.language;

    const trimmedName = String(name ?? "").trim();
    const trimmedDesc = String(description ?? "").trim();
    if (!trimmedName || !trimmedDesc) {
      return jsonNoStore({ error: "Missing fields" }, { status: 400 });
    }

    const trimmedLang = String(language || "javascript").trim().toLowerCase();

    const db = await getDb();
    const rooms = db.collection("rooms");

    const updatedAt = new Date();
    const result = await rooms.findOneAndUpdate(
      { code: normalized },
      {
        $set: {
          name: trimmedName,
          description: trimmedDesc,
          language: trimmedLang,
          updatedAt,
        },
      },
      { returnDocument: "after" },
    );

    // MongoDB driver v6+ returns the document directly, not { value: doc }
    const room = (result as any)?.value ?? result;
    if (!room) {
      return jsonNoStore({ error: "Room not found" }, { status: 404 });
    }

    return jsonNoStore(
      {
        ok: true,
        room: {
          code: room.code,
          name: room.name,
          description: room.description,
          language: room.language ?? "javascript",
          codeContent: room.codeContent ?? "",
          stats: room.stats ?? { totalStudents: 0, handsRaised: 0, submitted: 0 },
        },
      },
      { status: 200 },
    );
  } catch {
    return jsonNoStore({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await ctx.params;
    const normalized = String(code || "").trim().toUpperCase();
    if (!normalized) {
      return jsonNoStore({ error: "Missing code" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const codeContent = body?.codeContent;
    if (typeof codeContent !== "string") {
      return jsonNoStore({ error: "Missing codeContent" }, { status: 400 });
    }

    const db = await getDb();
    const rooms = db.collection("rooms");

    await rooms.updateOne(
      { code: normalized },
      { $set: { codeContent, updatedAt: new Date() } },
    );

    return jsonNoStore({ ok: true }, { status: 200 });
  } catch {
    return jsonNoStore({ error: "Internal Server Error" }, { status: 500 });
  }
}
