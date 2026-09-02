"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  createBlockAction,
  endBlockAction,
  updateBlockAction,
  type BlockActionState,
} from "./actions";

const initialState: BlockActionState = {};

const TYPE_OPTIONS = [
  { value: "VEREIN", label: "Vereinskontingent" },
  { value: "LIGA", label: "Liga" },
  { value: "WARTUNG", label: "Wartung" },
  { value: "EVENT", label: "Event" },
  { value: "GESPERRT", label: "Gesperrt" },
] as const;

const WEEKDAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 7, label: "So" },
] as const;

export type BlockFormDefaults = {
  blockId?: string;
  courtId?: string;
  type?: string;
  title?: string;
  clubId?: string;
  date?: string;
  timeFrom?: string;
  timeTo?: string;
  weekdays?: number[];
  untilDate?: string;
  memberSelfBooking?: boolean;
  /** null = Venue-Default, 0 = nie (fest reserviert), sonst Stunden */
  releaseHoursBefore?: number | null;
};

export function BlockForm({
  venueId,
  courts,
  clubs,
  defaults = {},
  submitLabel,
}: {
  venueId: string;
  courts: { id: string; name: string }[];
  clubs: { id: string; name: string }[];
  defaults?: BlockFormDefaults;
  submitLabel: string;
}) {
  const isEdit = Boolean(defaults.blockId);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateBlockAction : createBlockAction,
    initialState,
  );
  const [type, setType] = useState(defaults.type ?? "GESPERRT");
  const [weekly, setWeekly] = useState((defaults.weekdays?.length ?? 0) > 0);
  const initialReleaseMode =
    defaults.releaseHoursBefore === 0
      ? "NONE"
      : defaults.releaseHoursBefore != null
        ? "CUSTOM"
        : "VENUE";
  const [releaseMode, setReleaseMode] = useState(initialReleaseMode);
  const idp = defaults.blockId ?? "neu";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="venueId" value={venueId} />
      {defaults.blockId ? (
        <input type="hidden" name="blockId" value={defaults.blockId} />
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`court-${idp}`}>Platz</Label>
          <select
            id={`court-${idp}`}
            name="courtId"
            defaultValue={defaults.courtId ?? ""}
            required
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            <option value="" disabled>
              wählen …
            </option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`type-${idp}`}>Typ</Label>
          <select
            id={`type-${idp}`}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {type === "VEREIN" || type === "LIGA" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`club-${idp}`}>Verein</Label>
            <select
              id={`club-${idp}`}
              name="clubId"
              defaultValue={defaults.clubId ?? ""}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="">– kein Verein –</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {type === "VEREIN" ? (
          <label className="col-span-2 flex items-start gap-2 text-sm sm:col-span-3 lg:col-span-3">
            <input
              type="checkbox"
              name="memberSelfBooking"
              defaultChecked={defaults.memberSelfBooking ?? false}
              className="mt-0.5 size-4"
            />
            <span>
              <strong>Mitglieder-Buchungsfenster:</strong> Mitglieder buchen
              und bezahlen die Slots selbst (Mitgliederpreis); Nicht-Mitglieder
              können sie erst ab der Freigabefrist wählen. Ohne Haken:
              Vereinsbetrieb – die Zeiten werden als Belegungen materialisiert
              und der Verein verwaltet sie unter /verein.
            </span>
          </label>
        ) : null}

        {type === "VEREIN" ? (
          <div className="col-span-2 flex flex-wrap items-end gap-2 sm:col-span-3 lg:col-span-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`release-${idp}`}>Automatische Freigabe</Label>
              <select
                id={`release-${idp}`}
                name="releaseMode"
                value={releaseMode}
                onChange={(e) => setReleaseMode(e.target.value)}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                <option value="VENUE">Standard des Standorts</option>
                <option value="CUSTOM">Eigene Frist</option>
                <option value="NONE">
                  Keine – fest für den Verein reserviert
                </option>
              </select>
            </div>
            {releaseMode === "CUSTOM" ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`release-h-${idp}`}>Stunden vor Beginn</Label>
                <Input
                  id={`release-h-${idp}`}
                  name="releaseHours"
                  type="number"
                  min={1}
                  className="w-28"
                  defaultValue={
                    defaults.releaseHoursBefore && defaults.releaseHoursBefore > 0
                      ? defaults.releaseHoursBefore
                      : ""
                  }
                />
              </div>
            ) : (
              <input type="hidden" name="releaseHours" value="" />
            )}
            <p className="text-muted-foreground max-w-md text-xs">
              Ungebuchte bzw. unbestätigte Vereins-Slots werden so viele
              Stunden vor Beginn für alle freigegeben. &bdquo;Keine&ldquo;
              hält die Zeit die ganze Saison fest beim Verein.
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label htmlFor={`title-${idp}`}>Titel</Label>
          <Input
            id={`title-${idp}`}
            name="title"
            required
            defaultValue={defaults.title ?? ""}
            placeholder="z. B. Vereinskontingent Feld 1"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`date-${idp}`}>
            {weekly ? "Erster Termin" : "Datum"}
          </Label>
          <Input
            id={`date-${idp}`}
            name="date"
            type="date"
            required
            defaultValue={defaults.date ?? ""}
          />
        </div>

        <div className="flex gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`from-${idp}`}>Von</Label>
            <Input
              id={`from-${idp}`}
              name="timeFrom"
              type="time"
              required
              step={60 * 30}
              defaultValue={defaults.timeFrom ?? ""}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor={`to-${idp}`}>Bis</Label>
            <Input
              id={`to-${idp}`}
              name="timeTo"
              type="time"
              required
              step={60 * 30}
              defaultValue={defaults.timeTo ?? ""}
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={weekly}
          onChange={(e) => setWeekly(e.target.checked)}
          className="size-4"
        />
        Wöchentlich wiederholen
      </label>

      {weekly ? (
        <div className="flex flex-wrap items-end gap-3">
          <fieldset className="flex gap-2">
            <legend className="mb-1 text-sm font-medium">Wochentage</legend>
            {WEEKDAYS.map((d) => (
              <label
                key={d.value}
                className="flex items-center gap-1 text-sm"
              >
                <input
                  type="checkbox"
                  name="weekdays"
                  value={d.value}
                  defaultChecked={defaults.weekdays?.includes(d.value)}
                  className="size-4"
                />
                {d.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`until-${idp}`}>Wiederholen bis (inkl.)</Label>
            <Input
              id={`until-${idp}`}
              name="untilDate"
              type="date"
              defaultValue={defaults.untilDate ?? ""}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : submitLabel}
        </Button>
        {state.error ? (
          <span className="text-destructive text-sm" role="alert">
            {state.error}
          </span>
        ) : null}
        {state.ok ? (
          <span className="text-sm text-green-700" role="status">
            {state.ok}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function EndBlockButton({ blockId }: { blockId: string }) {
  const [state, formAction, pending] = useActionState(
    endBlockAction,
    initialState,
  );
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="blockId" value={blockId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "…" : "Beenden"}
      </Button>
      {state.error ? (
        <span className="text-destructive text-xs" role="alert">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span className="text-xs text-green-700" role="status">
          {state.ok}
        </span>
      ) : null}
    </form>
  );
}
