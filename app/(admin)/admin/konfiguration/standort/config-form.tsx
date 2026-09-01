"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateVenueConfig, type ConfigFormState } from "./actions";
import { WEEKDAYS } from "./weekdays";

const initialState: ConfigFormState = {};

export type VenueConfigValues = {
  venueId: string;
  slotMinutes: number;
  minDurationMin: number;
  maxDurationMin: number;
  leadTimeMin: number;
  horizonDays: number;
  memberHorizonDays: number;
  holdMinutes: number;
  cancelHours: number;
  cancelRefundMode: "MONEY" | "CREDIT" | "NONE";
  releaseHoursBefore: number;
  sepaLeadDays: number;
  closedDates: string[];
  openingHours: Record<string, [string, string][]>;
};

function NumberField({
  id,
  name,
  label,
  defaultValue,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        defaultValue={defaultValue}
        required
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

export function ConfigForm({ values }: { values: VenueConfigValues }) {
  const [state, action, pending] = useActionState(
    updateVenueConfig,
    initialState,
  );

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-8">
      <input type="hidden" name="venueId" value={values.venueId} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Öffnungszeiten</h2>
        <div className="flex flex-col gap-2">
          {WEEKDAYS.map(([key, label]) => {
            const window = values.openingHours[key]?.[0];
            return (
              <div key={key} className="grid grid-cols-[7rem_auto_1fr_1fr] items-center gap-2">
                <Label htmlFor={`open_${key}`}>{label}</Label>
                <input
                  id={`open_${key}`}
                  name={`open_${key}`}
                  type="checkbox"
                  defaultChecked={Boolean(window)}
                  className="size-4"
                  aria-label={`${label} geöffnet`}
                />
                <Input
                  name={`from_${key}`}
                  type="time"
                  defaultValue={window?.[0] ?? "08:00"}
                  aria-label={`${label} von`}
                />
                <Input
                  name={`to_${key}`}
                  type="time"
                  defaultValue={window?.[1] ?? "22:00"}
                  aria-label={`${label} bis`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="closedDates">Schließtage</Label>
          <textarea
            id="closedDates"
            name="closedDates"
            defaultValue={values.closedDates.join("\n")}
            rows={4}
            className="border-input bg-background rounded-md border p-2 text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Ein Datum pro Zeile im Format JJJJ-MM-TT.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Raster und Dauer</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            id="slotMinutes"
            name="slotMinutes"
            label="Raster (Min.)"
            defaultValue={values.slotMinutes}
            hint="15, 30 oder 60"
          />
          <NumberField
            id="minDurationMin"
            name="minDurationMin"
            label="Mindestdauer (Min.)"
            defaultValue={values.minDurationMin}
          />
          <NumberField
            id="maxDurationMin"
            name="maxDurationMin"
            label="Maximaldauer (Min.)"
            defaultValue={values.maxDurationMin}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Fristen</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            id="leadTimeMin"
            name="leadTimeMin"
            label="Mindestvorlauf (Min.)"
            defaultValue={values.leadTimeMin}
          />
          <NumberField
            id="horizonDays"
            name="horizonDays"
            label="Buchungshorizont (Tage)"
            defaultValue={values.horizonDays}
          />
          <NumberField
            id="memberHorizonDays"
            name="memberHorizonDays"
            label="Horizont Mitglieder (Tage)"
            defaultValue={values.memberHorizonDays}
          />
          <NumberField
            id="holdMinutes"
            name="holdMinutes"
            label="Hold-Dauer (Min.)"
            defaultValue={values.holdMinutes}
          />
          <NumberField
            id="releaseHoursBefore"
            name="releaseHoursBefore"
            label="Kontingent-Freigabe (Std. vorher)"
            defaultValue={values.releaseHoursBefore}
          />
          <NumberField
            id="sepaLeadDays"
            name="sepaLeadDays"
            label="SEPA-Vorlauf (Tage)"
            defaultValue={values.sepaLeadDays}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Storno-Regel</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField
            id="cancelHours"
            name="cancelHours"
            label="Kostenlos stornierbar bis (Std. vorher)"
            defaultValue={values.cancelHours}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="cancelRefundMode">Erstattungsart</Label>
            <select
              id="cancelRefundMode"
              name="cancelRefundMode"
              defaultValue={values.cancelRefundMode}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="MONEY">Geld zurück</option>
              <option value="CREDIT">Guthaben</option>
              <option value="NONE">Keine Erstattung</option>
            </select>
          </div>
        </div>
      </section>

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-400" role="status">
          Gespeichert.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
