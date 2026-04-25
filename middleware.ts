import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("lch_token")?.value;
  if (!token) {
    const next = encodeURIComponent(`${req.nextUrl.pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/student/:path*", "/instructor/:path*"],
};
