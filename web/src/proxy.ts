import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth";

// Everything behind the passcode except the login screen itself.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const secret = process.env.SESSION_SECRET ?? "";
  const ok = secret
    ? await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value, secret)
    : false;
  if (!ok) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
