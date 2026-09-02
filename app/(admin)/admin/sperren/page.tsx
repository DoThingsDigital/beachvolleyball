import { TZDate } from "@date-fns/tz";

import { requireStaff } from "@/src/auth/guards";
import { countFutureBlockBookings } from "@/src/db/blocks";
import { createRepositories } from "@/src/db/repositories";
import { parseUntil } from "@/src/domain/block-occurrences";
import { parseWeeklyBydays } from "@/src/domain/subscription-availability";

import { getSelectedVenue } from "../_lib/selected-venue";
import { BlockForm, EndBlockButton, type BlockFormDefaults } from "./block-form";

// Sperren-Verwaltung (Ticket 5.1, E1/E2): Regeln anlegen/ändern/beenden;
// die Materialisierung in Belegungen übernimmt der Block-Service.

const TYPE_LABELS: Record<string, string> = {
  VEREIN: "Vereinskontingent",
  LIGA: "Liga",
  WARTUNG: "Wartung",
  EVENT: "Event",
  GESPERRT: "Gesperrt",
};

const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

function localParts(instant: Date, timezone: string) {
  const local = new TZDate(instant.getTime(), timezone);
  const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  const time = `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

export default async function SperrenPage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }

  const [blocks, courts, clubs] = await Promise.all([
    repos.blocks.findManyForAdmin(venue.id),
    repos.courts.findManyForVenue(venue.id),
    repos.clubs.findManyForVenue(venue.id),
  ]);
  const futureCounts = await countFutureBlockBookings(
    staff.ctx,
    blocks.map((b) => b.id),
  );

  const courtOptions = courts.map((c) => ({ id: c.id, name: c.name }));
  const clubOptions = clubs.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Sperren – {venue.name}</h1>
      <p className="text-muted-foreground max-w-2xl text-sm">
        Sperren belegen Plätze ohne Kunden (Kontingent, Liga, Wartung, Events).
        Sie werden als Belegungen materialisiert und unterliegen demselben
        Konfliktschutz wie Buchungen. Termine mit bestehenden Buchungen werden
        beim Speichern übersprungen und gemeldet.
      </p>

      <section className="flex flex-col gap-2 rounded-md border p-3">
        <h2 className="text-lg font-medium">Neue Sperre</h2>
        <BlockForm
          venueId={venue.id}
          courts={courtOptions}
          clubs={clubOptions}
          submitLabel="Anlegen"
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Bestehende Sperren</h2>
        {blocks.length === 0 ? (
          <p className="text-muted-foreground text-sm">Noch keine Sperren.</p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="block-list">
            {blocks.map((block) => {
              const weekdays = parseWeeklyBydays(block.rrule) ?? [];
              const { date, time: timeFrom } = localParts(
                block.startAt,
                venue.timezone,
              );
              const { time: timeTo } = localParts(block.endAt, venue.timezone);
              const until = parseUntil(block.rrule);
              const untilDate = until
                ? localParts(until, venue.timezone).date
                : "";
              const defaults: BlockFormDefaults = {
                blockId: block.id,
                courtId: block.courtId,
                type: block.type,
                title: block.title,
                clubId: block.club?.id ?? "",
                date,
                timeFrom,
                timeTo,
                weekdays,
                untilDate,
                memberSelfBooking: block.memberSelfBooking,
                releaseHoursBefore: block.releaseHoursBefore,
              };
              const futureCount = futureCounts.get(block.id) ?? 0;
              return (
                <li key={block.id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-semibold">{block.title}</span>{" "}
                      <span className="text-muted-foreground">
                        · {TYPE_LABELS[block.type] ?? block.type} ·{" "}
                        {block.court.name} ·{" "}
                        {weekdays.length > 0
                          ? `${weekdays.map((w) => WEEKDAY_SHORT[w - 1]).join(", ")} ${timeFrom}–${timeTo}` +
                            (untilDate ? ` bis ${untilDate}` : "")
                          : `${date} ${timeFrom}–${timeTo}`}
                        {block.club ? ` · ${block.club.name}` : ""}
                        {block.memberSelfBooking
                          ? " · Mitglieder-Buchungsfenster"
                          : ` · ${futureCount} zukünftige Termine`}
                        {block.type === "VEREIN"
                          ? block.releaseHoursBefore === 0
                            ? " · fest reserviert (keine Auto-Freigabe)"
                            : block.releaseHoursBefore != null
                              ? ` · Freigabe ${block.releaseHoursBefore} Std. vorher`
                              : ""
                          : ""}
                      </span>
                    </p>
                    <EndBlockButton blockId={block.id} />
                  </div>
                  <details>
                    <summary className="text-muted-foreground cursor-pointer text-sm">
                      Bearbeiten
                    </summary>
                    <div className="pt-2">
                      <BlockForm
                        venueId={venue.id}
                        courts={courtOptions}
                        clubs={clubOptions}
                        defaults={defaults}
                        submitLabel="Speichern"
                      />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
