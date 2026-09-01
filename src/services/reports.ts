import { TZDate } from "@date-fns/tz";
import { renderToBuffer } from "@react-pdf/renderer";

import { formatDate, formatDateTime } from "@/lib/format";
import { createRepositories } from "@/src/db/repositories";
import {
  fieldHoursByKind,
  occupiedFieldHoursGrouped,
  refundsInPeriod,
  revenueByProductAndMethod,
  usageFieldHours,
  type OccupancyGroupBy,
  type UsageTotals,
} from "@/src/db/reports";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";

export type { OccupancyGroupBy } from "@/src/db/reports";
import { availableFieldHours } from "@/src/domain/report-availability";
import { VereinsnutzungPdf } from "@/src/pdf/report-vereinsnutzung.v1";

// Reports (Tickets 6.1–6.4): Zusammensetzung der Aggregate, Quoten und
// CSV-Erzeugung. Zeiträume sind lokale Kalendertage [von, bis] inklusive.

export type ReportPeriod = {
  dateFrom: string;
  dateTo: string;
  from: Date;
  to: Date;
};

export function resolvePeriod(
  dateFrom: string,
  dateTo: string,
  timezone: string,
): ReportPeriod {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) ||
    dateTo < dateFrom
  ) {
    throw new DomainError("INVALID_PERIOD", "Ungültiger Report-Zeitraum.");
  }
  const [fy, fm, fd] = dateFrom.split("-").map(Number);
  const [ty, tm, td] = dateTo.split("-").map(Number);
  return {
    dateFrom,
    dateTo,
    from: new Date(new TZDate(fy!, fm! - 1, fd!, 0, 0, timezone).getTime()),
    to: new Date(new TZDate(ty!, tm! - 1, td! + 1, 0, 0, timezone).getTime()),
  };
}

// --- Formatierung -----------------------------------------------------------

function num(value: number, decimals = 2): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function euro(cents: number): string {
  return num(cents / 100);
}

function pct(value: number): string {
  return Number.isFinite(value) ? `${num(value * 100, 1)} %` : "–";
}

/** CSV für Excel-DE: Semikolon-getrennt, BOM, CRLF. */
export function toCsv(rows: (string | number)[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = typeof cell === "number" ? num(cell) : cell;
          return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(";"),
    )
    .join("\r\n");
  return `﻿${body}\r\n`;
}

// --- L3 Vereinsnutzung ------------------------------------------------------

export type VereinsnutzungReport = {
  period: ReportPeriod;
  venueName: string;
  totals: UsageTotals;
  availableHours: number;
  quotas: {
    vorhaltungVsVerfuegbar: number;
    vorhaltungVsBelegt: number;
    auslastungVsVerfuegbar: number;
    auslastungVsBelegt: number;
  };
  definitions: string[];
};

export const L3_DEFINITIONS = [
  "Feldstunde: 1 Platz × 1 Stunde.",
  "Vorhaltung: für den Verein vorgehaltene Feldstunden (usageType VEREIN/LIGA), einschließlich fristgerecht freigegebener, aber ungenutzter Slots (Status RELEASED).",
  "Auslastung: vom Verein tatsächlich in Anspruch genommene Feldstunden (VEREIN/LIGA ohne RELEASED).",
  "Verfügbare Feldstunden: Öffnungszeit × aktive Plätze im Zeitraum, abzüglich Schließtage (Basis: aktuelle Konfiguration).",
  "Belegte Feldstunden: alle Belegungen außer freigegebenen (Status CONFIRMED/NO_SHOW).",
  "Eine Belegung zählt zum Kalendertag ihres Beginns.",
];

