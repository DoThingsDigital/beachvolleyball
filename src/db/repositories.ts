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
      // Aussteller-Wechsel (B4): wirkt nur auf neue Rechnungen; bestehende
      // tragen ihren Aussteller-Snapshot.
      async setLegalEntity(id: string, legalEntityId: string) {
        const entity = await prisma.legalEntity.findFirst({
          where: { id: legalEntityId, organisationId },
        });
        if (!entity) return false;
        const res = await prisma.venue.updateMany({
          where: { id, organisationId },
          data: { legalEntityId },
        });
        return res.count > 0;
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
      findAllForVenue(venueId: string) {
        return prisma.court.findMany({
          where: { venueId, organisationId },
          orderBy: { sortOrder: "asc" },
        });
      },
      create(data: Omit<Prisma.CourtUncheckedCreateInput, "organisationId">) {
        return prisma.court.create({ data: { ...data, organisationId } });
      },
      async update(
        id: string,
        data: Omit<Prisma.CourtUncheckedUpdateInput, "id" | "organisationId" | "venueId">,
      ) {
        const res = await prisma.court.updateMany({
          where: { id, organisationId },
          data,
        });
        return res.count > 0;
      },
    },

    seasons: {
      findManyForVenue(venueId: string) {
        return prisma.season.findMany({
          where: { venueId, organisationId },
          orderBy: { startDate: "desc" },
        });
      },
      create(data: Omit<Prisma.SeasonUncheckedCreateInput, "organisationId">) {
        return prisma.season.create({ data: { ...data, organisationId } });
      },
      async update(
        id: string,
        data: Omit<Prisma.SeasonUncheckedUpdateInput, "id" | "organisationId" | "venueId">,
      ) {
        const res = await prisma.season.updateMany({
          where: { id, organisationId },
          data,
        });
        return res.count > 0;
      },
    },

    clubs: {
      findManyForVenue(venueId: string) {
        return prisma.club.findMany({
          where: { venueId, organisationId },
          orderBy: { name: "asc" },
        });
      },
      create(data: Omit<Prisma.ClubUncheckedCreateInput, "organisationId">) {
        return prisma.club.create({ data: { ...data, organisationId } });
      },
      async update(
        id: string,
        data: Omit<Prisma.ClubUncheckedUpdateInput, "id" | "organisationId" | "venueId">,
      ) {
        const res = await prisma.club.updateMany({
          where: { id, organisationId },
          data,
        });
        return res.count > 0;
      },
    },

    subscriptions: {
      // Dauerplätze, die Wochenslots der Saison belegen (PENDING zählt mit:
      // Hold/Zahlung läuft, der Slot darf nicht doppelt verkauft werden)
      findBlockingForSeason(seasonId: string) {
        return prisma.subscription.findMany({
          where: {
            seasonId,
            organisationId,
            status: { in: ["PENDING", "ACTIVE"] },
          },
          select: {
            id: true,
            courtId: true,
            weekday: true,
            startTime: true,
            durationMin: true,
          },
        });
      },
    },

    blocks: {
      findManyForVenue(venueId: string) {
        return prisma.block.findMany({
          where: { venueId, organisationId },
          select: {
            id: true,
            courtId: true,
            type: true,
            startAt: true,
            endAt: true,
            rrule: true,
          },
        });
      },
    },

    priceRules: {
      findManyForSeason(seasonId: string) {
        return prisma.priceRule.findMany({
          where: { seasonId, organisationId },
          orderBy: [{ priority: "desc" }, { label: "asc" }],
        });
      },
      create(
        data: Omit<Prisma.PriceRuleUncheckedCreateInput, "organisationId">,
      ) {
        return prisma.priceRule.create({ data: { ...data, organisationId } });
      },
      async update(
        id: string,
        data: Omit<
          Prisma.PriceRuleUncheckedUpdateInput,
          "id" | "organisationId" | "venueId" | "seasonId"
        >,
      ) {
        const res = await prisma.priceRule.updateMany({
          where: { id, organisationId },
          data,
        });
        return res.count > 0;
      },
    },

    legalEntities: {
      findMany() {
        return prisma.legalEntity.findMany({
          where: { organisationId },
          orderBy: { name: "asc" },
        });
      },
      findById(id: string) {
        return prisma.legalEntity.findFirst({ where: { id, organisationId } });
      },
      create(
        data: Omit<Prisma.LegalEntityUncheckedCreateInput, "organisationId">,
      ) {
        return prisma.legalEntity.create({ data: { ...data, organisationId } });
      },
      async update(
        id: string,
        data: Omit<Prisma.LegalEntityUncheckedUpdateInput, "id" | "organisationId">,
      ) {
        const res = await prisma.legalEntity.updateMany({
          where: { id, organisationId },
          data,
        });
        return res.count > 0;
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
