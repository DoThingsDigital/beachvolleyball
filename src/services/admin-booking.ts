import { TZDate } from "@date-fns/tz";

import { formatDate, formatWeekday } from "@/lib/format";
import type { Prisma } from "@/src/generated/prisma/client";
import {
  createManualBookingRow,
  createManualPaidOrderTx,
  findBookingForAdmin,
  findCustomerByEmail,
  moveBookingRow,
  setBookingStatusAdmin,
} from "@/src/db/admin-calendar";
import { isActiveClubMember } from "@/src/db/club-memberships";
import { createRepositories } from "@/src/db/repositories";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { computePrice, splitGross } from "@/src/domain/pricing";
import { isoWeekdayOfDate } from "@/src/domain/week-occupancy";

import { createInvoiceForOrder, resendInvoiceEmail } from "./invoices";
import { invalidateOccupancyCache } from "./occupancy";

// Admin-Buchungen (Ticket 5.4, K4/G7/I4): manuelle Belegung (kostenlos oder
// mit Rechnung und manueller Zahlart), Verschieben, Stornieren, No-Show.
// Der Admin ist nicht an Öffnungszeiten/Vorlauf/Horizont gebunden – nur an
// das Slot-Raster und den Konfliktschutz der Datenbank.

function buildPeriod(params: {
  timezone: string;
  slotMinutes: number;
  date: string;
  time: string;
  durationMin: number;
}): { startAt: Date; endAt: Date } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(params.date) ||
    !/^\d{2}:\d{2}$/.test(params.time)
  ) {
    throw new DomainError("INVALID_PERIOD", "Ungültige Datums- oder Zeitangabe.");
  }
  if (
    params.durationMin <= 0 ||
    params.durationMin > 24 * 60 ||
    params.durationMin % params.slotMinutes !== 0
  ) {
    throw new DomainError(
      "INVALID_PERIOD",
      `Dauer muss ein Vielfaches von ${params.slotMinutes} Minuten sein.`,
    );
  }
  const [y, m, d] = params.date.split("-").map(Number);
  const [h, min] = params.time.split(":").map(Number);
  const startAt = new Date(
    new TZDate(y!, m! - 1, d!, h!, min!, params.timezone).getTime(),
  );
  return { startAt, endAt: new Date(startAt.getTime() + params.durationMin * 60_000) };
}

export type ManualBookingInput = {
  venueId: string;
  courtId: string;
  /** "YYYY-MM-DD" lokal */
  date: string;
  /** "HH:MM" lokal */
  time: string;
  durationMin: number;
  mode: "FREE" | "INVOICE";
  /** FREE: Nutzungsart Pflicht (Invariante 10); INVOICE ist KOMMERZIELL */
  usageType?: "KOMMERZIELL" | "VEREIN" | "LIGA" | "INTERN";
  label?: string | null;
  note?: string | null;
  customerEmail?: string | null;
  pricing?: "RULES" | "MANUAL";
  manualGrossCents?: number | null;
  paymentMethod?: "cash" | "transfer";
};

export type ManualBookingResult = {
  bookingId: string;
  orderId?: string;
  invoiceNumber?: string;
};

