import { requireStaff } from "@/src/auth/guards";
import { findClubAdmins } from "@/src/db/club-memberships";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../../_lib/selected-venue";
import { CrudForm, type CrudField } from "../_components/crud-form";
import { createClub, updateClub } from "./actions";
import { ClubAdmins, type ClubAdminEntry } from "./club-admins";

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
  const adminsByClub = new Map<string, ClubAdminEntry[]>();
  for (const club of clubs) {
    adminsByClub.set(
      club.id,
      (await findClubAdmins(staff.ctx, club.id)).map((m) => ({
        membershipId: m.id,
        name: m.user.name,
        email: m.user.email,
      })),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Vereine – {venue.name}</h1>

      <ul className="flex flex-col gap-4">
        {clubs.map((club) => (
          <li key={club.id} className="flex flex-col gap-3 rounded-md border p-3">
            <CrudForm
              action={updateClub}
              fields={clubFields(club)}
              hidden={{ id: club.id, venueId: venue.id }}
              submitLabel="Speichern"
              compact
            />
            <div className="border-t pt-3">
              <ClubAdmins
                clubId={club.id}
                admins={adminsByClub.get(club.id) ?? []}
              />
            </div>
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
        Mitgliedschaften verwaltet der Vereins-Admin selbst unter /verein
        (Freigabe von Anfragen, Listenimport, Kontingent). Hier ernennst du,
        wer das für den Verein darf – die Person braucht ein registriertes
        Konto.
      </p>
    </div>
  );
}
