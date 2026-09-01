"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  executeMassCancelAction,
  previewMassCancelAction,
  type MassCancelState,
} from "./actions";

const initialState: MassCancelState = {};

export function MassCancelForm({
  venueId,
  courts,
}: {
  venueId: string;
  courts: { id: string; name: string }[];
}) {
  const [previewState, previewAction, previewPending] = useActionState(
    previewMassCancelAction,
    initialState,
  );
  const [execState, execAction, execPending] = useActionState(
    executeMassCancelAction,
    initialState,
  );

  // React 19 resettet das Formular nach jeder Action auf die defaultValues.
  // Die Actions spiegeln deshalb die Eingaben in state.values zurück; die
  // Felder bleiben unkontrolliert (kontrollierte Felder verlieren Eingaben,
  // die vor der Hydration getätigt wurden – siehe Memory react19-form-reset).
  const values = execState.values ?? previewState.values;

  // Beide Buttons überschreiben die Form-Action per formAction –
  // ein Action-Wechsel über State wäre eine Race (Submit vor Re-Render).
  return (
    <form
      action={previewAction}
      className="flex max-w-2xl flex-col gap-4"
      data-testid="mass-cancel-form"
    >
      <input type="hidden" name="venueId" value={venueId} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="mc-from">Von (inkl.)</Label>
          <Input
            id="mc-from"
            name="dateFrom"
            type="date"
            required
            defaultValue={values?.dateFrom ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mc-to">Bis (inkl.)</Label>
          <Input
            id="mc-to"
            name="dateTo"
            type="date"
            required
            defaultValue={values?.dateTo ?? ""}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="text-sm font-medium">Plätze (leer = alle)</span>
          <div className="flex flex-wrap gap-2 pt-1">
            {courts.map((c) => (
              <label key={c.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  name="courtIds"
                  value={c.id}
                  defaultChecked={values?.courtIds.includes(c.id) ?? false}
                  className="size-4"
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={previewPending}
          formAction={previewAction}
        >
          {previewPending ? "…" : "Vorschau"}
        </Button>
        {previewState.preview ? (
          <span className="text-sm" data-testid="mass-cancel-preview">
            <strong>{previewState.preview.affected}</strong> Belegungen von{" "}
            <strong>{previewState.preview.customers}</strong> Kunden betroffen ·
            bezahltes Volumen {previewState.preview.paidFormatted}
          </span>
        ) : null}
        {previewState.error ? (
          <span className="text-destructive text-sm" role="alert">
            {previewState.error}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="mc-reason">Grund (steht in der Kundenmail)</Label>
            <Input
              id="mc-reason"
              name="reason"
              placeholder="z. B. Sturmschaden an der Traglufthalle"
              defaultValue={values?.reason ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mc-refund">Erstattung</Label>
            <select
              id="mc-refund"
              name="refundMode"
              defaultValue={values?.refundMode ?? "MONEY"}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="MONEY">Geld zurück (Gutschrift + Stripe)</option>
              <option value="CREDIT">Guthaben</option>
              <option value="NONE">Keine Erstattung</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" className="size-4" />
          Ich will alle betroffenen Termine unwiderruflich stornieren und die
          Kunden benachrichtigen.
        </label>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={execPending}
            formAction={execAction}
          >
            {execPending ? "Läuft …" : "Massenstorno ausführen"}
          </Button>
          {execState.error ? (
            <span className="text-destructive text-sm" role="alert">
              {execState.error}
            </span>
          ) : null}
        </div>
        {execState.ok ? (
          <p className="text-sm text-green-700" role="status">
            {execState.ok}
          </p>
        ) : null}
      </div>
    </form>
  );
}
