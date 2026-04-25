import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { verifyAuthToken, signAuthToken } from "@/lib/auth";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await getDb();
    const users = db.collection("users");
    const user = await users.findOne({ _id: new ObjectId(verified.payload.sub) });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const res = NextResponse.json({
      ok: true,
      user: {
        id: String(user._id),
        username: user.username ?? "",
        name: user.name ?? "",
        email: user.email ?? "",
        createdAt: user.createdAt ?? null,
      },
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const token = (await cookies()).get("lch_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verified = verifyAuthToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");
    const userId = new ObjectId(verified.payload.sub);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    // Validate and set name
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      updates.name = name;
    }

    // Validate and set username
    if (body.username !== undefined) {
      const username = String(body.username).trim();
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return NextResponse.json({ error: "Invalid username. Use 3-20 letters, numbers, or _" }, { status: 400 });
      }
      const usernameLower = username.toLowerCase();
      const existing = await users.findOne({ usernameLower, _id: { $ne: userId } });
      if (existing) {
        return NextResponse.json({ error: "Username already in use" }, { status: 409 });
      }
      updates.username = username;
      updates.usernameLower = usernameLower;
    }

    // Validate and set email
    if (body.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      const existing = await users.findOne({ email, _id: { $ne: userId } });
      if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
      updates.email = email;
    }

    await users.updateOne({ _id: userId }, { $set: updates });

    // Fetch updated user
    const updated = await users.findOne({ _id: userId });
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Re-sign the token with updated info
    const userSafe = { id: String(updated._id), name: updated.name, email: updated.email };
    const newToken = signAuthToken(userSafe);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: String(updated._id),
        username: updated.username ?? "",
        name: updated.name ?? "",
        email: updated.email ?? "",
        createdAt: updated.createdAt ?? null,
      },
    });
    res.cookies.set({
      name: "lch_token",
      value: newToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
