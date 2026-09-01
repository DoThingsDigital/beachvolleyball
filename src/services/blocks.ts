import { TZDate } from "@date-fns/tz";

import {
  cancelBlockBookings,
  createBlockBooking,
  findMaterializedBookings,
  materializationWindow,
  BLOCK_RULE_CANCEL_REASON,
} from "@/src/db/blocks";
import { createRepositories } from "@/src/db/repositories";
import type { TenantContext } from "@/src/db/tenant";
import {
  listBlockOccurrences,
  usageTypeForBlockType,
} from "@/src/domain/block-occurrences";
import { DomainError } from "@/src/domain/errors";

import { invalidateOccupancyCache } from "./occupancy";

// Sperren (Ticket 5.1, E1/E2): CRUD + Materialisierung in Bookings.
// Die Regel (Block) ist nur die Quelle; verbindlich sind die
// materialisierten Belegungen, die dem Exclusion-Constraint unterliegen.

export type BlockType = "VEREIN" | "LIGA" | "WARTUNG" | "EVENT" | "GESPERRT";

export type MaterializeResult = {
  created: number;
  cancelled: number;
  kept: number;
  /** Termine, die wegen bestehender Buchungen übersprungen wurden */
  skippedConflicts: Date[];
};

const ISO_TO_BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

function occurrenceKey(startAt: Date, endAt: Date): string {
  return `${startAt.getTime()}|${endAt.getTime()}`;
}

/** Materialisiert einen Block im Saisonhorizont (idempotent).
 *  - bestehende passende Termine bleiben erhalten (auch RELEASED),
 *  - regelgetriebene Stornos dürfen neu entstehen, manuelle nicht,
 *  - weggefallene zukünftige Termine werden storniert,
 *  - Konflikte mit fremden Buchungen werden übersprungen und gemeldet. */
