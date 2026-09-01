import { cookies } from "next/headers";

import { VENUE_COOKIE } from "@/lib/venue-cookie";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { ConfigForm, type VenueConfigValues } from "./config-form";

export default async function StandortKonfigurationPage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venues = await repos.venues.findMany();

  const cookieStore = await cookies();
  const cookieVenueId = cookieStore.get(VENUE_COOKIE)?.value;
  const venue = venues.find((v) => v.id === cookieVenueId) ?? venues[0] ?? null;

  if (!venue) {
    return (
      <p className="text-muted-foreground text-sm">
        Noch kein Standort angelegt – <code>pnpm seed</code> ausführen.
      </p>
    );
  }

  const values: VenueConfigValues = {
    venueId: venue.id,
    slotMinutes: venue.slotMinutes,
    minDurationMin: venue.minDurationMin,
    maxDurationMin: venue.maxDurationMin,
    leadTimeMin: venue.leadTimeMin,
    horizonDays: venue.horizonDays,
    memberHorizonDays: venue.memberHorizonDays,
    holdMinutes: venue.holdMinutes,
    cancelHours: venue.cancelHours,
    cancelRefundMode: venue.cancelRefundMode,
    releaseHoursBefore: venue.releaseHoursBefore,
    sepaLeadDays: venue.sepaLeadDays,
    closedDates: (venue.closedDates as string[]) ?? [],
    openingHours:
      (venue.openingHours as Record<string, [string, string][]>) ?? {},
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        Standort-Konfiguration – {venue.name}
      </h1>
      <ConfigForm values={values} />
    </div>
  );
}
