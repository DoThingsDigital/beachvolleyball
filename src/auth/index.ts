import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import type { EmailConfig } from "next-auth/providers";
import { z } from "zod";

import { prisma } from "@/src/db/client";
import { findUserForLogin, getMembershipsForUser } from "@/src/db/users";
import { verifyPassword } from "@/src/auth/password";
import { sendMagicLink } from "@/src/email/magic-link.v1";
import { authConfig } from "@/src/auth/config";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const magicLinkProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "E-Mail-Link",
  from: process.env.MAIL_FROM ?? "dev@localhost",
  maxAge: 15 * 60,
  options: {},
  sendVerificationRequest: sendMagicLink,
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    magicLinkProvider,
    Credentials({
      name: "Passwort",
      credentials: {
        email: { label: "E-Mail" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await findUserForLogin(parsed.data.email);
        if (!user?.passwordHash || user.anonymizedAt) return null;
        // Double-Opt-in (A1): Passwort-Login erst nach Bestätigung.
        // Magic Link bleibt möglich und verifiziert die Adresse implizit.
        if (!user.emailVerified) return null;

        const valid = await verifyPassword(
          user.passwordHash,
          parsed.data.password,
        );
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // Beim Sign-in (user gesetzt) Rollen einmal laden; danach lebt die
      // Info im JWT. Rollenwechsel greifen beim nächsten Login.
      if (user?.id) {
        token.memberships = await getMembershipsForUser(user.id);
      }
      return token;
    },
  },
});
