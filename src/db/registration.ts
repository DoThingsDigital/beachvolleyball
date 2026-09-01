import { createHash, randomBytes } from "node:crypto";

import { prisma } from "./client";

// DB-Zugriffe für Registrierung und Double-Opt-in (Ticket 1.8).
// VerificationToken wird mit Prefix "verify:" genutzt, damit sich unsere
// Bestätigungstokens nicht mit den Magic-Link-Tokens von Auth.js mischen.
// Tokens liegen nur als SHA-256-Hash in der DB.

const VERIFY_PREFIX = "verify:";
const TOKEN_TTL_MS = 15 * 60 * 1000;

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerified: true, passwordHash: true },
  });
}

export async function createCustomer(data: {
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  organisationId: string;
  termsVersion: string;
}) {
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      phone: data.phone,
      passwordHash: data.passwordHash,
      termsAcceptedVersion: data.termsVersion,
      termsAcceptedAt: new Date(),
      memberships: {
        create: { organisationId: data.organisationId, role: "CUSTOMER" },
      },
    },
  });
}

export async function createVerificationToken(email: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const identifier = `${VERIFY_PREFIX}${email}`;
  // alte Tokens der Adresse invalidieren
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashToken(raw),
      expires: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

export type ConfirmResult = "ok" | "invalid" | "expired";

export async function consumeVerificationToken(
  email: string,
  rawToken: string,
): Promise<ConfirmResult> {
  const identifier = `${VERIFY_PREFIX}${email}`;
  const tokenHash = hashToken(rawToken);
  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: tokenHash } },
  });
  if (!row) return "invalid";

  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier, token: tokenHash } },
  });
  if (row.expires < new Date()) return "expired";

  await prisma.user.update({
    where: { email },
    data: { emailVerified: new Date() },
  });
  return "ok";
}

export function findOrganisationBySlug(slug: string) {
  return prisma.organisation.findUnique({
    where: { slug },
    select: { id: true, slug: true, settings: true },
  });
}
