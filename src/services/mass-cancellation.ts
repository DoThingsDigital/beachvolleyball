import { TZDate } from "@date-fns/tz";

import { formatCents, formatDateTime } from "@/lib/format";
import { createCreditEntry } from "@/src/db/bookings";
import {
  cancelAffectedBooking,
  findAffectedCustomerBookings,
} from "@/src/db/mass-cancellation";
import { createRepositories } from "@/src/db/repositories";
import type { TenantContext } from "@/src/db/tenant";
import { DomainError } from "@/src/domain/errors";
import { getBrandName, sendEmail } from "@/src/email/send";
import {
  MASS_CANCELLATION_TEMPLATE,
  MASS_CANCELLATION_VERSION,
  MassCancellationMail,
} from "@/src/email/templates/mass-cancellation-mail.v1";

import { invalidateOccupancyCache } from "./occupancy";
import { refundOrder } from "./refunds";

// Betreiber-Massenstorno (Ticket 5.6, I3): alle Kundentermine eines
// Zeitraums (Hallenausfall) stornieren, Erstattung als Geld oder Guthaben,
// EINE Sammelmail je Kunde. Unbezahlte Holds werden nur storniert.
// Geld-Erstattung läuft je Buchung über refundOrder (Gutschrift + Stripe);
// manuell bezahlte Bestellungen fallen auf Guthaben zurück und werden
// im Ergebnis zur Nacharbeit gemeldet.

export type MassCancellationInput = {
  venueId: string;
  /** "YYYY-MM-DD" lokal */
  dateFrom: string;
  dateTo: string;
  /** leer = alle Plätze */
  courtIds?: string[];
  reason: string;
  refundMode: "MONEY" | "CREDIT" | "NONE";
};

export type MassCancellationPreview = {
  affected: number;
  paidCents: number;
  customers: number;
};

function periodFromInput(
  input: Pick<MassCancellationInput, "dateFrom" | "dateTo">,
  timezone: string,
): { from: Date; to: Date } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.dateFrom) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.dateTo)
  ) {
    throw new DomainError("INVALID_PERIOD", "Zeitraum angeben.");
  }
  const [fy, fm, fd] = input.dateFrom.split("-").map(Number);
  const [ty, tm, td] = input.dateTo.split("-").map(Number);
  const from = new Date(new TZDate(fy!, fm! - 1, fd!, 0, 0, timezone).getTime());
  // dateTo ist inklusiv: Ende = Folgetag 00:00 lokal
  const to = new Date(new TZDate(ty!, tm! - 1, td! + 1, 0, 0, timezone).getTime());
  if (to.getTime() <= from.getTime()) {
    throw new DomainError("INVALID_PERIOD", "Ende muss nach Beginn liegen.");
  }
  return { from, to };
}

export async function previewMassCancellation(
  ctx: TenantContext,
  input: Omit<MassCancellationInput, "reason" | "refundMode">,
): Promise<MassCancellationPreview> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(input.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const { from, to } = periodFromInput(input, venue.timezone);

  const bookings = await findAffectedCustomerBookings(ctx, {
    venueId: venue.id,
    from,
    to,
    courtIds: input.courtIds,
  });
  const paidCents = bookings
    .filter(
      (b) =>
        b.status === "CONFIRMED" &&
        (b.orderItem?.order.status === "PAID" ||
          b.orderItem?.order.status === "PARTIALLY_REFUNDED"),
    )
    .reduce((sum, b) => sum + (b.priceCents ?? 0), 0);
  return {
    affected: bookings.length,
    paidCents,
    customers: new Set(bookings.map((b) => b.userId).filter(Boolean)).size,
  };
}

export type MassCancellationResult = {
  cancelled: number;
  refundedCents: number;
  creditedCents: number;
  emailsSent: number;
  /** Bestellungen, die manuell erstattet werden müssen (MANUAL-Zahlung) */
  manualFollowUps: string[];
};

