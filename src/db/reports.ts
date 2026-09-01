import { Prisma } from "@/src/generated/prisma/client";

import { prisma } from "./client";
import type { TenantContext } from "./tenant";

// Report-Aggregate (Tickets 6.1–6.4). Alle Queries mandantengefiltert;
// Zeiträume als Instants [from, to). Eine Belegung zählt zu ihrem
// Starttag (docs/02_DATENMODELL.md, Vereinsnutzungs-Report).

export type UsageTotals = {
  vereinVorhaltung: number;
  vereinAuslastung: number;
  kommerziell: number;
  intern: number;
  belegtGesamt: number;
  releasedStunden: number;
};

/** L3-Kernquery: Feldstunden nach usageType in zwei Basen. */
export async function usageFieldHours(
  ctx: TenantContext,
  params: { venueId: string; from: Date; to: Date },
): Promise<UsageTotals> {
  const rows = await prisma.$queryRaw<
    {
      verein_vorhaltung: number | null;
      verein_auslastung: number | null;
      kommerziell: number | null;
      intern: number | null;
      belegt_gesamt: number | null;
      released_stunden: number | null;
    }[]
  >`
    WITH b AS (
      SELECT "usageType", "status", kind,
             SUM(EXTRACT(EPOCH FROM ("endAt" - "startAt")) / 3600.0) AS feldstunden
      FROM "Booking"
      WHERE "organisationId" = ${ctx.organisationId}
        AND "venueId" = ${params.venueId}
        AND "startAt" >= ${params.from} AND "startAt" < ${params.to}
        AND "status" IN ('CONFIRMED','RELEASED','NO_SHOW')
      GROUP BY 1, 2, 3
    )
    SELECT
      -- Vorhaltung nur aus materialisierten Sperren (kind BLOCK):
      -- Mitglieder-Fensterbuchungen (kind CUSTOMER, usageType VEREIN)
      -- stecken bereits in den Fensterstunden (E-005, App-seitig addiert)
      SUM(feldstunden) FILTER (WHERE "usageType" IN ('VEREIN','LIGA') AND kind = 'BLOCK')          AS verein_vorhaltung,
      SUM(feldstunden) FILTER (WHERE "usageType" IN ('VEREIN','LIGA') AND "status" <> 'RELEASED')  AS verein_auslastung,
      SUM(feldstunden) FILTER (WHERE "usageType" = 'KOMMERZIELL' AND "status" <> 'RELEASED')       AS kommerziell,
      SUM(feldstunden) FILTER (WHERE "usageType" = 'INTERN' AND "status" <> 'RELEASED')            AS intern,
      SUM(feldstunden) FILTER (WHERE "status" <> 'RELEASED')                                       AS belegt_gesamt,
      SUM(feldstunden) FILTER (WHERE "status" = 'RELEASED')                                        AS released_stunden
    FROM b
  `;
  const row = rows[0];
  return {
    vereinVorhaltung: Number(row?.verein_vorhaltung ?? 0),
    vereinAuslastung: Number(row?.verein_auslastung ?? 0),
    kommerziell: Number(row?.kommerziell ?? 0),
    intern: Number(row?.intern ?? 0),
    belegtGesamt: Number(row?.belegt_gesamt ?? 0),
    releasedStunden: Number(row?.released_stunden ?? 0),
  };
}

export type OccupancyGroupBy = "day" | "weekday" | "court" | "hour";

const GROUP_EXPRESSIONS: Record<OccupancyGroupBy, Prisma.Sql> = {
  day: Prisma.sql`to_char(b."startAt" AT TIME ZONE v.timezone, 'YYYY-MM-DD')`,
  weekday: Prisma.sql`to_char(b."startAt" AT TIME ZONE v.timezone, 'ID')`,
  court: Prisma.sql`c.name`,
  hour: Prisma.sql`to_char(b."startAt" AT TIME ZONE v.timezone, 'HH24:00')`,
};

