import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Vereinsmitgliedschaften (Ticket 4.6, A4).

export function findClubsWithMyMembership(ctx: TenantContext, userId: string) {
  return prisma.club.findMany({
    where: { organisationId: ctx.organisationId, active: true },
    include: {
      clubMemberships: {
        where: { userId },
        select: { id: true, status: true, isClubAdmin: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function requestClubMembership(
  ctx: TenantContext,
  userId: string,
  clubId: string,
): Promise<"created" | "exists"> {
  const club = await prisma.club.findFirst({
    where: { id: clubId, organisationId: ctx.organisationId, active: true },
  });
  if (!club) return "exists";

  const existing = await prisma.clubMembership.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (existing) {
    // Abgelehnte/abgelaufene dürfen erneut anfragen
    if (existing.status === "REJECTED" || existing.status === "EXPIRED") {
      await prisma.clubMembership.update({
        where: { id: existing.id },
        data: { status: "PENDING", verifiedByUserId: null },
      });
      return "created";
    }
    return "exists";
  }
  await prisma.clubMembership.create({
    data: { organisationId: ctx.organisationId, userId, clubId },
  });
  return "created";
}

/** Mitgliederpreis-Berechtigung: aktive Mitgliedschaft in einem Verein des
 *  Mandanten, nicht abgelaufen (A4). */
export async function isActiveClubMember(
  ctx: TenantContext,
  userId: string,
): Promise<boolean> {
  const membership = await prisma.clubMembership.findFirst({
    where: {
      organisationId: ctx.organisationId,
      userId,
      status: "ACTIVE",
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
  });
  return membership !== null;
}

// --- Vereins-Admin ----------------------------------------------------------

export function findClubsIAdminister(ctx: TenantContext, userId: string) {
  return prisma.club.findMany({
    where: {
      organisationId: ctx.organisationId,
      active: true,
      clubMemberships: {
        some: { userId, isClubAdmin: true, status: "ACTIVE" },
      },
    },
    orderBy: { name: "asc" },
  });
}

export function findClubMembers(ctx: TenantContext, clubId: string) {
  return prisma.clubMembership.findMany({
    where: { clubId, organisationId: ctx.organisationId },
    include: {
      user: { select: { email: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function setClubMembershipStatus(
  ctx: TenantContext,
  membershipId: string,
  clubId: string,
  status: "ACTIVE" | "REJECTED",
  verifiedByUserId: string,
): Promise<boolean> {
  const result = await prisma.clubMembership.updateMany({
    where: { id: membershipId, clubId, organisationId: ctx.organisationId },
    data: { status, verifiedByUserId },
  });
  return result.count > 0;
}

/** CSV-Import: bekannte E-Mails werden aktiviert (bestehende Anfragen
 *  freigegeben, sonst neu angelegt); unbekannte werden gemeldet. */
export async function importClubMembers(
  ctx: TenantContext,
  clubId: string,
  emails: string[],
  verifiedByUserId: string,
): Promise<{ activated: number; unknown: string[] }> {
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  let activated = 0;
  const unknown: string[] = [];
  for (const email of emails) {
    const userId = byEmail.get(email.toLowerCase());
    if (!userId) {
      unknown.push(email);
      continue;
    }
    await prisma.clubMembership.upsert({
      where: { userId_clubId: { userId, clubId } },
      update: { status: "ACTIVE", verifiedByUserId },
      create: {
        organisationId: ctx.organisationId,
        userId,
        clubId,
        status: "ACTIVE",
        verifiedByUserId,
      },
    });
    activated += 1;
  }
  return { activated, unknown };
}
