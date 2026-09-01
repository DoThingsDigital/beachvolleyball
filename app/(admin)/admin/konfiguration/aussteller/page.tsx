import { requireStaff } from "@/src/auth/guards";
import { createRepositories } from "@/src/db/repositories";

import { getSelectedVenue } from "../../_lib/selected-venue";
import { CrudForm, type CrudField } from "../_components/crud-form";
import {
  createLegalEntity,
  switchVenueLegalEntity,
  updateLegalEntity,
} from "./actions";

type EntityValues = {
  name: string;
  legalForm: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  taxNumber: string | null;
  vatId: string | null;
  invoicePrefix: string;
  defaultTaxRateBp: number;
  smallBusiness: boolean;
  email: string;
  phone: string | null;
  website: string | null;
  active: boolean;
};

function entityFields(e?: EntityValues): CrudField[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: e?.name },
    { name: "legalForm", label: "Rechtsform", type: "text", required: true, defaultValue: e?.legalForm },
    { name: "street", label: "Straße", type: "text", required: true, defaultValue: e?.street },
    { name: "zip", label: "PLZ", type: "text", required: true, defaultValue: e?.zip },
    { name: "city", label: "Ort", type: "text", required: true, defaultValue: e?.city },
    { name: "country", label: "Land (ISO)", type: "text", required: true, defaultValue: e?.country ?? "DE" },
    { name: "taxNumber", label: "Steuernummer", type: "text", defaultValue: e?.taxNumber ?? "" },
    { name: "vatId", label: "USt-ID", type: "text", defaultValue: e?.vatId ?? "" },
    { name: "invoicePrefix", label: "Rechnungs-Präfix", type: "text", required: true, defaultValue: e?.invoicePrefix },
    { name: "defaultTaxRateBp", label: "Steuersatz (Bp, 1900 = 19 %)", type: "number", defaultValue: e?.defaultTaxRateBp ?? 1900 },
    { name: "email", label: "E-Mail", type: "email", required: true, defaultValue: e?.email },
    { name: "phone", label: "Telefon", type: "text", defaultValue: e?.phone ?? "" },
    { name: "website", label: "Website", type: "text", defaultValue: e?.website ?? "" },
    { name: "smallBusiness", label: "Kleinunternehmer (§ 19 UStG)", type: "checkbox", defaultValue: e?.smallBusiness ?? false },
    { name: "active", label: "Aktiv", type: "checkbox", defaultValue: e?.active ?? true },
  ];
}

export default async function AusstellerPage() {
  const staff = await requireStaff();
  const repos = createRepositories(staff.ctx);
  const venue = await getSelectedVenue(repos);
  const entities = await repos.legalEntities.findMany();
  const activeEntity = venue
    ? entities.find((e) => e.id === venue.legalEntityId)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Rechnungsaussteller</h1>

      {venue ? (
        <section className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
          <h2 className="text-lg font-medium">
            Aktiver Aussteller für {venue.name}:{" "}
            <span data-testid="active-legal-entity">{activeEntity?.name}</span>
          </h2>
          <CrudForm
            action={switchVenueLegalEntity}
            fields={[
              {
                name: "legalEntityId",
                label: "Aussteller wechseln (wirkt nur auf neue Rechnungen)",
                type: "select",
                options: entities
                  .filter((e) => e.active)
                  .map((e) => ({ value: e.id, label: e.name })),
                defaultValue: venue.legalEntityId,
              },
            ]}
            hidden={{ venueId: venue.id }}
            submitLabel="Zuweisen"
            compact
          />
        </section>
      ) : null}

      <ul className="flex flex-col gap-4">
        {entities.map((entity) => (
          <li key={entity.id} className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">
              {entity.name} {entity.active ? "" : "(inaktiv)"}
            </p>
            <CrudForm
              action={updateLegalEntity}
              fields={entityFields(entity)}
              hidden={{ id: entity.id }}
              submitLabel="Speichern"
            />
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2 border-t pt-4">
        <h2 className="text-lg font-medium">Neuen Aussteller anlegen</h2>
        <CrudForm
          action={createLegalEntity}
          fields={entityFields()}
          submitLabel="Anlegen"
        />
      </section>

      <p className="text-muted-foreground text-xs">
        Rechnungen speichern einen Aussteller-Snapshot – ein Wechsel ändert
        bestehende Rechnungen nie. IBAN/Gläubiger-ID folgen mit Bank-SEPA
        (Stufe 3).
      </p>
    </div>
  );
}