export async function buildVereinsnutzungReport(
  ctx: TenantContext,
  params: { venueId: string; dateFrom: string; dateTo: string },
): Promise<VereinsnutzungReport> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const period = resolvePeriod(params.dateFrom, params.dateTo, venue.timezone);

  const courts = await repos.courts.findManyForVenue(venue.id);
  const availableHours = availableFieldHours({
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    openingHours: venue.openingHours as Record<string, [string, string][]>,
    closedDates: (venue.closedDates as string[]) ?? [],
    activeCourtCount: courts.length,
  });

  const totals = await usageFieldHours(ctx, {
    venueId: venue.id,
    from: period.from,
    to: period.to,
  });

  const belegtPlusReleased = totals.belegtGesamt + totals.releasedStunden;
  return {
    period,
    venueName: venue.name,
    totals,
    availableHours,
    quotas: {
      vorhaltungVsVerfuegbar:
        availableHours > 0 ? totals.vereinVorhaltung / availableHours : NaN,
      vorhaltungVsBelegt:
        belegtPlusReleased > 0
          ? totals.vereinVorhaltung / belegtPlusReleased
          : NaN,
      auslastungVsVerfuegbar:
        availableHours > 0 ? totals.vereinAuslastung / availableHours : NaN,
      auslastungVsBelegt:
        totals.belegtGesamt > 0
          ? totals.vereinAuslastung / totals.belegtGesamt
          : NaN,
    },
    definitions: L3_DEFINITIONS,
  };
}

export function vereinsnutzungCsv(report: VereinsnutzungReport): string {
  return toCsv([
    ["Vereinsnutzungs-Report", report.venueName],
    ["Zeitraum", `${report.period.dateFrom} bis ${report.period.dateTo}`],
    [],
    ["Kennzahl", "Feldstunden"],
    ["Verein Vorhaltung (inkl. freigegeben)", report.totals.vereinVorhaltung],
    ["Verein Auslastung (tatsächlich genutzt)", report.totals.vereinAuslastung],
    ["Kommerziell", report.totals.kommerziell],
    ["Intern", report.totals.intern],
    ["Belegt gesamt (ohne freigegeben)", report.totals.belegtGesamt],
    ["Freigegeben (RELEASED)", report.totals.releasedStunden],
    ["Verfügbar (Öffnungszeit × Plätze)", report.availableHours],
    [],
    ["Quote", "Wert"],
    ["Vorhaltung / verfügbare Feldstunden", pct(report.quotas.vorhaltungVsVerfuegbar)],
    ["Vorhaltung / belegte Feldstunden (inkl. freigegeben)", pct(report.quotas.vorhaltungVsBelegt)],
    ["Auslastung / verfügbare Feldstunden", pct(report.quotas.auslastungVsVerfuegbar)],
    ["Auslastung / belegte Feldstunden", pct(report.quotas.auslastungVsBelegt)],
    [],
    ["Definitionen"],
    ...report.definitions.map((d) => [d]),
  ]);
}

/** L3 als PDF (Sportamt-Export): nutzt den Aussteller des Standorts. */
export async function vereinsnutzungPdf(
  ctx: TenantContext,
  params: { venueId: string; dateFrom: string; dateTo: string },
): Promise<{ buffer: Buffer; filename: string }> {
  const report = await buildVereinsnutzungReport(ctx, params);
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  const issuer = venue
    ? await repos.legalEntities.findById(venue.legalEntityId)
    : null;

  const periodFormatted = `${formatDate(report.period.from)} – ${formatDate(new Date(report.period.to.getTime() - 1))}`;
  const buffer = await renderToBuffer(
    VereinsnutzungPdf({
      data: {
        venueName: report.venueName,
        issuerName: issuer?.name ?? report.venueName,
        periodFormatted,
        generatedAtFormatted: formatDateTime(new Date()),
        rows: [
          { label: "Verein Vorhaltung (inkl. freigegeben)", hours: num(report.totals.vereinVorhaltung) },
          { label: "Verein Auslastung (tatsächlich genutzt)", hours: num(report.totals.vereinAuslastung) },
          { label: "Kommerziell", hours: num(report.totals.kommerziell) },
          { label: "Intern", hours: num(report.totals.intern) },
          { label: "Belegt gesamt (ohne freigegeben)", hours: num(report.totals.belegtGesamt) },
          { label: "Freigegeben (RELEASED)", hours: num(report.totals.releasedStunden) },
          { label: "Verfügbar (Öffnungszeit × Plätze)", hours: num(report.availableHours) },
        ],
        quotas: [
          { label: "Vorhaltung / verfügbare Feldstunden", value: pct(report.quotas.vorhaltungVsVerfuegbar) },
          { label: "Vorhaltung / belegte Feldstunden (inkl. freigegeben)", value: pct(report.quotas.vorhaltungVsBelegt) },
          { label: "Auslastung / verfügbare Feldstunden", value: pct(report.quotas.auslastungVsVerfuegbar) },
          { label: "Auslastung / belegte Feldstunden", value: pct(report.quotas.auslastungVsBelegt) },
        ],
        definitions: report.definitions,
      },
    }),
  );
  return {
    buffer,
    filename: `Vereinsnutzung_${report.period.dateFrom}_${report.period.dateTo}.pdf`,
  };
}