/** L1: belegte Feldstunden gruppiert nach Tag/Wochentag/Platz/Stunde. */
export async function occupiedFieldHoursGrouped(
  ctx: TenantContext,
  params: {
    venueId: string;
    from: Date;
    to: Date;
    groupBy: OccupancyGroupBy;
  },
): Promise<{ key: string; hours: number }[]> {
  const groupExpr = GROUP_EXPRESSIONS[params.groupBy];
  const rows = await prisma.$queryRaw<{ key: string; hours: number }[]>`
    SELECT ${groupExpr} AS key,
           SUM(EXTRACT(EPOCH FROM (b."endAt" - b."startAt")) / 3600.0) AS hours
    FROM "Booking" b
    JOIN "Venue" v ON v.id = b."venueId"
    JOIN "Court" c ON c.id = b."courtId"
    WHERE b."organisationId" = ${ctx.organisationId}
      AND b."venueId" = ${params.venueId}
      AND b."startAt" >= ${params.from} AND b."startAt" < ${params.to}
      AND b."status" IN ('CONFIRMED','NO_SHOW')
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((r) => ({ key: r.key, hours: Number(r.hours) }));
}

/** L4: kommerzielle Feldstunden nach Belegungsart (Dauerplatz vs. Einzel).
 *  Interne/Vereins-Belegungen zählen nicht – die Quote steuert
 *  Vorverkauf vs. Einzelbuchung im Kundengeschäft. */
export async function fieldHoursByKind(
  ctx: TenantContext,
  params: { venueId: string; from: Date; to: Date },
): Promise<{ kind: string; hours: number }[]> {
  const rows = await prisma.$queryRaw<{ kind: string; hours: number }[]>`
    SELECT b.kind AS kind,
           SUM(EXTRACT(EPOCH FROM (b."endAt" - b."startAt")) / 3600.0) AS hours
    FROM "Booking" b
    WHERE b."organisationId" = ${ctx.organisationId}
      AND b."venueId" = ${params.venueId}
      AND b."startAt" >= ${params.from} AND b."startAt" < ${params.to}
      AND b."status" IN ('CONFIRMED','NO_SHOW')
      AND b."usageType" = 'KOMMERZIELL'
    GROUP BY 1
  `;
  return rows.map((r) => ({ kind: r.kind, hours: Number(r.hours) }));
}

export type RevenueRow = {
  productType: string;
  paymentMethod: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  orderCount: number;
};

/** L2: Umsatz nach Produktart × Zahlart (Basis: paidAt im Zeitraum). */
export async function revenueByProductAndMethod(
  ctx: TenantContext,
  params: { venueId: string; from: Date; to: Date },
): Promise<RevenueRow[]> {
  const rows = await prisma.$queryRaw<
    {
      product_type: string;
      payment_method: string | null;
      net: bigint | number | null;
      tax: bigint | number | null;
      gross: bigint | number | null;
      order_count: bigint | number;
    }[]
  >`
    SELECT i."productType" AS product_type,
           COALESCE(o."paymentMethodType", 'unbekannt') AS payment_method,
           SUM(i."netCents")   AS net,
           SUM(i."taxCents")   AS tax,
           SUM(i."grossCents") AS gross,
           COUNT(DISTINCT o.id) AS order_count
    FROM "OrderItem" i
    JOIN "Order" o ON o.id = i."orderId"
    WHERE o."organisationId" = ${ctx.organisationId}
      AND o."venueId" = ${params.venueId}
      AND o."paidAt" IS NOT NULL
      AND o."paidAt" >= ${params.from} AND o."paidAt" < ${params.to}
      AND o.status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  return rows.map((r) => ({
    productType: r.product_type,
    paymentMethod: r.payment_method ?? "unbekannt",
    netCents: Number(r.net ?? 0),
    taxCents: Number(r.tax ?? 0),
    grossCents: Number(r.gross ?? 0),
    orderCount: Number(r.order_count),
  }));
}

/** L2: Erstattungen im Zeitraum (separat ausgewiesen). */
export async function refundsInPeriod(
  ctx: TenantContext,
  params: { venueId: string; from: Date; to: Date },
): Promise<{ amountCents: number; count: number }> {
  const rows = await prisma.$queryRaw<
    { amount: bigint | number | null; cnt: bigint | number }[]
  >`
    SELECT SUM(r."amountCents") AS amount, COUNT(*) AS cnt
    FROM "Refund" r
    JOIN "Order" o ON o.id = r."orderId"
    WHERE o."organisationId" = ${ctx.organisationId}
      AND o."venueId" = ${params.venueId}
      AND r."createdAt" >= ${params.from} AND r."createdAt" < ${params.to}
      AND r.status <> 'FAILED'
  `;
  return {
    amountCents: Number(rows[0]?.amount ?? 0),
    count: Number(rows[0]?.cnt ?? 0),
  };
}
