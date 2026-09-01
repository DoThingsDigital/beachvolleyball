import { TZDate } from "@date-fns/tz";
import Link from "next/link";

import { formatCents, formatWeekday } from "@/lib/format";
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

const STATE_STYLES: Record<string, string> = {
  FREI: "bg-accent hover:bg-accent/70",
  BELEGT: "bg-foreground/80 text-background",
  VEREIN: "bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50",
  GESPERRT: "bg-muted text-muted-foreground line-through",
};

const STATE_LABELS: Record<string, string> = {
  FREI: "frei",
  BELEGT: "belegt",
  VEREIN: "Vereinskontingent",
  GESPERRT: "gesperrt",
};

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

  // Preisvorschau (C4, Nichtmitgliederpreis)
  let quote: { grossCents: number; description: string } | null = null;
  let quoteError: string | null = null;
  if (selectedTime && selectedCourtId && durationMin) {
    try {
      const result = await getSingleBookingQuote(ctx, {
        venueId: venue.id,
        courtId: selectedCourtId,
        date,
        time: selectedTime,
        durationMin,
        isMember: false,
      });
      quote = { grossCents: result.grossCents, description: result.description };
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
                "rounded-md px-2 py-1 text-center text-sm " +
                (d.date === date
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent")
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
                  if (state === "FREI" && bookable) {
                    return (
                      <td key={court.id} className="p-0.5">
                        <Link
                          href={q({
                            tag: date,
                            zeit: slot.time,
                            platz: court.id,
                          })}
                          aria-label={`${court.name} ${slot.time} frei`}
                          className={
                            "block rounded p-1.5 " +
                            (isSelected
                              ? "bg-primary text-primary-foreground"
                              : STATE_STYLES.FREI)
                          }
                        >
                          {isSelected ? "✓" : ""}
                        </Link>
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
        <span className="bg-accent rounded px-1">frei</span> ·{" "}
        <span className="bg-foreground/80 text-background rounded px-1">belegt</span> ·{" "}
        <span className="rounded bg-amber-200 px-1 text-amber-950">Verein</span> ·{" "}
        <span className="bg-muted text-muted-foreground rounded px-1">gesperrt</span>{" "}
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
                    "rounded-md border px-3 py-1.5 text-sm " +
                    (d === durationMin
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent")
                  }
                >
                  {d} min
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
