import { TZDate } from "@date-fns/tz";
import Link from "next/link";

import { formatCents, formatWeekday } from "@/lib/format";
import { auth } from "@/src/auth";
import { isActiveClubMember } from "@/src/db/club-memberships";
import { DomainError } from "@/src/domain/errors";
import { addDays, isoWeekdayOfDate } from "@/src/domain/week-occupancy";
import { getWeekOccupancy } from "@/src/services/occupancy";
import { getPublicShopContext } from "@/src/services/public-context";
import { getSingleBookingQuote } from "@/src/services/single-booking";

import { BookButton } from "./book-button";

// Öffentlicher Belegungskalender (Ticket 4.2, D1/D2/C4): Tagesansicht mit
// Wochennavigation, Zustände je Slot, Preisvorschau, Auswahl mit Dauer.
// Vollständig serverseitig; jede Zelle ist ein Link (tastaturbedienbar, NF8).

const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

type SearchParams = {
  tag?: string;
  zeit?: string;
  platz?: string;
  dauer?: string;
};

function todayLocal(timezone: string): string {
  const now = new TZDate(Date.now(), timezone);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function q(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/kalender?${search.toString()}`;
}

// Zell-Zustände laut CI (Slot-Raster 5b): frei = weiß mit Border, Hover
// coral-Ring; belegt = booked-bg mit stone-Text; ausgewählt = coral.
const STATE_STYLES: Record<string, string> = {
  FREI: "bg-card border hover:border-primary hover:ring-1 hover:ring-primary",
  BELEGT: "bg-booked text-stone",
  VEREIN: "bg-ice/45 text-ice-deep",
  GESPERRT: "bg-booked text-stone line-through",
};

const STATE_LABELS: Record<string, string> = {
  FREI: "frei",
  BELEGT: "belegt",
  VEREIN: "Vereinskontingent",
  GESPERRT: "gesperrt",
};

// Immer live rendern: der frühe null-Return (Shop-Kontext) läuft vor jeder
// dynamic API – bei leerer DB zur Build-Zeit würde Next die Seite sonst als
// statisch einfrieren (Query-Parameter würden dann ignoriert).
export const dynamic = "force-dynamic";

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const shop = await getPublicShopContext();
  if (!shop) {
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">
          Der Kalender ist aktuell nicht verfügbar.
        </p>
      </main>
    );
  }
  const { ctx, venue } = shop;
  const params = await searchParams;

  const today = todayLocal(venue.timezone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.tag ?? "")
    ? params.tag!
    : today;
  const weekStart = addDays(date, -(isoWeekdayOfDate(date) - 1));

  const week = await getWeekOccupancy(ctx, {
    venueId: venue.id,
    startDate: weekStart,
  });
  const day = week.days.find((d) => d.date === date) ?? week.days[0]!;

  // Buchbarkeitsfenster (D2): Vorlauf + Horizont in lokaler Zeit
  const now = Date.now();
  const minStartMs = now + venue.leadTimeMin * 60_000;
  const maxStartMs = now + venue.horizonDays * DAY_MS;

  const selectedTime = params.zeit ?? null;
  const selectedCourtId = params.platz ?? null;

  // Passende Dauern: zusammenhängende FREI-Slots ab der Auswahl
  const fittingDurations: number[] = [];
  if (selectedTime && selectedCourtId) {
    const startIndex = day.slots.findIndex((s) => s.time === selectedTime);
    if (startIndex >= 0) {
      let freeRun = 0;
      for (let i = startIndex; i < day.slots.length; i++) {
        const slot = day.slots[i]!;
        const contiguous =
          i === startIndex ||
          slot.startMin === day.slots[i - 1]!.startMin + venue.slotMinutes;
        if (!contiguous || slot.states[selectedCourtId] !== "FREI") break;
        freeRun += venue.slotMinutes;
      }
      for (
        let d = venue.minDurationMin;
        d <= Math.min(venue.maxDurationMin, freeRun);
        d += venue.slotMinutes
      ) {
        fittingDurations.push(d);
      }
    }
  }
  const durationMin = fittingDurations.includes(Number(params.dauer))
    ? Number(params.dauer)
    : (fittingDurations[0] ?? null);

  // Preisvorschau (C4): Gast sieht Nichtmitgliederpreis, eingeloggte
  // Mitglieder ihren Mitgliederpreis (A4)
  const session = await auth();
  const isMember = session?.user
    ? await isActiveClubMember(ctx, session.user.id)
    : false;

  let quote: {
    grossCents: number;
    description: string;
    memberRateApplied: boolean;
  } | null = null;
  let quoteError: string | null = null;
  if (selectedTime && selectedCourtId && durationMin) {
    try {
      const result = await getSingleBookingQuote(ctx, {
        venueId: venue.id,
        courtId: selectedCourtId,
        date,
        time: selectedTime,
        durationMin,
        isMember,
        userId: session?.user?.id ?? null,
      });
      quote = {
        grossCents: result.grossCents,
        description: result.description,
        memberRateApplied: result.memberRateApplied,
      };
    } catch (error) {
      quoteError =
        error instanceof DomainError ? error.message : "Preis nicht verfügbar.";
    }
  }

  const selectedCourt = week.courts.find((c) => c.id === selectedCourtId);

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 p-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Belegungskalender</h1>
        <p className="text-muted-foreground text-sm">
          {venue.name} · {formatWeekday(day.weekday)},{" "}
          {date.split("-").reverse().join(".")}
        </p>
      </header>

      <nav aria-label="Woche wählen" className="flex items-center gap-1">
        <Link
          href={q({ tag: addDays(weekStart, -7) })}
          aria-label="Vorherige Woche"
          className="hover:bg-accent rounded-md border px-2 py-1 text-sm"
        >
          ‹
        </Link>
        <div className="flex flex-1 justify-center gap-1">
          {week.days.map((d, i) => (
            <Link
              key={d.date}
              href={q({ tag: d.date })}
              aria-current={d.date === date ? "date" : undefined}
              className={
                "rounded-full px-2.5 py-1 text-center text-sm font-semibold " +
                (d.date === date
                  ? "bg-foreground text-background"
                  : "bg-card border hover:border-primary")
              }
            >
              <span className="block text-xs">{WEEKDAY_SHORT[i]}</span>
              {d.date.slice(8)}
            </Link>
          ))}
        </div>
        <Link
          href={q({ tag: addDays(weekStart, 7) })}
          aria-label="Nächste Woche"
          className="hover:bg-accent rounded-md border px-2 py-1 text-sm"
        >
          ›
        </Link>
      </nav>

      <table className="w-full table-fixed border-collapse text-center text-sm">
        <thead>
          <tr>
            <th className="w-12 p-1" />
            {week.courts.map((court) => (
              <th key={court.id} className="text-muted-foreground truncate p-1 font-normal">
                {court.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {day.slots.map((slot) => {
            const slotStartMs =
              new TZDate(
                Number(date.slice(0, 4)),
                Number(date.slice(5, 7)) - 1,
                Number(date.slice(8, 10)),
                Math.floor(slot.startMin / 60),
                slot.startMin % 60,
                venue.timezone,
              ).getTime();
            const bookable =
              slotStartMs >= minStartMs && slotStartMs <= maxStartMs;
            return (
              <tr key={slot.time}>
                <td className="text-muted-foreground p-0.5 text-left text-xs">
                  {slot.time}
                </td>
                {week.courts.map((court) => {
                  const state = slot.states[court.id] ?? "FREI";
                  const isSelected =
                    slot.time === selectedTime && court.id === selectedCourtId;
                  // Mitglieder-Buchungsfenster (E-005): vor der Freigabe-
                  // frist nur für Mitglieder auswählbar
                  const windowReleaseHours = slot.memberWindows[court.id];
                  const membersOnly =
                    windowReleaseHours !== undefined &&
                    now < slotStartMs - windowReleaseHours * 3_600_000;
                  if (state === "FREI" && bookable && (!membersOnly || isMember)) {
                    return (
                      <td key={court.id} className="p-0.5">
                        <Link
                          href={q({
                            tag: date,
                            zeit: slot.time,
                            platz: court.id,
                          })}
                          aria-label={
                            `${court.name} ${slot.time} frei` +
                            (membersOnly ? " (Mitglieder-Slot)" : "")
                          }
                          className={
                            "block rounded p-1.5 " +
                            (isSelected
                              ? "bg-primary text-primary-foreground"
                              : membersOnly
                                ? "bg-ice/45 border-ice-deep/40 hover:border-primary border"
                                : STATE_STYLES.FREI)
                          }
                        >
                          {isSelected ? "✓" : ""}
                        </Link>
                      </td>
                    );
                  }
                  if (state === "FREI" && membersOnly) {
                    return (
                      <td key={court.id} className="p-0.5">
                        <span
                          aria-label={`${court.name} ${slot.time} Vereins-Slot (nur Mitglieder)`}
                          className="bg-ice/45 text-ice-deep block rounded p-1.5 text-xs"
                        >
                          M
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={court.id} className="p-0.5">
                      <span
                        aria-label={`${court.name} ${slot.time} ${state === "FREI" ? "nicht buchbar" : STATE_LABELS[state]}`}
                        className={
                          "block rounded p-1.5 text-xs " +
                          (state === "FREI"
                            ? "text-muted-foreground/40"
                            : STATE_STYLES[state])
                        }
                      >
                        {state === "FREI" ? "·" : ""}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-muted-foreground text-xs">
        <span className="bg-card rounded border px-1.5">frei</span> ·{" "}
        <span className="bg-booked text-stone rounded px-1.5">belegt</span> ·{" "}
        <span className="bg-ice/45 text-ice-deep rounded px-1.5">
          M = Mitglieder-Slot
        </span>{" "}
        (für Vereinsmitglieder buchbar, wird {venue.releaseHoursBefore} Std.
        vor Beginn für alle frei) ·{" "}
        <span className="bg-booked text-stone rounded px-1.5 line-through">
          gesperrt
        </span>{" "}
        · Preise sind Nichtmitgliederpreise
      </p>

      {selectedTime && selectedCourt ? (
        <section className="flex flex-col gap-3 rounded-md border p-3">
          <h2 className="text-sm font-medium">
            {selectedCourt.name} · {selectedTime} Uhr
          </h2>
          {fittingDurations.length > 0 ? (
            <div className="flex gap-2">
              {fittingDurations.map((d) => (
                <Link
                  key={d}
                  href={q({
                    tag: date,
                    zeit: selectedTime,
                    platz: selectedCourt.id,
                    dauer: String(d),
                  })}
                  className={
                    "rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
                    (d === durationMin
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card hover:border-primary")
                  }
                >
                  {d / 60 === 1 ? "1 Stunde" : `${d / 60} Stunden`}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Ab dieser Zeit ist keine buchbare Dauer mehr frei.
            </p>
          )}

          {quote && durationMin ? (
            <>
              <p className="text-sm" data-testid="booking-quote">
                {quote.description} ·{" "}
                <strong data-testid="booking-price">
                  {formatCents(quote.grossCents)}
                </strong>
                {quote.memberRateApplied ? (
                  <span className="text-ice-deep bg-ice/45 ml-2 rounded-full px-2 py-0.5 text-xs font-semibold">
                    Mitgliederpreis
                  </span>
                ) : null}
              </p>
              <BookButton
                courtId={selectedCourt.id}
                date={date}
                time={selectedTime}
                durationMin={durationMin}
                termsVersion={venue.termsVersion}
              />
            </>
          ) : null}
          {quoteError ? (
            <p className="text-destructive text-sm" role="alert">
              {quoteError}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Wähle einen freien Slot im Kalender.
        </p>
      )}
    </main>
  );
}
