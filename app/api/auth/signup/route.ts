import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import bcrypt from "bcryptjs";
import { signAuthToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { username, name, email, password } = await req.json();

    if (!username || !name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!/^([^\s@]+)@([^\s@]+)\.([^\s@]+)$/.test(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }
    if (!usernameRegex.test(username)) {
      return NextResponse.json({ error: "Invalid username. Use 3-20 letters, numbers, or _" }, { status: 400 });
    }

    const db = await getDb();
    const users = db.collection("users");

    const usernameLower = username.toLowerCase();
    const emailLower = email.toLowerCase();

    const existing = await users.findOne({
      $or: [{ email: emailLower }, { usernameLower }],
    });
    if (existing) {
      if (existing.email === emailLower) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
      }
      if ((existing as any).usernameLower === usernameLower) {
        return NextResponse.json({ error: "Username already in use" }, { status: 409 });
      }
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      username,
      usernameLower,
      name,
      email: emailLower,
      passwordHash: hashed,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await users.insertOne(user);

    const userSafe = { id: String(result.insertedId), name, email: emailLower };
    const token = signAuthToken(userSafe);
    const res = NextResponse.json({ ok: true, user: userSafe }, { status: 201 });
    res.cookies.set({
      name: "lch_token",
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    console.error("/api/auth/signup error", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
