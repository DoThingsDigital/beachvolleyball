import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { verifyPassword } from "@/src/auth/password";
import { createEmailChangeToken, createPasswordResetToken } from "@/src/db/account";
import { prisma } from "@/src/db/client";
import { cleanupTestDb } from "@/src/db/test/cleanup";
import {
  changePassword,
  confirmEmailChange,
  resetPassword,
} from "./account";

// A1-Nachtrag: Passwort-Reset, Passwort-Änderung, E-Mail-Wechsel.

let userId: string;
const EMAIL = "int-test-acc-user@example.org";

beforeAll(async () => {
  await cleanupTestDb();
  const org = await prisma.organisation.create({
    data: { name: "Acc Org", slug: "org-account" },
  });
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Acc User",
      emailVerified: new Date(),
      memberships: { create: { organisationId: org.id, role: "CUSTOMER" } },
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Passwort-Reset", () => {
  it("gültiger Token setzt das Passwort (auch erstmalig), Token ist einmalig", async () => {
    const token = await createPasswordResetToken(EMAIL);
    expect(await resetPassword({ email: EMAIL, token, password: "neues-passwort-123" })).toBe("ok");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toBeNull();
    expect(await verifyPassword(user.passwordHash!, "neues-passwort-123")).toBe(true);

    // Wiederverwendung schlägt fehl
    expect(
      await resetPassword({ email: EMAIL, token, password: "zweiter-versuch-123" }),
    ).toBe("invalid");
  });

  it("abgelaufener oder falscher Token wird abgelehnt", async () => {
    const token = await createPasswordResetToken(EMAIL);
    await prisma.verificationToken.updateMany({
      where: { identifier: `pwreset:${EMAIL}` },
      data: { expires: new Date(Date.now() - 1000) },
    });
    expect(
      await resetPassword({ email: EMAIL, token, password: "egal-egal-egal" }),
    ).toBe("expired");
    expect(
      await resetPassword({ email: EMAIL, token: "falsch", password: "egal-egal-egal" }),
    ).toBe("invalid");
  });
});

describe("Passwort ändern (eingeloggt)", () => {
  it("verlangt das korrekte aktuelle Passwort", async () => {
    await expect(
      changePassword({
        userId,
        currentPassword: "voellig-falsch",
        newPassword: "brandneu-123456",
      }),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    await changePassword({
      userId,
      currentPassword: "neues-passwort-123",
      newPassword: "brandneu-123456",
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await verifyPassword(user.passwordHash!, "brandneu-123456")).toBe(true);
  });
});

describe("E-Mail-Wechsel", () => {
  it("Bestätigung stellt die Adresse um; Konflikt wird erkannt", async () => {
    const newEmail = "int-test-acc-neu@example.org";
    const token = await createEmailChangeToken(userId, newEmail);
    expect(
      await confirmEmailChange({ userId, newEmail, token }),
    ).toBe("ok");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(newEmail);

    // Konflikt: Zieladresse inzwischen vergeben
    const other = await prisma.user.create({
      data: { email: "int-test-acc-belegt@example.org" },
    });
    const token2 = await createEmailChangeToken(userId, other.email);
    expect(
      await confirmEmailChange({ userId, newEmail: other.email, token: token2 }),
    ).toBe("conflict");

    // Token nicht wiederverwendbar
    expect(
      await confirmEmailChange({ userId, newEmail, token }),
    ).toBe("invalid");
  });
});
