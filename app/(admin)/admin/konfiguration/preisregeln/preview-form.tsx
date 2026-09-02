"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { previewPrice, type PreviewState } from "./actions";

export function PreviewForm({
  venueId,
  seasonId,
  courts,
}: {
  venueId: string;
  seasonId: string;
  courts: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<PreviewState, FormData>(
    previewPrice,
    {},
  );
  // React 19 resettet das Formular nach der Action auf die defaultValues.
  // Die Action spiegelt die Eingaben als state.values zurück; der key erzwingt
  // bei neuen Werten einen Remount, damit auch Select/Checkbox sie übernehmen.
  const v = state.values;
  const echoKey = v
    ? [v.courtId, v.date, v.startTime, v.durationMin, v.isMember].join("|")
    : "init";

  return (
    <form
      key={echoKey}
      action={action}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="venueId" value={venueId} />
      <input type="hidden" name="seasonId" value={seasonId} />
      <div className="flex flex-col gap-1">
        <Label htmlFor="preview-court">Platz</Label>
        <select
          id="preview-court"
          name="courtId"
          defaultValue={v?.courtId}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm"
        >
          {courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="preview-date">Datum</Label>
        <Input
          id="preview-date"
          name="date"
          type="date"
          required
          defaultValue={v?.date}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="preview-start">Startzeit</Label>
        <Input
          id="preview-start"
          name="startTime"
          type="time"
          required
          defaultValue={v?.startTime}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="preview-duration">Dauer (Min.)</Label>
        <Input
          id="preview-duration"
          name="durationMin"
          type="number"
          defaultValue={v?.durationMin ?? 60}
          className="w-28"
        />
      </div>
      <label className="flex items-center gap-2 py-2 text-sm" htmlFor="preview-member">
        <input
          id="preview-member"
          name="isMember"
          type="checkbox"
          defaultChecked={v?.isMember ?? false}
          className="size-4"
        />
        Mitglied
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : "Preis berechnen"}
      </Button>

      {state.error ? (
        <p className="text-destructive w-full text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.result ? (
        <p className="w-full text-sm" role="status">
          Preis: <strong data-testid="preview-price">{state.result}</strong>
          {state.breakdown?.length ? (
            <span className="text-muted-foreground">
              {" "}
              ({state.breakdown.join(" · ")})
            </span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
