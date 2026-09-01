import { TZDate } from "@date-fns/tz";
import Link from "next/link";

import { formatCents, formatDateTime, formatWeekday } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { findBookingsForAdminCalendar } from "@/src/db/admin-calendar";
import { findMemberWindowBlocks } from "@/src/db/blocks";
import { createRepositories } from "@/src/db/repositories";
import { listBlockOccurrences } from "@/src/domain/block-occurrences";
import {
  addDays,
  instantsToDayMinutes,
  isoWeekdayOfDate,
  localDateStart,
} from "@/src/domain/week-occupancy";

import { getSelectedVenue } from "../_lib/selected-venue";
import { BookingActionPanel, ManualBookingForm } from "./booking-forms";

// Admin-Kalender (Ticket 5.4, K4): Tagesansicht über alle Plätze oder
// Wochenansicht je Platz; Zellen öffnen Aktionen (manuelle Belegung,
// Verschieben, Stornieren, No-Show). Anzeige inkl. HOLD/RELEASED/NO_SHOW.

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

type SearchParams = {
  tag?: string;
  platz?: string;
  belegung?: string;
  slot?: string;
};

type CellBooking = {
  id: string;
  short: string;
  status: string;
  kind: string;
  usageType: string;
  isStart: boolean;
};

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-booked text-stone",
  HOLD: "bg-sun-gold/40",
  PENDING_PAYMENT: "bg-sun-gold/40",
  RELEASED: "border-ice-deep text-ice-deep border border-dashed bg-transparent",
  NO_SHOW: "bg-destructive/15 text-destructive line-through",
};

function cellStyle(b: CellBooking, selected: boolean): string {
  if (selected) return "bg-primary text-primary-foreground";
  if (b.status === "CONFIRMED" && b.kind === "BLOCK") {
    return b.usageType === "VEREIN" || b.usageType === "LIGA"
      ? "bg-ice/45 text-ice-deep"
      : "bg-booked text-stone line-through";
  }
  return STATUS_STYLES[b.status] ?? "bg-booked text-stone";
}

function shortLabel(b: {
  label: string | null;
  user: { name: string | null; email: string } | null;
  block: { title: string } | null;
  kind: string;
  status: string;
}): string {
  if (b.status === "RELEASED") return "frei*";
  if (b.label) return b.label;
  if (b.kind === "BLOCK") return b.block?.title ?? "Sperre";
  if (b.user) return b.user.name ?? b.user.email;
  return "belegt";
}

function localMinutes(instant: Date, timezone: string): number {
  const local = new TZDate(instant.getTime(), timezone);
  return local.getHours() * 60 + local.getMinutes();
}