export async function createManualBooking(
  ctx: TenantContext,
  input: ManualBookingInput,
  actorUserId: string,
): Promise<ManualBookingResult> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(input.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const courts = await repos.courts.findManyForVenue(venue.id);
  const court = courts.find((c) => c.id === input.courtId);
  if (!court) throw new DomainError("NOT_FOUND", "Platz nicht gefunden.");

  const { startAt, endAt } = buildPeriod({
    timezone: venue.timezone,
    slotMinutes: venue.slotMinutes,
    date: input.date,
    time: input.time,
    durationMin: input.durationMin,
  });

  if (input.mode === "FREE") {
    if (!input.usageType) {
      throw new DomainError("INVALID_PERIOD", "Nutzungsart wählen.");
    }
    const customer = input.customerEmail
      ? await findCustomerByEmail(ctx, input.customerEmail)
      : null;
    if (input.customerEmail && !customer) {
      throw new DomainError("NOT_FOUND", "Kein Kundenkonto mit dieser E-Mail.");
    }
    const created = await createManualBookingRow(ctx, {
      venueId: venue.id,
      courtId: court.id,
      startAt,
      endAt,
      usageType: input.usageType,
      userId: customer?.id ?? null,
      label: input.label ?? null,
      note: input.note ?? null,
      priceCents: 0,
    });
    if (!created.ok) {
      throw new DomainError("SLOT_TAKEN", "Der Slot ist bereits belegt.");
    }
    await repos.auditLogs.create({
      actorUserId,
      entity: "Booking",
      entityId: created.bookingId,
      action: "admin.manual-booking",
      diff: {
        mode: "FREE",
        usageType: input.usageType,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        courtId: court.id,
      },
    });
    invalidateOccupancyCache();
    return { bookingId: created.bookingId };
  }

  // --- Mit Rechnung (G7): Kunde + Preis + manuelle Zahlart -----------------
  if (!input.customerEmail) {
    throw new DomainError("INVALID_PERIOD", "Kunden-E-Mail angeben.");
  }
  const customer = await findCustomerByEmail(ctx, input.customerEmail);
  if (!customer) {
    throw new DomainError(
      "NOT_FOUND",
      "Kein Kundenkonto mit dieser E-Mail – der Kunde muss sich zuerst registrieren.",
    );
  }
  if (
    !customer.billingStreet ||
    !customer.billingZip ||
    !customer.billingCity ||
    !customer.billingCountry
  ) {
    throw new DomainError(
      "BILLING_ADDRESS_REQUIRED",
      "Der Kunde hat keine Rechnungsadresse im Konto hinterlegt.",
    );
  }
  if (!input.paymentMethod) {
    throw new DomainError("INVALID_PERIOD", "Zahlart wählen.");
  }

  const legalEntity = await repos.legalEntities.findById(venue.legalEntityId);
  if (!legalEntity) {
    throw new DomainError("NOT_FOUND", "Rechnungsaussteller nicht konfiguriert.");
  }

  let grossCents: number;
  let priceBreakdown: Prisma.InputJsonValue;
  if (input.pricing === "MANUAL") {
    if (!input.manualGrossCents || input.manualGrossCents <= 0) {
      throw new DomainError("INVALID_PERIOD", "Gültigen Betrag angeben.");
    }
    grossCents = input.manualGrossCents;
    priceBreakdown = { manual: true, grossCents };
  } else {
    const seasons = await repos.seasons.findManyForVenue(venue.id);
    const season = seasons.find(
      (s) =>
        (s.status === "ACTIVE" || s.status === "PRESALE") &&
        s.startDate <= startAt &&
        startAt < s.endDate,
    );
    if (!season) {
      throw new DomainError(
        "NO_PRICE_RULE",
        "Keine Saison für diesen Termin – Betrag manuell angeben.",
      );
    }
    const rules = await repos.priceRules.findManyForSeason(season.id);
    const isMember = await isActiveClubMember(ctx, customer.id);
    const price = computePrice({
      slotMinutes: venue.slotMinutes,
      timezone: venue.timezone,
      rules,
      courtId: court.id,
      startAt,
      endAt,
      isMember,
    });
    grossCents = price.grossCents;
    priceBreakdown = {
      grossCents,
      memberRateApplied: price.memberRateApplied,
      slots: price.breakdown.map((s) => ({
        from: s.slotStart.toISOString(),
        to: s.slotEnd.toISOString(),
        ruleId: s.ruleId,
        rateCents: s.rateCents,
        slotCents: s.slotCents,
      })),
    };
  }

  const { netCents, taxCents } = splitGross(
    grossCents,
    legalEntity.defaultTaxRateBp,
  );
  const weekday = isoWeekdayOfDate(input.date);
  const description =
    `Platzbuchung ${court.name}, ${formatWeekday(weekday)} ` +
    `${formatDate(startAt)}, ${input.time} Uhr (${input.durationMin} min, manuell)`;

  const created = await createManualPaidOrderTx(ctx, {
    venueId: venue.id,
    legalEntityId: legalEntity.id,
    courtId: court.id,
    userId: customer.id,
    startAt,
    endAt,
    description,
    taxRateBp: legalEntity.defaultTaxRateBp,
    netCents,
    taxCents,
    grossCents,
    priceBreakdown,
    billingSnapshot: {
      name: customer.name,
      street: customer.billingStreet,
      zip: customer.billingZip,
      city: customer.billingCity,
      country: customer.billingCountry,
    },
    paymentMethod: input.paymentMethod,
    termsVersion: venue.termsVersion,
    actorUserId,
  });
  if (!created.ok) {
    throw new DomainError("SLOT_TAKEN", "Der Slot ist bereits belegt.");
  }

  await repos.auditLogs.create({
    actorUserId,
    entity: "Order",
    entityId: created.orderId,
    action: "admin.manual-order",
    diff: {
      paymentMethod: input.paymentMethod,
      grossCents,
      bookingId: created.bookingId,
    },
  });

  // Rechnung im bestehenden Weg erzeugen und zustellen (H-Serie)
  const invoice = await createInvoiceForOrder(created.orderId);
  await resendInvoiceEmail(invoice.id).catch(() => {
    // Mailfehler blockiert die Belegung nicht; Rechnung ist erzeugt
  });

  invalidateOccupancyCache();
  return {
    bookingId: created.bookingId,
    orderId: created.orderId,
    invoiceNumber: invoice.number,
  };
}

