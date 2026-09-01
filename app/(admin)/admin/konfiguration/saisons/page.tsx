import { TZDate } from "@date-fns/tz";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../../_lib/selected-venue";
import { CrudForm, type CrudField } from "../_components/crud-form";
import { createSeason, updateSeason } from "./actions";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Entwurf" },
  { value: "PRESALE", label: "Vorverkauf" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "CLOSED", label: "Beendet" },
];

// UTC-Instant → lokales Datum "YYYY-MM-DD" für <input type=date>
function toLocalDate(date: Date, timezone: string): string {
  const tz = new TZDate(date.getTime(), timezone);
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function seasonFields(
  timezone: string,
  season?: {
    name: string;
    startDate: Date;
    endDate: Date;
    presaleStart: Date | null;
    status: string;
    subscriptionDiscountBp: number;
  },
): CrudField[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: season?.name },
    {
      name: "startDate",
      label: "Beginn",
      type: "date",
      required: true,
      defaultValue: season ? toLocalDate(season.startDate, timezone) : "",
    },
    {
      name: "endDate",
      label: "Ende",
      type: "date",
      required: true,
      defaultValue: season ? toLocalDate(season.endDate, timezone) : "",
    },
    {
      name: "presaleStart",
      label: "Vorverkaufsstart",
      type: "date",
      defaultValue: season?.presaleStart
        ? toLocalDate(season.presaleStart, timezone)
        : "",
    },
    { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, defaultValue: season?.status ?? "DRAFT" },
    {
      name: "subscriptionDiscountBp",
      label: "Dauerplatz-Rabatt (Bp, 1000 = 10 %)",
      type: "number",
      defaultValue: season?.subscriptionDiscountBp ?? 0,
    },
  ];
}

export default async function SaisonsPage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }
  const seasons = await repos.seasons.findManyForVenue(venue.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Saisons – {venue.name}</h1>

      <ul className="flex flex-col gap-4">
        {seasons.map((season) => (
          <li key={season.id} className="rounded-md border p-3">
            <CrudForm
              action={updateSeason}
              fields={seasonFields(venue.timezone, season)}
              hidden={{ id: season.id, venueId: venue.id }}
              submitLabel="Speichern"
              compact
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-lg font-medium">Neue Saison anlegen</h2>
        <CrudForm
          action={createSeason}
          fields={seasonFields(venue.timezone)}
          hidden={{ venueId: venue.id }}
          submitLabel="Anlegen"
          compact
        />
      </section>

      <p className="text-muted-foreground text-xs">
        Buchungen sind nur in Saisons mit Status „Vorverkauf“ (Dauerplatz) bzw.
        „Aktiv“ möglich. Das Saisonende ist durch die Standzeit-Genehmigung
        begrenzt (max. 6 Monate).
      </p>
    </div>
  );
}
