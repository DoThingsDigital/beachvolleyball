import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../_lib/selected-venue";
import { MassCancelForm } from "./mass-cancel-form";

// Betreiber-Massenstorno (Ticket 5.6, I3): Hallenausfall für einen
// Zeitraum – Vorschau, dann Storno + Erstattung + Sammelmail je Kunde.

export default async function MassenstornoPage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  if (!venue) {
    return <p className="text-muted-foreground text-sm">Kein Standort angelegt.</p>;
  }
  const courts = await repos.courts.findManyForVenue(venue.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Massenstorno – {venue.name}</h1>
      <p className="text-muted-foreground max-w-2xl text-sm">
        Für Hallenausfälle: storniert alle Kundenbuchungen und
        Dauerplatz-Termine im Zeitraum, erstattet wahlweise Geld (Gutschrift +
        Stripe) oder Guthaben und verschickt eine Sammelmail je Kunde.
        Unbezahlte Reservierungen werden nur storniert. Sperren-Termine bleiben
        unberührt – Sperren beendest du unter „Sperren“.
      </p>
      <MassCancelForm
        venueId={venue.id}
        courts={courts.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
