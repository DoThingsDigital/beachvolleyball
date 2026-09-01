import { prisma } from "./client";

// User und Membership sind organisationsübergreifende Identitätsdaten;
// das Tenant-Scoping über TenantContext betrifft die Fachtabellen (Ticket 1.1).

export function findUserForLogin(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      emailVerified: true,
      anonymizedAt: true,
    },
  });
}

export function findProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      phone: true,
      billingStreet: true,
      billingZip: true,
      billingCity: true,
      billingCountry: true,
      termsAcceptedVersion: true,
    },
  });
}

// A3: Zustimmung mit Zeitstempel und Version festhalten
export function recordTermsAcceptance(userId: string, version: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { termsAcceptedVersion: version, termsAcceptedAt: new Date() },
  });
}

export function findStripeCustomer(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  });
}

export function setStripeCustomerId(userId: string, stripeCustomerId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId },
  });
}

export function updateProfile(
  userId: string,
  data: {
    name: string;
    phone: string | null;
    billingStreet: string | null;
    billingZip: string | null;
    billingCity: string | null;
    billingCountry: string | null;
  },
) {
  return prisma.user.update({ where: { id: userId }, data });
}

export function getMembershipsForUser(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    select: { organisationId: true, role: true },
  });
}
