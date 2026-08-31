import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig, STAFF_ROLES } from "@/src/auth/config";

// Eigene NextAuth-Instanz ohne Adapter/Provider: Die Middleware läuft auf der
// Edge-Runtime und darf Prisma nicht laden; für den Guard reicht das JWT.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user;

  if (!user) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin")) {
    const isStaff = user.memberships.some((m) =>
      STAFF_ROLES.includes(m.role),
    );
    if (!isStaff) {
      return NextResponse.redirect(new URL("/konto", req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/konto/:path*"],
};
