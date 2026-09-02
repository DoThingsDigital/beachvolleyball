import { randomBytes } from "node:crypto";

import { prisma } from "./client";
import { hashToken } from "./registration";

// Konto-Selbstverwaltung (A1-Nachtrag): Passwort-Reset und E-Mail-Wechsel.
// Tokens liegen wie bei der Registrierung nur als SHA-256-Hash in der DB;
// Prefixe trennen die Verwendungszwecke.

const RESET_PREFIX = "pwreset:";
const EMAIL_CHANGE_PREFIX = "emailchange:";
const RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

export async function createPasswordResetToken(email: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const identifier = `${RESET_PREFIX}${email}`;
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashToken(raw),
      expires: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  return raw;
}

export type TokenResult = "ok" | "invalid" | "expired";

/** Reset-Token einlösen (einmalig); setzt noch kein Passwort. */
export async function consumePasswordResetToken(
  email: string,
  rawToken: string,
): Promise<TokenResult> {
  const identifier = `${RESET_PREFIX}${email}`;
  const tokenHash = hashToken(rawToken);
  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: tokenHash } },
  });
  if (!row) return "invalid";
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier, token: tokenHash } },
  });
  if (row.expires < new Date()) return "expired";
  return "ok";
}

export async function setPasswordByEmail(
  email: string,
  passwordHash: string,
): Promise<boolean> {
  const res = await prisma.user.updateMany({
    where: { email, anonymizedAt: null },
    data: { passwordHash, emailVerified: new Date() },
  });
  return res.count > 0;
}

export function findUserWithPassword(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, anonymizedAt: true },
  });
}

export async function setPasswordById(
  userId: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

// --- E-Mail-Wechsel ---------------------------------------------------------

export async function createEmailChangeToken(
  userId: string,
  newEmail: string,
): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const identifier = `${EMAIL_CHANGE_PREFIX}${userId}:${newEmail}`;
  // je Nutzer nur ein offener Wechsel
  await prisma.verificationToken.deleteMany({
    where: { identifier: { startsWith: `${EMAIL_CHANGE_PREFIX}${userId}:` } },
  });
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashToken(raw),
      expires: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
    },
  });
  return raw;
}

export type EmailChangeResult = TokenResult | "conflict";

/** Wechsel-Token einlösen und E-Mail umstellen. */
export async function consumeEmailChangeToken(
  userId: string,
  newEmail: string,
  rawToken: string,
): Promise<EmailChangeResult> {
  const identifier = `${EMAIL_CHANGE_PREFIX}${userId}:${newEmail}`;
  const tokenHash = hashToken(rawToken);
  const row = await prisma.verificationToken.findUnique({
    where: { identifier_token: { identifier, token: tokenHash } },
  });
  if (!row) return "invalid";
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier, token: tokenHash } },
  });
  if (row.expires < new Date()) return "expired";

  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== userId) return "conflict";

  await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, emailVerified: new Date() },
  });
  return "ok";
}

export function isEmailTaken(email: string) {
  return prisma.user
    .findUnique({ where: { email }, select: { id: true } })
    .then(Boolean);
}
