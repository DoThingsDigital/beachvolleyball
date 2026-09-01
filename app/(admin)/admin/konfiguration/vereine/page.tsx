import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../../_lib/selected-venue";
import { CrudForm, type CrudField } from "../_components/crud-form";
import { createClub, updateClub } from "./actions";

function clubFields(club?: {
  name: string;
  contactEmail: string;
  active: boolean;
}): CrudField[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: club?.name },
    { name: "contactEmail", label: "Kontakt-E-Mail", type: "email", required: true, defaultValue: club?.contactEmail },
    { name: "active", label: "Aktiv", type: "checkbox", defaultValue: club?.active ?? true },
  ];
}

export default async function VereinePage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }
  const clubs = await repos.clubs.findManyForVenue(venue.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Vereine – {venue.name}</h1>

      <ul className="flex flex-col gap-4">
        {clubs.map((club) => (
          <li key={club.id} className="rounded-md border p-3">
            <CrudForm
              action={updateClub}
              fields={clubFields(club)}
              hidden={{ id: club.id, venueId: venue.id }}
              submitLabel="Speichern"
              compact
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-lg font-medium">Neuen Verein anlegen</h2>
        <CrudForm
          action={createClub}
          fields={clubFields()}
          hidden={{ venueId: venue.id }}
          submitLabel="Anlegen"
          compact
        />
      </section>

      <p className="text-muted-foreground text-xs">
        Vereins-Admins und Mitgliederlisten folgen mit Ticket 4.6.
      </p>
    </div>
  );
}
