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
      anonymizedAt: true,
    },
  });
}

export function getMembershipsForUser(userId: string) {
  return prisma.membership.findMany({
    where: { userId },
    select: { organisationId: true, role: true },
  });
}