function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function todayLocal(timezone: string): string {
  const now = new TZDate(Date.now(), timezone);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default async function AdminKalenderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }

  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.tag ?? "")
    ? params.tag!
    : todayLocal(venue.timezone);

  const courts = await repos.courts.findManyForVenue(venue.id);
  const selectedCourt = courts.find((c) => c.id === params.platz) ?? null;

  // Anzeigetage: Tagesansicht = 1 Tag; Wochenansicht je Platz = 7 Tage ab `date`
  const dates = selectedCourt
    ? Array.from({ length: 7 }, (_, i) => addDays(date, i))
    : [date];

  const rangeFrom = new Date(localDateStart(dates[0]!, venue.timezone));
  const rangeTo = new Date(
    localDateStart(addDays(dates[dates.length - 1]!, 1), venue.timezone),
  );
  const bookings = await findBookingsForAdminCalendar(staff.ctx, {
    venueId: venue.id,
    from: rangeFrom,
    to: rangeTo,
  });

  const memberWindowBlocks = await findMemberWindowBlocks(staff.ctx, venue.id);

  const openingHours = venue.openingHours as Record<string, [string, string][]>;

  // Slot-Raster: gemeinsame Spanne über alle angezeigten Tage
  let gridStart = 24 * 60;
  let gridEnd = 0;
  for (const d of dates) {
    const windows = openingHours[WEEKDAY_KEYS[isoWeekdayOfDate(d) - 1]!] ?? [];
    for (const [from, to] of windows) {
      const [fh, fm] = from.split(":").map(Number);
      const [th, tm] = to.split(":").map(Number);
      gridStart = Math.min(gridStart, (fh ?? 0) * 60 + (fm ?? 0));
      gridEnd = Math.max(gridEnd, (th ?? 0) * 60 + (tm ?? 0));
    }
  }
  if (gridEnd <= gridStart) {
    gridStart = 8 * 60;
    gridEnd = 22 * 60;
  }
  const slotMinutes = venue.slotMinutes;
  const times: number[] = [];
  for (let t = gridStart; t + slotMinutes <= gridEnd; t += slotMinutes) {
    times.push(t);
  }

  // Mitglieder-Buchungsfenster (E-005) sichtbar machen: die Slots sind
  // physisch frei, aber der Betreiber soll die Vereinszeit erkennen.
  const windowCells = new Set<string>();
  for (const block of memberWindowBlocks) {
    for (const occurrence of listBlockOccurrences({
      block,
      timezone: venue.timezone,
      windowFrom: rangeFrom,
      windowTo: rangeTo,
    })) {
      for (const d of dates) {
        const minutes = instantsToDayMinutes(
          occurrence.startAt,
          occurrence.endAt,
          d,
          venue.timezone,
        );
        if (!minutes) continue;
        for (let t = gridStart; t < gridEnd; t += slotMinutes) {
          if (t < minutes.endMin && minutes.startMin < t + slotMinutes) {
            windowCells.add(`${d}#${block.courtId}#${t}`);
          }
        }
      }
    }
  }

  // Zellenzuordnung je (Datum, Court, SlotMin)
  const cellMap = new Map<string, CellBooking>();
  for (const b of bookings) {
    for (const d of dates) {
      const dayStart = localDateStart(d, venue.timezone);
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const startMs = Math.max(b.startAt.getTime(), dayStart);
      const endMs = Math.min(b.endAt.getTime(), dayEnd);
      if (endMs <= startMs) continue;
      const startMin = localMinutes(new Date(startMs), venue.timezone);
      const endMin =
        endMs === dayEnd ? 24 * 60 : localMinutes(new Date(endMs), venue.timezone);
      for (let t = gridStart; t < gridEnd; t += slotMinutes) {
        if (t < endMin && startMin < t + slotMinutes) {
          cellMap.set(`${d}#${b.courtId}#${t}`, {
            id: b.id,
            short: shortLabel(b),
            status: b.status,
            kind: b.kind,
            usageType: b.usageType,
            isStart: t <= startMin,
          });
        }
      }
    }
  }

  const selectedBooking = params.belegung
    ? (bookings.find((b) => b.id === params.belegung) ?? null)
    : null;
  const [slotCourtId, slotTime] = (params.slot ?? "").split("|");
  const slotCourt = courts.find((c) => c.id === slotCourtId) ?? null;

  const q = (extra: Record<string, string | undefined>) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries({
      tag: date,
      platz: selectedCourt?.id,
      ...extra,
    })) {
      if (v) query.set(k, v);
    }
    return `/admin/kalender?${query.toString()}`;
  };

  const durations = [1, 2, 3, 4]
    .map((n) => n * 60)
    .filter((d) => d % slotMinutes === 0);

  const columns = selectedCourt
    ? dates.map((d) => ({
        key: d,
        head: `${WEEKDAY_SHORT[isoWeekdayOfDate(d) - 1]} ${d.slice(8)}.${d.slice(5, 7)}.`,
        date: d,
        courtId: selectedCourt.id,
      }))
    : courts.map((c) => ({ key: c.id, head: c.name, date, courtId: c.id }));

  const selectedBookingLocal = selectedBooking
    ? {
        date: (() => {
          const l = new TZDate(selectedBooking.startAt.getTime(), venue.timezone);
          return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, "0")}-${String(l.getDate()).padStart(2, "0")}`;
        })(),
        time: minToTime(localMinutes(selectedBooking.startAt, venue.timezone)),
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Kalender – {venue.name}</h1>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={q({ tag: addDays(date, selectedCourt ? -7 : -1) })}
            className="hover:bg-accent rounded-md border px-2 py-1"
            aria-label={selectedCourt ? "Vorherige Woche" : "Vorheriger Tag"}
          >
            ‹
          </Link>
          <span className="min-w-40 px-2 text-center font-medium">
            {selectedCourt
              ? `${selectedCourt.name} · Woche ab ${date.split("-").reverse().join(".")}`
              : `${formatWeekday(isoWeekdayOfDate(date))}, ${date.split("-").reverse().join(".")}`}
          </span>
          <Link
            href={q({ tag: addDays(date, selectedCourt ? 7 : 1) })}
            className="hover:bg-accent rounded-md border px-2 py-1"
            aria-label={selectedCourt ? "Nächste Woche" : "Nächster Tag"}
          >
            ›
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Ansicht:</span>
        <Link
          href={q({ platz: undefined })}
          className={
            "rounded-full border px-3 py-1 font-semibold " +
            (!selectedCourt ? "bg-primary text-primary-foreground border-primary" : "bg-card")
          }
        >
          Tag (alle Plätze)
        </Link>
        {courts.map((c) => (
          <Link
            key={c.id}
            href={q({ platz: c.id })}
            className={
              "rounded-full border px-3 py-1 font-semibold " +
              (selectedCourt?.id === c.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card")
            }
          >
            {c.name}
          </Link>
        ))}
        <Link
          href="/admin/sperren"
          className="text-coral-deep ml-auto text-sm font-bold hover:underline"
        >
          Sperre anlegen →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="w-12 p-1" />
              {columns.map((col) => (
                <th key={col.key} className="text-muted-foreground p-1 font-normal">
                  {col.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t}>
                <td className="text-muted-foreground p-1 text-left align-top">
                  {minToTime(t)}
                </td>
                {columns.map((col) => {
                  const cell = cellMap.get(`${col.date}#${col.courtId}#${t}`);
                  if (!cell) {
                    const slotParam = `${col.courtId}|${minToTime(t)}`;
                    const isSelected =
                      params.slot === slotParam && date === col.date;
                    const inWindow = windowCells.has(
                      `${col.date}#${col.courtId}#${t}`,
                    );
                    return (
                      <td key={col.key} className="p-0.5">
                        <Link
                          href={q({
                            tag: col.date,
                            slot: slotParam,
                            belegung: undefined,
                          })}
                          aria-label={
                            `${col.head} ${minToTime(t)} frei – Belegung anlegen` +
                            (inWindow ? " (Mitglieder-Fenster)" : "")
                          }
                          className={
                            "block rounded p-1 " +
                            (isSelected
                              ? "bg-primary text-primary-foreground"
                              : inWindow
                                ? "bg-ice/45 border-ice-deep/40 hover:border-primary border"
                                : "bg-card border-border/60 hover:border-primary border")
                          }
                        >
                          {isSelected ? "✓" : inWindow ? "M" : ""}
                        </Link>
                      </td>
                    );
                  }
                  const isSelected = params.belegung === cell.id;
                  return (
                    <td key={col.key} className="p-0.5">
                      <Link
                        href={q({
                          tag: col.date,
                          belegung: cell.id,
                          slot: undefined,
                        })}
                        aria-label={`${col.head} ${minToTime(t)}: ${cell.short}`}
                        className={
                          "block truncate rounded p-1 font-medium " +
                          cellStyle(cell, isSelected)
                        }
                      >
                        {cell.isStart ? cell.short : "·"}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {slotCourt && slotTime ? (
        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h2 className="text-lg font-medium">
            Neue Belegung · {slotCourt.name}, {date.split("-").reverse().join(".")}{" "}
            {slotTime} Uhr
          </h2>
          <ManualBookingForm
            venueId={venue.id}
            courts={courts.map((c) => ({ id: c.id, name: c.name }))}
            date={date}
            time={slotTime}
            courtId={slotCourt.id}
            durations={durations.length > 0 ? durations : [slotMinutes]}
          />
        </section>
      ) : null}

      {selectedBooking && selectedBookingLocal ? (
        <section
          className="flex flex-col gap-3 rounded-md border p-3"
          data-testid="booking-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">
              {shortLabel(selectedBooking)} ·{" "}
              {formatDateTime(selectedBooking.startAt)}
            </h2>
            <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-semibold">
              {selectedBooking.status}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4">
            <dt className="text-muted-foreground">Art</dt>
            <dd>
              {selectedBooking.kind} / {selectedBooking.usageType}
            </dd>
            <dt className="text-muted-foreground">Kunde</dt>
            <dd>
              {selectedBooking.user
                ? (selectedBooking.user.name ?? selectedBooking.user.email)
                : "–"}
            </dd>
            <dt className="text-muted-foreground">Preis</dt>
            <dd>
              {selectedBooking.priceCents != null
                ? formatCents(selectedBooking.priceCents)
                : "–"}
            </dd>
            <dt className="text-muted-foreground">Bestellung</dt>
            <dd>
              {selectedBooking.orderItem ? (
                <Link
                  href={`/admin/bestellungen/${selectedBooking.orderItem.orderId}`}
                  className="text-coral-deep font-bold hover:underline"
                >
                  öffnen →
                </Link>
              ) : (
                "–"
              )}
            </dd>
          </dl>
          <BookingActionPanel
            bookingId={selectedBooking.id}
            status={selectedBooking.status}
            courts={courts.map((c) => ({ id: c.id, name: c.name }))}
            currentCourtId={selectedBooking.courtId}
            date={selectedBookingLocal.date}
            time={selectedBookingLocal.time}
          />
        </section>
      ) : null}

      <p className="text-muted-foreground text-xs">
        frei* = freigegebener Vereins-Slot (kommerziell buchbar) · M =
        Mitglieder-Buchungsfenster (Mitglieder buchen selbst; als Admin kannst
        du trotzdem manuell belegen) · Klick auf eine freie Zelle legt eine
        Belegung an, Klick auf eine Belegung öffnet die Aktionen.
      </p>
    </div>
  );
}
