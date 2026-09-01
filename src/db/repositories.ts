import type { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Mandantengefilterte Repositories: jede Query trägt organisationId aus dem
// TenantContext, jedes Create setzt sie. Services (src/services/) greifen nur
// hierüber auf Fachdaten zu, nie direkt auf den Prisma-Client.
// Der Zuschnitt wächst mit den Tickets; hier liegt die Grundlage (1.1).

export function createRepositories(ctx: TenantContext) {
  const { organisationId } = ctx;

  return {
    venues: {
      findMany() {
        return prisma.venue.findMany({
          where: { organisationId },
          orderBy: { name: "asc" },
        });
      },
      findById(id: string) {
        return prisma.venue.findFirst({ where: { id, organisationId } });
      },
      findBySlug(slug: string) {
        return prisma.venue.findFirst({ where: { slug, organisationId } });
      },
      async update(
        id: string,
        data: Omit<
          Prisma.VenueUncheckedUpdateInput,
          "id" | "organisationId" | "legalEntityId" | "slug"
        >,
      ) {
        // updateMany, damit der Mandantenfilter Teil des WHERE ist.
        const result = await prisma.venue.updateMany({
          where: { id, organisationId },
          data,
        });
        if (result.count === 0) return null;
        return prisma.venue.findFirst({ where: { id, organisationId } });
      },
    },

    auditLogs: {
      create(entry: {
        actorUserId: string | null;
        entity: string;
        entityId: string;
        action: string;
        diff: Prisma.InputJsonValue;
      }) {
        return prisma.auditLog.create({
          data: { ...entry, organisationId },
        });
      },
    },

    courts: {
      findManyForVenue(venueId: string) {
        return prisma.court.findMany({
          where: { venueId, organisationId, active: true },
          orderBy: { sortOrder: "asc" },
        });
      },
    },

    bookings: {
      findMany(where?: Prisma.BookingWhereInput) {
        return prisma.booking.findMany({
          where: { ...where, organisationId },
          orderBy: { startAt: "asc" },
        });
      },
      findById(id: string) {
        return prisma.booking.findFirst({ where: { id, organisationId } });
      },
      create(data: Omit<Prisma.BookingUncheckedCreateInput, "organisationId">) {
        return prisma.booking.create({
          data: { ...data, organisationId },
        });
      },
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
