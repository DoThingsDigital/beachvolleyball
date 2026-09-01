import Link from "next/link";

import { formatCents } from "@/lib/format";
import { auth } from "@/src/auth";
import { isActiveClubMember } from "@/src/db/club-memberships";
import { getPublicShopContext } from "@/src/services/public-context";
import { getSubscriptionAvailability } from "@/src/services/subscription-availability";
import { getSubscriptionQuote } from "@/src/services/subscription-quote";

import { CheckoutButton } from "./checkout-button";

// Vorverkaufs-UI (Ticket 2.2, F2): Raster Wochentag × Startzeit mit Anzahl
// freier Plätze; Auswahl über URL-Parameter (serverseitig gerendert).
// Gäste sehen den Nichtmitgliederpreis (C4); verifizierte Vereinsmitglieder
// ihren Mitgliederpreis (Ticket 4.6, A4).

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

type SearchParams = {
  dauer?: string;
  tag?: string;
  zeit?: string;
  platz?: string;
};

function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v);
  }
  return `/vorverkauf?${q.toString()}`;
}

// Immer live rendern (siehe Kalender: früher null-Return vor dynamic APIs)
export const dynamic = "force-dynamic";

export default async function VorverkaufPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const shop = await getPublicShopContext();
  if (!shop) {
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <p className="text-muted-foreground text-sm">
          Der Vorverkauf ist aktuell nicht geöffnet.
        </p>
      </main>
    );
  }

  const { ctx, venue, season } = shop;
  const availability = await getSubscriptionAvailability(ctx, {
    venueId: venue.id,
    seasonId: season.id,
  });

  const params = await searchParams;
  const weekday =
    Number(params.tag) >= 1 && Number(params.tag) <= 7
      ? Number(params.tag)
      : null;
  const startTime = params.zeit ?? null;

  // Raster zeigt die Basis-Dauer (Mindestdauer); die konkrete Dauer wird
  // unten in der Auswahl getroffen – nur volle Stunden (Venue-Raster).
  const baseDuration = availability.durationsMin[0] ?? 60;
  const slotsForBase = availability.slots.filter(
    (s) => s.durationMin === baseDuration,
  );
  const freeByCell = new Map<string, string[]>();
  const startTimes = new Set<string>();
  for (const slot of slotsForBase) {
    startTimes.add(slot.startTime);
    const key = `${slot.weekday}#${slot.startTime}`;
    const list = freeByCell.get(key);
    if (list) list.push(slot.courtId);
    else freeByCell.set(key, [slot.courtId]);
  }
  const sortedTimes = [...startTimes].sort();

  const freeCourtIds =
    weekday && startTime ? (freeByCell.get(`${weekday}#${startTime}`) ?? []) : [];
  const freeCourts = availability.courts.filter((c) =>
    freeCourtIds.includes(c.id),
  );
  const selectedCourt =
    freeCourts.find((c) => c.id === params.platz) ?? null;

  // Passende Dauern für die konkrete Auswahl (Platz × Wochentag × Zeit)
  const fittingDurations =
    weekday && startTime && selectedCourt
      ? availability.durationsMin.filter((d) =>
          availability.slots.some(
            (s) =>
              s.courtId === selectedCourt.id &&
              s.weekday === weekday &&
              s.startTime === startTime &&
              s.durationMin === d,
          ),
        )
      : [];
  const durationMin = fittingDurations.includes(Number(params.dauer))
    ? Number(params.dauer)
    : (fittingDurations[0] ?? null);

  const session = await auth();
  const isMember = session?.user
    ? await isActiveClubMember(ctx, session.user.id)
    : false;

  const quote =
    weekday && startTime && selectedCourt && durationMin
      ? await getSubscriptionQuote(ctx, {
          venueId: venue.id,
          seasonId: season.id,
          courtId: selectedCourt.id,
          weekday,
          startTime,
          durationMin,
          isMember,
        }).catch(() => null)
      : null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 p-3">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dauerplatz-Vorverkauf</h1>
        <p className="text-muted-foreground text-sm">
          {venue.name} · {season.name} · fester Wochentermin über die ganze
          Saison
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">
          Freie Plätze je Wochentag und Startzeit
        </h2>
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <thead>
            <tr>
              <th className="w-12 p-1 text-left font-normal" />
              {WEEKDAY_LABELS.map((label) => (
                <th key={label} className="text-muted-foreground p-1 font-normal">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTimes.map((time) => (
              <tr key={time}>
                <td className="text-muted-foreground p-1 text-left text-xs">
                  {time}
                </td>
                {WEEKDAY_LABELS.map((_, i) => {
                  const day = i + 1;
                  const free = freeByCell.get(`${day}#${time}`)?.length ?? 0;
                  const isSelected = day === weekday && time === startTime;
                  if (free === 0) {
                    return (
                      <td key={day} className="p-0.5">
                        <span className="text-muted-foreground/40 block rounded p-1.5">
                          –
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={day} className="p-0.5">
                      <Link
                        href={buildQuery({
                          tag: String(day),
                          zeit: time,
                        })}
                        aria-label={`${WEEKDAY_LABELS[i]} ${time}, ${free} Plätze frei`}
                        className={
                          "block rounded-lg p-1.5 font-semibold " +
                          (isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-card text-coral-deep border hover:border-primary hover:ring-1 hover:ring-primary")
                        }
                      >
                        {free}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-muted-foreground text-xs">
          Zahl = freie Plätze
          {isMember
            ? " · dein Mitgliederpreis wird unten angezeigt"
            : " · Preise sind Nichtmitgliederpreise"}
        </p>
      </section>

      {weekday && startTime ? (
        <section className="flex flex-col gap-2 rounded-md border p-3">
          <h2 className="text-sm font-medium">
            {WEEKDAY_LABELS[weekday - 1]}, {startTime} Uhr · Platz wählen
          </h2>
          <div className="flex flex-wrap gap-2">
            {freeCourts.map((court) => (
              <Link
                key={court.id}
                href={buildQuery({
                  tag: String(weekday),
                  zeit: startTime,
                  platz: court.id,
                })}
                className={
                  "rounded-full border px-3.5 py-1.5 text-sm font-semibold " +
                  (selectedCourt?.id === court.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:border-primary")
                }
              >
                {court.name}
              </Link>
            ))}
          </div>

          {selectedCourt && fittingDurations.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">Dauer:</span>
              {fittingDurations.map((d) => (
                <Link
                  key={d}
                  href={buildQuery({
                    tag: String(weekday),
                    zeit: startTime,
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
          ) : null}

          {quote && selectedCourt ? (
            <dl
              className="mt-2 grid grid-cols-2 gap-1 border-t pt-3 text-sm"
              data-testid="quote"
            >
              <dt className="text-muted-foreground">Termine in der Saison</dt>
              <dd data-testid="quote-occurrences">
                {quote.occurrenceCount} Termine
              </dd>
              <dt className="text-muted-foreground">Preis pro Termin</dt>
              <dd>{formatCents(quote.perOccurrenceCents)}</dd>
              {quote.discountCents > 0 ? (
                <>
                  <dt className="text-muted-foreground">
                    Dauerplatz-Rabatt ({(quote.discountBp / 100).toLocaleString("de-DE")} %)
                  </dt>
                  <dd>−{formatCents(quote.discountCents)}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground font-medium">Gesamtpreis</dt>
              <dd className="font-semibold" data-testid="quote-total">
                {formatCents(quote.totalCents)}
                {quote.memberRateApplied ? (
                  <span className="text-ice-deep bg-ice/45 ml-2 rounded-full px-2 py-0.5 text-xs font-semibold">
                    Mitgliederpreis
                  </span>
                ) : null}
              </dd>
            </dl>
          ) : null}

          {quote && selectedCourt && weekday && startTime && durationMin ? (
            <div className="mt-2">
              <CheckoutButton
                courtId={selectedCourt.id}
                weekday={weekday}
                startTime={startTime}
                durationMin={durationMin}
                termsVersion={venue.termsVersion}
              />
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Wähle im Raster einen Wochentag und eine Startzeit.
        </p>
      )}
    </main>
  );
}