// --- L1 Auslastung ----------------------------------------------------------

const WEEKDAY_NAMES: Record<string, string> = {
  "1": "Montag",
  "2": "Dienstag",
  "3": "Mittwoch",
  "4": "Donnerstag",
  "5": "Freitag",
  "6": "Samstag",
  "7": "Sonntag",
};

export type AuslastungReport = {
  period: ReportPeriod;
  groupBy: OccupancyGroupBy;
  rows: { key: string; hours: number; availableHours: number | null; quote: number | null }[];
  totalHours: number;
  totalAvailable: number;
};

export async function buildAuslastungReport(
  ctx: TenantContext,
  params: {
    venueId: string;
    dateFrom: string;
    dateTo: string;
    groupBy: OccupancyGroupBy;
  },
): Promise<AuslastungReport> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const period = resolvePeriod(params.dateFrom, params.dateTo, venue.timezone);
  const courts = await repos.courts.findManyForVenue(venue.id);
  const openingHours = venue.openingHours as Record<string, [string, string][]>;
  const closedDates = (venue.closedDates as string[]) ?? [];

  const grouped = await occupiedFieldHoursGrouped(ctx, {
    venueId: venue.id,
    from: period.from,
    to: period.to,
    groupBy: params.groupBy,
  });

  const totalAvailable = availableFieldHours({
    dateFrom: period.dateFrom,
    dateTo: period.dateTo,
    openingHours,
    closedDates,
    activeCourtCount: courts.length,
  });

  const rows = grouped.map((g) => {
    let available: number | null = null;
    if (params.groupBy === "day") {
      available = closedDates.includes(g.key)
        ? 0
        : availableFieldHours({
            dateFrom: g.key,
            dateTo: g.key,
            openingHours,
            closedDates,
            activeCourtCount: courts.length,
          });
    } else if (params.groupBy === "court") {
      available = totalAvailable / Math.max(1, courts.length);
    }
    const key =
      params.groupBy === "weekday" ? (WEEKDAY_NAMES[g.key] ?? g.key) : g.key;
    return {
      key,
      hours: g.hours,
      availableHours: available,
      quote: available && available > 0 ? g.hours / available : null,
    };
  });

  return {
    period,
    groupBy: params.groupBy,
    rows,
    totalHours: grouped.reduce((sum, g) => sum + g.hours, 0),
    totalAvailable,
  };
}

