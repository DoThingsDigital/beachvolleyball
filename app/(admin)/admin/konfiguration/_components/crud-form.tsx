"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CrudActionState = { ok?: boolean; error?: string };

export type CrudField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "checkbox" | "select" | "email";
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string | number | boolean;
};

type CrudAction = (
  prev: CrudActionState,
  formData: FormData,
) => Promise<CrudActionState>;

// Generisches Formular für die Konfigurations-CRUDs (1.5/1.6): rendert die
// Felder inline, meldet Zod-Fehler aus der Server Action zurück.
export function CrudForm({
  action,
  fields,
  hidden = {},
  submitLabel,
  compact = false,
}: {
  action: CrudAction;
  fields: CrudField[];
  hidden?: Record<string, string>;
  submitLabel: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className={
        compact
          ? "flex flex-wrap items-end gap-2"
          : "grid max-w-xl grid-cols-1 items-end gap-3 sm:grid-cols-2"
      }
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((f) => {
        const id = `${f.name}-${hidden.id ?? "neu"}`;
        if (f.type === "checkbox") {
          return (
            <label
              key={f.name}
              htmlFor={id}
              className="flex items-center gap-2 py-2 text-sm"
            >
              <input
                id={id}
                name={f.name}
                type="checkbox"
                defaultChecked={Boolean(f.defaultValue)}
                className="size-4"
              />
              {f.label}
            </label>
          );
        }
        if (f.type === "select") {
          return (
            <div key={f.name} className="flex flex-col gap-1">
              <Label htmlFor={id}>{f.label}</Label>
              <select
                id={id}
                name={f.name}
                defaultValue={String(f.defaultValue ?? "")}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <Label htmlFor={id}>{f.label}</Label>
            <Input
              id={id}
              name={f.name}
              type={f.type}
              required={f.required}
              defaultValue={
                f.defaultValue === undefined ? "" : String(f.defaultValue)
              }
              className={compact ? "w-36" : undefined}
            />
          </div>
        );
      })}
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
          <span className="text-sm text-green-700 dark:text-green-400" role="status">
            Gespeichert.
          </span>
        ) : null}
      </div>
    </form>
  );
}
