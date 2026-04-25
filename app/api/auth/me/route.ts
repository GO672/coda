import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = (await cookies()).get("lch_token")?.value;
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const verified = verifyAuthToken(token);
  if (!verified.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { sub, name, email } = verified.payload;
  const res = NextResponse.json({ ok: true, user: { id: sub, name, email } }, { status: 200 });
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