export async function moveBooking(
  ctx: TenantContext,
  params: {
    bookingId: string;
    courtId: string;
    date: string;
    time: string;
  },
  actorUserId: string,
): Promise<void> {
  const booking = await findBookingForAdmin(ctx, params.bookingId);
  if (!booking) throw new DomainError("NOT_FOUND", "Belegung nicht gefunden.");

  const durationMin = Math.round(
    (booking.endAt.getTime() - booking.startAt.getTime()) / 60_000,
  );
  const { startAt, endAt } = buildPeriod({
    timezone: booking.venue.timezone,
    slotMinutes: booking.venue.slotMinutes,
    date: params.date,
    time: params.time,
    durationMin,
  });

  const moved = await moveBookingRow(ctx, {
    bookingId: booking.id,
    courtId: params.courtId,
    startAt,
    endAt,
  });
  if (!moved.ok) {
    if ("conflict" in moved) {
      throw new DomainError("SLOT_TAKEN", "Der Ziel-Slot ist bereits belegt.");
    }
    throw new DomainError(
      "INVALID_TRANSITION",
      "Nur aktive Belegungen können verschoben werden.",
    );
  }
  await createRepositories(ctx).auditLogs.create({
    actorUserId,
    entity: "Booking",
    entityId: booking.id,
    action: "admin.move",
    diff: {
      from: {
        courtId: booking.courtId,
        startAt: booking.startAt.toISOString(),
      },
      to: { courtId: params.courtId, startAt: startAt.toISOString() },
    },
  });
  invalidateOccupancyCache();
}

export async function adminCancelBooking(
  ctx: TenantContext,
  bookingId: string,
  actorUserId: string,
): Promise<{ orderId: string | null }> {
  const booking = await findBookingForAdmin(ctx, bookingId);
  if (!booking) throw new DomainError("NOT_FOUND", "Belegung nicht gefunden.");

  const ok = await setBookingStatusAdmin(ctx, {
    bookingId,
    from: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"],
    to: "CANCELLED",
    actorUserId,
    reason: "ADMIN",
  });
  if (!ok) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "Nur aktive Belegungen können storniert werden.",
    );
  }
  await createRepositories(ctx).auditLogs.create({
    actorUserId,
    entity: "Booking",
    entityId: bookingId,
    action: "admin.cancel",
    diff: { previousStatus: booking.status },
  });
  invalidateOccupancyCache();
  return { orderId: booking.orderItem?.orderId ?? null };
}

export async function markNoShow(
  ctx: TenantContext,
  bookingId: string,
  actorUserId: string,
): Promise<void> {
  const ok = await setBookingStatusAdmin(ctx, {
    bookingId,
    from: ["CONFIRMED"],
    to: "NO_SHOW",
    actorUserId,
  });
  if (!ok) {
    throw new DomainError(
      "INVALID_TRANSITION",
      "No-Show ist nur für bestätigte Belegungen möglich.",
    );
  }
  await createRepositories(ctx).auditLogs.create({
    actorUserId,
    entity: "Booking",
    entityId: bookingId,
    action: "admin.no-show",
    diff: {},
  });
}
