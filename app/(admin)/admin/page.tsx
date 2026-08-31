import { cookies } from "next/headers";

import { VENUE_COOKIE } from "@/lib/venue-cookie";
import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

export default async function AdminPage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venues = await repos.venues.findMany();

  const cookieStore = await cookies();
  const cookieVenueId = cookieStore.get(VENUE_COOKIE)?.value;
  const venue = venues.find((v) => v.id === cookieVenueId) ?? venues[0] ?? null;
  const courts = venue ? await repos.courts.findManyForVenue(venue.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Übersicht</h1>
      {venue ? (
        <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Standort</dt>
          <dd data-testid="admin-venue">{venue.name}</dd>
          <dt className="text-muted-foreground">Aktive Plätze</dt>
          <dd>{courts.length}</dd>
          <dt className="text-muted-foreground">Rolle</dt>
          <dd>{staff.role}</dd>
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">
          Noch kein Standort angelegt – <code>pnpm seed</code> ausführen.
        </p>
      )}
    </div>
  );
}