export function auslastungCsv(report: AuslastungReport): string {
  const groupLabel = {
    day: "Tag",
    weekday: "Wochentag",
    court: "Platz",
    hour: "Startstunde",
  }[report.groupBy];
  return toCsv([
    ["Auslastungs-Report", `${report.period.dateFrom} bis ${report.period.dateTo}`],
    [],
    [groupLabel, "Gebuchte Feldstunden", "Verfügbare Feldstunden", "Auslastung"],
    ...report.rows.map((r) => [
      r.key,
      r.hours,
      r.availableHours ?? "",
      r.quote !== null ? pct(r.quote) : "",
    ]),
    [],
    ["Gesamt", report.totalHours, report.totalAvailable, pct(report.totalHours / report.totalAvailable)],
  ]);
}

// --- L2 Umsatz --------------------------------------------------------------

export type UmsatzReport = {
  period: ReportPeriod;
  rows: {
    productType: string;
    paymentMethod: string;
    netCents: number;
    taxCents: number;
    grossCents: number;
    orderCount: number;
  }[];
  totals: { netCents: number; taxCents: number; grossCents: number };
  refunds: { amountCents: number; count: number };
};

export async function buildUmsatzReport(
  ctx: TenantContext,
  params: { venueId: string; dateFrom: string; dateTo: string },
): Promise<UmsatzReport> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const period = resolvePeriod(params.dateFrom, params.dateTo, venue.timezone);

  const rows = await revenueByProductAndMethod(ctx, {
    venueId: venue.id,
    from: period.from,
    to: period.to,
  });
  const refunds = await refundsInPeriod(ctx, {
    venueId: venue.id,
    from: period.from,
    to: period.to,
  });

  return {
    period,
    rows,
    totals: rows.reduce(
      (acc, r) => ({
        netCents: acc.netCents + r.netCents,
        taxCents: acc.taxCents + r.taxCents,
        grossCents: acc.grossCents + r.grossCents,
      }),
      { netCents: 0, taxCents: 0, grossCents: 0 },
    ),
    refunds,
  };
}

export function umsatzCsv(report: UmsatzReport): string {
  return toCsv([
    ["Umsatz-Report", `${report.period.dateFrom} bis ${report.period.dateTo}`],
    ["Basis: Zahlungseingang (paidAt) im Zeitraum; Beträge in EUR"],
    [],
    ["Produktart", "Zahlart", "Bestellungen", "Netto", "Steuer", "Brutto"],
    ...report.rows.map((r) => [
      r.productType,
      r.paymentMethod,
      r.orderCount,
      euro(r.netCents),
      euro(r.taxCents),
      euro(r.grossCents),
    ]),
    [],
    ["Gesamt", "", "", euro(report.totals.netCents), euro(report.totals.taxCents), euro(report.totals.grossCents)],
    [],
    ["Erstattungen im Zeitraum (separat)", "", String(report.refunds.count), "", "", euro(report.refunds.amountCents)],
  ]);
}

// --- L4 Dauerplatz-Quote ----------------------------------------------------

export type DauerplatzQuoteReport = {
  period: ReportPeriod;
  rows: { kind: string; hours: number }[];
  subscriptionHours: number;
  customerHours: number;
  totalCustomerFacing: number;
  quote: number;
};

export async function buildDauerplatzQuote(
  ctx: TenantContext,
  params: { venueId: string; dateFrom: string; dateTo: string },
): Promise<DauerplatzQuoteReport> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(params.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const period = resolvePeriod(params.dateFrom, params.dateTo, venue.timezone);

  const rows = await fieldHoursByKind(ctx, {
    venueId: venue.id,
    from: period.from,
    to: period.to,
  });
  const subscriptionHours =
    rows.find((r) => r.kind === "SUBSCRIPTION")?.hours ?? 0;
  const customerHours = rows.find((r) => r.kind === "CUSTOMER")?.hours ?? 0;
  const totalCustomerFacing = subscriptionHours + customerHours;
  return {
    period,
    rows,
    subscriptionHours,
    customerHours,
    totalCustomerFacing,
    quote:
      totalCustomerFacing > 0 ? subscriptionHours / totalCustomerFacing : NaN,
  };
}

export { pct as formatQuote, num as formatHours, euro as formatEuroPlain };