export async function executeMassCancellation(
  ctx: TenantContext,
  input: MassCancellationInput,
  actorUserId: string,
): Promise<MassCancellationResult> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(input.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new DomainError("INVALID_PERIOD", "Grund angeben.");
  }
  const { from, to } = periodFromInput(input, venue.timezone);

  const bookings = await findAffectedCustomerBookings(ctx, {
    venueId: venue.id,
    from,
    to,
    courtIds: input.courtIds,
  });

  const result: MassCancellationResult = {
    cancelled: 0,
    refundedCents: 0,
    creditedCents: 0,
    emailsSent: 0,
    manualFollowUps: [],
  };

  type CustomerBucket = {
    email: string;
    userId: string;
    lines: string[];
    refundedCents: number;
    creditedCents: number;
  };
  const byCustomer = new Map<string, CustomerBucket>();

  for (const booking of bookings) {
    const cancelled = await cancelAffectedBooking(
      ctx,
      booking.id,
      actorUserId,
      `HALLENAUSFALL: ${reason}`,
    );
    if (!cancelled) continue; // parallel schon storniert → überspringen
    result.cancelled += 1;

    const amountCents = booking.priceCents ?? 0;
    const orderId = booking.orderItem?.orderId ?? null;
    const orderStatus = booking.orderItem?.order.status;
    const isPaid =
      booking.status === "CONFIRMED" &&
      (orderStatus === "PAID" || orderStatus === "PARTIALLY_REFUNDED");

    let refundedCents = 0;
    let creditedCents = 0;
    if (isPaid && amountCents > 0 && booking.userId) {
      if (input.refundMode === "MONEY" && orderId) {
        try {
          await refundOrder({
            orderId,
            amountCents,
            reason: `Hallenausfall: ${reason}`,
            actorUserId,
          });
          refundedCents = amountCents;
        } catch (error) {
          // Nur der erwartbare Fall "keine Stripe-Zahlung" (bar/Überweisung)
          // fällt auf Guthaben zurück und wird zur Nacharbeit gemeldet;
          // echte Fehler brechen den Lauf ab (erneut ausführbar).
          if (
            !(error instanceof DomainError) ||
            error.code !== "NOT_FOUND"
          ) {
            throw error;
          }
          await createCreditEntry(ctx, {
            userId: booking.userId,
            deltaCents: amountCents,
            reason: `Hallenausfall: ${reason} (manuelle Zahlung)`,
            refType: "booking",
            refId: booking.id,
          });
          creditedCents = amountCents;
          result.manualFollowUps.push(orderId);
        }
      } else if (input.refundMode === "CREDIT") {
        await createCreditEntry(ctx, {
          userId: booking.userId,
          deltaCents: amountCents,
          reason: `Hallenausfall: ${reason}`,
          refType: "booking",
          refId: booking.id,
        });
        creditedCents = amountCents;
      }
    }
    result.refundedCents += refundedCents;
    result.creditedCents += creditedCents;

    if (booking.user) {
      const bucket = byCustomer.get(booking.user.id) ?? {
        email: booking.user.email,
        userId: booking.user.id,
        lines: [],
        refundedCents: 0,
        creditedCents: 0,
      };
      bucket.lines.push(
        `${booking.court.name}, ${formatDateTime(booking.startAt)}`,
      );
      bucket.refundedCents += refundedCents;
      bucket.creditedCents += creditedCents;
      byCustomer.set(booking.user.id, bucket);
    }
  }

  invalidateOccupancyCache();

  // Eine Sammelmail je Kunde (I3). refundOrder verschickt zusätzlich die
  // Gutschrifts-Mails mit PDF – die Sammelmail fasst die Absage zusammen.
  for (const bucket of byCustomer.values()) {
    const refundParts: string[] = [];
    if (bucket.refundedCents > 0) {
      refundParts.push(
        `${formatCents(bucket.refundedCents)} erstatten wir auf dein Zahlungsmittel (Gutschrift folgt separat)`,
      );
    }
    if (bucket.creditedCents > 0) {
      refundParts.push(
        `${formatCents(bucket.creditedCents)} schreiben wir dir als Guthaben gut`,
      );
    }
    const refundText =
      refundParts.length > 0
        ? `Erstattung: ${refundParts.join("; ")}.`
        : "Für unbezahlte Reservierungen wird nichts abgebucht.";

    const sent = await sendEmail({
      to: bucket.email,
      subject: "Terminabsage – Hallenausfall",
      react: MassCancellationMail({
        brandName: getBrandName(),
        reason,
        bookings: bucket.lines,
        refundText,
      }),
      template: MASS_CANCELLATION_TEMPLATE,
      templateVersion: MASS_CANCELLATION_VERSION,
      userId: bucket.userId,
      refType: "mass-cancellation",
      refId: `${venue.id}:${input.dateFrom}:${input.dateTo}`,
    });
    if (sent.ok) result.emailsSent += 1;
  }

  await repos.auditLogs.create({
    actorUserId,
    entity: "Venue",
    entityId: venue.id,
    action: "admin.mass-cancellation",
    diff: {
      reason,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      refundMode: input.refundMode,
      cancelled: result.cancelled,
      refundedCents: result.refundedCents,
      creditedCents: result.creditedCents,
    },
  });

  return result;
}