export async function materializeBlock(
  ctx: TenantContext,
  blockId: string,
  opts: { now?: Date; actorUserId?: string | null } = {},
): Promise<MaterializeResult> {
  const repos = createRepositories(ctx);
  const block = await repos.blocks.findById(blockId);
  if (!block) throw new DomainError("NOT_FOUND", "Sperre nicht gefunden.");
  const venue = await repos.venues.findById(block.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");

  const now = opts.now ?? new Date();
  const window = await materializationWindow(ctx, block.venueId);
  const empty: MaterializeResult = {
    created: 0,
    cancelled: 0,
    kept: 0,
    skippedConflicts: [],
  };
  if (!window || window.to.getTime() <= now.getTime()) return empty;

  const from = new Date(Math.max(window.from.getTime(), now.getTime()));
  const desired = listBlockOccurrences({
    block,
    timezone: venue.timezone,
    windowFrom: from,
    windowTo: window.to,
  });
  const desiredByKey = new Map(
    desired.map((o) => [occurrenceKey(o.startAt, o.endAt), o]),
  );

  const existing = await findMaterializedBookings(ctx, blockId, from);
  const activeByKey = new Map<string, string>();
  const tombstones = new Set<string>();
  const toCancel: string[] = [];
  for (const b of existing) {
    const key = occurrenceKey(b.startAt, b.endAt);
    if (b.status === "CONFIRMED" || b.status === "RELEASED") {
      if (desiredByKey.has(key) || b.status === "RELEASED") {
        // RELEASED bleibt immer stehen (Report-Vorhaltung, blockiert nicht);
        // ein passender aktiver Termin wird nie neu angelegt.
        activeByKey.set(key, b.id);
      } else {
        toCancel.push(b.id);
      }
    } else if (
      b.status === "CANCELLED" &&
      b.cancelReason !== BLOCK_RULE_CANCEL_REASON
    ) {
      // Manuell stornierter Termin bleibt gestrichen (kein Wiederaufleben)
      tombstones.add(key);
    }
  }

  const result: MaterializeResult = {
    created: 0,
    cancelled: 0,
    kept: activeByKey.size,
    skippedConflicts: [],
  };

  result.cancelled = await cancelBlockBookings(
    ctx,
    toCancel,
    opts.actorUserId ?? null,
  );

  const usageType = usageTypeForBlockType(block.type as BlockType);
  for (const occurrence of desired) {
    const key = occurrenceKey(occurrence.startAt, occurrence.endAt);
    if (activeByKey.has(key) || tombstones.has(key)) continue;
    const created = await createBlockBooking(ctx, {
      venueId: block.venueId,
      courtId: block.courtId,
      blockId: block.id,
      clubId: block.clubId,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      usageType,
    });
    if (created.ok) result.created += 1;
    else result.skippedConflicts.push(occurrence.startAt);
  }

  invalidateOccupancyCache();
  return result;
}

export type BlockInput = {
  venueId: string;
  courtId: string;
  type: BlockType;
  title: string;
  clubId?: string | null;
  /** "YYYY-MM-DD" (lokal): Datum des ersten Termins */
  date: string;
  /** "HH:MM" lokal */
  timeFrom: string;
  timeTo: string;
  /** ISO-Wochentage 1–7; leer/undefined = einmalige Sperre */
  weekdays?: number[];
  /** "YYYY-MM-DD" (lokal, inklusiv); nur für wiederkehrende Sperren */
  untilDate?: string | null;
};

function buildRule(
  input: BlockInput,
  timezone: string,
): { startAt: Date; endAt: Date; rrule: string | null } {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    !/^\d{2}:\d{2}$/.test(input.timeFrom) ||
    !/^\d{2}:\d{2}$/.test(input.timeTo)
  ) {
    throw new DomainError("INVALID_PERIOD", "Ungültige Datums- oder Zeitangabe.");
  }
  if (input.timeTo <= input.timeFrom) {
    throw new DomainError("INVALID_PERIOD", "Ende muss nach Beginn liegen.");
  }
  const [y, m, d] = input.date.split("-").map(Number);
  const [fh, fm] = input.timeFrom.split(":").map(Number);
  const [th, tm] = input.timeTo.split(":").map(Number);
  const startAt = new Date(
    new TZDate(y!, m! - 1, d!, fh!, fm!, timezone).getTime(),
  );
  const endAt = new Date(
    new TZDate(y!, m! - 1, d!, th!, tm!, timezone).getTime(),
  );

  const weekdays = [...new Set(input.weekdays ?? [])].sort((a, b) => a - b);
  if (weekdays.length === 0) return { startAt, endAt, rrule: null };

  if (weekdays.some((w) => w < 1 || w > 7)) {
    throw new DomainError("INVALID_PERIOD", "Ungültiger Wochentag.");
  }
  const byday = weekdays.map((w) => ISO_TO_BYDAY[w - 1]!).join(",");
  let until = "";
  if (input.untilDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.untilDate)) {
      throw new DomainError("INVALID_PERIOD", "Ungültiges Enddatum.");
    }
    const [uy, um, ud] = input.untilDate.split("-").map(Number);
    // Ende des lokalen Tages als UTC-Instant (inklusives UNTIL)
    const untilInstant = new Date(
      new TZDate(uy!, um! - 1, ud!, 23, 59, 59, timezone).getTime(),
    );
    if (untilInstant.getTime() < startAt.getTime()) {
      throw new DomainError("INVALID_PERIOD", "Enddatum liegt vor dem Beginn.");
    }
    until =
      ";UNTIL=" +
      untilInstant
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
  }
  return { startAt, endAt, rrule: `FREQ=WEEKLY;BYDAY=${byday}${until}` };
}

