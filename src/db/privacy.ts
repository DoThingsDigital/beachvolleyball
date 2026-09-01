import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Datenauskunft + Anonymisierung (Ticket 6.5, A5/DSGVO).
// Löschung = Anonymisierung: Rechnungen und Belegungen bleiben (steuer-
// und betriebsrechtliche Aufbewahrung), der Personenbezug am User-Datensatz
// und in den Mail-Logs wird entfernt.

async function findTenantUser(ctx: TenantContext, userId: string) {
  return prisma.user.findFirst({
    where: {
      id: userId,
      memberships: { some: { organisationId: ctx.organisationId } },
    },
  });
}

/** Alle personenbezogenen Daten für die Auskunft (Art. 15 DSGVO). */
export async function exportUserData(ctx: TenantContext, userId: string) {
  const user = await findTenantUser(ctx, userId);
  if (!user) return null;

  const [
    memberships,
    clubMemberships,
    bookings,
    orders,
    invoices,
    sepaMandates,
    creditLedger,
    emailLog,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, organisationId: ctx.organisationId },
      select: { role: true, createdAt: true },
    }),
    prisma.clubMembership.findMany({
      where: { userId, organisationId: ctx.organisationId },
      select: {
        status: true,
        isClubAdmin: true,
        validUntil: true,
        createdAt: true,
        club: { select: { name: true } },
      },
    }),
    prisma.booking.findMany({
      where: { userId, organisationId: ctx.organisationId },
      select: {
        startAt: true,
        endAt: true,
        status: true,
        kind: true,
        priceCents: true,
        court: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.order.findMany({
      where: { userId, organisationId: ctx.organisationId },
      select: {
        number: true,
        status: true,
        totalCents: true,
        paymentMethodType: true,
        paidAt: true,
        createdAt: true,
        billingSnapshot: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invoice.findMany({
      where: { userId, organisationId: ctx.organisationId },
      select: {
        number: true,
        type: true,
        grossCents: true,
        issueDate: true,
        recipientSnapshot: true,
      },
      orderBy: { issueDate: "asc" },
    }),
    prisma.sepaMandate.findMany({
      where: { userId },
      select: { mandateRef: true, ibanLast4: true, status: true, signedAt: true },
    }),
    prisma.creditLedger.findMany({
      where: { userId, organisationId: ctx.organisationId },
      select: { deltaCents: true, reason: true, createdAt: true },
    }),
    prisma.emailLog.findMany({
      where: { userId },
      select: { to: true, template: true, status: true, sentAt: true },
      orderBy: { sentAt: "asc" },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      email: user.email,
      name: user.name,
      phone: user.phone,
      billingStreet: user.billingStreet,
      billingZip: user.billingZip,
      billingCity: user.billingCity,
      billingCountry: user.billingCountry,
      termsAcceptedVersion: user.termsAcceptedVersion,
      termsAcceptedAt: user.termsAcceptedAt,
      sepaBlocked: user.sepaBlocked,
      createdAt: user.createdAt,
      anonymizedAt: user.anonymizedAt,
    },
    memberships,
    clubMemberships,
    bookings,
    orders,
    invoices,
    sepaMandates,
    creditLedger,
    emailLog,
  };
}

export type AnonymizeBlocker = "FUTURE_BOOKINGS" | "ACTIVE_SUBSCRIPTION";

/** Anonymisiert den Kunden. Voraussetzung: keine zukünftigen aktiven
 *  Belegungen und keine laufenden Dauerplätze (erst stornieren/kündigen). */
export async function anonymizeUser(
  ctx: TenantContext,
  userId: string,
): Promise<
  | { ok: true; alreadyAnonymized: boolean }
  | { ok: false; blocker: AnonymizeBlocker }
  | null
> {
  const user = await findTenantUser(ctx, userId);
  if (!user) return null;
  if (user.anonymizedAt) return { ok: true, alreadyAnonymized: true };

  const futureBookings = await prisma.booking.count({
    where: {
      userId,
      organisationId: ctx.organisationId,
      status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] },
      startAt: { gte: new Date() },
    },
  });
  if (futureBookings > 0) return { ok: false, blocker: "FUTURE_BOOKINGS" };

  const activeSubscriptions = await prisma.subscription.count({
    where: {
      userId,
      organisationId: ctx.organisationId,
      status: { in: ["PENDING", "ACTIVE"] },
    },
  });
  if (activeSubscriptions > 0) {
    return { ok: false, blocker: "ACTIVE_SUBSCRIPTION" };
  }

  const oldEmail = user.email;
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `anonym-${userId}@anonymisiert.invalid`,
        name: "Anonymisiert",
        phone: null,
        passwordHash: null,
        emailVerified: null,
        billingStreet: null,
        billingZip: null,
        billingCity: null,
        billingCountry: null,
        stripeCustomerId: null,
        notes: null,
        anonymizedAt: new Date(),
      },
    }),
    // Mail-Logs schwärzen (Zustellhistorie bleibt, Adresse verschwindet)
    prisma.emailLog.updateMany({
      where: { userId },
      data: { to: "anonymisiert" },
    }),
    // Offene Verifizierungs-/Login-Tokens der alten Adresse entwerten
    prisma.verificationToken.deleteMany({
      where: { identifier: oldEmail },
    }),
  ]);
  return { ok: true, alreadyAnonymized: false };
}
