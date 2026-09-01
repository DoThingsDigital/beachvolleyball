import Link from "next/link";

import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../../_lib/selected-venue";
import { CrudForm, type CrudField } from "../_components/crud-form";
import { createPriceRule, updatePriceRule } from "./actions";
import { PreviewForm } from "./preview-form";

function ruleFields(
  courts: { id: string; name: string }[],
  rule?: {
    label: string;
    weekdays: number[];
    timeFrom: string;
    timeTo: string;
    pricePerHourCents: number;
    memberPricePerHourCents: number | null;
    priority: number;
    courtIds: string[];
    active: boolean;
  },
): CrudField[] {
  return [
    { name: "label", label: "Bezeichnung", type: "text", required: true, defaultValue: rule?.label },
    {
      name: "weekdays",
      label: "Wochentage (1=Mo…7=So)",
      type: "text",
      required: true,
      defaultValue: rule?.weekdays.join(",") ?? "1,2,3,4,5",
    },
    { name: "timeFrom", label: "Von", type: "time", required: true, defaultValue: rule?.timeFrom ?? "08:00" },
    { name: "timeTo", label: "Bis", type: "time", required: true, defaultValue: rule?.timeTo ?? "22:00" },
    {
      name: "pricePerHourCents",
      label: "Preis/h (Cent, brutto)",
      type: "number",
      required: true,
      defaultValue: rule?.pricePerHourCents,
    },
    {
      name: "memberPricePerHourCents",
      label: "Mitgliederpreis/h (Cent)",
      type: "number",
      defaultValue: rule?.memberPricePerHourCents ?? "",
    },
    { name: "priority", label: "Priorität", type: "number", defaultValue: rule?.priority ?? 0 },
    {
      name: "courtId",
      label: "Gilt für",
      type: "select",
      options: [
        { value: "", label: "Alle Plätze" },
        ...courts.map((c) => ({ value: c.id, label: c.name })),
      ],
      defaultValue: rule?.courtIds[0] ?? "",
    },
    { name: "active", label: "Aktiv", type: "checkbox", defaultValue: rule?.active ?? true },
  ];
}

export default async function PreisregelnPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }

  const params = await searchParams;
  const seasons = await repos.seasons.findManyForVenue(venue.id);
  const season = seasons.find((s) => s.id === params.season) ?? seasons[0] ?? null;
  if (!season) {
    return (
      <p className="text-muted-foreground text-sm">
        Erst eine Saison anlegen (Tab „Saisons“).
      </p>
    );
  }

  const [rules, courts] = await Promise.all([
    repos.priceRules.findManyForSeason(season.id),
    repos.courts.findManyForVenue(venue.id),
  ]);
  const courtOptions = courts.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Preisregeln – {season.name}</h1>
        {seasons.length > 1 ? (
          <nav className="flex gap-2 text-sm">
            {seasons.map((s) => (
              <Link
                key={s.id}
                href={`/admin/konfiguration/preisregeln?season=${s.id}`}
                className={
                  s.id === season.id
                    ? "font-medium underline"
                    : "text-muted-foreground hover:underline"
                }
              >
                {s.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <section className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
        <h2 className="text-lg font-medium">Vorschau: Preis für einen Slot</h2>
        <PreviewForm venueId={venue.id} seasonId={season.id} courts={courtOptions} />
      </section>

      <ul className="flex flex-col gap-4">
        {rules.map((rule) => (
          <li key={rule.id} className="rounded-md border p-3">
            <CrudForm
              action={updatePriceRule}
              fields={ruleFields(courtOptions, rule)}
              hidden={{ id: rule.id, venueId: venue.id, seasonId: season.id }}
              submitLabel="Speichern"
              compact
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-lg font-medium">Neue Preisregel anlegen</h2>
        <CrudForm
          action={createPriceRule}
          fields={ruleFields(courtOptions)}
          hidden={{ venueId: venue.id, seasonId: season.id }}
          submitLabel="Anlegen"
          compact
        />
      </section>

      <p className="text-muted-foreground text-xs">
        Preise sind Bruttopreise in Cent pro Stunde. Bei Überlappung gewinnt die
        höchste Priorität je 30-Minuten-Slot. Preise werden ausschließlich
        serverseitig berechnet.
      </p>
    </div>
  );
}
