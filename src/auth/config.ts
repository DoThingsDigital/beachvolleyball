import type { NextAuthConfig } from "next-auth";

// Edge-sicherer Teil der Auth-Konfiguration: wird auch von der Middleware
// geladen und darf deshalb weder Prisma noch Node-only-Module importieren.
// Adapter + Provider (mit DB-Zugriff) hängen in src/auth/index.ts dran.

export type MembershipRole = "CUSTOMER" | "STAFF" | "ADMIN" | "SUPERADMIN";

export type MembershipInfo = {
  organisationId: string;
  role: MembershipRole;
};

export const STAFF_ROLES: readonly MembershipRole[] = [
  "STAFF",
  "ADMIN",
  "SUPERADMIN",
];

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      memberships: MembershipInfo[];
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    memberships?: MembershipInfo[];
  }
}

export const authConfig = {
  // Production läuft hinter einem Reverse-Proxy (Coolify/VPS) bzw. lokal
  // als `next start` für E2E: der Host kommt aus X-Forwarded-Host und ist
  // vertrauenswürdig (Auth.js wirft sonst UntrustedHost).
  trustHost: true,
  pages: {
    signIn: "/login",
    verifyRequest: "/login/link-gesendet",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      session.user.memberships = token.memberships ?? [];
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
