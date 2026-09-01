import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../../_lib/selected-venue";
import { CrudForm, type CrudField } from "../_components/crud-form";
import { createCourt, updateCourt } from "./actions";

const SPORT_OPTIONS = [
  { value: "BEACH", label: "Beach" },
  { value: "TENNIS", label: "Tennis" },
];

function courtFields(court?: {
  name: string;
  sortOrder: number;
  courtGroup: string | null;
  sport: string;
  active: boolean;
}): CrudField[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: court?.name },
    { name: "sortOrder", label: "Reihenfolge", type: "number", defaultValue: court?.sortOrder ?? 0 },
    { name: "courtGroup", label: "Platzgruppe", type: "text", defaultValue: court?.courtGroup ?? "" },
    { name: "sport", label: "Sportart", type: "select", options: SPORT_OPTIONS, defaultValue: court?.sport ?? "BEACH" },
    { name: "active", label: "Aktiv", type: "checkbox", defaultValue: court?.active ?? true },
  ];
}

export default async function PlaetzePage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }
  const courts = await repos.courts.findAllForVenue(venue.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Plätze – {venue.name}</h1>

      <ul className="flex flex-col gap-4">
        {courts.map((court) => (
          <li key={court.id} className="rounded-md border p-3">
            <CrudForm
              action={updateCourt}
              fields={courtFields(court)}
              hidden={{ id: court.id, venueId: venue.id }}
              submitLabel="Speichern"
              compact
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-lg font-medium">Neuen Platz anlegen</h2>
        <CrudForm
          action={createCourt}
          fields={courtFields()}
          hidden={{ venueId: venue.id }}
          submitLabel="Anlegen"
          compact
        />
      </section>

      <p className="text-muted-foreground text-xs">
        Plätze werden nie gelöscht, nur deaktiviert – bestehende Belegungen
        bleiben erhalten.
      </p>
    </div>
  );
}