export async function createBlock(
  ctx: TenantContext,
  input: BlockInput,
  actorUserId: string,
): Promise<{ blockId: string; materialized: MaterializeResult }> {
  const repos = createRepositories(ctx);
  const venue = await repos.venues.findById(input.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  const courts = await repos.courts.findManyForVenue(venue.id);
  if (!courts.some((c) => c.id === input.courtId)) {
    throw new DomainError("NOT_FOUND", "Platz nicht gefunden.");
  }
  if (input.type === "VEREIN" && !input.clubId) {
    throw new DomainError(
      "INVALID_PERIOD",
      "Vereinskontingent braucht einen Verein.",
    );
  }
  const title = input.title.trim();
  if (title.length < 2) {
    throw new DomainError("INVALID_PERIOD", "Bitte einen Titel angeben.");
  }

  const rule = buildRule(input, venue.timezone);
  const block = await repos.blocks.create({
    venueId: input.venueId,
    courtId: input.courtId,
    clubId: input.clubId ?? null,
    type: input.type,
    title,
    startAt: rule.startAt,
    endAt: rule.endAt,
    rrule: rule.rrule,
    createdByUserId: actorUserId,
  });
  await repos.auditLogs.create({
    actorUserId,
    entity: "Block",
    entityId: block.id,
    action: "CREATE",
    diff: {
      type: input.type,
      title,
      courtId: input.courtId,
      rrule: rule.rrule,
      startAt: rule.startAt.toISOString(),
      endAt: rule.endAt.toISOString(),
    },
  });

  const materialized = await materializeBlock(ctx, block.id, { actorUserId });
  return { blockId: block.id, materialized };
}

export async function updateBlock(
  ctx: TenantContext,
  blockId: string,
  input: BlockInput,
  actorUserId: string,
): Promise<MaterializeResult> {
  const repos = createRepositories(ctx);
  const block = await repos.blocks.findById(blockId);
  if (!block) throw new DomainError("NOT_FOUND", "Sperre nicht gefunden.");
  const venue = await repos.venues.findById(block.venueId);
  if (!venue) throw new DomainError("NOT_FOUND", "Standort nicht gefunden.");
  if (input.type === "VEREIN" && !input.clubId) {
    throw new DomainError(
      "INVALID_PERIOD",
      "Vereinskontingent braucht einen Verein.",
    );
  }
  const title = input.title.trim();
  if (title.length < 2) {
    throw new DomainError("INVALID_PERIOD", "Bitte einen Titel angeben.");
  }

  const rule = buildRule(input, venue.timezone);
  const ok = await repos.blocks.update(blockId, {
    courtId: input.courtId,
    clubId: input.clubId ?? null,
    type: input.type,
    title,
    startAt: rule.startAt,
    endAt: rule.endAt,
    rrule: rule.rrule,
  });
  if (!ok) throw new DomainError("NOT_FOUND", "Sperre nicht gefunden.");
  await repos.auditLogs.create({
    actorUserId,
    entity: "Block",
    entityId: blockId,
    action: "UPDATE",
    diff: {
      type: input.type,
      title,
      courtId: input.courtId,
      rrule: rule.rrule,
      startAt: rule.startAt.toISOString(),
      endAt: rule.endAt.toISOString(),
    },
  });

  return materializeBlock(ctx, blockId, { actorUserId });
}

/** Beendet eine Sperre ab jetzt: zukünftige materialisierte Termine werden
 *  storniert, die Regel wird auf UNTIL=jetzt begrenzt. Vergangene Termine
 *  bleiben unverändert (Reports). */
export async function endBlock(
  ctx: TenantContext,
  blockId: string,
  actorUserId: string,
): Promise<{ cancelled: number }> {
  const repos = createRepositories(ctx);
  const block = await repos.blocks.findById(blockId);
  if (!block) throw new DomainError("NOT_FOUND", "Sperre nicht gefunden.");

  const now = new Date();
  const future = await findMaterializedBookings(ctx, blockId, now);
  const cancelled = await cancelBlockBookings(
    ctx,
    future.filter((b) => b.status === "CONFIRMED").map((b) => b.id),
    actorUserId,
  );

  if (block.rrule) {
    const until =
      ";UNTIL=" +
      now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
    const base = block.rrule.replace(/;?UNTIL=[0-9TZ]+/i, "");
    await repos.blocks.update(blockId, { rrule: `${base}${until}` });
  }
  await repos.auditLogs.create({
    actorUserId,
    entity: "Block",
    entityId: blockId,
    action: "END",
    diff: { cancelled, endedAt: now.toISOString() },
  });

  invalidateOccupancyCache();
  return { cancelled };
}
