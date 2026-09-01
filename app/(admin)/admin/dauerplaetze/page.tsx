import { TZDate } from "@date-fns/tz";
import Link from "next/link";

import { formatCents, formatWeekday } from "@/lib/format";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";
import {
  countSubscriptionBookings,
  findSubscriptionsForSeasonAdmin,
} from "@/src/db/subscriptions-admin";
import { listOccurrences } from "@/src/domain/pricing";

import { getSelectedVenue } from "../_lib/selected-venue";
import { CancelSubscriptionForm } from "./cancel-form";

// Dauerplatz-Übersicht (Ticket 5.5, K5): Saison-Raster, Soll/Ist-Abgleich
// (Lücken = stornierte oder kollidierte Termine), Kündigung mit Erstattung.

const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Warten auf Zahlung",
  ACTIVE: "Aktiv",
  CANCELLED: "Gekündigt",
};

function instantToLocalDate(instant: Date, timezone: string): string {
  const tz = new TZDate(instant.getTime(), timezone);
  return `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}-${String(tz.getDate()).padStart(2, "0")}`;
}

export default async function DauerplaetzePage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }

  const seasons = await repos.seasons.findManyForVenue(venue.id);
  const params = await searchParams;
  const season =
    seasons.find((s) => s.id === params.saison) ??
    seasons.find((s) => s.status === "ACTIVE") ??
    seasons.find((s) => s.status === "PRESALE") ??
    seasons[0] ??
    null;
  if (!season) {
    return <p className="text-muted-foreground text-sm">Keine Saison angelegt.</p>;
  }

  const subscriptions = await findSubscriptionsForSeasonAdmin(
    staff.ctx,
    season.id,
  );
  const counts = await countSubscriptionBookings(
    staff.ctx,
    subscriptions.map((s) => s.id),
  );

  const dateFrom = instantToLocalDate(season.startDate, venue.timezone);
  const dateTo = instantToLocalDate(
    new Date(season.endDate.getTime() - 1),
    venue.timezone,
  );
  const closedDates = (venue.closedDates as string[]) ?? [];

  const withStats = subscriptions.map((sub) => {
    const target =
      sub.status === "CANCELLED"
        ? null
        : listOccurrences({
            timezone: venue.timezone,
            weekday: sub.weekday,
            startTime: sub.startTime,
            durationMin: sub.durationMin,
            dateFrom,
            dateTo,
            excludedDates: [
              ...closedDates,
              ...((sub.skippedDates as string[]) ?? []),
            ],
          }).length;
    const count = counts.get(sub.id) ?? { confirmed: 0, cancelled: 0 };
    return {
      sub,
      target,
      confirmed: count.confirmed,
      gap: target !== null && sub.status === "ACTIVE" ? target - count.confirmed : 0,
    };
  });

  // Raster: Zeiten × Wochentage, aktive/pending Dauerplätze
  const active = withStats.filter(({ sub }) => sub.status !== "CANCELLED");
  const times = [...new Set(active.map(({ sub }) => sub.startTime))].sort();
  const byCell = new Map<string, typeof active>();
  for (const entry of active) {
    const key = `${entry.sub.weekday}#${entry.sub.startTime}`;
    const list = byCell.get(key);
    if (list) list.push(entry);
    else byCell.set(key, [entry]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Dauerplätze – {season.name}</h1>
        <div className="flex gap-1 text-sm">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/admin/dauerplaetze?saison=${s.id}`}
              className={
                "rounded-full border px-3 py-1 font-semibold " +
                (s.id === season.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card")
              }
            >
              {s.name}
            </Link>
          ))}
        </div>
      </div>

      {times.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Keine aktiven Dauerplätze in dieser Saison.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed border-collapse text-center text-xs">
            <thead>
              <tr>
                <th className="w-12 p-1" />
                {WEEKDAY_SHORT.map((label) => (
                  <th key={label} className="text-muted-foreground p-1 font-normal">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((time) => (
                <tr key={time}>
                  <td className="text-muted-foreground p-1 text-left align-top">
                    {time}
                  </td>
                  {WEEKDAY_SHORT.map((_, i) => {
                    const entries = byCell.get(`${i + 1}#${time}`) ?? [];
                    return (
                      <td key={i} className="p-0.5 align-top">
                        {entries.map(({ sub }) => (
                          <div
                            key={sub.id}
                            className={
                              "mb-0.5 truncate rounded p-1 font-medium " +
                              (sub.status === "ACTIVE"
                                ? "bg-booked text-stone"
                                : "bg-sun-gold/40")
                            }
                            title={`${sub.court.name} · ${sub.user.name ?? sub.user.email}`}
                          >
                            {sub.court.name.replace("Feld ", "F")} ·{" "}
                            {sub.user.name ?? sub.user.email}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Alle Dauerplätze</h2>
        {withStats.length === 0 ? (
          <p className="text-muted-foreground text-sm">Keine Dauerplätze.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="subscription-list">
            {withStats.map(({ sub, target, confirmed, gap }) => (
              <li
                key={sub.id}
                className="flex flex-col gap-2 rounded-md border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="font-semibold">
                      {sub.user.name ?? sub.user.email}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {sub.court.name} · {formatWeekday(sub.weekday)}{" "}
                      {sub.startTime} Uhr ({sub.durationMin} min) ·{" "}
                      {formatCents(sub.totalCents)}
                    </span>
                  </p>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-semibold " +
                      (sub.status === "ACTIVE"
                        ? "bg-ice text-foreground"
                        : sub.status === "CANCELLED"
                          ? "bg-muted text-muted-foreground"
                          : "bg-sun-gold/40")
                    }
                  >
                    {STATUS_LABELS[sub.status] ?? sub.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    {sub.status === "CANCELLED"
                      ? `Gekündigt${sub.cancelReason ? ` – ${sub.cancelReason}` : ""}`
                      : `${confirmed}${target !== null ? ` von ${target}` : ""} Terminen bestätigt`}
                    {gap > 0 ? (
                      <span className="text-destructive ml-2 font-semibold">
                        {gap} Termine fehlen (storniert oder Konflikt)
                      </span>
                    ) : null}
                  </p>
                  {sub.status !== "CANCELLED" ? (
                    <CancelSubscriptionForm subscriptionId={sub.id} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
